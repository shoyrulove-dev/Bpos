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

  private buildConfig(config: AdapterConfig) {
    return {
      partnerId: String(config.partnerId ?? ''),
      partnerKey: String(config.partnerKey ?? ''),
      shopId: String(config.shopId ?? config.storeId ?? ''),
      accessToken: String(config.accessToken ?? ''),
    }
  }

  private async fetchOrderList(config: AdapterConfig, options: { timeFrom: number; timeTo: number; pageSize?: number }) {
    const { partnerId, partnerKey, shopId, accessToken } = this.buildConfig(config)

    if (!partnerId || !partnerKey || !shopId || !accessToken) {
      throw new Error('Thiếu credentials: cần partnerId, partnerKey, shopId, accessToken')
    }

    const path = '/api/v2/order/get_order_list'
    const collected = new Map<string, Record<string, unknown>>()
    let cursor = ''

    for (let page = 0; page < 20; page += 1) {
      const timestamp = Math.floor(Date.now() / 1000)
      const sign = this.sign(partnerId, partnerKey, path, timestamp, accessToken, shopId)
      const params = new URLSearchParams({
        partner_id: partnerId,
        timestamp: String(timestamp),
        access_token: accessToken,
        shop_id: shopId,
        sign,
        time_range_field: 'create_time',
        time_from: String(options.timeFrom),
        time_to: String(options.timeTo),
        page_size: String(options.pageSize ?? 50),
      })
      if (cursor) params.set('cursor', cursor)

      const res = await fetch(`${SHOPEE_BASE}${path}?${params}`)
      if (!res.ok) throw new Error(`Shopee API ${res.status}: ${res.statusText}`)

      const data = await res.json() as {
        error?: string
        message?: string
        response?: {
          more?: boolean
          next_cursor?: string
          order_list?: Record<string, unknown>[]
        }
      }
      if (data.error) throw new Error(`Shopee: ${data.message ?? data.error}`)

      const list = data.response?.order_list ?? []
      list.forEach((order) => {
        const orderId = String(order.order_sn ?? '')
        if (orderId) collected.set(orderId, order)
      })

      if (!data.response?.more || !data.response?.next_cursor) break
      cursor = data.response.next_cursor
    }

    return Array.from(collected.values())
  }

  private async enrichOrdersWithDetails(rawOrders: Record<string, unknown>[], config: AdapterConfig) {
    const detailMap = new Map<string, NormalizedOrder>()
    const orderIds = rawOrders
      .map((order) => String(order.order_sn ?? ''))
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

      details.forEach((detail) => {
        if (!detail?.externalOrderId) return
        detailMap.set(detail.externalOrderId, detail)
      })
    }

    return rawOrders.map((order) => {
      const orderId = String(order.order_sn ?? '')
      return detailMap.get(orderId) ?? this.normalizeOrder(order)
    })
  }

  async fetchOrders(config: AdapterConfig): Promise<NormalizedOrder[]> {
    const timeTo = Math.floor(Date.now() / 1000)
    const timeFrom = timeTo - 86400
    const list = await this.fetchOrderList(config, { timeFrom, timeTo, pageSize: 50 })
    return this.enrichOrdersWithDetails(list, config)
  }

  async fetchHistoricalOrders(config: AdapterConfig, options?: { days?: number }): Promise<NormalizedOrder[]> {
    const days = Math.max(1, Math.min(90, Number(options?.days ?? 30)))
    const timeTo = Math.floor(Date.now() / 1000)
    const timeFrom = timeTo - days * 86400
    const list = await this.fetchOrderList(config, { timeFrom, timeTo, pageSize: 50 })
    return this.enrichOrdersWithDetails(list, config)
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

    const subtotal   = Number(raw.total_amount ?? raw.item_list_price ?? 0)
    const escrow     = Number(raw.escrow_amount ?? raw.buyer_pay_amount ?? subtotal)
    const platformFee = Math.max(0, subtotal - escrow)

    return {
      source:          'shopee',
      externalOrderId: String(raw.order_sn ?? ''),
      externalStoreId: String(raw.shop_id ?? ''),
      customerName:    String((raw.recipient_address as Record<string,unknown>)?.name ?? 'Khách hàng'),
      customerPhone:   String((raw.recipient_address as Record<string,unknown>)?.phone ?? ''),
      items,
      subtotal,
      discount:        Number(raw.voucher_from_seller ?? 0),
      total:           subtotal,
      platformFee,
      paymentMethod:   String(raw.payment_method ?? ''),
      deliveryInfo: {
        address: String((raw.recipient_address as Record<string,unknown>)?.full_address ?? ''),
      },
      driverInfo: {
        name:  String((raw.logistics_info as Record<string,unknown>)?.shipper_name ?? ''),
        phone: String((raw.logistics_info as Record<string,unknown>)?.shipper_phone ?? ''),
      },
      orderStatus: statusMap[rawStatus] ?? 'waiting_confirm',
      placedAt:    new Date(Number(raw.create_time ?? Date.now()) * 1000).toISOString(),
      deliveredAt: raw.delivery_complete_time
        ? new Date(Number(raw.delivery_complete_time) * 1000).toISOString()
        : undefined,
      rawPayload:  raw,
    }
  }
}
