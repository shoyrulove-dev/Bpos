import type { NormalizedOrder, OrderItem, OrderStatus } from '@/types'
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
// in_progress fetch_type = awaiting confirmation, pending = being prepared
const STATUS_BY_FETCH: Record<string, OrderStatus> = {
  in_progress: 'waiting_confirm',
  on_delivery: 'delivering',
  pending:     'waiting_pickup',
  previous:    'completed',
}

// Simple in-process token cache keyed by clientId (lives in memory per serverless instance)
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

export class BeAdapter implements PlatformAdapter {
  source = 'be' as const

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
        detailMap.set(detail.externalOrderId, detail)
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
    const previous = await this.fetchByType(token, base, restaurantId, 'previous').catch(() => [] as Record<string, unknown>[])
    return this.enrichOrdersWithDetails(previous, config, 'previous')
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
    const orderItems = raw.order_items as Record<string, unknown>[] ?? []
    const items: OrderItem[] = orderItems.map((i) => ({
      name:     String(i.item_name ?? ''),
      quantity: Number(i.quantity ?? 1),
      price:    Number(i.item_price ?? i.uint_price ?? i.amount ?? 0),
      total:    Number(i.amount ?? 0),
      note:     String(i.note ?? '') || undefined,
    }))

    // Be API uses integer status codes — map via fetch_type context when available
    // Known: in_progress = waiting_confirm, pending = waiting_pickup
    // status integers observed: 2 = in-process, 21 = completed
    const statusInt = Number(raw.status ?? -1)
    let orderStatus: OrderStatus = (fetchType ? STATUS_BY_FETCH[fetchType] : undefined) ?? 'waiting_confirm'
    if (statusInt === 21 || statusInt === 20) orderStatus = 'completed'
    if (statusInt === 99 || statusInt === 100) orderStatus = 'cancelled'

    const total    = Number(raw.order_amount ?? raw.total_amount ?? raw.final_amount ?? 0)
    const original = Number(raw.original_amount ?? raw.sub_total ?? raw.subtotal ?? raw.net_order_amount ?? total)
    const discount = original > total ? original - total : 0
    const actualReceived = Number(raw.net_order_amount ?? raw.received_amount ?? raw.merchant_receivable ?? total)
    const platformFee = actualReceived > 0 ? Math.max(0, total - actualReceived) : 0

    return {
      source:          'be',
      externalOrderId: String(raw.order_id ?? ''),
      externalStoreId: String(raw.restaurant_id ?? ''),
      customerName:    String(raw.customer_name    ?? 'Khách hàng'),
      customerPhone:   String(raw.customer_phone_no ?? ''),
      items,
      subtotal:        original,
      discount,
      total,
      platformFee,
      paymentMethod:   String(raw.payment_method ?? (raw.is_pickup_order ? 'pickup' : 'delivery')),
      deliveryInfo: {
        address: String(raw.delivery_address ?? ''),
        note:    String(raw.delivery_note    ?? '') || undefined,
        estimatedTime: String(raw.to_be_delivered_at ?? '') || undefined,
      },
      driverInfo: {
        name:  String(raw.driver_name     ?? ''),
        phone: String(raw.driver_phone_no ?? ''),
      },
      orderStatus,
      placedAt:   String(raw.created_at ?? raw.ordered_at ?? new Date().toISOString()),
      deliveredAt: raw.delivered_at ? String(raw.delivered_at) : undefined,
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
        for (const o of orders) {
          const id = String(o.order_id ?? '')
          if (!id || seen.has(id)) continue
          seen.add(id)
          all.push(this.normalizeOrder(o, fetchType))
        }
      }
      return all
    } catch {
      return null
    }
  }

  async fetchHistoricalOrdersWithSession(session: SessionData, restaurantId: string): Promise<NormalizedOrder[] | null> {
    const accessToken = this.getSessionAccessToken(session)
    if (!accessToken) return null

    const sessionRestaurant = await this.resolveSessionRestaurant(accessToken, restaurantId)
    if (!sessionRestaurant) return null

    const { restaurantId: resId, merchantContext } = sessionRestaurant

    try {
      const previous = await this.fetchByTypeWithSession(accessToken, merchantContext, resId, 'previous')
      return previous.map((order) => this.normalizeOrder(order, 'previous'))
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
    if (!res.ok) return []

    const data = await res.json() as { restaurant_orders?: Record<string, unknown>[] }
    return data.restaurant_orders ?? []
  }
}
