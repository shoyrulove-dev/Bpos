import type { NormalizedOrder, OrderItem, OrderStatus } from '@/types'
import type { PlatformAdapter, AdapterConfig } from './types'

/**
 * Shopee Food adapter
 * Normalizes Shopee order payload into BPOS common format.
 */
export class ShopeeAdapter implements PlatformAdapter {
  source = 'shopee' as const

  async fetchOrders(_config: AdapterConfig): Promise<NormalizedOrder[]> {
    // TODO: integrate with Shopee Open API v2
    // https://open.shopee.com/documents/v2/v2.order.get_order_list
    return []
  }

  async fetchOrderDetail(_id: string, _config: AdapterConfig): Promise<NormalizedOrder | null> {
    return null
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

    return {
      source:          'shopee',
      externalOrderId: String(raw.order_sn ?? ''),
      externalStoreId: String(raw.shop_id ?? ''),
      customerName:    String((raw.recipient_address as Record<string,unknown>)?.name ?? 'Khách hàng'),
      customerPhone:   String((raw.recipient_address as Record<string,unknown>)?.phone ?? ''),
      items,
      subtotal:        Number(raw.total_amount ?? 0),
      discount:        Number(raw.voucher_from_seller ?? 0),
      total:           Number(raw.total_amount ?? 0),
      deliveryInfo: {
        address: String((raw.recipient_address as Record<string,unknown>)?.full_address ?? ''),
      },
      orderStatus: statusMap[rawStatus] ?? 'waiting_confirm',
      placedAt:    new Date(Number(raw.create_time ?? Date.now()) * 1000).toISOString(),
      rawPayload:  raw,
    }
  }
}
