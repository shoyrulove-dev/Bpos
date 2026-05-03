import type { NormalizedOrder, OrderItem, OrderStatus } from '@/types'
import type { PlatformAdapter, AdapterConfig } from './types'

/**
 * Xanh SM adapter
 */
export class XanhSMAdapter implements PlatformAdapter {
  source = 'xanh_sm' as const

  async fetchOrders(_config: AdapterConfig): Promise<NormalizedOrder[]> {
    return []
  }

  async fetchOrderDetail(_id: string, _config: AdapterConfig): Promise<NormalizedOrder | null> {
    return null
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
