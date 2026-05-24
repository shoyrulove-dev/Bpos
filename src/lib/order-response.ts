import { repairVietnameseText, repairVietnameseTextDeep } from '@/lib/text-normalizer'
import { recoverOrderDisplayFields } from '@/lib/order-recovery'
import { getOrderDisplayCode } from '@/lib/utils'

type PopulatedRef = { _id?: { toString(): string } | string; name?: string } | string | null | undefined
type OrderLike = Record<string, unknown> & {
  _id?: { toString(): string } | string
  brandId?: PopulatedRef
  hubId?: PopulatedRef
  channelId?: PopulatedRef
}

type SerializeOrderResponseOptions = {
  includeRawPayload?: boolean
}

function getRefId(value: PopulatedRef) {
  if (!value || typeof value === 'string') return value
  if ('_id' in value && value._id) return value._id.toString()
  return undefined
}

function getRefName(value: PopulatedRef) {
  if (!value || typeof value === 'string') return undefined
  return typeof value.name === 'string' ? value.name : undefined
}

function buildRecoveredOrderBase<T extends OrderLike>(order: T, options: SerializeOrderResponseOptions = {}) {
  const recovered = recoverOrderDisplayFields(order as {
    rawPayload?: unknown
    customerName?: unknown
    customerPhone?: unknown
    placedAt?: unknown
    deliveredAt?: unknown
    createdAt?: unknown
    updatedAt?: unknown
    status?: unknown
  })
  const includeRawPayload = options.includeRawPayload !== false
  const displayCode = getOrderDisplayCode({
    source: typeof order.source === 'string' ? order.source : undefined,
    shortId: typeof order.shortId === 'string' ? order.shortId : undefined,
    externalOrderId: typeof order.externalOrderId === 'string' ? order.externalOrderId : undefined,
    rawPayload: recovered.rawPayload as Record<string, unknown> | undefined,
  })

  return {
    ...recovered,
    ...(includeRawPayload ? {} : { rawPayload: undefined }),
    displayCode,
    _id: typeof order._id === 'string' ? order._id : order._id?.toString?.(),
    brandId: getRefId(order.brandId),
    brandName: getRefName(order.brandId),
    hubId: getRefId(order.hubId),
    hubName: getRefName(order.hubId),
    channelId: getRefId(order.channelId),
    channelName: getRefName(order.channelId),
  }
}

export function serializeOrderResponse<T extends OrderLike>(order: T, options: SerializeOrderResponseOptions = {}) {
  return repairVietnameseTextDeep(buildRecoveredOrderBase(order, options))
}

export function serializeOrderListResponse<T extends OrderLike>(order: T, options: SerializeOrderResponseOptions = {}) {
  const base = buildRecoveredOrderBase(order, options) as Record<string, unknown>
  const deliveryInfo = base.deliveryInfo && typeof base.deliveryInfo === 'object' && !Array.isArray(base.deliveryInfo)
    ? (base.deliveryInfo as Record<string, unknown>)
    : undefined
  const driverInfo = base.driverInfo && typeof base.driverInfo === 'object' && !Array.isArray(base.driverInfo)
    ? (base.driverInfo as Record<string, unknown>)
    : undefined
  const items = Array.isArray(base.items)
    ? base.items.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return item
        const record = item as Record<string, unknown>
        return {
          ...record,
          ...(typeof record.name === 'string' ? { name: repairVietnameseText(record.name) } : {}),
        }
      })
    : base.items

  return {
    ...base,
    customerName: typeof base.customerName === 'string' ? repairVietnameseText(base.customerName) : base.customerName,
    customerPhone: typeof base.customerPhone === 'string' ? repairVietnameseText(base.customerPhone) : base.customerPhone,
    brandName: typeof base.brandName === 'string' ? repairVietnameseText(base.brandName) : base.brandName,
    hubName: typeof base.hubName === 'string' ? repairVietnameseText(base.hubName) : base.hubName,
    deliveryInfo: deliveryInfo ? {
      ...deliveryInfo,
      ...(typeof deliveryInfo.address === 'string' ? { address: repairVietnameseText(deliveryInfo.address) } : {}),
      ...(typeof deliveryInfo.note === 'string' ? { note: repairVietnameseText(deliveryInfo.note) } : {}),
    } : base.deliveryInfo,
    driverInfo: driverInfo ? {
      ...driverInfo,
      ...(typeof driverInfo.name === 'string' ? { name: repairVietnameseText(driverInfo.name) } : {}),
      ...(typeof driverInfo.phone === 'string' ? { phone: repairVietnameseText(driverInfo.phone) } : {}),
    } : base.driverInfo,
    items,
  }
}
