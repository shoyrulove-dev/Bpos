import { generateId } from '@/lib/utils'
import type { NormalizedOrder } from '@/types'

type IntegrationRef = {
  brandId: string
  hubId?: string
}

function parseDateValue(value: unknown) {
  if (!value) return undefined
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return undefined
  return date
}

function extractCancellationReason(rawPayload: Record<string, unknown>) {
  const reason = rawPayload.cancelReason ?? rawPayload.cancellationReason ?? rawPayload.cancelledReason ?? rawPayload.reason
  return reason ? String(reason) : undefined
}

function extractCancellationDate(normalized: NormalizedOrder) {
  const rawPayload = normalized.rawPayload ?? {}
  return (
    parseDateValue(rawPayload.cancelledAt) ??
    parseDateValue(rawPayload.canceledAt) ??
    parseDateValue(rawPayload.updatedAt) ??
    parseDateValue(rawPayload.completedAt) ??
    parseDateValue(normalized.deliveredAt) ??
    parseDateValue(normalized.placedAt) ??
    new Date()
  )
}

function extractDeliveredDate(normalized: NormalizedOrder) {
  const rawPayload = normalized.rawPayload ?? {}
  return (
    parseDateValue(normalized.deliveredAt) ??
    parseDateValue(rawPayload.deliveredAt) ??
    parseDateValue(rawPayload.completedAt) ??
    parseDateValue(rawPayload.updatedAt)
  )
}

export function buildOrderUpsert(integration: IntegrationRef, normalized: NormalizedOrder) {
  const baseSet: Record<string, unknown> = {
    status: normalized.orderStatus,
    customerName: normalized.customerName || 'Khách hàng',
    customerPhone: normalized.customerPhone,
    items: normalized.items,
    subtotal: normalized.subtotal,
    discount: normalized.discount,
    total: normalized.total,
    platformFee: normalized.platformFee,
    paymentMethod: normalized.paymentMethod,
    deliveryInfo: normalized.deliveryInfo,
    driverInfo: normalized.driverInfo,
    rawPayload: normalized.rawPayload,
    source: normalized.source,
    externalOrderId: normalized.externalOrderId,
    externalStoreId: normalized.externalStoreId,
  }

  const unsetFields: Record<string, ''> = {}

  if (normalized.orderStatus === 'completed') {
    const deliveredAt = extractDeliveredDate(normalized)
    if (deliveredAt) {
      baseSet.deliveredAt = deliveredAt
    } else {
      unsetFields.deliveredAt = ''
    }
    unsetFields.cancelledAt = ''
    unsetFields.cancelReason = ''
  } else if (normalized.orderStatus === 'cancelled') {
    baseSet.cancelledAt = extractCancellationDate(normalized)
    const cancelReason = extractCancellationReason(normalized.rawPayload ?? {})
    if (cancelReason) {
      baseSet.cancelReason = cancelReason
    } else {
      unsetFields.cancelReason = ''
    }
    unsetFields.deliveredAt = ''
  } else {
    unsetFields.deliveredAt = ''
    unsetFields.cancelledAt = ''
    unsetFields.cancelReason = ''
  }

  return {
    $setOnInsert: {
      shortId: generateId(),
      placedAt: parseDateValue(normalized.placedAt) ?? new Date(),
      brandId: integration.brandId,
      hubId: integration.hubId,
    },
    $set: baseSet,
    ...(Object.keys(unsetFields).length ? { $unset: unsetFields } : {}),
  }
}