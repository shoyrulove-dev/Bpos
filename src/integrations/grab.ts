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
const GRAB_PORTAL_ACTIVE_PAGE_TYPES = ['PreparingV2', 'Ready', 'Upcoming'] as const
const GRAB_PORTAL_HISTORY_PAGE_TYPES = ['Completed', 'CompletedV2', 'History', 'Past', 'PastOrders', 'Delivered', 'Cancelled', 'All'] as const

export class GrabAdapter implements PlatformAdapter {
  source = 'grab' as const

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

    const baseHeaders: Record<string, string> = {
      'Cookie': cookieHeader,
      'x-grab-tenant': 'GF_VN',
      'x-grab-country': 'VN',
      'Accept': 'application/json',
      'Accept-Language': 'vi',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://merchant.grab.com/food/orders',
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
    orders: NormalizedOrder[] | null
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
      orders: portalOrders.length ? portalOrders.map((order) => this.normalizePortalOrder(order)) : null,
      sawAuthFailure,
      sawPaginationEnvelope,
    }
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

    return allOrders.map(o => this.normalizeOrder(o))
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
    if (activeResult.orders) return activeResult.orders
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
        if (orders !== null) return orders.map(o => this.normalizePortalOrder(o))
      } catch {
        continue
      }
    }

    if (sawAuthFailure) return null
    if (sawHtmlShell) return []

    return null  // all endpoints failed – session likely expired
  }

  async fetchHistoricalOrdersWithSession(session: SessionData, storeId: string): Promise<NormalizedOrder[] | null> {
    const context = this.buildGrabSessionContext(session, storeId)
    if (!context) return null

    const historyResult = await this.fetchPortalOrdersByPageTypes(
      context.baseHeaders,
      context.discoveredStoreId,
      GRAB_PORTAL_HISTORY_PAGE_TYPES
    )

    if (historyResult.orders) return historyResult.orders
    if (historyResult.sawPaginationEnvelope) return []
    if (historyResult.sawAuthFailure) return null
    return []
  }

  /** Extract orders array from various portal response shapes */
  private extractOrdersFromPortalResponse(data: unknown): Record<string, unknown>[] | null {
    if (!data || typeof data !== 'object') return null
    const d = data as Record<string, unknown>
    if (Array.isArray(d)) return d as Record<string, unknown>[]
    if (Array.isArray(d.orders)) return d.orders as Record<string, unknown>[]
    if (Array.isArray(d.orderList)) return d.orderList as Record<string, unknown>[]
    if (Array.isArray(d.orderCards)) return d.orderCards as Record<string, unknown>[]
    if (Array.isArray(d.data)) return d.data as Record<string, unknown>[]
    if (Array.isArray(d.result)) return d.result as Record<string, unknown>[]
    if (Array.isArray(d.results)) return d.results as Record<string, unknown>[]
    if (d.data && typeof d.data === 'object' && !Array.isArray(d.data)) {
      const inner = d.data as Record<string, unknown>
      if (Array.isArray(inner.orders)) return inner.orders as Record<string, unknown>[]
      if (Array.isArray(inner.orderList)) return inner.orderList as Record<string, unknown>[]
      if (Array.isArray(inner.results)) return inner.results as Record<string, unknown>[]
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
  private normalizePortalOrder(raw: Record<string, unknown>): NormalizedOrder {
    // Portal might use different field names than Partner API
    const itemsRaw = (raw.items ?? raw.orderItems ?? raw.lineItems ?? []) as Record<string, unknown>[]
    const items: OrderItem[] = itemsRaw.map(i => ({
      name:     String(i.name ?? i.itemName ?? ''),
      quantity: Number(i.quantity ?? 1),
      price:    Number(i.itemPrice ?? i.price ?? i.unitPrice ?? 0),
      total:    Number(i.quantity ?? 1) * Number(i.itemPrice ?? i.price ?? i.unitPrice ?? 0),
    }))

    const statusMap: Record<string, OrderStatus> = {
      'PENDING':           'waiting_confirm',
      'ACCEPTED':          'waiting_pickup',
      'CONFIRMED':         'waiting_pickup',
      'PREPARING':         'waiting_pickup',
      'DRIVER_ALLOCATED':  'waiting_pickup',
      'DRIVER_ARRIVED':    'waiting_pickup',
      'COLLECTED':         'delivering',
      'IN_DELIVERY':       'delivering',
      'DELIVERED':         'completed',
      'COMPLETED':         'completed',
      'BILL_PAID':         'completed',
      'CANCELLED':         'cancelled',
      'FAILED':            'cancelled',
      'REFUNDED':          'cancelled',
    }

    const rawStatus = String(raw.orderState ?? raw.status ?? raw.orderStatus ?? raw.state ?? '')
    const consumer  = raw.consumer ?? raw.customer ?? raw.receiver ?? {} as Record<string, unknown>
    const consumerObj = typeof consumer === 'object' ? consumer as Record<string, unknown> : {}

    const priceObj = (raw.price ?? raw.pricing ?? {}) as Record<string, unknown>
    const subtotal = Number(priceObj.subtotal ?? raw.subtotal ?? raw.subTotal ?? 0)
    const discount = Number(priceObj.basketPromo ?? priceObj.discount ?? raw.discount ?? raw.discountAmount ?? 0)
    const total    = Number(priceObj.eaterPayment ?? priceObj.total ?? raw.total ?? raw.orderTotal ?? 0)

    const delivery = (raw.delivery ?? {}) as Record<string, unknown>
    const dropoff  = (delivery.dropoff ?? {}) as Record<string, unknown>
    const address  = String(dropoff.address ?? dropoff.formattedAddress ?? delivery.address ?? raw.deliveryAddress ?? '')

    return {
      source:          'grab',
      externalOrderId: String(raw.orderID ?? raw.id ?? raw.orderId ?? ''),
      externalStoreId: String(raw.merchantID ?? raw.merchantId ?? raw.storeId ?? ''),
      customerName:    String(consumerObj.name ?? consumerObj.displayName ?? 'Khách hàng'),
      customerPhone:   String(consumerObj.phones ?? consumerObj.phone ?? consumerObj.phoneNumber ?? ''),
      items,
      subtotal, discount, total,
      paymentMethod:   String(raw.paymentType ?? raw.paymentMethod ?? ''),
      deliveryInfo:    { address },
      driverInfo:      { name: '', phone: '' },
      orderStatus:     statusMap[rawStatus] ?? 'waiting_confirm',
      placedAt:        String(raw.orderTime ?? raw.createdAt ?? raw.createTime ?? new Date().toISOString()),
      rawPayload:      raw,
    }
  }

  normalizeOrder(raw: Record<string, unknown>): NormalizedOrder {
    // items[] — field name is 'items' in POS API v1.1.3 (not 'orderItems')
    const items: OrderItem[] = ((raw.items as Record<string, unknown>[]) ?? []).map((i) => ({
      name:     String(i.name ?? ''),
      quantity: Number(i.quantity ?? 1),
      price:    Number(i.price ?? 0),
      total:    Number(i.quantity ?? 1) * Number(i.price ?? 0),
    }))

    // orderState field (not 'state')
    const statusMap: Record<string, OrderStatus> = {
      'PENDING':           'waiting_confirm',
      'ACCEPTED':          'waiting_pickup',
      'DRIVER_ALLOCATED':  'waiting_pickup',
      'DRIVER_ARRIVED':    'waiting_pickup',
      'COLLECTED':         'delivering',
      'IN_DELIVERY':       'delivering',
      'DELIVERED':         'completed',
      'COMPLETED':         'completed',
      'BILL_PAID':         'completed',
      'CANCELLED':         'cancelled',
      'FAILED':            'cancelled',
      'REFUNDED':          'cancelled',
    }
    const rawStatus = String(raw.orderState ?? '')

    // receiver object contains customer name, phone, and delivery address
    const receiver = raw.receiver as Record<string, unknown> | undefined
    const receiverAddress = receiver?.address as Record<string, unknown> | undefined

    // price is a nested object in POS API v1.1.3
    const price = raw.price as Record<string, unknown> | undefined

    return {
      source:          'grab',
      externalOrderId: String(raw.orderID ?? ''),
      externalStoreId: String(raw.merchantID ?? ''),
      customerName:    String(receiver?.name ?? 'Khách hàng'),
      customerPhone:   String(receiver?.phones ?? ''),
      items,
      subtotal:        Number(price?.subtotal ?? 0),
      discount:        Number(price?.basketPromo ?? 0),
      total:           Number(price?.eaterPayment ?? 0),
      paymentMethod:   String(raw.paymentType ?? ''),
      deliveryInfo: {
        address: String(receiverAddress?.address ?? receiverAddress?.formattedAddress ?? ''),
      },
      driverInfo: {
        name:  '',
        phone: '',
      },
      orderStatus: statusMap[rawStatus] ?? 'waiting_confirm',
      placedAt:    String(raw.orderTime ?? new Date().toISOString()),
      rawPayload:  raw,
    }
  }
}
