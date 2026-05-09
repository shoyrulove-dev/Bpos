import { generateId } from '@/lib/utils'
import type { NormalizedOrder } from '@/types'

type IntegrationRef = {
  brandId: string
  hubId?: string
}

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

function hasMeaningfulCustomerName(value: unknown) {
  if (!hasText(value)) return false
  const normalized = String(value).trim().toLowerCase()
  return normalized !== 'khách hàng' && normalized !== 'khach hang'
}

function hasItems(items: unknown) {
  return Array.isArray(items) && items.length > 0
}

function pickNumber(incoming: unknown, existing: unknown, fallback = 0) {
  const incomingNumber = Number(incoming)
  if (Number.isFinite(incomingNumber) && incomingNumber > 0) return incomingNumber

  const existingNumber = Number(existing)
  if (Number.isFinite(existingNumber) && existingNumber > 0) return existingNumber

  return Number.isFinite(incomingNumber) ? incomingNumber : Number.isFinite(existingNumber) ? existingNumber : fallback
}

function mergeInfoObject<T extends object>(existing: T | undefined, incoming: T | undefined) {
  if (!existing && !incoming) return undefined

  const merged: Record<string, unknown> = { ...((existing ?? {}) as Record<string, unknown>) }

  for (const [key, value] of Object.entries((incoming ?? {}) as Record<string, unknown>)) {
    if (typeof value === 'number') {
      if (Number.isFinite(value)) merged[key] = value
      continue
    }

    if (hasText(value)) merged[key] = String(value).trim()
  }

  return Object.keys(merged).length ? (merged as T) : undefined
}

type OrderSnapshot = Partial<NormalizedOrder>

export function mergeNormalizedOrderPreservingDetail(existing: OrderSnapshot | null | undefined, incoming: NormalizedOrder): NormalizedOrder {
  const mergedCustomerName = hasMeaningfulCustomerName(incoming.customerName)
    ? incoming.customerName.trim()
    : hasMeaningfulCustomerName(existing?.customerName)
    ? String(existing?.customerName).trim()
    : incoming.customerName

  const mergedCustomerPhone = hasText(incoming.customerPhone)
    ? String(incoming.customerPhone).trim()
    : hasText(existing?.customerPhone)
    ? String(existing?.customerPhone).trim()
    : undefined

  return {
    ...incoming,
    customerName: mergedCustomerName,
    customerPhone: mergedCustomerPhone,
    items: hasItems(incoming.items) ? incoming.items : existing?.items ?? incoming.items,
    subtotal: pickNumber(incoming.subtotal, existing?.subtotal),
    discount: pickNumber(incoming.discount, existing?.discount),
    total: pickNumber(incoming.total, existing?.total),
    platformFee: pickNumber(incoming.platformFee, existing?.platformFee),
    paymentMethod: hasText(incoming.paymentMethod)
      ? String(incoming.paymentMethod).trim()
      : hasText(existing?.paymentMethod)
      ? String(existing?.paymentMethod).trim()
      : undefined,
    deliveryInfo: mergeInfoObject(existing?.deliveryInfo, incoming.deliveryInfo),
    driverInfo: mergeInfoObject(existing?.driverInfo, incoming.driverInfo),
    rawPayload: {
      ...(existing?.rawPayload ?? {}),
      ...(incoming.rawPayload ?? {}),
    },
  }
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