import type { NormalizedOrder, OrderItem, OrderStatus } from '@/types'
import type { PlatformAdapter, AdapterConfig } from './types'

/**
 * GrabFood adapter
 */
export class GrabAdapter implements PlatformAdapter {
  source = 'grab' as const

  async fetchOrders(_config: AdapterConfig): Promise<NormalizedOrder[]> {
    // TODO: integrate with Grab Merchant API
    return []
  }

  async fetchOrderDetail(_id: string, _config: AdapterConfig): Promise<NormalizedOrder | null> {
    return null
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
