import { createHmac } from 'crypto'
import type { NormalizedOrder, OrderItem, OrderStatus } from '@/types'
import type { PlatformAdapter, AdapterConfig } from './types'

const SHOPEE_BASE = 'https://partner.shopeefood.vn'

/**
 * Shopee Food adapter – Shopee Open API v2 (HMAC-SHA256)
 * Docs: https://open.shopeefood.vn/documents/v2
 */
export class ShopeeAdapter implements PlatformAdapter {
  source = 'shopee' as const

  private sign(partnerId: string, partnerKey: string, path: string, timestamp: number, accessToken: string, shopId: string): string {
    const base = `${partnerId}${path}${timestamp}${accessToken}${shopId}`
    return createHmac('sha256', partnerKey).update(base).digest('hex')
  }

  async fetchOrders(config: AdapterConfig): Promise<NormalizedOrder[]> {
    const partnerId   = String(config.partnerId   ?? '')
    const partnerKey  = String(config.partnerKey  ?? '')
    const shopId      = String(config.shopId      ?? config.storeId ?? '')
    const accessToken = String(config.accessToken ?? '')

    if (!partnerId || !partnerKey || !shopId || !accessToken) {
      throw new Error('Thiếu credentials: cần partnerId, partnerKey, shopId, accessToken')
    }

    const path      = '/api/v2/order/get_order_list'
    const timestamp = Math.floor(Date.now() / 1000)
    const sign      = this.sign(partnerId, partnerKey, path, timestamp, accessToken, shopId)

    const params = new URLSearchParams({
      partner_id:       partnerId,
      timestamp:        String(timestamp),
      access_token:     accessToken,
      shop_id:          shopId,
      sign,
      time_range_field: 'create_time',
      time_from:        String(timestamp - 86400),
      time_to:          String(timestamp),
      page_size:        '20',
    })

    const res = await fetch(`${SHOPEE_BASE}${path}?${params}`)
    if (!res.ok) throw new Error(`Shopee API ${res.status}: ${res.statusText}`)
    const data = await res.json() as { error?: string; message?: string; response?: { order_list?: Record<string, unknown>[] } }
    if (data.error) throw new Error(`Shopee: ${data.message ?? data.error}`)

    const list = data.response?.order_list ?? []
    return list.map(o => this.normalizeOrder(o))
  }

  async fetchOrderDetail(orderId: string, config: AdapterConfig): Promise<NormalizedOrder | null> {
    const partnerId   = String(config.partnerId   ?? '')
    const partnerKey  = String(config.partnerKey  ?? '')
    const shopId      = String(config.shopId      ?? config.storeId ?? '')
    const accessToken = String(config.accessToken ?? '')
    if (!partnerId || !partnerKey || !shopId || !accessToken) return null

    const path      = '/api/v2/order/get_order_detail'
    const timestamp = Math.floor(Date.now() / 1000)
    const sign      = this.sign(partnerId, partnerKey, path, timestamp, accessToken, shopId)

    const params = new URLSearchParams({ partner_id: partnerId, timestamp: String(timestamp), access_token: accessToken, shop_id: shopId, sign, order_sn: orderId })
    const res  = await fetch(`${SHOPEE_BASE}${path}?${params}`)
    if (!res.ok) return null
    const data = await res.json() as { response?: Record<string, unknown> }
    return data.response ? this.normalizeOrder(data.response) : null
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
