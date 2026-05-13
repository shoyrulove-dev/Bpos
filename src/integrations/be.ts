import type { NormalizedOrder, OrderItem, OrderStatus } from '@/types'
import { hasBeCancelSignal } from '@/lib/be-order-status'
import { normalizeCompactPhone } from '@/lib/phone'
import type { PlatformAdapter, AdapterConfig, SessionData } from './types'

/**
 * Be Food adapter – beFood Partner Open API
 * Docs: https://developers.be.com.vn/docs/food-api-10
 *
 * Auth: OAuth2 — POST {base}/v1/authorize → { client_id, client_secret } → access_token (JWT, 2h)
 * Orders: POST {base}/partner/v1/orders → { restaurant_id, fetch_type }
 *
 * Credentials cần từ Be (đăng ký Partner):
 *   - clientId     : số ID cấp bởi beFood khi đăng ký merchant partner
 *   - clientSecret : secret cấp bởi beFood
 *   - restaurantId : ID nhà hàng trên beFood (ví dụ: 129990, 99379)
 */

const BE_BASE_PROD    = 'https://gw.be.com.vn/api/v1/be-food-gateway'
const BE_BASE_STAGING = 'https://gw.veep.me/api/v1/be-food-gateway'
const BE_MERCHANT_BASE = 'https://gw.be.com.vn/api/v1/be-merchant-gateway/v2/merchant'
const BE_MERCHANT_OPERATOR_TOKEN = '0b28e008bc323838f5ec84f718ef11e6'
const BE_MERCHANT_DEVICE_TYPE = '2'

// Status integer → fetch_type context mapping (Be API uses int, not string enum)
// Inferred from docs examples: status 21 = completed (previous), status 2 = in-process
// All 3 active tabs (pending=new, in_progress=preparing, on_delivery=ready for pickup) → waiting_pickup
const STATUS_BY_FETCH: Record<string, OrderStatus> = {
  in_progress: 'waiting_pickup',
  on_delivery: 'waiting_pickup',
  pending:     'waiting_pickup',
  previous:    'waiting_pickup',  // default for history; overridden to completed(21) or cancelled below
  cancelled:   'cancelled',
}

// Simple in-process token cache keyed by clientId (lives in memory per serverless instance)
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

export class BeAdapter implements PlatformAdapter {
  source = 'be' as const

  private hasCancelSignal(raw: Record<string, unknown>): boolean {
    return hasBeCancelSignal(raw)
  }

  private async fetchOrderDetailRawWithSession(
    accessToken: string,
    merchantContext: { merchantId: number; userId: number },
    restaurantId: number,
    orderId: string
  ): Promise<Record<string, unknown> | null> {
    const res = await fetch(`${BE_MERCHANT_BASE}/get_restaurant_order`, {
      method: 'POST',
      headers: this.buildMerchantHeaders(),
      body: JSON.stringify({
        device_type: Number(BE_MERCHANT_DEVICE_TYPE),
        access_token: accessToken,
        merchant_id: merchantContext.merchantId,
        api_version: 2,
        user_id: merchantContext.userId,
        restaurant_id: restaurantId,
        locale: 'vi',
        device_token: '',
        order_id: Number(orderId),
        id: Number(orderId),
      }),
    })

    if (!res.ok) return null

    const data = await res.json() as { order?: Record<string, unknown>; code?: number }
    return data.order ?? null
  }

  private async enrichSessionOrdersWithDetails(
    rawOrders: Record<string, unknown>[],
    accessToken: string,
    merchantContext: { merchantId: number; userId: number },
    restaurantId: number,
    fetchType: string
  ) {
    // For cancelled orders, skip detail enrichment to preserve cancelled status — the detail
    // endpoint may return status 21 (completed) which would incorrectly override 'cancelled'.
    if (fetchType === 'cancelled') {
      return rawOrders.map((order) => this.normalizeOrder(order, fetchType))
    }

    const detailMap = new Map<string, Record<string, unknown>>()
    const orderIds = rawOrders
      .map((order) => String(order.order_id ?? ''))
      .filter(Boolean)

    for (let index = 0; index < orderIds.length; index += 5) {
      const batch = orderIds.slice(index, index + 5)
      const details = await Promise.all(batch.map(async (orderId) => {
        try {
          return await this.fetchOrderDetailRawWithSession(accessToken, merchantContext, restaurantId, orderId)
        } catch {
          return null
        }
      }))

      for (const detail of details) {
        if (!detail) continue

        const orderId = String(detail.order_id ?? '')
        if (!orderId) continue
        detailMap.set(orderId, detail)
      }
    }

    return rawOrders.map((order) => {
      const orderId = String(order.order_id ?? '')
      const rawDetail = detailMap.get(orderId) ?? order
      const normalized = this.normalizeOrder(rawDetail, fetchType)

      // For previous bucket: if raw order OR detail has any cancel signal that normalizeOrder
      // might have missed (e.g. unknown status int), force cancelled
      if (fetchType === 'previous' && normalized.orderStatus !== 'cancelled') {
        if (this.hasCancelSignal(order) || (detailMap.has(orderId) && this.hasCancelSignal(detailMap.get(orderId)!))) {
          console.log(`[BE] previous order ${orderId} forced cancelled by cancel signal fields`)
          return { ...normalized, orderStatus: 'cancelled' as const }
        }
      }

      return normalized
    })
  }

  private async enrichOrdersWithDetails(rawOrders: Record<string, unknown>[], config: AdapterConfig, fetchType: string): Promise<NormalizedOrder[]> {
    const detailMap = new Map<string, NormalizedOrder>()
    const orderIds = rawOrders
      .map((order) => String(order.order_id ?? ''))
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
        // fetchOrderDetail normalizes without fetchType context — re-apply cancelled status
        const corrected = fetchType === 'cancelled'
          ? { ...detail, orderStatus: 'cancelled' as const }
          : detail
        detailMap.set(detail.externalOrderId, corrected)
      }
    }

    return rawOrders.map((order) => {
      const orderId = String(order.order_id ?? '')
      return detailMap.get(orderId) ?? this.normalizeOrder(order, fetchType)
    })
  }

  private parseJwtPayload(token: string): Record<string, unknown> | null {
    const [, payload] = token.split('.')
    if (!payload) return null

    try {
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
      return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>
    } catch {
      return null
    }
  }

  private getSessionAccessToken(session: SessionData): string | null {
    const raw = session.extraHeaders?.Authorization ?? session.extraHeaders?.authorization
    if (!raw) return null
    return raw.replace(/^Bearer\s+/i, '').trim() || null
  }

  private buildMerchantHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'device_type': BE_MERCHANT_DEVICE_TYPE,
      'operator_token': BE_MERCHANT_OPERATOR_TOKEN,
    }
  }

  private async getUserProfiles(accessToken: string, userId: number): Promise<Array<{
    merchant_id?: number
    merchant_name?: string
    store_profiles?: Array<{ store_id?: number; store_name?: string }>
  }> | null> {
    const res = await fetch(`${BE_MERCHANT_BASE}/get_user_profiles`, {
      method: 'POST',
      headers: this.buildMerchantHeaders(),
      body: JSON.stringify({
        operator_token: BE_MERCHANT_OPERATOR_TOKEN,
        device_type: Number(BE_MERCHANT_DEVICE_TYPE),
        access_token: accessToken,
        user_id: userId,
        locale: 'vi',
        device_token: '',
      }),
    })

    if (!res.ok) return null

    const data = await res.json() as {
      data?: Array<{
        merchant_id?: number
        merchant_name?: string
        store_profiles?: Array<{ store_id?: number; store_name?: string }>
      }>
    }

    return data.data ?? null
  }

  private async resolveMerchantContext(accessToken: string, restaurantId: number): Promise<{ merchantId: number; userId: number } | null> {
    const payload = this.parseJwtPayload(accessToken)
    const userId = Number(payload?.sub ?? 0)
    if (!userId) return null

    const profiles = await this.getUserProfiles(accessToken, userId)
    const profile = profiles?.find((entry) =>
      entry.store_profiles?.some((store) => Number(store.store_id ?? 0) === restaurantId)
    )

    const merchantId = Number(profile?.merchant_id ?? 0)
    if (!merchantId) return null

    return { merchantId, userId }
  }

  private async resolveSessionRestaurant(accessToken: string, restaurantId: string): Promise<{
    restaurantId: number
    merchantContext: { merchantId: number; userId: number }
  } | null> {
    const configuredRestaurantId = Number(restaurantId)
    if (configuredRestaurantId) {
      const merchantContext = await this.resolveMerchantContext(accessToken, configuredRestaurantId)
      if (!merchantContext) return null
      return { restaurantId: configuredRestaurantId, merchantContext }
    }

    const payload = this.parseJwtPayload(accessToken)
    const userId = Number(payload?.sub ?? 0)
    if (!userId) return null

    const profiles = await this.getUserProfiles(accessToken, userId)
    const stores = (profiles ?? []).flatMap((profile) =>
      (profile.store_profiles ?? []).map((store) => ({
        merchantId: Number(profile.merchant_id ?? 0),
        restaurantId: Number(store.store_id ?? 0),
      }))
    ).filter((store) => store.merchantId && store.restaurantId)

    if (stores.length !== 1) return null

    return {
      restaurantId: stores[0].restaurantId,
      merchantContext: {
        merchantId: stores[0].merchantId,
        userId,
      },
    }
  }

  private getBase(config: AdapterConfig): string {
    return config.useStaging === 'true' ? BE_BASE_STAGING : BE_BASE_PROD
  }

  private async getToken(clientId: string, clientSecret: string, base: string): Promise<string> {
    const cached = tokenCache.get(clientId)
    // Use cached token if still valid for >60s
    if (cached && cached.expiresAt - Date.now() > 60_000) return cached.token

    const res = await fetch(`${base}/v1/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    })
    if (res.status === 401) throw new Error('client_id hoặc client_secret không hợp lệ')
    if (!res.ok) throw new Error(`Be Auth ${res.status}: ${res.statusText}`)

    const data = await res.json() as { access_token?: string; expires_in?: string; code?: number }
    if (!data.access_token) throw new Error('Be API không trả về access_token')

    const expiresIn = Number(data.expires_in ?? 7200)
    tokenCache.set(clientId, { token: data.access_token, expiresAt: Date.now() + expiresIn * 1000 })
    return data.access_token
  }

  private async fetchByType(
    token: string, base: string, restaurantId: number, fetchType: string
  ): Promise<Record<string, unknown>[]> {
    const res = await fetch(`${base}/partner/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ restaurant_id: restaurantId, fetch_type: fetchType }),
    })
    if (res.status === 401) {
      // Token may be stale — clear cache and let caller retry
      tokenCache.delete(String(restaurantId))
      throw new Error('Access token hết hạn, thử lại')
    }
    if (!res.ok) throw new Error(`Be orders API ${res.status}: ${res.statusText}`)
    const data = await res.json() as { restaurant_orders?: Record<string, unknown>[] }
    return data.restaurant_orders ?? []
  }

  async fetchOrders(config: AdapterConfig): Promise<NormalizedOrder[]> {
    const clientId     = String(config.clientId     ?? '')
    const clientSecret = String(config.clientSecret ?? '')
    const restaurantId = Number(config.restaurantId ?? config.storeId ?? config.externalStoreId ?? 0)

    if (!clientId)     throw new Error('Thiếu client_id (cung cấp bởi beFood khi đăng ký Partner)')
    if (!clientSecret) throw new Error('Thiếu client_secret (cung cấp bởi beFood khi đăng ký Partner)')
    if (!restaurantId) throw new Error('Thiếu restaurant_id (ID nhà hàng trên beFood, ví dụ: 129990)')

    const base  = this.getBase(config)
    const token = await this.getToken(clientId, clientSecret, base)

    // Fetch both active states in parallel
    const [inProgress, pending] = await Promise.all([
      this.fetchByType(token, base, restaurantId, 'in_progress').catch(() => [] as Record<string, unknown>[]),
      this.fetchByType(token, base, restaurantId, 'pending').catch(() => [] as Record<string, unknown>[]),
    ])

    const seen = new Set<string>()
    const all: NormalizedOrder[] = []
    for (const [orders, fetchType] of [[inProgress, 'in_progress'], [pending, 'pending']] as [Record<string, unknown>[], string][]) {
      const enriched = await this.enrichOrdersWithDetails(orders, config, fetchType)
      for (const order of enriched) {
        const id = String(order.externalOrderId ?? '')
        if (!id || seen.has(id)) continue
        seen.add(id)
        all.push(order)
      }
    }
    return all
  }

  async fetchHistoricalOrders(config: AdapterConfig): Promise<NormalizedOrder[]> {
    const clientId     = String(config.clientId     ?? '')
    const clientSecret = String(config.clientSecret ?? '')
    const restaurantId = Number(config.restaurantId ?? config.storeId ?? config.externalStoreId ?? 0)

    if (!clientId)     throw new Error('Thiếu client_id (cung cấp bởi beFood khi đăng ký Partner)')
    if (!clientSecret) throw new Error('Thiếu client_secret (cung cấp bởi beFood khi đăng ký Partner)')
    if (!restaurantId) throw new Error('Thiếu restaurant_id (ID nhà hàng trên beFood, ví dụ: 129990)')

    const base  = this.getBase(config)
    const token = await this.getToken(clientId, clientSecret, base)
    const [previous, cancelled] = await Promise.all([
      this.fetchByType(token, base, restaurantId, 'previous').catch(() => [] as Record<string, unknown>[]),
      this.fetchByType(token, base, restaurantId, 'cancelled').catch(() => [] as Record<string, unknown>[]),
    ])
    const seen = new Set<string>()
    const all: NormalizedOrder[] = []
    // Process cancelled FIRST so cancelled orders win if an order appears in both buckets
    for (const [orders, fetchType] of [[cancelled, 'cancelled'], [previous, 'previous']] as [Record<string, unknown>[], string][]) {
      const enriched = await this.enrichOrdersWithDetails(orders, config, fetchType)
      for (const order of enriched) {
        const id = String(order.externalOrderId ?? '')
        if (!id || seen.has(id)) continue
        seen.add(id)
        all.push(order)
      }
    }
    return all
  }

  async fetchOrderDetail(orderId: string, config: AdapterConfig): Promise<NormalizedOrder | null> {
    const clientId     = String(config.clientId     ?? '')
    const clientSecret = String(config.clientSecret ?? '')
    const restaurantId = Number(config.restaurantId ?? config.storeId ?? 0)
    if (!clientId || !clientSecret || !restaurantId) return null
    try {
      const base  = this.getBase(config)
      const token = await this.getToken(clientId, clientSecret, base)
      const res = await fetch(`${base}/partner/v1/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ restaurant_id: restaurantId, order_id: Number(orderId) }),
      })
      if (!res.ok) return null
      const data = await res.json() as { order?: Record<string, unknown> }
      return data.order ? this.normalizeOrder(data.order) : null
    } catch { return null }
  }

  normalizeOrder(raw: Record<string, unknown>, fetchType?: string): NormalizedOrder {
    const orderItems = Array.isArray(raw.order_items)
      ? raw.order_items as Record<string, unknown>[]
      : Array.isArray(raw.items)
      ? raw.items as Record<string, unknown>[]
      : []

    const items: OrderItem[] = orderItems.map((i) => {
      const quantity = Math.max(1, Number(i.quantity ?? i.item_quantity ?? 1))

      // Parse customizations — BE returns customize_json (partner API) or customize_object (merchant gateway)
      // Both may be a JSON array: [{ name: "GroupName", options: [{ name: "...", price: 0 }] }]
      let customizationLines: string[] = []

      type BeCustomizeGroup = { name?: string; options?: Array<{ name?: string; quantity?: number; price?: number }> }
      const parseCustomizeGroups = (src: string): BeCustomizeGroup[] | null => {
        const trimmed = src.trim()
        if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return null
        try {
          const parsed = JSON.parse(trimmed)
          return Array.isArray(parsed) ? parsed : null
        } catch { return null }
      }

      const buildLines = (groups: BeCustomizeGroup[]) =>
        groups.flatMap((group) =>
          (group.options ?? []).map((option) => {
            const groupLabel = group.name ? `${String(group.name).trim()}: ` : ''
            const qty = option.quantity && option.quantity > 1 ? `${option.quantity} x ` : ''
            const price = typeof option.price === 'number' && option.price > 0 ? ` (+${option.price.toLocaleString('vi-VN')}đ)` : ''
            return `${groupLabel}${qty}${String(option.name ?? '').trim()}${price}`.trim()
          })
        ).filter(Boolean)

      const jsonSrc = String(i.customize_json ?? '').trim() || String(i.customize_object ?? '').trim()
      if (jsonSrc) {
        const groups = parseCustomizeGroups(jsonSrc)
        if (groups) customizationLines = buildLines(groups)
      }

      // Text fallback: "GroupA: Option1 | GroupB: Option2" or comma-separated
      if (!customizationLines.length) {
        const text = String(i.customize_object ?? i.customize_json ?? '').trim()
        if (text) {
          // Try pipe separator first (more reliable than comma because group names may contain commas)
          const parts = text.includes('|') ? text.split('|') : text.split(',')
          customizationLines = parts.map((p) => p.trim()).filter(Boolean)
        }
      }

      const noteParts = Array.from(new Set([
        String(i.note ?? i.item_note ?? '').trim(),
        ...customizationLines,
      ].filter(Boolean)))

      // unit_price is per-item; amount is total for this line item (quantity * unit_price)
      const unitPrice = Number(i.unit_price ?? i.uint_price ?? i.item_price ?? 0)
      const lineTotal = Number(i.amount ?? i.original_amount ?? 0)
      const computedUnitPrice = unitPrice > 0 ? unitPrice : (lineTotal > 0 ? Math.round(lineTotal / quantity) : 0)

      return {
        name:     String(i.item_name ?? i.name ?? ''),
        quantity,
        price:    computedUnitPrice,
        total:    lineTotal || computedUnitPrice * quantity,
        note:     noteParts.join(' | ') || undefined,
      }
    })

    // Be API uses integer status codes — check multiple possible field names (merchant portal may use order_status / current_status)
    const statusInt = Number(raw.status ?? raw.order_status ?? raw.current_status ?? raw.state ?? raw.order_state ?? -1)
    // Trust fetch_type bucket first — orders in active tabs (in_progress/on_delivery/pending) can NEVER be cancelled
    const ACTIVE_FETCH_TYPES = new Set(['in_progress', 'on_delivery', 'pending'])
    const isActiveBucket = fetchType ? ACTIVE_FETCH_TYPES.has(fetchType) : false
    let orderStatus: OrderStatus = (fetchType ? STATUS_BY_FETCH[fetchType] : undefined) ?? 'waiting_confirm'
    if (!isActiveBucket) {
      // Only apply cancel/complete detection for history buckets (previous, cancelled) or unknown fetchType
      const isDefinitelyCompleted = (statusInt === 21 || statusInt === 20) && fetchType !== 'cancelled'
      if (isDefinitelyCompleted) {
        orderStatus = 'completed'
      } else if (fetchType === 'previous') {
        // previous bucket includes: đang giao (driver delivering) → waiting_pickup,
        // đã giao (delivered, status 21) → completed, hủy → cancelled
        const CANCELLED_INTS = new Set([3, 4, 5, 6, 7, 8, 9, 10, 99, 100])
        if (CANCELLED_INTS.has(statusInt)) {
          orderStatus = 'cancelled'
        } else {
          // default = waiting_pickup (đang giao); completed only when status 21/20 (handled above)
          orderStatus = 'waiting_pickup'
        }
      } else {
        // Broad cancelled detection: 99/100 (partner), 3-10 (merchant portal cancel reasons)
        const CANCELLED_INTS = new Set([3, 4, 5, 6, 7, 8, 9, 10, 99, 100])
        if (CANCELLED_INTS.has(statusInt)) orderStatus = 'cancelled'
        // Check explicit cancellation fields in raw payload (merchant API may include these)
        if (this.hasCancelSignal(raw)) orderStatus = 'cancelled'
      }
    }

    // BE price breakdown (merchant perspective):
    //   order_amount / sub_total = food value (what customer pays for food)
    //   jugnoo_commission        = platform fee deducted from merchant
    //   net_order_amount         = what merchant actually receives
    //   total_amount             = food + delivery fee (customer total) — do NOT use as order total
    const total = Number(
      raw.order_amount ?? raw.originial_amount ?? raw.original_amount
      ?? raw.sub_total ?? raw.subtotal ?? raw.final_amount ?? 0
    )
    const original = Number(
      raw.originial_amount ?? raw.original_amount
      ?? raw.sub_total ?? raw.subtotal ?? raw.order_amount ?? total
    )
    const discount = original > total ? original - total : 0

    // Platform fee: jugnoo_commission is BE's name for the merchant commission
    const actualReceived = Number(raw.net_order_amount ?? raw.received_amount ?? raw.merchant_receivable ?? 0)
    const platformFee = Number(
      raw.jugnoo_commission
      ?? (actualReceived > 0 && total > actualReceived ? total - actualReceived : undefined)
      ?? 0
    )

    const deliveredAt = String(
      raw.delivered_at ?? raw.completed_at ?? raw.completedAt ?? raw.finished_at ?? raw.updated_at ?? raw.updatedAt ?? ''
    ) || undefined

    const driverName = String(raw.driver_name ?? '').trim()
    const driverPhone = normalizeCompactPhone(String(raw.driver_phone_no ?? raw.driver_contact ?? ''))

    return {
      source:          'be',
      externalOrderId: String(raw.order_id ?? ''),
      externalStoreId: String(raw.restaurant_id ?? raw.store_id ?? ''),
      customerName:    String(raw.customer_name ?? 'Khách hàng'),
      customerPhone:   normalizeCompactPhone(String(raw.customer_phone_no ?? raw.receiver_phone_no ?? '')),
      items,
      subtotal:        original,
      discount,
      total,
      platformFee,
      paymentMethod:   String(raw.payment_method ?? raw.payment_mode ?? (raw.is_pickup_order ? 'pickup' : 'delivery')),
      deliveryInfo: {
        address: String(raw.delivery_address ?? ''),
        note:    String(raw.delivery_note ?? raw.note ?? raw.customer_note ?? raw.special_instruction ?? raw.remark ?? '') || undefined,
        estimatedTime: String(raw.to_be_delivered_at ?? raw.estimated_delivery_time ?? raw.promised_delivery_time ?? '') || undefined,
      },
      driverInfo: (driverName || driverPhone) ? { name: driverName, phone: driverPhone } : undefined,
      orderStatus,
      placedAt:   String(raw.created_at ?? raw.ordered_at ?? new Date().toISOString()),
      deliveredAt: orderStatus === 'completed' ? deliveredAt : undefined,
      rawPayload:  raw,
    }
  }

  /**
   * Fetch orders using a captured browser session (auto-login mode).
   * Uses the JWT extracted from merchant.be.com.vn portal localStorage.
   * The JWT from the portal is the same credential used by the Be Partner API.
   */
  async fetchOrdersWithSession(session: SessionData, restaurantId: string): Promise<NormalizedOrder[] | null> {
    const accessToken = this.getSessionAccessToken(session)
    if (!accessToken) return null

    const sessionRestaurant = await this.resolveSessionRestaurant(accessToken, restaurantId)
    if (!sessionRestaurant) return null

    const { restaurantId: resId, merchantContext } = sessionRestaurant

    try {
      const [inProgress, onDelivery, pending] = await Promise.all([
        this.fetchByTypeWithSession(accessToken, merchantContext, resId, 'in_progress'),
        this.fetchByTypeWithSession(accessToken, merchantContext, resId, 'on_delivery'),
        this.fetchByTypeWithSession(accessToken, merchantContext, resId, 'pending'),
      ])

      const seen = new Set<string>()
      const all: NormalizedOrder[] = []
      for (const [orders, fetchType] of [[inProgress, 'in_progress'], [onDelivery, 'on_delivery'], [pending, 'pending']] as [Record<string, unknown>[], string][]) {
        const enrichedOrders = await this.enrichSessionOrdersWithDetails(orders, accessToken, merchantContext, resId, fetchType)
        for (const o of enrichedOrders) {
          const id = String(o.externalOrderId ?? '')
          if (!id || seen.has(id)) continue
          seen.add(id)
          all.push(o)
        }
      }
      return all
    } catch {
      return null
    }
  }

  async fetchOrderDetailWithSession(orderId: string, session: SessionData, restaurantId: string): Promise<NormalizedOrder | null> {
    const accessToken = this.getSessionAccessToken(session)
    if (!accessToken) return null

    const sessionRestaurant = await this.resolveSessionRestaurant(accessToken, restaurantId)
    if (!sessionRestaurant) return null

    const detail = await this.fetchOrderDetailRawWithSession(
      accessToken,
      sessionRestaurant.merchantContext,
      sessionRestaurant.restaurantId,
      orderId,
    )
    if (!detail) return null

    const normalized = this.normalizeOrder(detail, 'previous')
    return this.hasCancelSignal(detail)
      ? { ...normalized, orderStatus: 'cancelled' as const }
      : normalized
  }

  async fetchHistoricalOrdersWithSession(session: SessionData, restaurantId: string, _options?: { days?: number }): Promise<NormalizedOrder[] | null> {
    const accessToken = this.getSessionAccessToken(session)
    if (!accessToken) return null

    const sessionRestaurant = await this.resolveSessionRestaurant(accessToken, restaurantId)
    if (!sessionRestaurant) return null

    const { restaurantId: resId, merchantContext } = sessionRestaurant

    try {
      const [previous, merchantCancelled] = await Promise.all([
        this.fetchByTypeWithSession(accessToken, merchantContext, resId, 'previous'),
        this.fetchByTypeWithSession(accessToken, merchantContext, resId, 'cancelled').catch(() => [] as Record<string, unknown>[]),
      ])

      // Fallback: if merchant cancelled bucket returns nothing, try alternate fetch_type spellings
      let cancelled = merchantCancelled
      if (!cancelled.length) {
        const alt = await this.fetchByTypeWithSession(accessToken, merchantContext, resId, 'cancel').catch(() => [] as Record<string, unknown>[])
        if (alt.length) cancelled = alt
      }

      // Fallback 2: try the partner API endpoint with the session JWT as bearer token
      // (same gateway, different path — JWT may be accepted by partner API too)
      if (!cancelled.length) {
        try {
          const partnerRes = await fetch(`${BE_BASE_PROD}/partner/v1/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({ restaurant_id: resId, fetch_type: 'cancelled' }),
            signal: AbortSignal.timeout(8000),
          })
          if (partnerRes.ok) {
            const partnerData = await partnerRes.json() as { restaurant_orders?: Record<string, unknown>[] }
            if (partnerData.restaurant_orders?.length) {
              cancelled = partnerData.restaurant_orders
              console.log(`[BE] partner-api cancelled fallback: ${cancelled.length} orders for restaurant=${resId}`)
            }
          } else {
            console.log(`[BE] partner-api cancelled fallback HTTP ${partnerRes.status} for restaurant=${resId}`)
          }
        } catch (e) {
          console.log(`[BE] partner-api cancelled fallback error: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      const seen = new Set<string>()
      const all: NormalizedOrder[] = []
      // Process cancelled FIRST so cancelled orders win if an order appears in both buckets
      for (const [orders, fetchType] of [[cancelled, 'cancelled'], [previous, 'previous']] as [Record<string, unknown>[], string][]) {
        const enriched = await this.enrichSessionOrdersWithDetails(orders, accessToken, merchantContext, resId, fetchType)
        for (const o of enriched) {
          const id = String(o.externalOrderId ?? '')
          if (!id || seen.has(id)) continue
          seen.add(id)
          all.push(o)
        }
      }
      return all
    } catch {
      return null
    }
  }

  private async fetchByTypeWithSession(
    accessToken: string,
    merchantContext: { merchantId: number; userId: number },
    restaurantId: number,
    fetchType: string
  ): Promise<Record<string, unknown>[]> {
    const res = await fetch(`${BE_MERCHANT_BASE}/get_restaurant_orders`, {
      method: 'POST',
      headers: this.buildMerchantHeaders(),
      body: JSON.stringify({
        device_type: Number(BE_MERCHANT_DEVICE_TYPE),
        access_token: accessToken,
        merchant_id: merchantContext.merchantId,
        api_version: 2,
        fetch_type: fetchType,
        user_id: merchantContext.userId,
        restaurant_id: restaurantId,
        locale: 'vi',
        device_token: '',
      }),
    })

    if (res.status === 401 || res.status === 403) return []
    if (!res.ok) {
      console.error(`[BE] fetchByTypeWithSession(${fetchType}) HTTP ${res.status} restaurant=${restaurantId}`)
      return []
    }

    const data = await res.json() as {
      restaurant_orders?: Record<string, unknown>[]
      orders?: Record<string, unknown>[]
      data?: { restaurant_orders?: Record<string, unknown>[] }
      code?: number
      message?: string
    }
    if (fetchType === 'cancelled') {
      console.log(`[BE] cancelled bucket code=${data.code} msg=${data.message ?? ''} orders=${(data.restaurant_orders ?? data.orders ?? []).length}`)
    }
    if (fetchType === 'previous') {
      const orders = data.restaurant_orders ?? data.orders ?? []
      const statusLog = orders.slice(0, 20).map((o) => `${o.order_id}:s=${o.status ?? o.order_status ?? '?'},c=${o.cancel_reason ?? o.cancel_time ?? o.is_cancelled ?? o.is_cancel ?? '-'}`).join(' | ')
      console.log(`[BE] previous bucket: ${orders.length} orders | ${statusLog}`)
    }
    // Support alternate response shapes the merchant API might use
    return data.restaurant_orders ?? data.orders ?? data.data?.restaurant_orders ?? []
  }
}
