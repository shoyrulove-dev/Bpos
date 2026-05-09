import type { NormalizedOrder, OrderItem, OrderStatus } from '@/types'
import type { PlatformAdapter, AdapterConfig, SessionData } from './types'

// GrabFood Partner API (POS) v1.1.3
// Docs: https://developer.grab.com/docs/grabfood/api/v1-1-3
const GRAB_TOKEN_URL = 'https://partner-api.grab.com/grabid/v1/oauth2/token'
const GRAB_API_BASE  = 'https://partner-api.grab.com/grabfood/partner/v1'

// ─── Known Grab Merchant Portal internal API endpoints (VN) ──────────────────
// These are discovered by intercepting XHR during Playwright session.
// Tried in order; first success wins. Kept as fallback when Playwright hasn't
// yet captured x-grab-orders-api from the live portal.
const GRAB_PORTAL_ORDER_CANDIDATES = [
  'https://merchant.grab.com/grabfood/v1/restaurants/{storeId}/orders',
  'https://merchant.grab.com/grabfood/v1/stores/{storeId}/orders',
  'https://merchant.grab.com/portal/v1/orders?merchantID={storeId}',
  'https://merchant.grab.com/portal/merchant/v1/restaurants/{storeId}/orders',
]
const GRAB_PORTAL_ORDER_DETAIL_CANDIDATES = [
  'https://api.grab.com/food/merchant/v3/orders/{orderId}',
  'https://api.grab.com/delvplatformapi/merchant/v1/order/details?merchantID={storeId}&orderID={orderId}',
  'https://api.grab.com/delvplatformapi/merchant/v2/order/details?merchantID={storeId}&orderID={orderId}',
  'https://api.grab.com/delvplatformapi/merchant/v1/orders/{orderId}?merchantID={storeId}',
  'https://api.grab.com/delvplatformapi/merchant/v2/orders/{orderId}?merchantID={storeId}',
  'https://merchant.grab.com/grabfood/v1/orders/{orderId}?merchantID={storeId}',
]
const GRAB_PORTAL_ORDER_DETAIL_PAGE_STAGES = ['preparing', 'ready', 'upcoming', 'history', 'completed', 'cancelled'] as const
const GRAB_PORTAL_HISTORY_REPORTS_URL = 'https://api.grab.com/delvplatformapi/merchant/v1/reports/daily-pagination'
const GRAB_PORTAL_ACTIVE_PAGE_TYPES = ['PreparingV2', 'Ready', 'Upcoming'] as const
const GRAB_PORTAL_HISTORY_PAGE_TYPES = ['Completed', 'CompletedV2', 'History', 'Past', 'PastOrders', 'Delivered', 'Cancelled', 'All'] as const

function mapGrabStatus(rawStatus: string): OrderStatus {
  const statusMap: Record<string, OrderStatus> = {
    PENDING: 'waiting_confirm',
    ORDER_RECEIVED: 'waiting_confirm',
    NEW: 'waiting_confirm',
    ACCEPTED: 'waiting_pickup',
    CONFIRMED: 'waiting_pickup',
    PREPARING: 'waiting_pickup',
    ORDER_IN_PREPARE: 'waiting_pickup',
    ORDER_EXECUTING: 'waiting_pickup',
    DRIVER_ALLOCATED: 'waiting_pickup',
    DRIVER_ARRIVED: 'waiting_pickup',
    READY_FOR_PICKUP: 'waiting_pickup',
    COLLECTED: 'delivering',
    IN_DELIVERY: 'delivering',
    DELIVERED: 'completed',
    COMPLETED: 'completed',
    BILL_PAID: 'completed',
    CANCELLED: 'cancelled',
    CANCELLED_MAX: 'cancelled',
    CANCELLED_BY_MERCHANT: 'cancelled',
    CANCELLED_BY_CUSTOMER: 'cancelled',
    CANCELLED_BY_DRIVER: 'cancelled',
    FAILED: 'cancelled',
    REFUNDED: 'cancelled',
  }

  return statusMap[rawStatus] ?? 'waiting_confirm'
}

export class GrabAdapter implements PlatformAdapter {
  source = 'grab' as const

  private async enrichOrdersWithDetails(rawOrders: Record<string, unknown>[], config: AdapterConfig) {
    const detailMap = new Map<string, NormalizedOrder>()
    const orderIds = rawOrders
      .map((order) => String(order.orderID ?? ''))
      .filter(Boolean)

    for (let index = 0; index < orderIds.length; index += 5) {
      const batch = orderIds.slice(index, index + 5)
      const details = await Promise.all(batch.map(async (orderId) => {
        try {
          return await this.fetchOrderDetail(orderId, config)
        } catch {
          return null
        }
      }))

      for (const detail of details) {
        if (!detail?.externalOrderId) continue
        detailMap.set(detail.externalOrderId, detail)
      }
    }

    return rawOrders.map((order) => {
      const orderId = String(order.orderID ?? '')
      return detailMap.get(orderId) ?? this.normalizeOrder(order)
    })
  }

  private buildGrabSessionContext(session: SessionData, storeId: string): {
    baseHeaders: Record<string, string>
    extraHeaders: Record<string, string>
    discoveredStoreId: string
  } | null {
    const cookieHeader = session.cookies
      .filter(c => {
        if (c.expires === -1) return true
        if (c.expires > Date.now() / 1000) return true
        return false
      })
      .map(c => `${c.name}=${c.value}`)
      .join('; ')

    if (!cookieHeader) return null

    const extraHeaders = session.extraHeaders ?? {}
    const token = extraHeaders['x-grab-token'] ?? extraHeaders['Authorization'] ?? ''
    const discoveredStoreId = extraHeaders['x-grab-store-id'] ?? storeId

    const forwardedHeaders = Object.fromEntries(
      Object.entries(extraHeaders).filter(([key, value]) => {
        if (!value) return false
        const normalizedKey = key.toLowerCase()
        return normalizedKey !== 'x-grab-orders-api' && normalizedKey !== 'x-grab-stores'
      })
    )

    const baseHeaders: Record<string, string> = {
      ...forwardedHeaders,
      'Cookie': cookieHeader,
      'x-grab-tenant': 'GF_VN',
      'x-grab-country': 'VN',
      'x-grab-language': 'vi',
      'Accept': 'application/json',
      'Accept-Language': 'vi',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin': 'https://merchant.grab.com',
      'Referer': 'https://merchant.grab.com/food/orders',
      'Sec-Fetch-Site': 'same-site',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
      'requestsource': 'troyPortal',
      'merchantid': discoveredStoreId,
    }
    if (token && !token.startsWith('x-grab')) {
      baseHeaders['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`
    }

    return { baseHeaders, extraHeaders, discoveredStoreId }
  }

  private async fetchPortalOrdersByPageTypes(
    baseHeaders: Record<string, string>,
    discoveredStoreId: string,
    pageTypes: readonly string[]
  ): Promise<{
    orders: Record<string, unknown>[] | null
    sawAuthFailure: boolean
    sawPaginationEnvelope: boolean
  }> {
    let sawAuthFailure = false
    let sawPaginationEnvelope = false
    const portalOrders: Record<string, unknown>[] = []
    const seenOrderIds = new Set<string>()

    for (const pageType of pageTypes) {
      const url = new URL('https://api.grab.com/delvplatformapi/merchant/v4/orders-pagination')
      url.searchParams.set('AutoAcceptGroup', '1')
      url.searchParams.set('merchantID', discoveredStoreId)
      url.searchParams.set('PageType', pageType)
      url.searchParams.set('searchToken', '')
      url.searchParams.set('size', '50')

      try {
        const res = await fetch(url, { headers: baseHeaders, signal: AbortSignal.timeout(8000) })
        if (res.status === 401 || res.status === 403) {
          sawAuthFailure = true
          continue
        }
        if (!res.ok) continue

        const data = await res.json() as unknown
        const orders = this.extractOrdersFromPortalResponse(data)
        if (orders) {
          sawPaginationEnvelope = true
          for (const order of orders) {
            const orderId = String(order.orderID ?? order.orderId ?? order.id ?? '')
            if (orderId && seenOrderIds.has(orderId)) continue
            if (orderId) seenOrderIds.add(orderId)
            portalOrders.push(order)
          }
          continue
        }

        if (this.isGrabPortalPaginationEnvelope(data)) {
          sawPaginationEnvelope = true
        }
      } catch {
        continue
      }
    }

    return {
      orders: portalOrders.length ? portalOrders : null,
      sawAuthFailure,
      sawPaginationEnvelope,
    }
  }

  private getGrabPortalOrderId(raw: Record<string, unknown>) {
    return String(raw.orderID ?? raw.orderId ?? raw.ID ?? raw.id ?? '')
  }

  private getGrabPortalShortOrderId(raw: Record<string, unknown>) {
    return String(raw.displayID ?? raw.shortOrderID ?? raw.shortOrderId ?? '')
  }

  private getGrabPortalOrderPageStage(raw: Record<string, unknown>) {
    const rawStatus = String(raw.deliveryStatus ?? raw.orderState ?? raw.status ?? raw.orderStatus ?? raw.state ?? '').toLowerCase()
    if (rawStatus.includes('ready')) return 'ready'
    if (rawStatus.includes('upcoming') || rawStatus.includes('schedule')) return 'upcoming'
    if (rawStatus.includes('cancel')) return 'cancelled'
    if (rawStatus.includes('complete') || rawStatus.includes('deliver') || rawStatus.includes('history') || rawStatus.includes('past')) return 'history'
    return 'preparing'
  }

  private buildGrabPortalDetailPageUrls(raw: Record<string, unknown>, discoveredStoreId: string) {
    const orderId = this.getGrabPortalOrderId(raw)
    if (!orderId || !discoveredStoreId) return []

    const shortOrderId = this.getGrabPortalShortOrderId(raw)
    const preferredStage = this.getGrabPortalOrderPageStage(raw)
    const stages = [preferredStage, ...GRAB_PORTAL_ORDER_DETAIL_PAGE_STAGES.filter((stage) => stage !== preferredStage)]

    return stages.map((stage) => {
      const url = new URL(`https://merchant.grab.com/order/${encodeURIComponent(discoveredStoreId)}/${stage}/${encodeURIComponent(orderId)}`)
      if (shortOrderId) url.searchParams.set('shortOrderID', shortOrderId)
      return url.toString()
    })
  }

  private findGrabPortalOrderInValue(value: unknown, orderId: string, depth = 0): Record<string, unknown> | null {
    if (depth > 10 || value == null) return null

    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findGrabPortalOrderInValue(item, orderId, depth + 1)
        if (found) return found
      }
      return null
    }

    if (typeof value !== 'object') return null

    const record = value as Record<string, unknown>
    const recordOrderId = this.getGrabPortalOrderId(record)
    const hasDetailFields = Boolean(
      Array.isArray(record.items) ||
      Array.isArray(record.orderItems) ||
      Array.isArray(record.lineItems) ||
      record.consumer ||
      record.customer ||
      record.receiver ||
      record.delivery ||
      record.driver ||
      record.rider
    )

    if ((!orderId || recordOrderId === orderId) && hasDetailFields) {
      return record
    }

    for (const nested of Object.values(record)) {
      const found = this.findGrabPortalOrderInValue(nested, orderId, depth + 1)
      if (found) return found
    }

    return null
  }

  private decodeHtmlEntities(value: string) {
    return value
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#(\d+);/g, (_match, digits) => String.fromCharCode(Number(digits)))
  }

  private normalizeGrabPortalText(html: string) {
    return this.decodeHtmlEntities(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  private parseGrabPortalAmount(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value !== 'string') return undefined

    const normalized = value.replace(/[^\d-]/g, '')
    if (!normalized || normalized === '-') return undefined

    const amount = Number(normalized)
    return Number.isFinite(amount) ? amount : undefined
  }

  private extractGrabPortalAmountByLabels(text: string, labels: string[]) {
    for (const label of labels) {
      const pattern = new RegExp(`${this.escapeRegExp(label)}\\s*[:：-]?\\s*([-+]?\\d[\\d.,\u00A0\s]*)\\s*(?:₫|đ|VND)`, 'i')
      const match = text.match(pattern)
      const amount = this.parseGrabPortalAmount(match?.[1])
      if (typeof amount === 'number') return amount
    }

    return undefined
  }

  private extractGrabPortalSegment(text: string, label: string, nextLabels: string[]) {
    const startIndex = text.toLowerCase().indexOf(label.toLowerCase())
    if (startIndex < 0) return ''

    const from = startIndex + label.length
    let end = text.length

    for (const nextLabel of nextLabels) {
      const nextIndex = text.toLowerCase().indexOf(nextLabel.toLowerCase(), from)
      if (nextIndex >= 0 && nextIndex < end) end = nextIndex
    }

    return text.slice(from, end).trim()
  }

  private normalizeGrabPortalPhone(phone?: string) {
    if (!phone) return undefined
    // Strip all whitespace, dashes, dots to get compact number e.g. +84397891772
    const compact = phone.replace(/[\s\-.()\u00A0]/g, '')
    if (!compact) return undefined
    return compact
  }

  private extractGrabPortalPhone(segment: string) {
    const match = segment.match(/((?:\+?84|0)\d[\d .-]{7,13}\d)/)
    return match?.[1]?.trim()
  }

  private extractGrabPortalName(segment: string, phone?: string) {
    const withoutPhone = phone ? segment.replace(phone, ' ') : segment
    const cleaned = withoutPhone
      .replace(/^(?:[:：-]|sdt|sđt|điện thoại|phone)\s*/i, '')
      .replace(/(?:sdt|sđt|điện thoại|phone).*$/i, '')
      .replace(/(?:đã giao|đã hoàn tất|hoàn tất|đã hủy|đã huỷ|mã đặt hàng).*$/i, '')
      .replace(/[📞☎]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!cleaned || /\d/.test(cleaned)) return undefined
    return cleaned.slice(0, 80).trim()
  }

  private extractGrabPortalOrderFromText(html: string, orderId: string): Record<string, unknown> | null {
    const text = this.normalizeGrabPortalText(html)
    if (!text) return null

    const customerSegment = this.extractGrabPortalSegment(text, 'Khách hàng', ['Tài xế', 'Lưu ý từ khách hàng', 'Sản phẩm', 'Tóm tắt đơn hàng'])
    const driverSegment = this.extractGrabPortalSegment(text, 'Tài xế', ['Mã đặt hàng', 'Khách hàng', 'Lưu ý từ khách hàng', 'Sản phẩm', 'Tóm tắt đơn hàng'])
    const rawCustomerPhone = this.extractGrabPortalPhone(customerSegment)
    const rawDriverPhone = this.extractGrabPortalPhone(driverSegment)
    const customerPhone = this.normalizeGrabPortalPhone(rawCustomerPhone)
    const driverPhone = this.normalizeGrabPortalPhone(rawDriverPhone)
    const customerName = this.extractGrabPortalName(customerSegment, rawCustomerPhone)
    const driverName = this.extractGrabPortalName(driverSegment, rawDriverPhone)

    const financialBreakdown = {
      merchandiseAmount: this.extractGrabPortalAmountByLabels(text, ['Tiền hàng']),
      productDiscount: this.extractGrabPortalAmountByLabels(text, ['Giảm giá sản phẩm']),
      orderDiscount: this.extractGrabPortalAmountByLabels(text, ['Giảm giá tổng đơn (ĐH + VC)', 'Giảm giá tổng đơn']),
      platformCommission: this.extractGrabPortalAmountByLabels(text, ['Chiết khấu (CK) sàn', 'Chiết khấu sàn']),
      revenueAfterPromotion: this.extractGrabPortalAmountByLabels(text, ['Doanh thu sau KM']),
      taxWithheld: this.extractGrabPortalAmountByLabels(text, ['Khấu trừ thuế']),
      actualReceived: this.extractGrabPortalAmountByLabels(text, ['Thực nhận từ sàn']),
    }

    const hasFinancialBreakdown = Object.values(financialBreakdown).some((value) => typeof value === 'number')
    const hasContacts = Boolean(customerPhone || driverPhone || customerName || driverName)
    if (!hasFinancialBreakdown && !hasContacts) return null

    const merged: Record<string, unknown> = {
      orderID: orderId,
      ID: orderId,
      financialBreakdown,
    }

    if (hasContacts) {
      merged.customer = {
        name: customerName ?? 'Khách hàng',
        phone: customerPhone ?? '',
        phoneNumber: customerPhone ?? '',
      }
      merged.driver = {
        name: driverName ?? '',
        phone: driverPhone ?? '',
        phoneNumber: driverPhone ?? '',
      }
    }

    if (typeof financialBreakdown.merchandiseAmount === 'number') merged.subtotal = financialBreakdown.merchandiseAmount
    if (typeof financialBreakdown.revenueAfterPromotion === 'number') merged.total = financialBreakdown.revenueAfterPromotion
    if (typeof financialBreakdown.actualReceived === 'number') merged.merchantReceivable = financialBreakdown.actualReceived
    if (typeof financialBreakdown.platformCommission === 'number') merged.platformFee = financialBreakdown.platformCommission
    if (typeof financialBreakdown.productDiscount === 'number' || typeof financialBreakdown.orderDiscount === 'number') {
      merged.discountAmount = Number(financialBreakdown.productDiscount ?? 0) + Number(financialBreakdown.orderDiscount ?? 0)
    }

    return merged
  }

  private extractGrabPortalOrderFromHtml(html: string, orderId: string): Record<string, unknown> | null {
    const jsonBlocks = new Set<string>()

    const nextDataMatch = html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
    if (nextDataMatch?.[1]) jsonBlocks.add(nextDataMatch[1])

    for (const match of Array.from(html.matchAll(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi))) {
      if (match[1]) jsonBlocks.add(match[1])
    }

    for (const block of Array.from(jsonBlocks)) {
      try {
        const parsed = JSON.parse(block) as unknown
        const found = this.findGrabPortalOrderInValue(parsed, orderId)
        if (found) return found
      } catch {
        continue
      }
    }

    return this.extractGrabPortalOrderFromText(html, orderId)
  }

  private scoreNormalizedGrabPortalDetail(normalized: NormalizedOrder) {
    const rawPayload = normalized.rawPayload
    const financialBreakdown = rawPayload.financialBreakdown && typeof rawPayload.financialBreakdown === 'object' && !Array.isArray(rawPayload.financialBreakdown)
      ? rawPayload.financialBreakdown as Record<string, unknown>
      : undefined
    const financialSignals = [
      financialBreakdown?.merchandiseAmount,
      financialBreakdown?.productDiscount,
      financialBreakdown?.orderDiscount,
      financialBreakdown?.platformCommission,
      financialBreakdown?.revenueAfterPromotion,
      financialBreakdown?.taxWithheld,
      financialBreakdown?.actualReceived,
      rawPayload.orderValue,
      rawPayload.priceDisplay,
      rawPayload.subtotal,
      rawPayload.total,
      rawPayload.merchantReceivable,
    ].filter((value) => typeof this.parseGrabDisplayAmount(value) === 'number')

    let score = 0
    if (normalized.customerName && normalized.customerName !== 'Khách hàng') score += 3
    if (normalized.customerPhone) score += 6
    if (normalized.driverInfo?.name) score += 3
    if (normalized.driverInfo?.phone) score += 6
    if (normalized.items.length) score += normalized.items.length * 2
    if (normalized.total > 0) score += 4
    if (normalized.subtotal > 0) score += 3
    if ((normalized.platformFee ?? 0) > 0) score += 2
    if (financialSignals.length) score += financialSignals.length * 2

    return score
  }

  private scoreGrabPortalDetail(detail: Record<string, unknown>) {
    return this.scoreNormalizedGrabPortalDetail(this.normalizePortalOrder(detail))
  }

  private async fetchPortalOrderDetailPageWithSession(
    rawOrder: Record<string, unknown>,
    baseHeaders: Record<string, string>,
    discoveredStoreId: string
  ): Promise<NormalizedOrder | null> {
    const urlsToTry = this.buildGrabPortalDetailPageUrls(rawOrder, discoveredStoreId)
    const orderId = this.getGrabPortalOrderId(rawOrder)
    let bestMergedDetail: Record<string, unknown> | null = null
    let bestScore = -1

    for (const url of urlsToTry) {
      try {
        const res = await fetch(url, {
          headers: {
            ...baseHeaders,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            Referer: `https://merchant.grab.com/order/${encodeURIComponent(discoveredStoreId)}`,
          },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) continue

        const html = await res.text()
        if (!html.includes('<html')) continue

        const detail = this.extractGrabPortalOrderFromHtml(html, orderId)
        if (!detail) continue

        const mergedDetail = {
          ...rawOrder,
          ...detail,
        }
        const score = this.scoreGrabPortalDetail(mergedDetail)
        if (score > bestScore) {
          bestScore = score
          bestMergedDetail = mergedDetail
        }
      } catch {
        continue
      }
    }

    return bestMergedDetail ? this.normalizePortalOrder(bestMergedDetail, discoveredStoreId) : null
  }

  private async fetchPortalOrderDetailWithSession(
    rawOrder: Record<string, unknown>,
    baseHeaders: Record<string, string>,
    discoveredStoreId: string
  ): Promise<NormalizedOrder | null> {
    const orderId = this.getGrabPortalOrderId(rawOrder)
    if (!orderId) return null
    let bestDetail: NormalizedOrder | null = null
    let bestScore = -1

    const urlsToTry = GRAB_PORTAL_ORDER_DETAIL_CANDIDATES.map((template) => (
      template
        .replace('{storeId}', encodeURIComponent(discoveredStoreId))
        .replace('{orderId}', encodeURIComponent(orderId))
    ))

    for (const url of urlsToTry) {
      try {
        const res = await fetch(url, { headers: baseHeaders, signal: AbortSignal.timeout(8000) })
        if (!res.ok) continue

        const text = await res.text()
        const trimmed = text.trim()
        if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')) continue

        let data: unknown
        try {
          data = JSON.parse(text) as unknown
        } catch {
          continue
        }

        const orders = this.extractOrdersFromPortalResponse(data)
        const detail = orders?.find((order) => this.getGrabPortalOrderId(order) === orderId)
        if (!detail) continue

        const normalizedDetail = this.normalizePortalOrder({
          ...rawOrder,
          ...detail,
        }, discoveredStoreId)
        const score = this.scoreNormalizedGrabPortalDetail(normalizedDetail)
        if (score > bestScore) {
          bestScore = score
          bestDetail = normalizedDetail
        }
      } catch {
        continue
      }
    }

    const pageDetail = await this.fetchPortalOrderDetailPageWithSession(rawOrder, baseHeaders, discoveredStoreId)
    if (pageDetail) {
      const pageScore = this.scoreNormalizedGrabPortalDetail(pageDetail)
      if (pageScore > bestScore) return pageDetail
    }

    return bestDetail
  }

  private async enrichSessionOrdersWithDetails(
    rawOrders: Record<string, unknown>[],
    baseHeaders: Record<string, string>,
    discoveredStoreId: string
  ) {
    const detailMap = new Map<string, NormalizedOrder>()
    const orderIds = Array.from(new Set(rawOrders.map((order) => this.getGrabPortalOrderId(order)).filter(Boolean)))

    for (let index = 0; index < orderIds.length; index += 5) {
      const batch = rawOrders.filter((order) => orderIds.slice(index, index + 5).includes(this.getGrabPortalOrderId(order)))
      const details = await Promise.all(batch.map((order) => this.fetchPortalOrderDetailWithSession(order, baseHeaders, discoveredStoreId)))

      for (const detail of details) {
        if (!detail?.externalOrderId) continue
        detailMap.set(detail.externalOrderId, detail)
      }
    }

    return rawOrders.map((order) => {
      const orderId = this.getGrabPortalOrderId(order)
      return detailMap.get(orderId) ?? this.normalizePortalOrder(order, discoveredStoreId)
    })
  }

  private async getToken(clientId: string, clientSecret: string): Promise<string> {
    const res = await fetch(GRAB_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials', scope: 'food.partner_api' }),
    })
    if (!res.ok) throw new Error(`Grab OAuth ${res.status}: Sai clientId hoặc clientSecret`)
    const d = await res.json() as { access_token?: string; error?: string; error_description?: string }
    if (!d.access_token) throw new Error(`Grab OAuth: ${d.error_description ?? d.error ?? 'Không lấy được token'}`)
    return d.access_token
  }

  // ── Official Partner API mode ────────────────────────────────────────────
  async fetchOrders(config: AdapterConfig): Promise<NormalizedOrder[]> {
    const clientId     = String(config.clientId     ?? '')
    const clientSecret = String(config.clientSecret ?? '')
    const merchantId   = String(config.merchantId   ?? config.storeId ?? '')

    if (!clientId || !clientSecret || !merchantId) {
      throw new Error('Thiếu credentials: cần clientId, clientSecret, merchantId')
    }

    const token = await this.getToken(clientId, clientSecret)
    const today = new Date().toISOString().slice(0, 10)
    const allOrders: Record<string, unknown>[] = []

    let page = 0
    let more = true
    while (more) {
      const res = await fetch(
        `${GRAB_API_BASE}/orders?merchantID=${encodeURIComponent(merchantId)}&date=${today}&page=${page}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.status === 401) throw new Error('Token không hợp lệ hoặc thiếu quyền food.partner_api')
      if (!res.ok) throw new Error(`Grab API ${res.status}: ${res.statusText}`)
      const data = await res.json() as { orders?: Record<string, unknown>[]; more?: boolean }
      allOrders.push(...(data.orders ?? []))
      more = data.more ?? false
      page++
    }

    return this.enrichOrdersWithDetails(allOrders, config)
  }

  async fetchOrderDetail(orderId: string, config: AdapterConfig): Promise<NormalizedOrder | null> {
    const clientId     = String(config.clientId     ?? '')
    const clientSecret = String(config.clientSecret ?? '')
    if (!clientId || !clientSecret) return null
    try {
      const token = await this.getToken(clientId, clientSecret)
      const res = await fetch(`${GRAB_API_BASE}/orders?orderIDs=${encodeURIComponent(orderId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return null
      const data = await res.json() as { orders?: Record<string, unknown>[] }
      const order = data.orders?.[0]
      return order ? this.normalizeOrder(order) : null
    } catch { return null }
  }

  // ── Auto-login (session) mode ────────────────────────────────────────────
  /**
   * Fetches orders from Grab Merchant Portal using captured browser session.
   * Tries the discovered API endpoint first (stored in extraHeaders['x-grab-orders-api']),
   * then falls back to known candidate URLs.
   */
  async fetchOrdersWithSession(session: SessionData, storeId: string): Promise<NormalizedOrder[] | null> {
    const context = this.buildGrabSessionContext(session, storeId)
    if (!context) return null

    const { baseHeaders, extraHeaders, discoveredStoreId } = context

    let sawAuthFailure = false
    let sawHtmlShell = false

    const activeResult = await this.fetchPortalOrdersByPageTypes(baseHeaders, discoveredStoreId, GRAB_PORTAL_ACTIVE_PAGE_TYPES)
    sawAuthFailure = activeResult.sawAuthFailure
    if (activeResult.orders) return this.enrichSessionOrdersWithDetails(activeResult.orders, baseHeaders, discoveredStoreId)
    if (activeResult.sawPaginationEnvelope) {
      return []
    }

    // Build list of URLs to try
    const urlsToTry: string[] = []
    if (extraHeaders['x-grab-orders-api']) {
      urlsToTry.push(extraHeaders['x-grab-orders-api'])
    }
    for (const tpl of GRAB_PORTAL_ORDER_CANDIDATES) {
      urlsToTry.push(tpl.replace('{storeId}', encodeURIComponent(discoveredStoreId)))
    }

    for (const url of urlsToTry) {
      try {
        const res = await fetch(url, { headers: baseHeaders, signal: AbortSignal.timeout(8000) })
        if (res.status === 401 || res.status === 403) {
          sawAuthFailure = true
          continue
        }
        if (!res.ok) continue

        const text = await res.text()
        const trimmed = text.trim()
        if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')) {
          sawHtmlShell = true
          continue
        }

        let data: unknown
        try {
          data = JSON.parse(text) as unknown
        } catch {
          continue
        }

        const orders = this.extractOrdersFromPortalResponse(data)
        if (orders !== null) return this.enrichSessionOrdersWithDetails(orders, baseHeaders, discoveredStoreId)
      } catch {
        continue
      }
    }

    if (sawAuthFailure) return null
    if (sawHtmlShell) return []

    return null  // all endpoints failed – session likely expired
  }

  async fetchHistoricalOrdersWithSession(
    session: SessionData,
    storeId: string,
    options?: { days?: number }
  ): Promise<NormalizedOrder[] | null> {
    const context = this.buildGrabSessionContext(session, storeId)
    if (!context) return null

    const days = Math.max(1, Math.min(29, Number(options?.days ?? 30)))
    const historyStatements = await this.fetchPortalHistoryStatements(context.baseHeaders, context.discoveredStoreId, days)
    if (historyStatements === null) return null
    if (historyStatements.length) {
      return this.enrichSessionOrdersWithDetails(historyStatements, context.baseHeaders, context.discoveredStoreId)
    }

    const historyResult = await this.fetchPortalOrdersByPageTypes(
      context.baseHeaders,
      context.discoveredStoreId,
      GRAB_PORTAL_HISTORY_PAGE_TYPES
    )

    if (historyResult.orders) return this.enrichSessionOrdersWithDetails(historyResult.orders, context.baseHeaders, context.discoveredStoreId)
    if (historyResult.sawPaginationEnvelope) return []
    if (historyResult.sawAuthFailure) return null
    return []
  }

  private async fetchPortalHistoryStatements(
    baseHeaders: Record<string, string>,
    storeId: string,
    days: number
  ): Promise<Record<string, unknown>[] | null> {
    const endDate = new Date()
    const startDate = new Date(endDate)
    startDate.setDate(startDate.getDate() - Math.max(0, days - 1))

    const startTime = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}T00:00:00+07:00`
    const endTime = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}T23:59:59+07:00`

    const statements: Record<string, unknown>[] = []
    const seenIds = new Set<string>()

    for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
      const url = new URL(GRAB_PORTAL_HISTORY_REPORTS_URL)
      url.searchParams.set('states', '')
      url.searchParams.set('startTime', startTime)
      url.searchParams.set('endTime', endTime)
      url.searchParams.set('pageIndex', String(pageIndex))
      url.searchParams.set('pageSize', '50')

      try {
        const res = await fetch(url, {
          headers: {
            ...baseHeaders,
            merchantid: storeId,
            Referer: `https://merchant.grab.com/order/${encodeURIComponent(storeId)}/history`,
          },
          signal: AbortSignal.timeout(8000),
        })

        if (res.status === 401 || res.status === 403) return null
        if (!res.ok) break

        const data = await res.json() as {
          hasMore?: boolean
          statements?: Record<string, unknown>[]
        }

        const pageStatements = Array.isArray(data.statements) ? data.statements : []
        for (const statement of pageStatements) {
          const statementId = String(statement.ID ?? statement.id ?? statement.orderID ?? '')
          if (statementId && seenIds.has(statementId)) continue
          if (statementId) seenIds.add(statementId)
          statements.push(statement)
        }

        if (!data.hasMore) break
      } catch {
        break
      }
    }

    return statements
  }

  /** Extract orders array from various portal response shapes */
  private extractOrdersFromPortalResponse(data: unknown): Record<string, unknown>[] | null {
    if (!data || typeof data !== 'object') return null
    const d = data as Record<string, unknown>
    if (this.looksLikeGrabPortalOrder(d)) return [d]
    if (Array.isArray(d)) return d as Record<string, unknown>[]
    if (Array.isArray(d.orders)) return d.orders as Record<string, unknown>[]
    if (Array.isArray(d.orderList)) return d.orderList as Record<string, unknown>[]
    if (Array.isArray(d.orderCards)) return d.orderCards as Record<string, unknown>[]
    if (Array.isArray(d.data)) return d.data as Record<string, unknown>[]
    if (Array.isArray(d.result)) return d.result as Record<string, unknown>[]
    if (Array.isArray(d.results)) return d.results as Record<string, unknown>[]
    if (d.order && typeof d.order === 'object' && this.looksLikeGrabPortalOrder(d.order)) {
      return [d.order as Record<string, unknown>]
    }
    if (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) {
      const inner = d.data as Record<string, unknown>
      if (this.looksLikeGrabPortalOrder(inner)) return [inner]
      if (Array.isArray(inner.orders)) return inner.orders as Record<string, unknown>[]
      if (Array.isArray(inner.orderList)) return inner.orderList as Record<string, unknown>[]
      if (Array.isArray(inner.results)) return inner.results as Record<string, unknown>[]
      if (inner.order && typeof inner.order === 'object' && this.looksLikeGrabPortalOrder(inner.order)) {
        return [inner.order as Record<string, unknown>]
      }
      if (inner.result && typeof inner.result === 'object' && this.looksLikeGrabPortalOrder(inner.result)) {
        return [inner.result as Record<string, unknown>]
      }
    }
    if (d.result && typeof d.result === 'object' && !Array.isArray(d.result)) {
      const inner = d.result as Record<string, unknown>
      if (this.looksLikeGrabPortalOrder(inner)) return [inner]
      if (inner.order && typeof inner.order === 'object' && this.looksLikeGrabPortalOrder(inner.order)) {
        return [inner.order as Record<string, unknown>]
      }
    }
    for (const value of Object.values(d)) {
      if (Array.isArray(value) && value.some(item => this.looksLikeGrabPortalOrder(item))) {
        return value as Record<string, unknown>[]
      }
    }
    return null
  }

  private isGrabPortalPaginationEnvelope(data: unknown): boolean {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false
    const envelope = data as Record<string, unknown>
    return 'nextSearchToken' in envelope || 'orderStats' in envelope || 'pollInterval' in envelope
  }

  private looksLikeGrabPortalOrder(data: unknown): boolean {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false
    const order = data as Record<string, unknown>
    return Boolean(
      order.orderID ||
      order.orderId ||
      order.orderNumber ||
      order.orderStatus ||
      order.orderState ||
      order.consumer ||
      order.receiver
    )
  }

  /**
   * Normalize a raw order from the Grab Merchant Portal (different shape than Partner API).
   * Portal orders may use camelCase keys like orderStatus, consumerName, etc.
   */
  private parseGrabDisplayAmount(value: unknown): number {
    if (typeof value === 'number') return value
    const text = String(value ?? '').replace(/[^\d-]/g, '')
    return text ? Number(text) : 0
  }

  private normalizePortalOrder(raw: Record<string, unknown>, fallbackStoreId?: string): NormalizedOrder {
    // Portal might use different field names than Partner API
    const itemInfo = (raw.itemInfo ?? {}) as Record<string, unknown>
    const itemsRaw = (raw.items ?? raw.orderItems ?? raw.lineItems ?? itemInfo.items ?? []) as Record<string, unknown>[]
    const items: OrderItem[] = itemsRaw.map(i => ({
      name:     String(i.name ?? i.itemName ?? ''),
      quantity: Number(i.quantity ?? 1),
      price:    Number(i.itemPrice ?? i.price ?? i.unitPrice ?? 0),
      total:    Number(i.quantity ?? 1) * Number(i.itemPrice ?? i.price ?? i.unitPrice ?? 0),
    }))

    const rawStatus = String(raw.deliveryStatus ?? raw.orderState ?? raw.status ?? raw.orderStatus ?? raw.state ?? '')
    const orderStatus = mapGrabStatus(rawStatus)
    const consumer  = raw.consumer ?? raw.customer ?? raw.receiver ?? raw.eater ?? {} as Record<string, unknown>
    const consumerObj = typeof consumer === 'object' ? consumer as Record<string, unknown> : {}
    const consumerPhone = String(
      consumerObj.phones ??
      consumerObj.phone ??
      consumerObj.phoneNumber ??
      consumerObj.mobileNumber ??
      this.extractGrabPortalPhone(String(consumerObj.comment ?? '')) ??
      ''
    )

    const priceObj = (raw.price ?? raw.pricing ?? {}) as Record<string, unknown>
    const subtotal = Number(
      priceObj.subtotal ??
      raw.subtotal ??
      raw.subTotal ??
      this.parseGrabDisplayAmount(raw.cancelledOriginalPriceDisplay ?? raw.priceDisplay ?? raw.orderValue)
    )
    const discount = Number(priceObj.basketPromo ?? priceObj.discount ?? raw.discount ?? raw.discountAmount ?? 0)
    const total    = Number(
      priceObj.eaterPayment ??
      priceObj.total ??
      raw.total ??
      raw.orderTotal ??
      this.parseGrabDisplayAmount(raw.priceDisplay ?? raw.orderValue)
    )
    const actualReceived = Number(
      priceObj.merchantPayment ??
      priceObj.merchantReceivable ??
      priceObj.payToMerchant ??
      raw.merchantReceivable ??
      raw.receivedAmount ??
      0
    )
    const platformFee = actualReceived > 0 ? Math.max(0, total - actualReceived) : 0

    const delivery = (raw.delivery ?? {}) as Record<string, unknown>
    const dropoff  = (delivery.dropoff ?? {}) as Record<string, unknown>
    const address  = String(dropoff.address ?? dropoff.formattedAddress ?? delivery.address ?? raw.deliveryAddress ?? '')
    const driver   = (delivery.driver ?? raw.driver ?? raw.rider ?? {}) as Record<string, unknown>

    return {
      source:          'grab',
      externalOrderId: String(raw.orderID ?? raw.ID ?? raw.id ?? raw.orderId ?? ''),
      externalStoreId: String(raw.merchantID ?? raw.merchantId ?? raw.storeId ?? fallbackStoreId ?? ''),
      customerName:    String(consumerObj.name ?? consumerObj.displayName ?? 'Khách hàng'),
      customerPhone:   consumerPhone,
      items,
      subtotal,
      discount,
      total,
      platformFee,
      paymentMethod:   String(raw.paymentType ?? raw.paymentMethod ?? (raw.isTakeawayOrder ? 'pickup' : 'delivery')),
      deliveryInfo:    { address },
      driverInfo:      {
        name: String(driver.name ?? driver.displayName ?? ''),
        phone: String(driver.phone ?? driver.phoneNumber ?? driver.mobileNumber ?? ''),
      },
      orderStatus,
      placedAt:        String(raw.orderTime ?? raw.createdAt ?? raw.createTime ?? new Date().toISOString()),
      deliveredAt:     orderStatus === 'completed' ? String(raw.updatedAt ?? raw.completedAt ?? raw.createdAt ?? '') : undefined,
      rawPayload:      raw,
    }
  }

  normalizeOrder(raw: Record<string, unknown>): NormalizedOrder {
    // items[] — field name is 'items' in POS API v1.1.3 (not 'orderItems')
    const itemInfo = raw.itemInfo as Record<string, unknown> | undefined
    const items: OrderItem[] = (((raw.items as Record<string, unknown>[]) ?? (itemInfo?.items as Record<string, unknown>[] | undefined) ?? [])).map((i) => ({
      name:     String(i.name ?? i.itemName ?? ''),
      quantity: Number(i.quantity ?? 1),
      price:    Number(i.price ?? i.itemPrice ?? i.unitPrice ?? 0),
      total:    Number(i.quantity ?? 1) * Number(i.price ?? i.itemPrice ?? i.unitPrice ?? 0),
    }))

    // orderState field (not 'state')
    const rawStatus = String(raw.orderState ?? '')

    // receiver object contains customer name, phone, and delivery address
    const receiver = (raw.receiver ?? raw.eater) as Record<string, unknown> | undefined
    const receiverPhone = String(
      receiver?.phones ??
      receiver?.phone ??
      receiver?.phoneNumber ??
      receiver?.mobileNumber ??
      this.extractGrabPortalPhone(String(receiver?.comment ?? '')) ??
      ''
    )
    const receiverAddress = receiver?.address as Record<string, unknown> | undefined

    // price is a nested object in POS API v1.1.3
    const price = raw.price as Record<string, unknown> | undefined

    const subtotal = Number(price?.subtotal ?? this.parseGrabDisplayAmount(raw.orderValue) ?? 0)
    const discount = Number(price?.basketPromo ?? 0)
    const total = Number(price?.eaterPayment ?? this.parseGrabDisplayAmount(raw.orderValue) ?? 0)
    const actualReceived = Number(price?.merchantPayment ?? price?.merchantReceivable ?? 0)

    return {
      source:          'grab',
      externalOrderId: String(raw.orderID ?? ''),
      externalStoreId: String(raw.merchantID ?? ''),
      customerName:    String(receiver?.name ?? 'Khách hàng'),
      customerPhone:   receiverPhone,
      items,
      subtotal,
      discount,
      total,
      platformFee:     actualReceived > 0 ? Math.max(0, total - actualReceived) : 0,
      paymentMethod:   String(raw.paymentType ?? ''),
      deliveryInfo: {
        address: String(receiverAddress?.address ?? receiverAddress?.formattedAddress ?? ''),
      },
      driverInfo: {
        name:  String((raw.driver as Record<string, unknown> | undefined)?.name ?? ''),
        phone: String(
          (raw.driver as Record<string, unknown> | undefined)?.phone ??
          (raw.driver as Record<string, unknown> | undefined)?.phoneNumber ??
          (raw.driver as Record<string, unknown> | undefined)?.mobileNumber ??
          ''
        ),
      },
      orderStatus: mapGrabStatus(rawStatus),
      placedAt:    String(raw.orderTime ?? new Date().toISOString()),
      deliveredAt: mapGrabStatus(rawStatus) === 'completed' ? String(raw.completedAt ?? raw.updatedAt ?? raw.orderTime ?? '') : undefined,
      rawPayload:  raw,
    }
  }
}
