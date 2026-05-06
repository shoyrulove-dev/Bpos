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

// Status integer → fetch_type context mapping (Be API uses int, not string enum)
// Inferred from docs examples: status 21 = completed (previous), status 2 = in-process
// in_progress fetch_type = awaiting confirmation, pending = being prepared
const STATUS_BY_FETCH: Record<string, OrderStatus> = {
  in_progress: 'waiting_confirm',
  pending:     'waiting_pickup',
  previous:    'completed',
}

// Simple in-process token cache keyed by clientId (lives in memory per serverless instance)
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

export class BeAdapter implements PlatformAdapter {
  source = 'be' as const

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
      for (const o of orders) {
        const id = String(o.order_id ?? '')
        if (!id || seen.has(id)) continue
        seen.add(id)
        all.push(this.normalizeOrder(o, fetchType))
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
    const orderItems = raw.order_items as Record<string, unknown>[] ?? []
    const items: OrderItem[] = orderItems.map((i) => ({
      name:     String(i.item_name ?? ''),
      quantity: Number(i.quantity ?? 1),
      price:    Number(i.item_price ?? i.amount ?? 0),
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

    const total    = Number(raw.order_amount    ?? 0)
    const original = Number(raw.original_amount ?? raw.net_order_amount ?? total)
    const discount = original > total ? original - total : 0

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
      deliveryInfo: {
        address: String(raw.delivery_address ?? ''),
        note:    String(raw.delivery_note    ?? '') || undefined,
      },
      driverInfo: {
        name:  String(raw.driver_name     ?? ''),
        phone: String(raw.driver_phone_no ?? ''),
      },
      orderStatus,
      placedAt:   String(raw.created_at    ?? new Date().toISOString()),
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
    const jwt = session.extraHeaders?.['Authorization']?.replace('Bearer ', '')
    if (!jwt) return null

    const base = BE_BASE_PROD
    const resId = Number(restaurantId)
    if (!resId) return null

    try {
      const [inProgress, pending] = await Promise.all([
        this.fetchByTypeWithJwt(jwt, base, resId, 'in_progress'),
        this.fetchByTypeWithJwt(jwt, base, resId, 'pending'),
      ])

      const seen = new Set<string>()
      const all: NormalizedOrder[] = []
      for (const [orders, fetchType] of [[inProgress, 'in_progress'], [pending, 'pending']] as [Record<string, unknown>[], string][]) {
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

  private async fetchByTypeWithJwt(
    jwt: string, base: string, restaurantId: number, fetchType: string
  ): Promise<Record<string, unknown>[]> {
    const res = await fetch(`${base}/partner/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ restaurant_id: restaurantId, fetch_type: fetchType }),
    })
    if (!res.ok) return []
    const data = await res.json() as { restaurant_orders?: Record<string, unknown>[] }
    return data.restaurant_orders ?? []
  }
}
