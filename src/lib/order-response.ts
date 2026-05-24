import { repairVietnameseTextDeep } from '@/lib/text-normalizer'
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

export function serializeOrderResponse<T extends OrderLike>(order: T, options: SerializeOrderResponseOptions = {}) {
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

  return repairVietnameseTextDeep({
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
  })
}
