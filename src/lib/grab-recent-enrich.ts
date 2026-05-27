import OrderModel from '@/models/Order'
import { buildOrderUpsert } from '@/lib/order-upsert'
import type { NormalizedOrder, OrderStatus } from '@/types'

type RecentGrabEnrichOptions = {
  hours: number
  limit: number
  externalOrderIds?: string[]
}

type StoredGrabOrder = {
  _id: string
  source: string
  externalOrderId?: string
  externalStoreId?: string
  brandId?: string
  hubId?: string
  customerName?: string
  customerPhone?: string
  items?: unknown[]
  subtotal?: number
  discount?: number
  total?: number
  platformFee?: number
  paymentMethod?: string
  deliveryInfo?: Record<string, unknown>
  driverInfo?: Record<string, unknown>
  status: string
  placedAt?: Date | string
  deliveredAt?: Date | string
  rawPayload?: Record<string, unknown>
  updatedAt?: Date | string
}

function toIsoString(value: Date | string | undefined) {
  if (!value) return new Date().toISOString()
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function toObjectIdString(value: unknown) {
  return value ? String(value) : ''
}

function toOrderStatus(value: string): OrderStatus {
  switch (value) {
    case 'draft':
    case 'pre_order':
    case 'waiting_confirm':
    case 'waiting_pickup':
    case 'delivering':
    case 'completed':
    case 'cancelled':
      return value
    default:
      return 'waiting_pickup'
  }
}

function buildNormalizedFromStored(order: StoredGrabOrder): NormalizedOrder {
  return {
    source: 'grab',
    externalOrderId: String(order.externalOrderId ?? ''),
    externalStoreId: String(order.externalStoreId ?? ''),
    customerName: String(order.customerName ?? 'Khách hàng'),
    customerPhone: order.customerPhone ? String(order.customerPhone) : undefined,
    items: Array.isArray(order.items) ? order.items as NormalizedOrder['items'] : [],
    subtotal: Number(order.subtotal ?? 0),
    discount: Number(order.discount ?? 0),
    total: Number(order.total ?? 0),
    platformFee: Number(order.platformFee ?? 0),
    paymentMethod: order.paymentMethod ? String(order.paymentMethod) : undefined,
    deliveryInfo: order.deliveryInfo,
    driverInfo: order.driverInfo,
    orderStatus: toOrderStatus(order.status),
    placedAt: toIsoString(order.placedAt),
    deliveredAt: order.deliveredAt ? toIsoString(order.deliveredAt) : undefined,
    rawPayload: (order.rawPayload ?? {}) as Record<string, unknown>,
  }
}

function getComparableSnapshot(order: StoredGrabOrder) {
  return JSON.stringify({
    items: order.items ?? [],
    subtotal: Number(order.subtotal ?? 0),
    discount: Number(order.discount ?? 0),
    total: Number(order.total ?? 0),
    platformFee: Number(order.platformFee ?? 0),
    status: String(order.status ?? ''),
    deliveredAt: order.deliveredAt ? toIsoString(order.deliveredAt) : '',
  })
}

export async function runRecentGrabEnrich(options: RecentGrabEnrichOptions) {
  const cutoff = new Date(Date.now() - options.hours * 60 * 60 * 1000)
  const query: Record<string, unknown> = {
    source: 'grab',
    rawPayload: { $exists: true, $ne: null },
    $or: [
      { updatedAt: { $gte: cutoff } },
      { placedAt: { $gte: cutoff } },
    ],
  }

  if (options.externalOrderIds?.length) {
    query.externalOrderId = { $in: options.externalOrderIds }
  }

  const orders = await OrderModel.find(query)
    .sort({ updatedAt: -1 })
    .limit(options.limit)
    .select('source externalOrderId externalStoreId brandId hubId customerName customerPhone items subtotal discount total platformFee paymentMethod deliveryInfo driverInfo status placedAt deliveredAt rawPayload updatedAt')
    .lean() as unknown as StoredGrabOrder[]

  let scanned = 0
  let updated = 0
  let skipped = 0
  const samples: Array<{ externalOrderId: string; changed: string[] }> = []

  for (const order of orders) {
    if (!order.externalOrderId || !order.rawPayload) {
      skipped += 1
      continue
    }

    scanned += 1
    const normalized = buildNormalizedFromStored(order)
    const upsert = buildOrderUpsert(
      { brandId: toObjectIdString(order.brandId), hubId: toObjectIdString(order.hubId) || undefined },
      normalized,
    )

    const nextSet = (upsert.$set ?? {}) as Record<string, unknown>
    const beforeSnapshot = getComparableSnapshot(order)
    const afterSnapshot = JSON.stringify({
      items: nextSet.items ?? [],
      subtotal: Number(nextSet.subtotal ?? 0),
      discount: Number(nextSet.discount ?? 0),
      total: Number(nextSet.total ?? 0),
      platformFee: Number(nextSet.platformFee ?? 0),
      status: String(nextSet.status ?? ''),
      deliveredAt: nextSet.deliveredAt ? toIsoString(nextSet.deliveredAt as Date | string) : '',
    })

    if (beforeSnapshot === afterSnapshot) {
      skipped += 1
      continue
    }

    const changed: string[] = []
    if (JSON.stringify(order.items ?? []) !== JSON.stringify(nextSet.items ?? [])) changed.push('items')
    if (Number(order.subtotal ?? 0) !== Number(nextSet.subtotal ?? 0)) changed.push('subtotal')
    if (Number(order.discount ?? 0) !== Number(nextSet.discount ?? 0)) changed.push('discount')
    if (Number(order.total ?? 0) !== Number(nextSet.total ?? 0)) changed.push('total')
    if (Number(order.platformFee ?? 0) !== Number(nextSet.platformFee ?? 0)) changed.push('platformFee')
    if (String(order.status ?? '') !== String(nextSet.status ?? '')) changed.push('status')

    await OrderModel.updateOne({ _id: order._id }, upsert)
    updated += 1
    if (samples.length < 20) {
      samples.push({ externalOrderId: String(order.externalOrderId), changed })
    }
  }

  return {
    ok: true,
    hours: options.hours,
    limit: options.limit,
    scanned,
    updated,
    skipped,
    samples,
  }
}
