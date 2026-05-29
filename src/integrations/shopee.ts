import { createHmac } from 'crypto'
import type { NormalizedOrder, OrderItem, OrderStatus } from '@/types'
import type { PlatformAdapter, AdapterConfig, SessionData } from './types'

const SHOPEE_BASE = 'https://partner.shopeefood.vn'
const SHOPEE_PARTNER_DASHBOARD_BASE = 'https://partner.shopee.vn'
const SHOPEE_GMERCHANT_BASE = 'https://gmerchant.deliverynow.vn'
const SHOPEE_PARTNER_ORDER_LIST_ENDPOINT = `${SHOPEE_GMERCHANT_BASE}/api/v5/order/get_list_with_pagination`
const SHOPEE_PARTNER_ORDER_DETAIL_ENDPOINT = `${SHOPEE_GMERCHANT_BASE}/api/v5/order/get_detail`

/**
 * Shopee Food adapter supports two modes:
 * 1. Official partner API (partner.shopeefood.vn) when partner credentials exist.
 * 2. Partner dashboard browser session (partner.shopee.vn / partner.food.shopee.vn).
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
      throw new Error('Thi?u credentials: c?n partnerId, partnerKey, shopId, accessToken')
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
    const partnerId = String(config.partnerId ?? '')
    const partnerKey = String(config.partnerKey ?? '')
    const shopId = String(config.shopId ?? config.storeId ?? '')
    const accessToken = String(config.accessToken ?? '')
    if (!partnerId || !partnerKey || !shopId || !accessToken) return null

    const path = '/api/v2/order/get_order_detail'
    const timestamp = Math.floor(Date.now() / 1000)
    const sign = this.sign(partnerId, partnerKey, path, timestamp, accessToken, shopId)

    const params = new URLSearchParams({ partner_id: partnerId, timestamp: String(timestamp), access_token: accessToken, shop_id: shopId, sign, order_sn: orderId })
    const res = await fetch(`${SHOPEE_BASE}${path}?${params}`)
    if (!res.ok) return null
    const data = await res.json() as { response?: Record<string, unknown> }
    return data.response ? this.normalizeOrder(data.response) : null
  }

  normalizeOrder(raw: Record<string, unknown>): NormalizedOrder {
    const items: OrderItem[] = ((raw.item_list ?? []) as Record<string, unknown>[]).map((i) => ({
      name: String(i.item_name ?? ''),
      quantity: Number(i.model_quantity_purchased ?? 1),
      price: Number(i.model_discounted_price ?? 0),
      total: Number(i.model_quantity_purchased ?? 1) * Number(i.model_discounted_price ?? 0),
    }))

    const statusMap: Record<string, OrderStatus> = {
      UNPAID: 'waiting_confirm',
      READY_TO_SHIP: 'waiting_pickup',
      PROCESSED: 'waiting_pickup',
      SHIPPED: 'delivering',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
      IN_CANCEL: 'cancelled',
      TO_RETURN: 'cancelled',
    }

    const rawStatus = String(raw.order_status ?? '')
    const subtotal = Number(raw.total_amount ?? raw.item_list_price ?? 0)
    const escrow = Number(raw.escrow_amount ?? raw.buyer_pay_amount ?? subtotal)
    const platformFee = Math.max(0, subtotal - escrow)

    return {
      source: 'shopee',
      externalOrderId: String(raw.order_sn ?? ''),
      externalStoreId: String(raw.shop_id ?? ''),
      customerName: String((raw.recipient_address as Record<string, unknown>)?.name ?? 'Kh?ch h?ng'),
      customerPhone: String((raw.recipient_address as Record<string, unknown>)?.phone ?? ''),
      items,
      subtotal,
      discount: Number(raw.voucher_from_seller ?? 0),
      total: subtotal,
      platformFee,
      paymentMethod: String(raw.payment_method ?? ''),
      deliveryInfo: {
        address: String((raw.recipient_address as Record<string, unknown>)?.full_address ?? ''),
      },
      driverInfo: {
        name: String((raw.logistics_info as Record<string, unknown>)?.shipper_name ?? ''),
        phone: String((raw.logistics_info as Record<string, unknown>)?.shipper_phone ?? ''),
      },
      orderStatus: statusMap[rawStatus] ?? 'waiting_confirm',
      placedAt: new Date(Number(raw.create_time ?? Date.now()) * 1000).toISOString(),
      deliveredAt: raw.delivery_complete_time
        ? new Date(Number(raw.delivery_complete_time) * 1000).toISOString()
        : undefined,
      rawPayload: raw,
    }
  }

  private buildPartnerHeaders(session: SessionData, storeId?: string): Record<string, string> | null {
    const cookieHeader = session.cookies
      .filter((c) => c.expires === -1 || c.expires > Date.now() / 1000)
      .map((c) => `${c.name}=${c.value}`)
      .join('; ')
    if (!cookieHeader) return null

    const spcFCookie = session.cookies.find((c) => c.name === 'SPC_F')
    const csrfCookie = session.cookies.find((c) => c.name === 'csrftoken')
    const csrfToken =
      session.extraHeaders?.['x-csrftoken']
      ?? csrfCookie?.value
      ?? session.localStorage?.csrfToken
      ?? session.localStorage?.csrftoken
      ?? spcFCookie?.value
      ?? ''
    const resolvedStoreId = storeId || String(session.storeInfo?.storeId ?? '') || String(session.extraHeaders?.['x-store-id'] ?? '')
    const merchantId = session.storeInfo?.merchantId ? String(session.storeInfo.merchantId) : ''
    const forwardedHeaders = Object.fromEntries(
      Object.entries(session.extraHeaders ?? {}).filter(([, value]) => Boolean(value))
    )

    return {
      ...forwardedHeaders,
      Cookie: cookieHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Origin: SHOPEE_PARTNER_DASHBOARD_BASE,
      Referer: `${SHOPEE_PARTNER_DASHBOARD_BASE}/order/report-restaurant`,
      'x-requested-with': 'XMLHttpRequest',
      ...(resolvedStoreId ? { 'x-store-id': resolvedStoreId } : {}),
      ...(merchantId ? { 'x-merchant-id': merchantId } : {}),
      ...(csrfToken ? { 'x-csrftoken': csrfToken } : {}),
    }
  }

  private extractPartnerOrders(data: unknown): Record<string, unknown>[] | null {
    if (!data || typeof data !== 'object') return null
    const d = data as Record<string, unknown>
    const candidates = [d.data, d.result, d.response, d.payload, d]
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue
      const c = candidate as Record<string, unknown>
      const list = c.order_list ?? c.orders ?? c.items ?? c.data ?? c.list ?? c.records ?? c.result
      if (Array.isArray(list)) return list as Record<string, unknown>[]
    }
    return Array.isArray(data) ? data as Record<string, unknown>[] : null
  }

  private mapPortalStatus(raw: Record<string, unknown>): OrderStatus {
    const rawStatus = String(raw.order_status ?? raw.status ?? raw.state ?? raw.orderStatus ?? '').toUpperCase()
    const numericStatus = Number(raw.order_status ?? raw.status ?? -1)
    if (!isNaN(numericStatus)) {
      if (numericStatus === 1 || numericStatus === 2 || numericStatus === 24) return 'waiting_confirm'
      if ([3, 4, 5, 11, 13, 14, 15, 18, 21, 22, 29].includes(numericStatus)) return 'waiting_pickup'
      if (numericStatus === 6) return 'delivering'
      if ([7, 9, 27, 30].includes(numericStatus)) return 'completed'
      if ([8, 16, 17, 25, 26].includes(numericStatus)) return 'cancelled'
    }
    if (rawStatus.includes('CANCEL')) return 'cancelled'
    if (rawStatus.includes('COMPLET') || rawStatus.includes('DELIVER') || rawStatus.includes('DONE')) return 'completed'
    if (rawStatus.includes('SHIP') || rawStatus.includes('TRANSIT') || rawStatus.includes('PICK')) return 'delivering'
    if (rawStatus.includes('PROCESS') || rawStatus.includes('PREPAR') || rawStatus.includes('CONFIRM')) return 'waiting_pickup'
    if (rawStatus.includes('PENDING') || rawStatus.includes('NEW') || rawStatus.includes('WAIT')) return 'waiting_confirm'
    return 'waiting_confirm'
  }

  normalizePortalOrder(raw: Record<string, unknown>): NormalizedOrder {
    const rawCustomer = (raw.buyer ?? raw.customer ?? raw.user ?? raw.order_user ?? {}) as Record<string, unknown>
    const rawDelivery = (raw.delivery_info ?? raw.delivery ?? raw.logistics_info ?? raw.deliver_address ?? {}) as Record<string, unknown>
    const rawDriver = (raw.driver ?? raw.shipper ?? rawDelivery.driver ?? rawDelivery.shipper ?? {}) as Record<string, unknown>
    const rawItems = (raw.order_items ?? raw.item_list ?? raw.items ?? raw.foods ?? []) as Record<string, unknown>[]
    const customerBill = (raw.customer_bill ?? {}) as Record<string, unknown>
    const commission = (raw.commission ?? {}) as Record<string, unknown>

    const items: OrderItem[] = rawItems.map((i) => {
      const qty = Number(i.quantity ?? i.model_quantity_purchased ?? i.count ?? 1)
      const unitPrice = Number(i.unit_price ?? i.price ?? i.model_discounted_price ?? i.discount_price ?? 0)
      const lineTotal = Number(i.subtotal ?? i.total ?? unitPrice * qty)
      const optionGroups = Array.isArray(i.options_groups)
        ? (i.options_groups as Record<string, unknown>[]).map((group) => {
            const title = String(group.name ?? '').trim()
            const values = Array.isArray(group.options)
              ? (group.options as Record<string, unknown>[])
                  .map((option) => {
                    const optionName = String(option.name ?? '').trim()
                    const optionPrice = Number(option.discount_price ?? option.original_price ?? 0)
                    if (!optionName) return ''
                    return optionPrice > 0 ? `${optionName} ${optionPrice}` : optionName
                  })
                  .filter(Boolean)
              : []
            return [title, values.join(', ')].filter(Boolean).join(': ')
          })
          .filter(Boolean)
        : []
      const note = [String(i.note ?? '').trim(), ...optionGroups].filter(Boolean).join('\n').trim()
      return {
        name: String(
          (i.dish && typeof i.dish === 'object' ? (i.dish as Record<string, unknown>).name : undefined)
          ?? i.name
          ?? i.item_name
          ?? i.food_name
          ?? i.product_name
          ?? ''
        ),
        quantity: qty,
        price: unitPrice,
        total: lineTotal,
        ...(note ? { note } : {}),
      }
    })

    const orderId = String(raw.code ?? raw.order_sn ?? raw.order_id ?? raw.id ?? '')
    const storeId = String(raw.store_id ?? raw.shop_id ?? raw.restaurant_id ?? raw.food_delivery_id ?? '')
    const createTime = Number(raw.order_time ?? raw.create_time ?? raw.created_at ?? 0)
    const subtotal = Number(customerBill.sub_total ?? raw.order_value_amount ?? raw.total_amount ?? raw.sub_total ?? raw.amount ?? 0)
    const total = Number(customerBill.total_amount ?? raw.total_value_amount ?? raw.total ?? raw.order_total ?? subtotal)
    const discount = Number(customerBill.total_discount ?? raw.discount ?? raw.voucher_from_seller ?? 0)
    const platformFee = Number(commission.amount ?? raw.platform_fee ?? raw.commission_fee ?? 0)
    const paymentMethod = String(raw.payment_method ?? raw.payment_type ?? raw.customer_pay_type ?? '')
    const deliveryAddress = String(rawDelivery.address ?? raw.delivery_address ?? rawCustomer.address ?? (raw.recipient_address as Record<string, unknown>)?.full_address ?? '')
    const customerName = String(
      rawDelivery.contact_name
      ?? rawCustomer.name
      ?? rawCustomer.user_name
      ?? rawCustomer.display_name
      ?? (raw.recipient_address as Record<string, unknown>)?.name
      ?? 'Khach hang'
    )
    const customerPhone = String(rawDelivery.phone ?? rawCustomer.phone ?? rawCustomer.phone_number ?? rawCustomer.mobile ?? (raw.recipient_address as Record<string, unknown>)?.phone ?? '')
    const driverName = String(rawDriver.name ?? rawDriver.driver_name ?? rawDelivery.shipper_name ?? '')
    const driverPhone = String(rawDriver.phone ?? rawDriver.driver_phone ?? rawDelivery.shipper_phone ?? '')

    const deliveredAt = raw.actual_deliver_time ?? raw.delivery_complete_time ?? raw.delivered_at ?? raw.completed_at ?? raw.complete_time
    const cancelledAt = raw.cancel_time ?? raw.cancelled_at
    const status = this.mapPortalStatus(raw)

    return {
      source: 'shopee',
      externalOrderId: orderId,
      externalStoreId: storeId,
      customerName,
      customerPhone,
      items,
      subtotal,
      discount,
      total,
      platformFee,
      paymentMethod,
      deliveryInfo: { address: deliveryAddress },
      driverInfo: { name: driverName, phone: driverPhone },
      orderStatus: status,
      placedAt: createTime > 0 ? new Date(createTime * 1000).toISOString() : new Date().toISOString(),
      deliveredAt: deliveredAt && Number(deliveredAt) > 0 ? new Date(Number(deliveredAt) * 1000).toISOString() : undefined,
      rawPayload: { ...raw, ...(cancelledAt ? { _cancelledAt: new Date(Number(cancelledAt) * 1000).toISOString() } : {}) },
    }
  }

  private buildPartnerSearchBodies(session: SessionData, options?: { page?: number; timeFrom?: number; timeTo?: number; orderFilterType?: number }) {
    const restaurantId = Number(session.storeInfo?.restaurantId ?? session.storeInfo?.storeId ?? 0)
    const page = options?.page ?? 1
    return [
      {
        restaurantIds: restaurantId ? [restaurantId] : [],
        orderFilterType: options?.orderFilterType ?? 40,
        page,
        pageSize: 50,
        ...(options?.timeFrom ? { fromTime: options.timeFrom } : {}),
        ...(options?.timeTo ? { toTime: options.timeTo } : {}),
      },
    ]
  }

  private async fetchPartnerOrderPage(session: SessionData, headers: Record<string, string>, options?: { page?: number; timeFrom?: number; timeTo?: number; orderFilterType?: number }): Promise<Record<string, unknown>[] | null> {
    const endpoint = String(session.storeInfo?.ordersApiUrl ?? SHOPEE_PARTNER_ORDER_LIST_ENDPOINT)
    for (const body of this.buildPartnerSearchBodies(session, options)) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(12000),
        })
        if (res.status === 401 || res.status === 403) return null
        if (!res.ok) continue
        const data = await res.json() as unknown
        const list = this.extractPartnerOrders(data)
        if (list) return list
      } catch {
        // try next shape
      }
    }
    return []
  }

  async fetchOrdersWithSession(session: SessionData, storeId: string): Promise<NormalizedOrder[] | null> {
    const headers = this.buildPartnerHeaders(session, storeId)
    if (!headers) return null

    const seenIds = new Set<string>()
    const result: NormalizedOrder[] = []

    const filterTypes = [30, 31, 43, 44, 45, 46, 40, 41, 42]
    const timeTo = Math.floor(Date.now() / 1000)
    const timeFrom = timeTo - 86400

    for (const orderFilterType of filterTypes) {
      const orders = await this.fetchPartnerOrderPage(session, headers, {
        orderFilterType,
        timeFrom,
        timeTo,
      })
      if (orders === null) return null
      for (const raw of orders) {
        const id = String(raw.code ?? raw.order_sn ?? raw.order_id ?? raw.id ?? '')
        if (!id || seenIds.has(id)) continue
        seenIds.add(id)
        result.push(this.normalizePortalOrder(raw))
      }
    }

    return result
  }

  async fetchHistoricalOrdersWithSession(session: SessionData, storeId: string, options?: { days?: number }): Promise<NormalizedOrder[] | null> {
    const headers = this.buildPartnerHeaders(session, storeId)
    if (!headers) return null

    const days = Math.max(1, Math.min(90, Number(options?.days ?? 30)))
    const timeTo = Math.floor(Date.now() / 1000)
    const timeFrom = timeTo - days * 86400

    const seenIds = new Set<string>()
    const result: NormalizedOrder[] = []

    for (let page = 1; page <= 20; page += 1) {
      const orders = await this.fetchPartnerOrderPage(session, headers, { page, timeFrom, timeTo, orderFilterType: 40 })
      if (!orders || orders.length === 0) break

      for (const raw of orders) {
        const id = String(raw.code ?? raw.order_sn ?? raw.order_id ?? raw.id ?? '')
        if (!id || seenIds.has(id)) continue
        seenIds.add(id)
        result.push(this.normalizePortalOrder(raw))
      }

      if (orders.length < 50) break
    }

    return result
  }

  async fetchOrderDetailWithSession(orderId: string, session: SessionData, storeId: string): Promise<NormalizedOrder | null> {
    const headers = this.buildPartnerHeaders(session, storeId)
    if (!headers) return null

    try {
      const url = new URL(String(session.storeInfo?.orderDetailApiUrl ?? SHOPEE_PARTNER_ORDER_DETAIL_ENDPOINT))
      url.searchParams.set('orderCode', orderId)
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(12000),
      })
      if (res.status === 401 || res.status === 403) return null
      if (!res.ok) return null
      const data = await res.json() as Record<string, unknown>
      const dataEnvelope = data.data && typeof data.data === 'object' && !Array.isArray(data.data)
        ? data.data as Record<string, unknown>
        : null
      const resultEnvelope = data.result && typeof data.result === 'object' && !Array.isArray(data.result)
        ? data.result as Record<string, unknown>
        : null
      const raw = (
        dataEnvelope?.order
        ?? dataEnvelope
        ?? resultEnvelope?.order
        ?? resultEnvelope
        ?? data.response
        ?? data
      ) as Record<string, unknown>
      if (raw && typeof raw === 'object' && Object.keys(raw).length > 0) {
        return this.normalizePortalOrder(raw)
      }
      return null
    } catch {
      return null
    }
  }
}
