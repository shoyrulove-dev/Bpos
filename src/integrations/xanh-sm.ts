import type { NormalizedOrder, OrderItem, OrderStatus } from '@/types'
import type { PlatformAdapter, AdapterConfig } from './types'
import type { SessionData } from './types'

const XANH_SM_BASE = 'https://merchant.xanhsm.com/api/v1'

/**
 * Xanh SM adapter – Xanh SM Merchant API (Bearer token)
 * Credentials cần lấy từ: https://merchant.xanhsm.com → Cài đặt → Tích hợp
 */
export class XanhSMAdapter implements PlatformAdapter {
  source = 'xanh_sm' as const

  private getSessionToken(session: SessionData) {
    const raw = session.extraHeaders?.Authorization ?? session.extraHeaders?.authorization
    if (raw) return raw.replace(/^Bearer\s+/i, '').trim() || null

    const localToken = session.localStorage?.token
      ?? session.localStorage?.access_token
      ?? session.localStorage?.jwt
    return localToken ? String(localToken).trim() : null
  }

  private async fetchOrdersByToken(accessToken: string, storeId: string) {
    const res = await fetch(`${XANH_SM_BASE}/stores/${storeId}/orders?limit=20`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })

    if (res.status === 401 || res.status === 403) return null
    if (!res.ok) throw new Error(`Xanh SM API ${res.status}: ${res.statusText}`)

    const data = await res.json() as { orders?: Record<string, unknown>[]; items?: Record<string, unknown>[] }
    const orders = data.orders ?? data.items ?? []
    return orders.map(o => this.normalizeOrder(o))
  }

  async fetchOrders(config: AdapterConfig): Promise<NormalizedOrder[]> {
    const apiKey  = String(config.apiKey  ?? '')
    const storeId = String(config.storeId ?? config.externalStoreId ?? '')

    if (!apiKey) throw new Error('Thiếu credentials: cần API Key từ Xanh SM Merchant Portal')
    if (!storeId) throw new Error('Thiếu Store ID')

    const res = await fetch(`${XANH_SM_BASE}/stores/${storeId}/orders?limit=20`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    })
    if (res.status === 401) throw new Error('API Key không hợp lệ hoặc đã hết hạn')
    if (res.status === 404) throw new Error(`Không tìm thấy cửa hàng với Store ID: ${storeId}`)
    if (!res.ok) throw new Error(`Xanh SM API ${res.status}: ${res.statusText}`)

    const data   = await res.json() as { orders?: Record<string, unknown>[]; items?: Record<string, unknown>[] }
    const orders = data.orders ?? data.items ?? []
    return orders.map(o => this.normalizeOrder(o))
  }

  async fetchOrdersWithSession(session: SessionData, storeId: string): Promise<NormalizedOrder[] | null> {
    const accessToken = this.getSessionToken(session)
    const resolvedStoreId = String(storeId || session.extraHeaders?.['x-store-id'] || session.storeInfo?.storeId || '')

    if (!accessToken || !resolvedStoreId) return null
    return this.fetchOrdersByToken(accessToken, resolvedStoreId)
  }

  async fetchOrderDetail(orderId: string, config: AdapterConfig): Promise<NormalizedOrder | null> {
    const apiKey  = String(config.apiKey  ?? '')
    const storeId = String(config.storeId ?? '')
    if (!apiKey || !storeId) return null
    try {
      const res = await fetch(`${XANH_SM_BASE}/stores/${storeId}/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) return null
      const data = await res.json() as Record<string, unknown>
      return this.normalizeOrder(data)
    } catch { return null }
  }

  normalizeOrder(raw: Record<string, unknown>): NormalizedOrder {
    const lines = raw.orderLines as Record<string, unknown>[] ?? []
    const items: OrderItem[] = lines.map((l) => ({
      name:     String(l.productName ?? ''),
      quantity: Number(l.qty ?? 1),
      price:    Number(l.unitPrice ?? 0),
      total:    Number(l.lineTotal ?? 0),
    }))

    const statusMap: Record<string, OrderStatus> = {
      'NEW':        'waiting_confirm',
      'CONFIRMED':  'waiting_pickup',
      'DELIVERING': 'delivering',
      'DONE':       'completed',
      'CANCELLED':  'cancelled',
    }

    return {
      source:          'xanh_sm',
      externalOrderId: String(raw.orderId ?? ''),
      externalStoreId: String(raw.storeCode ?? ''),
      customerName:    String(raw.customerName ?? 'Khách hàng'),
      customerPhone:   String(raw.customerPhone ?? ''),
      items,
      subtotal:        Number(raw.subTotal ?? 0),
      discount:        Number(raw.discount ?? 0),
      total:           Number(raw.total ?? 0),
      deliveryInfo: {
        address: String(raw.deliveryAddress ?? ''),
      },
      orderStatus: statusMap[String(raw.status ?? '')] ?? 'waiting_confirm',
      placedAt:    String(raw.createdAt ?? new Date().toISOString()),
      rawPayload:  raw,
    }
  }
}
