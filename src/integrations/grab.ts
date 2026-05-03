import type { NormalizedOrder, OrderItem, OrderStatus } from '@/types'
import type { PlatformAdapter, AdapterConfig } from './types'

const GRAB_TOKEN_URL  = 'https://partner-api.grab.com/grabid/v1/oauth2/token'
const GRAB_ORDER_BASE = 'https://partner-api.grab.com/partner/v1'

/**
 * GrabFood adapter – Grab Merchant API (OAuth2 client credentials)
 * Docs: https://developer.grab.com/docs/
 */
export class GrabAdapter implements PlatformAdapter {
  source = 'grab' as const

  private async getToken(clientId: string, clientSecret: string): Promise<string> {
    const res = await fetch(GRAB_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials', scope: 'food.order.read' }),
    })
    if (!res.ok) throw new Error(`Grab OAuth ${res.status}: Sai clientId hoặc clientSecret`)
    const d = await res.json() as { access_token?: string; error?: string; error_description?: string }
    if (!d.access_token) throw new Error(`Grab OAuth: ${d.error_description ?? d.error ?? 'Không lấy được token'}`)
    return d.access_token
  }

  async fetchOrders(config: AdapterConfig): Promise<NormalizedOrder[]> {
    const clientId     = String(config.clientId     ?? '')
    const clientSecret = String(config.clientSecret ?? '')
    const merchantId   = String(config.merchantId   ?? config.storeId ?? '')

    if (!clientId || !clientSecret || !merchantId) {
      throw new Error('Thiếu credentials: cần clientId, clientSecret, merchantId')
    }

    const token = await this.getToken(clientId, clientSecret)
    const res   = await fetch(`${GRAB_ORDER_BASE}/restaurants/${merchantId}/orders?orderState=ACTIVE`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401) throw new Error('Token không hợp lệ hoặc thiếu quyền food.order.read')
    if (!res.ok) throw new Error(`Grab API ${res.status}: ${res.statusText}`)

    const data   = await res.json() as { orders?: Record<string, unknown>[]; data?: Record<string, unknown>[] }
    const orders = data.orders ?? data.data ?? []
    return orders.map(o => this.normalizeOrder(o))
  }

  async fetchOrderDetail(orderId: string, config: AdapterConfig): Promise<NormalizedOrder | null> {
    const clientId     = String(config.clientId     ?? '')
    const clientSecret = String(config.clientSecret ?? '')
    if (!clientId || !clientSecret) return null
    try {
      const token = await this.getToken(clientId, clientSecret)
      const res   = await fetch(`${GRAB_ORDER_BASE}/orders/${orderId}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return null
      const data = await res.json() as Record<string, unknown>
      return this.normalizeOrder(data)
    } catch { return null }
  }

  normalizeOrder(raw: Record<string, unknown>): NormalizedOrder {
    const orderItems = raw.orderItems as Record<string, unknown>[] ?? []
    const items: OrderItem[] = orderItems.map((i) => ({
      name:     String(i.itemName ?? ''),
      quantity: Number(i.quantity ?? 1),
      price:    Number(i.price ?? 0),
      total:    Number(i.quantity ?? 1) * Number(i.price ?? 0),
    }))

    const statusMap: Record<string, OrderStatus> = {
      'PENDING':   'waiting_confirm',
      'ACCEPTED':  'waiting_pickup',
      'IN_DELIVERY': 'delivering',
      'COMPLETED': 'completed',
      'CANCELLED': 'cancelled',
      'FAILED':    'cancelled',
    }

    const rawStatus = String(raw.state ?? '')

    return {
      source:          'grab',
      externalOrderId: String(raw.orderID ?? ''),
      externalStoreId: String(raw.merchantID ?? ''),
      customerName:    String((raw.sender as Record<string,unknown>)?.name ?? 'Khách hàng'),
      customerPhone:   String((raw.sender as Record<string,unknown>)?.phone ?? ''),
      items,
      subtotal:        Number(raw.subTotal ?? 0),
      discount:        Number(raw.discountAmount ?? 0),
      total:           Number(raw.orderTotal ?? 0),
      deliveryInfo: {
        address: String((raw.delivery as Record<string,unknown>)?.dropoff ?? ''),
      },
      driverInfo: {
        name:  String((raw.driver as Record<string,unknown>)?.name ?? ''),
        phone: String((raw.driver as Record<string,unknown>)?.phone ?? ''),
      },
      orderStatus: statusMap[rawStatus] ?? 'waiting_confirm',
      placedAt:    String(raw.createTime ?? new Date().toISOString()),
      rawPayload:  raw,
    }
  }
}
