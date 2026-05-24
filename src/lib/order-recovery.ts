import { getDisplayCustomerName, getDisplayCustomerPhone } from '@/lib/order-financials'
import { normalizeCompactPhone } from '@/lib/phone'
import { repairVietnameseText } from '@/lib/text-normalizer'
import { toValidDate } from '@/lib/utils'
import type { Order } from '@/types'

type OrderLike = {
  rawPayload?: unknown
  customerName?: unknown
  customerPhone?: unknown
  placedAt?: unknown
  deliveredAt?: unknown
  createdAt?: unknown
  updatedAt?: unknown
  status?: unknown
}

const CUSTOMER_NAME_PLACEHOLDERS = new Set(['khachhang', 'customer', 'guest'])
const DATE_DEPTH_LIMIT = 4
const OBJECT_KEYS_TO_SCAN = [
  'times',
  'timeline',
  'timestamps',
  'customer',
  'customerInfo',
  'customer_info',
  'receiver',
  'consumer',
  'eater',
  'recipient',
  'consignee',
  'buyer',
  'user',
  'contact',
  'shippingAddress',
  'shipping_address',
  'delivery',
  'order',
  'orderInfo',
  'order_info',
  'meta',
  'payload',
]
const CUSTOMER_CONTAINER_KEYS = [
  'customer',
  'customerInfo',
  'customer_info',
  'receiver',
  'consumer',
  'eater',
  'recipient',
  'consignee',
  'buyer',
  'user',
  'contact',
  'shippingAddress',
  'shipping_address',
]
const CUSTOMER_NAME_KEYS = [
  'name',
  'displayName',
  'fullName',
  'contactName',
  'customerName',
  'customer_name',
  'receiverName',
  'receiver_name',
  'recipientName',
  'recipient_name',
  'buyerName',
  'buyer_name',
]
const CUSTOMER_PHONE_KEYS = [
  'phone',
  'phoneNumber',
  'mobileNumber',
  'contactNumber',
  'displayPhone',
  'customerPhone',
  'customer_phone',
  'customer_phone_no',
  'receiverPhone',
  'receiver_phone',
  'receiver_phone_no',
  'recipientPhone',
  'recipient_phone',
  'contactPhone',
  'contact_phone',
]
const PLACED_AT_KEYS = [
  'placedAt',
  'placed_at',
  'createdAt',
  'created_at',
  'createTime',
  'create_time',
  'created_time',
  'orderTime',
  'order_time',
  'bookedAt',
  'booked_at',
  'orderedAt',
  'ordered_at',
]
const DELIVERED_AT_KEYS = [
  'deliveredAt',
  'delivered_at',
  'completedAt',
  'completed_at',
  'deliveryCompletedAt',
  'delivered_time',
  'finishedAt',
  'finished_at',
  'finishTime',
  'finish_time',
  'receivedAt',
  'received_at',
  'dropoffAt',
  'dropoff_at',
]
const LAST_RESORT_COMPLETED_KEYS = [
  'updatedAt',
  'updated_at',
  'closedAt',
  'closed_at',
]

function getRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeComparableText(value: string) {
  return repairVietnameseText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function normalizeNameCandidate(value: unknown) {
  if (!hasText(value)) return undefined

  const repaired = repairVietnameseText(String(value)).trim()
  if (!repaired) return undefined

  const comparable = normalizeComparableText(repaired)
  if (!comparable || CUSTOMER_NAME_PLACEHOLDERS.has(comparable)) return undefined
  if (comparable.includes('khachhang') && comparable.length <= 'khachhang'.length + 2) return undefined
  if (comparable.includes('*') || /^[xX#._-]+$/.test(repaired.replace(/\s+/g, ''))) return undefined

  return repaired
}

function normalizePhoneCandidate(value: unknown) {
  if (value == null) return undefined

  const text = repairVietnameseText(String(value)).trim()
  if (!text) return undefined

  return normalizeCompactPhone(text) ?? undefined
}

function toIsoString(value: unknown) {
  const date = toValidDate(value)
  return date ? date.toISOString() : undefined
}

function findDateByKeys(value: unknown, keys: string[], depth = 0, seen = new Set<unknown>()): string | undefined {
  if (value == null || depth > DATE_DEPTH_LIMIT || seen.has(value)) return undefined

  const direct = toIsoString(value)
  if (direct) return direct

  if (Array.isArray(value)) {
    seen.add(value)
    for (const item of value.slice(0, 12)) {
      const nested = findDateByKeys(item, keys, depth + 1, seen)
      if (nested) return nested
    }
    return undefined
  }

  const record = getRecord(value)
  if (!record) return undefined

  seen.add(value)

  for (const key of keys) {
    const nested = toIsoString(record[key])
    if (nested) return nested
  }

  for (const key of OBJECT_KEYS_TO_SCAN) {
    const nested = findDateByKeys(record[key], keys, depth + 1, seen)
    if (nested) return nested
  }

  if (depth < 2) {
    for (const nestedValue of Object.values(record)) {
      const nested = findDateByKeys(nestedValue, keys, depth + 1, seen)
      if (nested) return nested
    }
  }

  return undefined
}

function getContainerRecords(rawPayload: Record<string, unknown> | undefined) {
  if (!rawPayload) return []

  return CUSTOMER_CONTAINER_KEYS
    .map((key) => getRecord(rawPayload[key]))
    .filter((value): value is Record<string, unknown> => Boolean(value))
}

function findFirstNameCandidate(order: OrderLike) {
  const rawPayload = getRecord(order.rawPayload)
  const directCandidates = [
    order.customerName,
    rawPayload?.customer_name,
    rawPayload?.customerName,
    rawPayload?.receiver_name,
    rawPayload?.receiverName,
    rawPayload?.recipient_name,
    rawPayload?.recipientName,
    rawPayload?.contact_name,
    rawPayload?.contactName,
  ]

  for (const candidate of directCandidates) {
    const normalized = normalizeNameCandidate(candidate)
    if (normalized) return normalized
  }

  for (const container of getContainerRecords(rawPayload)) {
    for (const key of CUSTOMER_NAME_KEYS) {
      const normalized = normalizeNameCandidate(container[key])
      if (normalized) return normalized
    }
  }

  return undefined
}

function findFirstPhoneCandidate(order: OrderLike) {
  const rawPayload = getRecord(order.rawPayload)
  const directCandidates = [
    order.customerPhone,
    rawPayload?.customer_phone_no,
    rawPayload?.customer_phone,
    rawPayload?.customerPhone,
    rawPayload?.receiver_phone_no,
    rawPayload?.receiver_phone,
    rawPayload?.receiverPhone,
    rawPayload?.recipient_phone,
    rawPayload?.recipientPhone,
    rawPayload?.contact_phone,
    rawPayload?.contactPhone,
  ]

  for (const candidate of directCandidates) {
    const normalized = normalizePhoneCandidate(candidate)
    if (normalized) return normalized
  }

  for (const container of getContainerRecords(rawPayload)) {
    for (const key of CUSTOMER_PHONE_KEYS) {
      const normalized = normalizePhoneCandidate(container[key])
      if (normalized) return normalized
    }
  }

  return undefined
}

export function resolveOrderCustomerName(order: OrderLike) {
  const display = normalizeNameCandidate(getDisplayCustomerName(order as Order))
  if (display) return display
  return findFirstNameCandidate(order)
}

export function resolveOrderCustomerPhone(order: OrderLike) {
  const display = normalizePhoneCandidate(getDisplayCustomerPhone(order as Order))
  if (display) return display
  return findFirstPhoneCandidate(order)
}

export function resolveOrderPlacedAtValue(order: OrderLike) {
  const rawPayload = getRecord(order.rawPayload)

  return (
    toIsoString(order.placedAt)
    ?? findDateByKeys(rawPayload?.times, PLACED_AT_KEYS)
    ?? findDateByKeys(rawPayload, PLACED_AT_KEYS)
    ?? toIsoString(order.createdAt)
    ?? toIsoString(order.updatedAt)
  )
}

export function resolveOrderDeliveredAtValue(order: OrderLike) {
  const rawPayload = getRecord(order.rawPayload)
  const resolved = (
    toIsoString(order.deliveredAt)
    ?? findDateByKeys(rawPayload?.times, DELIVERED_AT_KEYS)
    ?? findDateByKeys(rawPayload, DELIVERED_AT_KEYS)
  )

  if (resolved) return resolved

  if (String(order.status ?? '').toLowerCase() === 'completed') {
    return findDateByKeys(rawPayload?.times, LAST_RESORT_COMPLETED_KEYS)
      ?? findDateByKeys(rawPayload, LAST_RESORT_COMPLETED_KEYS)
  }

  return undefined
}

export function recoverOrderDisplayFields<T extends OrderLike>(order: T) {
  const customerName = resolveOrderCustomerName(order)
  const customerPhone = resolveOrderCustomerPhone(order)
  const placedAt = resolveOrderPlacedAtValue(order)
  const deliveredAt = resolveOrderDeliveredAtValue(order)

  return {
    ...order,
    ...(customerName ? { customerName } : {}),
    ...(customerPhone ? { customerPhone } : {}),
    ...(placedAt ? { placedAt } : {}),
    ...(deliveredAt ? { deliveredAt } : {}),
  }
}
