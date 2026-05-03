import type { NormalizedOrder, OrderItem, OrderStatus } from '@/types'
import type { PlatformAdapter, AdapterConfig } from './types'

const BE_BASE = 'https://merchant-api.be.com.vn/v1'

/**
 * Be Food adapter – Be Merchant API (API Key)
 * Credentials cần lấy từ: https://merchant.be.com.vn → Cài đặt → API
 */
export class BeAdapter implements PlatformAdapter {
  source = 'be' as const

  async fetchOrders(config: AdapterConfig): Promise<NormalizedOrder[]> {
    const apiKey  = String(config.apiKey  ?? '')
    const storeId = String(config.storeId ?? config.externalStoreId ?? '')

    if (!apiKey) throw new Error('Thiếu credentials: cần API Key từ Be Merchant Portal')
    if (!storeId) throw new Error('Thiếu Store ID')

    const res = await fetch(`${BE_BASE}/restaurants/${storeId}/orders?status=active&limit=20`, {
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    })
    if (res.status === 401) throw new Error('API Key không hợp lệ hoặc đã hết hạn')
    if (res.status === 404) throw new Error(`Không tìm thấy cửa hàng với Store ID: ${storeId}`)
    if (!res.ok) throw new Error(`Be API ${res.status}: ${res.statusText}`)

    const data   = await res.json() as { orders?: Record<string, unknown>[]; data?: Record<string, unknown>[] }
    const orders = data.orders ?? data.data ?? []
    return orders.map(o => this.normalizeOrder(o))
  }

  async fetchOrderDetail(orderId: string, config: AdapterConfig): Promise<NormalizedOrder | null> {
    const apiKey  = String(config.apiKey  ?? '')
    const storeId = String(config.storeId ?? '')
    if (!apiKey || !storeId) return null
    try {
      const res = await fetch(`${BE_BASE}/restaurants/${storeId}/orders/${orderId}`, {
        headers: { 'X-Api-Key': apiKey },
      })
      if (!res.ok) return null
      const data = await res.json() as Record<string, unknown>
      return this.normalizeOrder(data)
    } catch { return null }
  }

  normalizeOrder(raw: Record<string, unknown>): NormalizedOrder {
    const details = raw.orderDetails as Record<string, unknown>[] ?? []
    const items: OrderItem[] = details.map((d) => ({
      name:     String(d.name ?? ''),
      quantity: Number(d.quantity ?? 1),
      price:    Number(d.price ?? 0),
      total:    Number(d.quantity ?? 1) * Number(d.price ?? 0),
    }))

    const statusMap: Record<string, OrderStatus> = {
      'created':   'waiting_confirm',
      'accepted':  'waiting_pickup',
      'picked_up': 'delivering',
      'delivered': 'completed',
      'cancelled': 'cancelled',
    }

    return {
      source:          'be',
      externalOrderId: String(raw.id ?? ''),
      externalStoreId: String(raw.storeId ?? ''),
      customerName:    String(raw.userName ?? 'Khách hàng'),
      customerPhone:   String(raw.userPhone ?? ''),
      items,
      subtotal:        Number(raw.subTotal ?? 0),
      discount:        Number(raw.promotionDiscount ?? 0),
      total:           Number(raw.finalAmount ?? 0),
      deliveryInfo: {
        address: String(raw.dropoffAddress ?? ''),
      },
      driverInfo: {
        name:         String((raw.driver as Record<string,unknown>)?.name ?? ''),
        phone:        String((raw.driver as Record<string,unknown>)?.phone ?? ''),
        vehiclePlate: String((raw.driver as Record<string,unknown>)?.plate ?? ''),
      },
      orderStatus: statusMap[String(raw.status ?? '')] ?? 'waiting_confirm',
      placedAt:    String(raw.createdAt ?? new Date().toISOString()),
      rawPayload:  raw,
    }
  }
}
