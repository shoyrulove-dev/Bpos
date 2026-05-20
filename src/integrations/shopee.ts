import { createHmac } from 'crypto'
import type { NormalizedOrder, OrderItem, OrderStatus } from '@/types'
import type { PlatformAdapter, AdapterConfig, SessionData } from './types'

const SHOPEE_BASE = 'https://partner.shopeefood.vn'

// ─── ShopeeFood Merchant Portal internal API (Đường 2 – session-based) ────────
// Discovered by intercepting XHR during Playwright session at merchant.shopeefood.vn.
// Does NOT require partner registration. Requires browser session cookies (SPC_ST, SPC_F, etc.).
// Session TTL: ~7 days (SPC_ST cookie).
const SHOPEE_PORTAL_BASE = 'https://merchant.shopeefood.vn'
const SHOPEE_PORTAL_ORDER_LIST_ENDPOINT = `${SHOPEE_PORTAL_BASE}/api/v4/order/get_order_list`

/**
 * Shopee Food adapter – supports two operation modes:
 *   1. Official Partner API (partner.shopeefood.vn, HMAC-SHA256) — requires registration.
 *   2. Merchant Portal internal API (merchant.shopeefood.vn/api/v4) — session-based, no registration.
 *
 * Mode is selected automatically:
 *   - If config.sessionData is present → Đường 2 (session-based)
 *   - Otherwise → Đường 1 (partner API, needs partnerId/partnerKey/shopId/accessToken)
 *
 * Docs (partner): https://open.shopeefood.vn/documents/v2
 */
export class ShopeeAdapter implements PlatformAdapter {
  source = 'shopee' as const

  private sign(partnerId: string, partnerKey: string, path: string, timestamp: number, accessToken: string, shopId: string): string {
    const base = `${partnerId}${path}${timestamp}${accessToken}${shopId}`
    return createHmac('sha256', partnerKey).update(base).digest('hex')
  }

  private buildConfig(config: AdapterConfig) {
    return {
      partnerId: String(config.partnerId ?? ''),
      partnerKey: String(config.partnerKey ?? ''),
      shopId: String(config.shopId ?? config.storeId ?? ''),
      accessToken: String(config.accessToken ?? ''),
    }
  }

  private async fetchOrderList(config: AdapterConfig, options: { timeFrom: number; timeTo: number; pageSize?: number }) {
    const { partnerId, partnerKey, shopId, accessToken } = this.buildConfig(config)

    if (!partnerId || !partnerKey || !shopId || !accessToken) {
      throw new Error('Thiếu credentials: cần partnerId, partnerKey, shopId, accessToken')
    }

    const path = '/api/v2/order/get_order_list'
    const collected = new Map<string, Record<string, unknown>>()
    let cursor = ''

    for (let page = 0; page < 20; page += 1) {
      const timestamp = Math.floor(Date.now() / 1000)
      const sign = this.sign(partnerId, partnerKey, path, timestamp, accessToken, shopId)
      const params = new URLSearchParams({
        partner_id: partnerId,
        timestamp: String(timestamp),
        access_token: accessToken,
        shop_id: shopId,
        sign,
        time_range_field: 'create_time',
        time_from: String(options.timeFrom),
        time_to: String(options.timeTo),
        page_size: String(options.pageSize ?? 50),
      })
      if (cursor) params.set('cursor', cursor)

      const res = await fetch(`${SHOPEE_BASE}${path}?${params}`)
      if (!res.ok) throw new Error(`Shopee API ${res.status}: ${res.statusText}`)

      const data = await res.json() as {
        error?: string
        message?: string
        response?: {
          more?: boolean
          next_cursor?: string
          order_list?: Record<string, unknown>[]
        }
      }
      if (data.error) throw new Error(`Shopee: ${data.message ?? data.error}`)

      const list = data.response?.order_list ?? []
      list.forEach((order) => {
        const orderId = String(order.order_sn ?? '')
        if (orderId) collected.set(orderId, order)
      })

      if (!data.response?.more || !data.response?.next_cursor) break
      cursor = data.response.next_cursor
    }

    return Array.from(collected.values())
  }

  private async enrichOrdersWithDetails(rawOrders: Record<string, unknown>[], config: AdapterConfig) {
    const detailMap = new Map<string, NormalizedOrder>()
    const orderIds = rawOrders
      .map((order) => String(order.order_sn ?? ''))
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

      details.forEach((detail) => {
        if (!detail?.externalOrderId) return
        detailMap.set(detail.externalOrderId, detail)
      })
    }

    return rawOrders.map((order) => {
      const orderId = String(order.order_sn ?? '')
      return detailMap.get(orderId) ?? this.normalizeOrder(order)
    })
  }

  async fetchOrders(config: AdapterConfig): Promise<NormalizedOrder[]> {
    const timeTo = Math.floor(Date.now() / 1000)
    const timeFrom = timeTo - 86400
    const list = await this.fetchOrderList(config, { timeFrom, timeTo, pageSize: 50 })
    return this.enrichOrdersWithDetails(list, config)
  }

  async fetchHistoricalOrders(config: AdapterConfig, options?: { days?: number }): Promise<NormalizedOrder[]> {
    const days = Math.max(1, Math.min(90, Number(options?.days ?? 30)))
    const timeTo = Math.floor(Date.now() / 1000)
    const timeFrom = timeTo - days * 86400
    const list = await this.fetchOrderList(config, { timeFrom, timeTo, pageSize: 50 })
    return this.enrichOrdersWithDetails(list, config)
  }

  async fetchOrderDetail(orderId: string, config: AdapterConfig): Promise<NormalizedOrder | null> {
    const partnerId   = String(config.partnerId   ?? '')
    const partnerKey  = String(config.partnerKey  ?? '')
    const shopId      = String(config.shopId      ?? config.storeId ?? '')
    const accessToken = String(config.accessToken ?? '')
    if (!partnerId || !partnerKey || !shopId || !accessToken) return null

    const path      = '/api/v2/order/get_order_detail'
    const timestamp = Math.floor(Date.now() / 1000)
    const sign      = this.sign(partnerId, partnerKey, path, timestamp, accessToken, shopId)

    const params = new URLSearchParams({ partner_id: partnerId, timestamp: String(timestamp), access_token: accessToken, shop_id: shopId, sign, order_sn: orderId })
    const res  = await fetch(`${SHOPEE_BASE}${path}?${params}`)
    if (!res.ok) return null
    const data = await res.json() as { response?: Record<string, unknown> }
    return data.response ? this.normalizeOrder(data.response) : null
  }

  normalizeOrder(raw: Record<string, unknown>): NormalizedOrder {
    const items: OrderItem[] = ((raw.item_list ?? []) as Record<string, unknown>[]).map((i) => ({
      name:     String(i.item_name ?? ''),
      quantity: Number(i.model_quantity_purchased ?? 1),
      price:    Number(i.model_discounted_price ?? 0),
      total:    Number(i.model_quantity_purchased ?? 1) * Number(i.model_discounted_price ?? 0),
    }))

    const statusMap: Record<string, OrderStatus> = {
      UNPAID:           'waiting_confirm',
      READY_TO_SHIP:    'waiting_pickup',
      PROCESSED:        'waiting_pickup',
      SHIPPED:          'delivering',
      COMPLETED:        'completed',
      CANCELLED:        'cancelled',
      IN_CANCEL:        'cancelled',
      TO_RETURN:        'cancelled',
    }

    const rawStatus = String(raw.order_status ?? '')

    const subtotal   = Number(raw.total_amount ?? raw.item_list_price ?? 0)
    const escrow     = Number(raw.escrow_amount ?? raw.buyer_pay_amount ?? subtotal)
    const platformFee = Math.max(0, subtotal - escrow)

    return {
      source:          'shopee',
      externalOrderId: String(raw.order_sn ?? ''),
      externalStoreId: String(raw.shop_id ?? ''),
      customerName:    String((raw.recipient_address as Record<string,unknown>)?.name ?? 'Khách hàng'),
      customerPhone:   String((raw.recipient_address as Record<string,unknown>)?.phone ?? ''),
      items,
      subtotal,
      discount:        Number(raw.voucher_from_seller ?? 0),
      total:           subtotal,
      platformFee,
      paymentMethod:   String(raw.payment_method ?? ''),
      deliveryInfo: {
        address: String((raw.recipient_address as Record<string,unknown>)?.full_address ?? ''),
      },
      driverInfo: {
        name:  String((raw.logistics_info as Record<string,unknown>)?.shipper_name ?? ''),
        phone: String((raw.logistics_info as Record<string,unknown>)?.shipper_phone ?? ''),
      },
      orderStatus: statusMap[rawStatus] ?? 'waiting_confirm',
      placedAt:    new Date(Number(raw.create_time ?? Date.now()) * 1000).toISOString(),
      deliveredAt: raw.delivery_complete_time
        ? new Date(Number(raw.delivery_complete_time) * 1000).toISOString()
        : undefined,
      rawPayload:  raw,
    }
  }

  // ─── Đường 2: ShopeeFood Merchant Portal session-based ──────────────────────

  private buildShopeePortalHeaders(session: SessionData): Record<string, string> | null {
    const cookieHeader = session.cookies
      .filter((c) => c.expires === -1 || c.expires > Date.now() / 1000)
      .map((c) => `${c.name}=${c.value}`)
      .join('; ')
    if (!cookieHeader) return null

    // SPC_F cookie value is the CSRF token for ShopeeFood merchant portal
    const spcFCookie = session.cookies.find((c) => c.name === 'SPC_F')
    const csrfToken = spcFCookie?.value ?? session.extraHeaders?.['x-csrftoken'] ?? ''

    return {
      'Cookie': cookieHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin': SHOPEE_PORTAL_BASE,
      'Referer': `${SHOPEE_PORTAL_BASE}/order`,
      ...(csrfToken ? { 'x-csrftoken': csrfToken } : {}),
    }
  }

  /** Extract order list from various possible portal API response shapes. */
  private extractPortalOrders(data: unknown): Record<string, unknown>[] | null {
    if (!data || typeof data !== 'object') return null
    const d = data as Record<string, unknown>

    // Try common envelope structures
    const candidates = [
      d.data,
      d.result,
      d.response,
      d,
    ]
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue
      const c = candidate as Record<string, unknown>
      const list = c.order_list ?? c.orders ?? c.items ?? c.data ?? c.list
      if (Array.isArray(list) && list.length >= 0) return list as Record<string, unknown>[]
    }
    if (Array.isArray(data)) return data as Record<string, unknown>[]
    return null
  }

  /** Map ShopeeFood merchant portal order status to internal OrderStatus. */
  private mapPortalStatus(raw: Record<string, unknown>): OrderStatus {
    const rawStatus = String(
      raw.order_status ?? raw.status ?? raw.state ?? raw.orderStatus ?? ''
    ).toUpperCase()

    // ShopeeFood portal numeric status codes (discovered from network traffic)
    const numericStatus = Number(raw.order_status ?? raw.status ?? -1)
    if (!isNaN(numericStatus)) {
      // 1=new/pending, 2=confirmed, 3=preparing, 4=ready, 5=delivering, 6=completed, 7=cancelled
      if (numericStatus === 1) return 'waiting_confirm'
      if (numericStatus === 2 || numericStatus === 3) return 'waiting_pickup'
      if (numericStatus === 4) return 'waiting_pickup'
      if (numericStatus === 5) return 'delivering'
      if (numericStatus === 6) return 'completed'
      if (numericStatus === 7 || numericStatus === 8) return 'cancelled'
    }

    if (rawStatus.includes('CANCEL')) return 'cancelled'
    if (rawStatus.includes('COMPLET') || rawStatus.includes('DELIVER') || rawStatus.includes('DONE')) return 'completed'
    if (rawStatus.includes('SHIP') || rawStatus.includes('TRANSIT') || rawStatus.includes('PICK')) return 'delivering'
    if (rawStatus.includes('PROCESS') || rawStatus.includes('PREPAR') || rawStatus.includes('CONFIRM')) return 'waiting_pickup'
    if (rawStatus.includes('PENDING') || rawStatus.includes('NEW') || rawStatus.includes('WAIT')) return 'waiting_confirm'
    return 'waiting_confirm'
  }

  /** Normalize a ShopeeFood merchant portal order into NormalizedOrder. */
  normalizePortalOrder(raw: Record<string, unknown>): NormalizedOrder {
    const rawCustomer = (raw.buyer ?? raw.customer ?? raw.user ?? {}) as Record<string, unknown>
    const rawDelivery = (raw.delivery_info ?? raw.delivery ?? raw.logistics_info ?? {}) as Record<string, unknown>
    const rawDriver   = (raw.driver ?? raw.shipper ?? rawDelivery.driver ?? rawDelivery.shipper ?? {}) as Record<string, unknown>
    const rawItems    = (raw.item_list ?? raw.items ?? raw.foods ?? raw.order_items ?? []) as Record<string, unknown>[]

    const items: OrderItem[] = rawItems.map((i) => {
      const qty   = Number(i.quantity ?? i.model_quantity_purchased ?? i.count ?? 1)
      const price = Number(i.price ?? i.model_discounted_price ?? i.unit_price ?? 0)
      const note  = String(i.note ?? i.modifier_groups_text ?? i.options ?? '').trim()
      return {
        name:     String(i.name ?? i.item_name ?? i.food_name ?? i.product_name ?? ''),
        quantity: qty,
        price,
        total:    Number(i.total ?? i.subtotal ?? price * qty),
        ...(note ? { note } : {}),
      }
    })

    const orderId    = String(raw.order_sn ?? raw.order_id ?? raw.id ?? '')
    const storeId    = String(raw.shop_id ?? raw.store_id ?? raw.restaurant_id ?? raw.food_delivery_id ?? '')
    const createTime = Number(raw.create_time ?? raw.created_at ?? raw.order_time ?? 0)
    const subtotal   = Number(raw.total_amount ?? raw.sub_total ?? raw.merchandise_subtotal ?? raw.amount ?? 0)
    const total      = Number(raw.total ?? raw.grand_total ?? raw.order_total ?? subtotal)
    const discount   = Number(raw.discount ?? raw.voucher_from_seller ?? 0)
    const platformFee = Number(raw.platform_fee ?? raw.commission ?? 0)
    const paymentMethod = String(raw.payment_method ?? raw.payment_type ?? '')
    const deliveryAddress = String(
      raw.delivery_address ?? rawDelivery.address ?? rawCustomer.address ??
      (raw.recipient_address as Record<string, unknown>)?.full_address ?? ''
    )
    const customerName  = String(
      rawCustomer.name ?? rawCustomer.user_name ?? rawCustomer.display_name ??
      (raw.recipient_address as Record<string, unknown>)?.name ?? 'Khách hàng'
    )
    const customerPhone = String(
      rawCustomer.phone ?? rawCustomer.phone_number ?? rawCustomer.mobile ??
      (raw.recipient_address as Record<string, unknown>)?.phone ?? ''
    )
    const driverName  = String(rawDriver.name ?? rawDriver.driver_name ?? rawDelivery.shipper_name ?? '')
    const driverPhone = String(rawDriver.phone ?? rawDriver.driver_phone ?? rawDelivery.shipper_phone ?? '')

    const deliveredAt = raw.delivery_complete_time ?? raw.delivered_at ?? raw.completed_at
    const cancelledAt = raw.cancel_time ?? raw.cancelled_at

    const status = this.mapPortalStatus(raw)

    return {
      source:          'shopee',
      externalOrderId: orderId,
      externalStoreId: storeId,
      customerName,
      customerPhone,
      items,
      subtotal,
      discount,
      total,
      platformFee,
      paymentMethod,
      deliveryInfo:    { address: deliveryAddress },
      driverInfo:      { name: driverName, phone: driverPhone },
      orderStatus:     status,
      placedAt:        createTime > 0 ? new Date(createTime * 1000).toISOString() : new Date().toISOString(),
      deliveredAt:     deliveredAt ? new Date(Number(deliveredAt) * 1000).toISOString() : undefined,
      rawPayload:      { ...raw, ...(cancelledAt ? { _cancelledAt: new Date(Number(cancelledAt) * 1000).toISOString() } : {}) },
    }
  }

  private async fetchPortalOrderPage(
    headers: Record<string, string>,
    storeId: string,
    options?: { type?: number; page?: number; timeFrom?: number; timeTo?: number }
  ): Promise<Record<string, unknown>[] | null> {
    const body: Record<string, unknown> = {
      page:      options?.page ?? 1,
      page_size: 50,
      type:      options?.type ?? 1,  // 1=active
    }
    if (storeId) body.food_delivery_id = storeId
    if (options?.timeFrom) body.time_from = options.timeFrom
    if (options?.timeTo)   body.time_to   = options.timeTo

    try {
      const res = await fetch(SHOPEE_PORTAL_ORDER_LIST_ENDPOINT, {
        method:  'POST',
        headers,
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(10000),
      })
      if (res.status === 401 || res.status === 403) return null
      if (!res.ok) return []
      const data = await res.json() as unknown
      return this.extractPortalOrders(data) ?? []
    } catch {
      return null
    }
  }

  async fetchOrdersWithSession(session: SessionData, storeId: string): Promise<NormalizedOrder[] | null> {
    const headers = this.buildShopeePortalHeaders(session)
    if (!headers) return null

    const resolvedStoreId = storeId || String(session.storeInfo?.storeId ?? '')
    const seenIds = new Set<string>()
    const result: NormalizedOrder[] = []

    // Fetch active orders (type=1)
    const active = await this.fetchPortalOrderPage(headers, resolvedStoreId, { type: 1 })
    if (active === null) return null  // auth failed

    // Fetch recent history orders (type=2) — last 24h
    const timeTo   = Math.floor(Date.now() / 1000)
    const timeFrom = timeTo - 86400
    const history  = await this.fetchPortalOrderPage(headers, resolvedStoreId, { type: 2, timeFrom, timeTo }) ?? []

    for (const raw of [...active, ...history]) {
      const id = String(raw.order_sn ?? raw.order_id ?? raw.id ?? '')
      if (!id || seenIds.has(id)) continue
      seenIds.add(id)
      result.push(this.normalizePortalOrder(raw))
    }

    return result
  }

  async fetchHistoricalOrdersWithSession(session: SessionData, storeId: string, options?: { days?: number }): Promise<NormalizedOrder[] | null> {
    const headers = this.buildShopeePortalHeaders(session)
    if (!headers) return null

    const resolvedStoreId = storeId || String(session.storeInfo?.storeId ?? '')
    const days     = Math.max(1, Math.min(90, Number(options?.days ?? 30)))
    const timeTo   = Math.floor(Date.now() / 1000)
    const timeFrom = timeTo - days * 86400

    const seenIds = new Set<string>()
    const result: NormalizedOrder[] = []

    for (let page = 1; page <= 20; page++) {
      const orders = await this.fetchPortalOrderPage(headers, resolvedStoreId, { type: 2, page, timeFrom, timeTo })
      if (!orders || orders.length === 0) break

      for (const raw of orders) {
        const id = String(raw.order_sn ?? raw.order_id ?? raw.id ?? '')
        if (!id || seenIds.has(id)) continue
        seenIds.add(id)
        result.push(this.normalizePortalOrder(raw))
      }

      if (orders.length < 50) break
    }

    return result
  }
}
