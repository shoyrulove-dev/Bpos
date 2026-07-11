import type { NormalizedOrder, OrderItem, OrderStatus } from '@/types'
import { enrichGrabSessionExtraHeaders } from '@/lib/grab-session'
import { extractCompactPhone, normalizeCompactPhone } from '@/lib/phone'
import { mergeNormalizedOrderPreservingDetail } from '@/lib/order-upsert'
import { normalizeGrabItemsFromRawPayload } from '@/lib/grab-order-items'
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
const GRAB_PORTAL_ACTIVE_PAGE_TYPE_SET = new Set<string>(GRAB_PORTAL_ACTIVE_PAGE_TYPES)
const GRAB_PORTAL_HISTORY_PAGE_TYPE_SET = new Set<string>(GRAB_PORTAL_HISTORY_PAGE_TYPES)

type GrabPortalStage = typeof GRAB_PORTAL_ORDER_DETAIL_PAGE_STAGES[number]

function normalizeGrabPortalPageType(value: unknown) {
  return String(value ?? '').trim()
}

function resolveGrabPortalStage(raw: Record<string, unknown>): GrabPortalStage {
  const explicitStage = String(raw._pageStage ?? '').trim().toLowerCase()
  if (GRAB_PORTAL_ORDER_DETAIL_PAGE_STAGES.includes(explicitStage as GrabPortalStage)) {
    return explicitStage as GrabPortalStage
  }

  const pageType = normalizeGrabPortalPageType(raw._pageType ?? raw.pageType)
  const normalizedPageType = pageType.toLowerCase()
  if (pageType && GRAB_PORTAL_ACTIVE_PAGE_TYPE_SET.has(pageType)) {
    if (normalizedPageType.includes('ready')) return 'ready'
    if (normalizedPageType.includes('upcoming')) return 'upcoming'
    return 'preparing'
  }

  if (pageType && GRAB_PORTAL_HISTORY_PAGE_TYPE_SET.has(pageType)) {
    if (normalizedPageType.includes('cancel')) return 'cancelled'
    if (normalizedPageType.includes('complete') || normalizedPageType.includes('deliver')) return 'completed'
    return 'history'
  }

  const rawStatus = String(raw.deliveryStatus ?? raw.orderState ?? raw.status ?? raw.orderStatus ?? raw.state ?? '').toLowerCase()
  if (rawStatus.includes('ready')) return 'ready'
  if (rawStatus.includes('upcoming') || rawStatus.includes('schedule')) return 'upcoming'
  if (rawStatus.includes('cancel')) return 'cancelled'
  if (rawStatus.includes('complete') || rawStatus.includes('deliver') || rawStatus.includes('history') || rawStatus.includes('past')) return 'history'
  return 'preparing'
}

function decorateGrabPortalOrderContext(raw: Record<string, unknown>, pageTypeHint?: string) {
  const pageType = normalizeGrabPortalPageType(raw._pageType ?? raw.pageType ?? pageTypeHint)
  const decorated: Record<string, unknown> = {
    ...raw,
    ...(pageType ? { _pageType: pageType } : {}),
  }
  decorated._pageStage = resolveGrabPortalStage(decorated)
  return decorated
}

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

function hasGrabDeliverySignal(signals: string[]) {
  return signals.some((value) => (
    value.includes('in_delivery')
    || value.includes('delivering')
    || value.includes('dang giao')
    || value.includes('đang giao')
    || value.includes('collected')
    || value.includes('picked_up')
    || value.includes('on_the_way')
    || value.includes('delivery')
  ))
}

function hasGrabCompletionSignal(signals: string[]) {
  return signals.some((value) => (
    value.includes('complete')
    || value.includes('delivered')
    || value.includes('terminate')
    || value.includes('hoàn tất')
    || value.includes('hoan tat')
  ))
}

function hasGrabDateValue(value: unknown) {
  if (!value) return false
  const date = new Date(String(value))
  return !Number.isNaN(date.getTime())
}

// States that Grab explicitly sends for in-progress orders.
// When the primary state is one of these, it takes precedence over page-tab location signals
// (e.g., _pageType = "Cancelled" due to a stale tab while the order is still active).
const GRAB_EXPLICIT_ACTIVE_STATES = new Set([
  'PENDING', 'ORDER_RECEIVED', 'NEW',
  'ACCEPTED', 'CONFIRMED', 'PREPARING',
  'ORDER_IN_PREPARE', 'ORDER_EXECUTING',
  'DRIVER_ALLOCATED', 'DRIVER_ARRIVED',
  'READY_FOR_PICKUP', 'COLLECTED', 'IN_DELIVERY',
])

function resolveGrabStatus(rawStatus: string, raw: Record<string, unknown>): OrderStatus {
  const mappedStatus = mapGrabStatus(rawStatus)
  // cancelled is always final — no override possible
  if (mappedStatus === 'cancelled') return mappedStatus

  const pageStage = resolveGrabPortalStage(raw)

  const times = raw.times && typeof raw.times === 'object' && !Array.isArray(raw.times)
    ? raw.times as Record<string, unknown>
    : undefined

  const secondarySignals = [
    raw.deliveryStatus,
    raw.orderState,
    raw.status,
    raw.orderStatus,
    raw.state,
    raw._pageType,
    raw.deliveryTaskpoolStatus,
    raw.preparationTaskpoolStatus,
    raw.fulfillmentStatus,
    raw.displayStatus,
    raw.pageType,
    pageStage,
  ]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)

  const hasCompletionEvidence = hasGrabCompletionSignal(secondarySignals)
    || hasGrabDateValue(raw.completedAt)
    || hasGrabDateValue(raw.deliveredAt)
    || hasGrabDateValue(raw.deliveryCompletedAt)
    || hasGrabDateValue(raw.delivered_time)
    || hasGrabDateValue(times?.completedAt)
    || hasGrabDateValue(times?.deliveredAt)

  // Grab can keep stale cancel/reassign breadcrumbs in the payload even after the order was
  // delivered. When the portal/detail stage explicitly says completed/history, completion wins.
  if (pageStage === 'completed') return 'completed'
  if (pageStage === 'history' && hasCompletionEvidence) return 'completed'

  // If the primary state is explicitly active, trust it over page-tab signals.
  // Scenario: scraper briefly sees the order in the Cancelled tab due to a driver cancel/reassign,
  // but the order state itself is still ORDER_IN_PREPARE / ACCEPTED / etc.
  if (GRAB_EXPLICIT_ACTIVE_STATES.has(rawStatus)) {
    if (hasCompletionEvidence) return 'completed'
    if (hasGrabDeliverySignal(secondarySignals)) return 'delivering'
    return mappedStatus
  }

  if (secondarySignals.some((value) => value.includes('cancel') || value.includes('fail') || value.includes('refund')) && !hasGrabDeliverySignal(secondarySignals) && !hasCompletionEvidence) {
    return 'cancelled'
  }

  if (pageStage === 'cancelled' && !hasGrabDeliverySignal(secondarySignals) && !hasCompletionEvidence) return 'cancelled'

  // Nếu order đang ở tab ACTIVE (PreparingV2, Ready, Upcoming), trust page bucket — không check completion timestamps
  // vì các field completedAt/deliveredAt có thể là stale/null từ order trước
  const isActivePageStage = pageStage === 'preparing' || pageStage === 'ready' || pageStage === 'upcoming'
  if (isActivePageStage) {
    // "Đang giao" không phải trạng thái riêng trên BPOS — giữ là waiting_pickup
    if (hasGrabDeliverySignal(secondarySignals)) return 'delivering'
    if (pageStage === 'ready') return 'waiting_pickup'
    if (pageStage === 'upcoming') return 'waiting_pickup'
    return mappedStatus
  }

  // Delivery signal check MUST come BEFORE the mappedStatus === 'completed' early return.
  // Grab sets deliveryStatus = 'DELIVERED' (or similar) the moment driver picks up the food
  // and the order moves to the history bucket — while driver is still "đang giao".
  // If we don't catch the delivery signal first, we'd incorrectly return 'completed'.
  if (hasGrabDeliverySignal(secondarySignals) || mappedStatus === 'delivering') {
    return 'delivering'
  }

  // Now safe to trust mappedStatus === 'completed' — no active delivery signals present
  if (mappedStatus === 'completed') return mappedStatus

  // Check completion TRƯỚC khi check pageStage === 'ready', để tránh downgrade
  // đơn đã hoàn thành (có completedAt/deliveredAt) xuống waiting_pickup
  if (hasCompletionEvidence) {
    return 'completed'
  }

  if (pageStage === 'history') {
    // history tab: chỉ completed/cancelled khi có bằng chứng rõ ràng
    // Đang giao (driver đã lấy, chưa giao xong) → vẫn là waiting_pickup từ góc nhìn nhà hàng
    if (secondarySignals.some(v => v.includes('cancel') || v.includes('fail') || v.includes('refund'))) return 'cancelled'
    if ((raw.cancelCode || hasGrabDateValue(raw.cancelledAt) || hasGrabDateValue(raw.canceledAt) || hasGrabDateValue(times?.cancelledAt)) && !hasGrabDeliverySignal(secondarySignals) && !hasCompletionEvidence) return 'cancelled'
    if (hasCompletionEvidence) return 'completed'
    // Đang giao hoặc chưa rõ → waiting_pickup (không dùng delivering)
    if (hasGrabDeliverySignal(secondarySignals)) return 'delivering'
    return 'waiting_pickup'
  }

  if ((raw.cancelCode || hasGrabDateValue(raw.cancelledAt) || hasGrabDateValue(raw.canceledAt) || hasGrabDateValue(times?.cancelledAt)) && !hasGrabDeliverySignal(secondarySignals) && !hasCompletionEvidence) {
    return 'cancelled'
  }

  return mappedStatus
}

function shouldExposeGrabDriverInfo(raw: Record<string, unknown>, orderStatus: OrderStatus) {
  if (orderStatus === 'delivering' || orderStatus === 'waiting_pickup' || orderStatus === 'completed' || orderStatus === 'cancelled') {
    return true
  }

  // If the raw payload already has driver phone data (e.g. from DOM extraction or XHR fallback),
  // always expose — the phone was explicitly fetched and should not be suppressed by stage logic
  const rawDelivery = raw.delivery && typeof raw.delivery === 'object' ? raw.delivery as Record<string, unknown> : {}
  const rawDeliveryDriver = rawDelivery.driver && typeof rawDelivery.driver === 'object' ? rawDelivery.driver as Record<string, unknown> : {}
  const rawDriver = raw.driver && typeof raw.driver === 'object' ? raw.driver as Record<string, unknown> : {}
  const hasDriverPhone = Boolean(
    rawDriver.phone || rawDriver.phoneNumber ||
    rawDeliveryDriver.phone || rawDeliveryDriver.phoneNumber ||
    raw.driverPhone || raw.driverPhoneNumber || raw.driver_phone || raw.driver_phone_no
  )
  if (hasDriverPhone) return true

  const pageStage = resolveGrabPortalStage(raw)
  if (pageStage === 'ready' || pageStage === 'history' || pageStage === 'completed' || pageStage === 'cancelled') {
    return true
  }

  const driverSignals = [
    raw.deliveryStatus,
    raw.orderState,
    raw.status,
    raw.orderStatus,
    raw.state,
    raw.deliveryTaskpoolStatus,
    raw.fulfillmentStatus,
    raw._pageType,
    raw.pageType,
  ]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)

  return driverSignals.some((value) => (
    value.includes('ready')
    || value.includes('collect')
    || value.includes('delivery')
    || value.includes('picking_up')
  ))
}

export class GrabAdapter implements PlatformAdapter {
  source = 'grab' as const

  private getGrabEstimatedTime(raw: Record<string, unknown>) {
    const times = raw.times && typeof raw.times === 'object' && !Array.isArray(raw.times)
      ? raw.times as Record<string, unknown>
      : undefined

    return String(
      times?.dropOffTime ?? times?.dropoffTime ?? times?.deliveryTime ?? times?.estimatedDeliveryTime ??
      times?.pickUpTime ?? times?.pickupTime ?? times?.estimatedPickupTime ??
      raw.busyModeOrderPickupTime ??
      raw.schedulePickupTime ?? raw.scheduledOrderPickUpTime ?? raw.scheduledAt ?? raw.estimatedDeliveryTime ??
      raw.estimatedPickupTime ?? raw.promisedDeliveryTime ?? raw.promisedPickupTime ??
      ''
    ) || undefined
  }

  private getGrabDeliveredAt(raw: Record<string, unknown>, orderStatus: OrderStatus) {
    if (orderStatus !== 'completed') return undefined

    const times = raw.times && typeof raw.times === 'object' && !Array.isArray(raw.times)
      ? raw.times as Record<string, unknown>
      : undefined

    return String(
      raw.deliveredAt ?? raw.deliveryCompletedAt ?? raw.completedAt ?? raw.delivered_time ??
      times?.deliveredAt ?? times?.deliveryCompletedAt ?? times?.completedAt ?? times?.updatedAt ??
      raw.updatedAt ?? raw.createdAt ?? raw.orderTime ??
      ''
    ) || undefined
  }

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

    const { extraHeaders, discoveredStoreId } = enrichGrabSessionExtraHeaders(session, storeId)

    const forwardedHeaders = Object.fromEntries(
      Object.entries(extraHeaders).filter(([key, value]) => {
        if (!value) return false
        const normalizedKey = key.toLowerCase()
        return normalizedKey !== 'x-grab-orders-api'
          && normalizedKey !== 'x-grab-stores'
          && normalizedKey !== 'authorization'
          && normalizedKey !== 'x-grab-token'
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
            portalOrders.push(decorateGrabPortalOrderContext(order, pageType))
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
    return resolveGrabPortalStage(raw)
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

  private normalizeGrabPortalStructuredText(html: string) {
    return this.decodeHtmlEntities(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|section|article|li|tr|td|th|h[1-6]|ul|ol)>/gi, '\n')
      .replace(/<(?:p|div|section|article|li|tr|td|th|h[1-6]|ul|ol)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
  }

  private extractGrabPortalItems(segment: string): Record<string, unknown>[] {
    const lines = segment
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)

    const items: Record<string, unknown>[] = []
    let current: { name: string; quantity?: number; price?: number; total?: number; note?: string } | null = null

    const pushCurrent = () => {
      if (!current?.name) return

      const quantity = Math.max(1, Number(current.quantity ?? 1) || 1)
      const price = Number(current.price ?? 0)
      const total = Number(current.total ?? (price > 0 ? price * quantity : 0))
      const item: Record<string, unknown> = {
        name: current.name,
        quantity,
      }

      if (price > 0) item.price = price
      if (total > 0) item.total = total
      if (current.note) item.note = current.note
      items.push(item)
      current = null
    }

    for (const line of lines) {
      const compactLine = line.replace(/\s+/g, ' ').trim()
      const lowerLine = compactLine.toLowerCase()
      if (!compactLine) continue

      if (/^(?:sản phẩm|chi tiết đơn hàng|danh sách sản phẩm|tóm tắt đơn hàng|khách hàng|tài xế|mã đặt hàng|thanh toán|tài chính)$/i.test(compactLine)) {
        continue
      }

      const quantityPriceMatch = compactLine.match(/(?:^|\s)(\d+)\s*(?:x|×)\s*([\d.,]+)\s*(?:₫|đ|vnd)?/i)
        ?? compactLine.match(/([\d.,]+)\s*(?:₫|đ|vnd)\s*(?:x|×)\s*(\d+)/i)
      if (current && quantityPriceMatch) {
        if (quantityPriceMatch[2] && compactLine.indexOf(quantityPriceMatch[2]) > compactLine.indexOf(quantityPriceMatch[1])) {
          current.quantity = Number(quantityPriceMatch[1]) || current.quantity
          current.price = this.parseGrabPortalAmount(quantityPriceMatch[2]) ?? current.price
        } else {
          current.price = this.parseGrabPortalAmount(quantityPriceMatch[1]) ?? current.price
          current.quantity = Number(quantityPriceMatch[2]) || current.quantity
        }
        const quantity = Math.max(1, Number(current.quantity ?? 1) || 1)
        if (typeof current.price === 'number' && current.price > 0) current.total = current.price * quantity
        continue
      }

      if (current && /^x\s*\d+$/i.test(compactLine)) {
        current.quantity = Number(compactLine.replace(/\D/g, '')) || current.quantity
        continue
      }

      if (current && /^\d+$/.test(compactLine) && typeof current.quantity !== 'number') {
        current.quantity = Number(compactLine) || current.quantity
        continue
      }

      const amount = this.parseGrabPortalAmount(compactLine)
      if (current && typeof amount === 'number' && (/(?:₫|đ|vnd)/i.test(compactLine) || /\d[.,]\d{3}/.test(compactLine))) {
        if (typeof current.price !== 'number' || current.price <= 0) current.price = amount
        const quantity = Math.max(1, Number(current.quantity ?? 1) || 1)
        current.total = current.price * quantity
        continue
      }

      const looksLikeName = /[A-Za-zÀ-ỹ]/.test(compactLine)
        && !this.extractGrabPortalPhone(compactLine)
        && !/^(?:ghi chú|lưu ý|không cần dụng cụ|cần dụng cụ)/i.test(lowerLine)

      if (!looksLikeName) continue

      if (!current) {
        current = { name: compactLine }
        continue
      }

      const hasStructuredDetail = typeof current.quantity === 'number'
        || typeof current.price === 'number'
        || typeof current.total === 'number'
        || Boolean(current.note)

      if (hasStructuredDetail) {
        pushCurrent()
        current = { name: compactLine }
        continue
      }

      current.note = current.note ? `${current.note}\n${compactLine}` : compactLine
    }

    pushCurrent()
    return items
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
    return normalizeCompactPhone(phone)
  }

  private getGrabPhoneCandidate(value: unknown): string | undefined {
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim()
      // Reject empty strings and Grab-masked numbers (e.g. "+84901***567", "090****123")
      if (!text || text.includes('*') || text.includes('x')) return undefined
      return text
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const candidate = this.getGrabPhoneCandidate(item)
        if (candidate) return candidate
      }
      return undefined
    }

    if (!value || typeof value !== 'object') return undefined

    const record = value as Record<string, unknown>
    const candidates = [
      record.phone,
      record.phoneNumber,
      record.mobileNumber,
      record.contactNumber,
      record.contactNo,
      record.contact,
      record.displayPhone,
      record.phoneNo,
      record.mobile,
      record.value,
      record.number,
    ]
    for (const candidate of candidates) {
      const resolved = this.getGrabPhoneCandidate(candidate)
      if (resolved) return resolved
    }

    return undefined
  }

  private extractGrabPortalPhone(segment: string) {
    return extractCompactPhone(segment)
  }

  private extractGrabPortalName(segment: string, phone?: string) {
    const lines = segment
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)

    for (const line of lines) {
      const candidate = (phone ? line.replace(phone, ' ') : line)
        .replace(/^(?:[:：-]|sdt|sđt|điện thoại|phone)\s*/i, '')
        .replace(/[📞☎]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (!candidate) continue
      const candidateNFC = candidate.normalize('NFC')
      if (/^(?:khách hàng|tài xế|lưu ý từ khách hàng|ghi chú|mã đặt hàng|hóa đơn|hoá đơn|hoa don|invoice|thanh toán|tóm tắt đơn hàng|tài chính|hóa đơn điện tử|hoá đơn điện tử|phương thức thanh toán)$/i.test(candidateNFC)) continue
      if (/(?:đang giao|dang giao|đang đến lấy|dang den lay|đang lấy hàng|dang lay hang|đã giao|da giao|đã hoàn tất|da hoan tat|hoàn tất|hoan tat|đã hủy|da huy|đã huỷ)/i.test(candidate)) continue
      if (/\d/.test(candidate)) continue
      return candidate.slice(0, 80).trim()
    }

    const withoutPhone = phone ? segment.replace(phone, ' ') : segment
    const cleaned = withoutPhone
      .replace(/^(?:[:：-]|sdt|sđt|điện thoại|phone)\s*/i, '')
      .replace(/(?:sdt|sđt|điện thoại|phone).*$/i, '')
      .replace(/(?:đang giao|dang giao|đang đến lấy|dang den lay|đang lấy hàng|dang lay hang|đã giao|da giao|đã hoàn tất|da hoan tat|hoàn tất|hoan tat|đã hủy|da huy|đã huỷ|da huy).*/i, '')
      .replace(/(?:đã giao|đã hoàn tất|hoàn tất|đã hủy|đã huỷ|mã đặt hàng).*$/i, '')
      .replace(/[📞☎]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!cleaned || /\d/.test(cleaned)) return undefined
    const cleanedNFC = cleaned.normalize('NFC')
    if (/^(?:khách hàng|tài xế|lưu ý từ khách hàng|ghi chú|mã đặt hàng|hóa đơn|hoá đơn|hoa don|invoice|thanh toán|tóm tắt đơn hàng|tài chính|hóa đơn điện tử|hoá đơn điện tử|phương thức thanh toán)$/i.test(cleanedNFC)) return undefined
    return cleaned.slice(0, 80).trim()
  }

  private extractGrabPortalOrderFromText(html: string, orderId: string): Record<string, unknown> | null {
    const text = this.normalizeGrabPortalText(html)
    const structuredText = this.normalizeGrabPortalStructuredText(html)
    if (!text && !structuredText) return null

    const NOTE_LABELS = ['Lưu ý từ khách hàng', 'Ghi chú từ khách hàng', 'Yêu cầu từ khách', 'Ghi chú', 'Yêu cầu đặc biệt']
    const ITEM_SECTION_LABELS = ['Sản phẩm', 'Chi tiết đơn hàng', 'Danh sách sản phẩm']
    const ITEM_STOP_LABELS = ['Tóm tắt đơn hàng', 'Tài chính', 'Thanh toán', 'Phương thức thanh toán', 'Khách hàng', 'Tài xế', 'Mã đặt hàng']
    const ALL_NEXT_LABELS = ['Tài xế', ...NOTE_LABELS, ...ITEM_SECTION_LABELS, 'Tóm tắt đơn hàng', 'Mã đặt hàng']

    const segmentSource = structuredText || text

    const customerSegment = this.extractGrabPortalSegment(segmentSource, 'Khách hàng', ALL_NEXT_LABELS)
    const driverSegment = this.extractGrabPortalSegment(segmentSource, 'Tài xế', ['Mã đặt hàng', 'Khách hàng', ...NOTE_LABELS, ...ITEM_SECTION_LABELS, 'Tóm tắt đơn hàng', 'Hóa đơn', 'Hoá đơn', 'Thanh toán', 'Phương thức thanh toán'])
    const statusSegment = this.extractGrabPortalSegment(segmentSource, 'Tài xế', ['Mã đặt hàng', 'Khách hàng'])

    // Extract "Lưu ý từ khách hàng" section
    let noteSegment = ''
    for (const label of NOTE_LABELS) {
      const seg = this.extractGrabPortalSegment(segmentSource, label, [...ITEM_SECTION_LABELS, 'Tóm tắt đơn hàng', 'Mã đặt hàng'])
      if (seg.trim()) { noteSegment = seg.trim(); break }
    }

    let itemSegment = ''
    for (const label of ITEM_SECTION_LABELS) {
      const seg = this.extractGrabPortalSegment(segmentSource, label, ITEM_STOP_LABELS)
      if (seg.trim()) {
        itemSegment = seg.trim()
        break
      }
    }

    const rawCustomerPhone = this.extractGrabPortalPhone(customerSegment)
    const rawDriverPhone = this.extractGrabPortalPhone(driverSegment)
    const customerPhone = this.normalizeGrabPortalPhone(rawCustomerPhone)
    const driverPhone = this.normalizeGrabPortalPhone(rawDriverPhone)
    const customerName = this.extractGrabPortalName(customerSegment, rawCustomerPhone)
    const driverName = this.extractGrabPortalName(driverSegment, rawDriverPhone)
    const parsedItems = this.extractGrabPortalItems(itemSegment)
    const normalizedStatusText = statusSegment.toLowerCase()
    const inferredDeliveryStatus = normalizedStatusText.includes('đang giao') || normalizedStatusText.includes('dang giao')
      ? 'IN_DELIVERY'
      : normalizedStatusText.includes('đã giao') || normalizedStatusText.includes('da giao') || normalizedStatusText.includes('hoàn tất') || normalizedStatusText.includes('hoan tat')
      ? 'DELIVERED'
      : undefined

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
  const hasItems = parsedItems.length > 0

    // Parse customer note: separate the cutlery hint from the free-text note
    let parsedNote = noteSegment
    let cutleryHint: string | undefined
    const CUTLERY_PATTERNS = [
      /không cần dụng cụ ăn uống nhựa/i,
      /không cần dụng cụ ăn uống/i,
      /không cần dao\/muỗng\/nĩa/i,
      /không cần muỗng/i,
      /không cần dao/i,
      /no cutlery/i,
    ]
    for (const pattern of CUTLERY_PATTERNS) {
      if (pattern.test(noteSegment)) {
        cutleryHint = 'Không'
        parsedNote = noteSegment.replace(pattern, '').replace(/^[,;.\s]+|[,;.\s]+$/g, '').trim()
        break
      }
    }
    if (/cần dụng cụ ăn uống/i.test(noteSegment) && !cutleryHint) {
      cutleryHint = 'Có'
    }

    const needCutlery = cutleryHint === undefined ? undefined : cutleryHint === 'Có'

    if (!hasFinancialBreakdown && !hasContacts && !hasItems && !parsedNote && !cutleryHint) return null

    const merged: Record<string, unknown> = {
      orderID: orderId,
      ID: orderId,
      financialBreakdown,
      ...(inferredDeliveryStatus ? { deliveryStatus: inferredDeliveryStatus, orderStatus: inferredDeliveryStatus } : {}),
      ...(parsedNote ? { specialRequest: parsedNote, customerNote: parsedNote, note: parsedNote } : {}),
      ...(cutleryHint !== undefined ? { cutlery: cutleryHint, needCutlery, utensilRequired: needCutlery } : {}),
      ...(hasItems ? { items: parsedItems, itemInfo: { items: parsedItems, ...(needCutlery !== undefined ? { needCutlery } : {}) } } : {}),
    }

    if (hasContacts) {
      // Only set customer fields if we actually have customer data (not just masked/empty)
      // This prevents overwriting existing real data when the page shows masked info
      if (customerName || customerPhone) {
        const customer = {
          name: customerName ?? 'Khách hàng',
          phone: customerPhone ?? '',
          phoneNumber: customerPhone ?? '',
        }
        merged.customer = customer
        merged.consumer = customer
        merged.receiver = customer
      }
      // Only set driver fields if we actually have driver data
      if (driverName || driverPhone) {
        const driver = {
          name: driverName ?? '',
          phone: driverPhone ?? '',
          phoneNumber: driverPhone ?? '',
        }
        merged.driver = driver
        merged.delivery = { driver }
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
      if (bestDetail) {
        const mergedDetail = mergeNormalizedOrderPreservingDetail(bestDetail, {
          ...pageDetail,
          rawPayload: {
            ...(bestDetail.rawPayload ?? {}),
            ...(pageDetail.rawPayload ?? {}),
          },
        })
        const mergedScore = this.scoreNormalizedGrabPortalDetail(mergedDetail)
        if (mergedScore >= bestScore) return mergedDetail
      }

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
    // When all cookies have expired, return [] instead of null so sync-orders
    // does not mark the integration as error. Real orders are handled by the
    // browser-based scraper via /api/cron/push-orders.
    if (!context) return []

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

    // When the server-side fetch fails with 401 (TLS fingerprint mismatch between
    // Node.js and Chromium), return [] instead of null so sync-orders does not
    // treat this as a session-expired error. Real orders are pushed separately
    // by the browser-based scraper via /api/cron/push-orders.
    if (sawAuthFailure) return []
    if (sawHtmlShell) return []

    return []  // all endpoints failed – treat as empty (browser scraper handles real orders)
  }

  async fetchOrderDetailWithSession(orderId: string, session: SessionData, storeId: string): Promise<NormalizedOrder | null> {
    const context = this.buildGrabSessionContext(session, storeId)
    if (!context) return null

    return this.fetchPortalOrderDetailWithSession(
      { orderID: orderId, orderId, merchantID: context.discoveredStoreId },
      context.baseHeaders,
      context.discoveredStoreId
    )
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
          statements.push(decorateGrabPortalOrderContext(statement, String(statement.pageType ?? statement.PageType ?? 'History')))
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
    raw = decorateGrabPortalOrderContext(raw)
    // Portal might use different field names than Partner API
    const itemInfo = (raw.itemInfo ?? {}) as Record<string, unknown>
    // Prefer itemInfo.items (from XHR intercept, has fare/modifierGroups) over raw.items which
    // may be overwritten by DOM extraction with partial/garbage data (e.g. "HOÁ ĐƠN" placeholder)
    const itemsRaw = (raw.orderItems ?? raw.lineItems ?? itemInfo.items ?? raw.items ?? []) as Record<string, unknown>[]
    const items: OrderItem[] = normalizeGrabItemsFromRawPayload({ itemInfo: { items: itemsRaw } })

    const rawStatus = String(raw.deliveryStatus ?? raw.orderState ?? raw.status ?? raw.orderStatus ?? raw.state ?? '')
    const orderStatus = resolveGrabStatus(rawStatus, raw)
    // eater = Grab app user (customer who ordered); always prefer over receiver which may
    // hold driver or system contact in some Grab API versions
    const consumer  = raw.consumer ?? raw.customer ?? raw.eater ?? raw.receiver ?? {} as Record<string, unknown>
    const consumerObj = typeof consumer === 'object' ? consumer as Record<string, unknown> : {}
    const consumerPhone = normalizeCompactPhone(
      this.getGrabPhoneCandidate([
        consumerObj.phones,
        consumerObj.phone,
        consumerObj.phoneNumber,
        consumerObj.displayPhone,
        consumerObj.contactNumber,
        consumerObj.mobileNumber,
        this.extractGrabPortalPhone(String(consumerObj.comment ?? '')),
        this.extractGrabPortalPhone(String(raw.specialRequest ?? raw.note ?? raw.remarks ?? '')),
      ])
    )

    const priceObj = (raw.price ?? raw.pricing ?? {}) as Record<string, unknown>
    const subtotal = Number(
      priceObj.subtotal ??
      raw.subtotal ??
      raw.subTotal ??
      this.parseGrabDisplayAmount(raw.cancelledOriginalPriceDisplay ?? raw.priceDisplay ?? raw.orderValue)
    )
    // Discount: check voucherInfo and orderLevelDiscounts in addition to price object
    const voucherInfo = raw.voucherInfo && typeof raw.voucherInfo === 'object' && !Array.isArray(raw.voucherInfo)
      ? raw.voucherInfo as Record<string, unknown>
      : undefined
    const voucherDiscount = Array.isArray(voucherInfo?.vouchers)
      ? (voucherInfo.vouchers as Record<string, unknown>[]).reduce((s, v) => s + Number(v?.discountAmount ?? v?.amount ?? v?.value ?? 0), 0)
      : Array.isArray(voucherInfo?.discounts)
      ? (voucherInfo.discounts as Record<string, unknown>[]).reduce((s, v) => s + Number(v?.discountAmount ?? v?.amount ?? v?.value ?? 0), 0)
      : 0
    const orderLevelDiscount = Array.isArray(raw.orderLevelDiscounts)
      ? (raw.orderLevelDiscounts as Record<string, unknown>[]).reduce(
          (s, d) => s + Number(
            d?.discountAmountValueInMin ?? d?.discountAmount ?? d?.amount ?? d?.value ?? 0
          ), 0)
      : 0
    const discount = Number(priceObj.basketPromo ?? priceObj.discount ?? raw.discount ?? raw.discountAmount ?? 0)
      || voucherDiscount || orderLevelDiscount
    // eaterPayment > price.total > orderValue (already net of discounts) > raw total fields
    const orderValueParsed = this.parseGrabDisplayAmount(raw.priceDisplay ?? raw.orderValue)
    const totalFromAPI = Number(
      priceObj.eaterPayment ??
      priceObj.total ??
      raw.total ??
      raw.orderTotal ??
      null
    ) || (orderValueParsed ?? 0)
    // Nếu total === subtotal nhưng có discount → total thực = subtotal - discount
    // (happens when orderValue wasn't available at first sync)
    const total = (totalFromAPI > 0 && discount > 0 && totalFromAPI === subtotal)
      ? subtotal - discount
      : totalFromAPI
    const platformFee = Number(
      priceObj.platformCommission ??
      priceObj.platformFee ??
      raw.platformCommission ??
      raw.platformFee ??
      raw.merchantCommission ??
      raw.commissionFee ??
      0
    )

    const delivery = (raw.delivery ?? {}) as Record<string, unknown>
    const dropoff  = (delivery.dropoff ?? {}) as Record<string, unknown>
    const address  = String(dropoff.address ?? dropoff.formattedAddress ?? delivery.address ?? raw.deliveryAddress ?? '')
    const driver   = (delivery.driver ?? raw.driver ?? raw.rider ?? raw.driverDetails ?? raw.driverInfo ?? raw.courier ?? raw.deliveryPerson ?? raw.deliveryAgent ?? {}) as Record<string, unknown>
    const driverPhone = normalizeCompactPhone(this.getGrabPhoneCandidate([
      driver.phones,
      driver.phone,
      driver.phoneNumber,
      driver.mobileNumber,
      driver.contact,
      driver.contactNumber,
      driver.displayPhone,
      raw.driverPhone,
      raw.driverContactNo,
      raw.driverPhoneNumber,
      raw.driver_phone_no,
      raw.driver_contact,
      raw.driver_phone,
    ]))
    const driverNameRaw = String(driver.name ?? driver.displayName ?? driver.fullName ?? '').trim()
    const INVALID_DRIVER_NAMES = /^(?:hóa đơn|hoá đơn|hoa don|hóa đơn điện tử|hoá đơn điện tử|invoice|tài xế|tai xe|khách hàng|khach hang|phương thức thanh toán|thanh toán|mã đặt hàng|tóm tắt đơn hàng)$/i
    const driverName = driverNameRaw && !INVALID_DRIVER_NAMES.test(driverNameRaw.normalize('NFC')) ? driverNameRaw : undefined
    const driverInfo = shouldExposeGrabDriverInfo(raw, orderStatus) && (driverName || driverPhone)
      ? {
        name: driverName,
        phone: driverPhone,
      }
      : undefined

    const estimatedTime = this.getGrabEstimatedTime(raw)

    // Order-level note: prefer eater.comment (direct from Grab API JSON) over DOM-extracted fields
    // which may contain '-' placeholder when DOM extraction found no note section.
    const eaterObj = (raw.eater ?? {}) as Record<string, unknown>
    const eaterComment = String(eaterObj.comment ?? '').trim()
    const rawNote = (() => {
      if (eaterComment && eaterComment !== '-') return eaterComment
      const s = String(raw.specialRequest ?? raw.customerNote ?? raw.note ?? raw.remarks ?? raw.deliveryNote ?? '').trim()
      return s !== '-' ? s : ''
    })()
    const deliveryNote = rawNote || undefined

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
      deliveryInfo:    { address, note: deliveryNote, estimatedTime },
      driverInfo,
      orderStatus,
      placedAt:        String(raw.orderTime ?? raw.createdAt ?? raw.createTime ?? new Date().toISOString()),
      deliveredAt:     this.getGrabDeliveredAt(raw, orderStatus),
      rawPayload:      raw,
    }
  }

  normalizeOrder(raw: Record<string, unknown>): NormalizedOrder {
    // items[] — field name is 'items' in POS API v1.1.3 (not 'orderItems')
    const itemInfo = raw.itemInfo as Record<string, unknown> | undefined
    const rawItems = Array.isArray(raw.items)
      ? raw.items as Record<string, unknown>[]
      : Array.isArray(raw.orderItems)
      ? raw.orderItems as Record<string, unknown>[]
      : Array.isArray(raw.lineItems)
      ? raw.lineItems as Record<string, unknown>[]
      : (itemInfo?.items as Record<string, unknown>[] | undefined) ?? []
    const items: OrderItem[] = normalizeGrabItemsFromRawPayload({ itemInfo: { items: rawItems } })

    // orderState field (not 'state')
    const rawStatus = String(raw.orderState ?? raw.deliveryStatus ?? raw.status ?? raw.orderStatus ?? raw.state ?? '')
    const orderStatus = resolveGrabStatus(rawStatus, raw)

    // receiver object contains customer name, phone, and delivery address
    // Also check consumer (portal format) and eater/customer (other formats)
    const receiver = (raw.receiver ?? raw.eater ?? raw.customer ?? raw.consumer) as Record<string, unknown> | undefined
    const receiverPhone = normalizeCompactPhone(this.getGrabPhoneCandidate([
      receiver?.phones,
      receiver?.phone,
      receiver?.phoneNumber,
      receiver?.mobileNumber,
      receiver?.displayPhone,
      receiver?.contactNumber,
      this.extractGrabPortalPhone(String(receiver?.comment ?? '')),
      this.extractGrabPortalPhone(String(raw.specialRequest ?? raw.note ?? '')),
    ]))
    const receiverAddress = receiver?.address as Record<string, unknown> | undefined

    // price is a nested object in POS API v1.1.3
    const price = raw.price as Record<string, unknown> | undefined

    const subtotal = Number(price?.subtotal ?? this.parseGrabDisplayAmount(raw.orderValue ?? raw.priceDisplay ?? raw.cancelledOriginalPriceDisplay) ?? 0)
    const discount = Number(price?.basketPromo ?? price?.discount ?? raw.discount ?? raw.discountAmount ?? 0)
    const total = Number(price?.eaterPayment ?? price?.total ?? this.parseGrabDisplayAmount(raw.orderValue ?? raw.priceDisplay) ?? 0)
    const platformFee = Number(
      price?.platformCommission ??
      price?.platformFee ??
      raw.platformCommission ??
      raw.platformFee ??
      raw.merchantCommission ??
      raw.commissionFee ??
      0
    )

    // driver object — Grab API uses different field names across versions
    const driverRaw = (
      raw.driver ?? raw.driverInfo ?? raw.courier ?? raw.driverDetails ?? raw.deliveryBoy
    ) as Record<string, unknown> | undefined
    const driverPhone = normalizeCompactPhone(this.getGrabPhoneCandidate([
      driverRaw?.phones,
      driverRaw?.phone,
      driverRaw?.phoneNumber,
      driverRaw?.mobileNumber,
      driverRaw?.contactNumber,
      driverRaw?.displayPhone,
    ]))
    const driverName = String(
      driverRaw?.name ?? driverRaw?.driverName ?? driverRaw?.fullName ?? driverRaw?.displayName ?? ''
    )
    const driverInfo = shouldExposeGrabDriverInfo(raw, orderStatus) && (driverName || driverPhone)
      ? {
        name: driverName,
        phone: driverPhone ?? '',
      }
      : undefined

    return {
      source:          'grab',
      externalOrderId: String(raw.orderID ?? ''),
      externalStoreId: String(raw.merchantID ?? ''),
      customerName:    String(receiver?.name ?? receiver?.displayName ?? receiver?.fullName ?? 'Khách hàng'),
      customerPhone:   receiverPhone,
      items,
      subtotal,
      discount,
      total,
      platformFee,
      paymentMethod:   String(raw.paymentType ?? ''),
      deliveryInfo: {
        address: String(
          receiverAddress?.address ?? receiverAddress?.formattedAddress ??
          receiverAddress?.displayAddress ?? receiverAddress?.label ?? ''
        ),
        note: String(raw.specialRequest ?? raw.note ?? raw.remarks ?? '') || undefined,
        estimatedTime: this.getGrabEstimatedTime(raw),
      },
      driverInfo,
      orderStatus,
      placedAt:    String(raw.orderTime ?? new Date().toISOString()),
      deliveredAt: this.getGrabDeliveredAt(raw, orderStatus),
      rawPayload:  raw,
    }
  }
}
