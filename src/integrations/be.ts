import type { NormalizedOrder, OrderItem, OrderStatus } from '@/types'
import type { PlatformAdapter, AdapterConfig } from './types'

/**
 * Be adapter
 */
export class BeAdapter implements PlatformAdapter {
  source = 'be' as const

  async fetchOrders(_config: AdapterConfig): Promise<NormalizedOrder[]> {
    return []
  }

  async fetchOrderDetail(_id: string, _config: AdapterConfig): Promise<NormalizedOrder | null> {
    return null
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
