import { generateId } from '@/lib/utils'
import { extractGrabCustomerFinancials, getDisplayCustomerName, getDisplayCustomerPhone, getDisplayDriverName, getDisplayDriverPhone, getFinancialBreakdown } from '@/lib/order-financials'
import { hasBeCancelSignal } from '@/lib/be-order-status'
import { normalizeCompactPhone } from '@/lib/phone'
import { resolveOrderCustomerName, resolveOrderCustomerPhone, resolveOrderDeliveredAtValue, resolveOrderPlacedAtValue } from '@/lib/order-recovery'
import { repairVietnameseTextDeep } from '@/lib/text-normalizer'
import type { NormalizedOrder, Order } from '@/types'

type IntegrationRef = {
  brandId: string
  hubId?: string
}

const FINALIZED_ORDER_STATUSES = new Set(['completed', 'cancelled'])

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

const CUSTOMER_NAME_PLACEHOLDERS = new Set(['khách hàng', 'khach hang'])
const DRIVER_NAME_PLACEHOLDERS = new Set(['tài xế', 'tai xe', 'driver', 'shipper', 'hóa đơn', 'hoá đơn', 'hoa don', 'invoice'])

function toTrimmedText(value: unknown) {
  return hasText(value) ? String(value).trim() : undefined
}

function isRedactedText(value: unknown) {
  const trimmed = toTrimmedText(value)
  if (!trimmed) return false

  const compact = trimmed.replace(/\s+/g, '')
  return compact.includes('*') || /^[xX#._-]+$/.test(compact)
}

export function hasMeaningfulPhone(value: unknown) {
  const trimmed = toTrimmedText(value)
  if (!trimmed || isRedactedText(trimmed)) return false
  return Boolean(normalizeCompactPhone(trimmed))
}

function pickPreferredPhone(incoming: unknown, existing: unknown) {
  if (hasMeaningfulPhone(existing)) return normalizeCompactPhone(toTrimmedText(existing))
  if (hasMeaningfulPhone(incoming)) return normalizeCompactPhone(toTrimmedText(incoming))
  return undefined
}

function hasMeaningfulName(value: unknown, placeholders: Set<string>) {
  const trimmed = toTrimmedText(value)
  if (!trimmed || isRedactedText(trimmed)) return false
  return !placeholders.has(trimmed.toLowerCase())
}

export function hasMeaningfulCustomerName(value: unknown) {
  return hasMeaningfulName(value, CUSTOMER_NAME_PLACEHOLDERS)
}

export function hasMeaningfulDriverName(value: unknown) {
  return hasMeaningfulName(value, DRIVER_NAME_PLACEHOLDERS)
}

export function getComparableDriverName(value: unknown) {
  if (!hasMeaningfulDriverName(value) || isDriverNamePlaceholder(value)) return undefined

  const trimmed = toTrimmedText(value)
  if (!trimmed) return undefined

  const normalized = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  return normalized || undefined
}

/** Returns true when a name is an auto-generated phone-only placeholder (e.g. "(Tài xế grab)"). */
export function isDriverNamePlaceholder(value: unknown) {
  const trimmed = toTrimmedText(value)
  return Boolean(trimmed && trimmed.startsWith('(') && trimmed.endsWith(')'))
}

function pickPreferredName(
  incoming: unknown,
  existing: unknown,
  placeholders: Set<string>,
  fallback?: string
) {
  const existingName = toTrimmedText(existing)
  if (hasMeaningfulName(existingName, placeholders)) return existingName

  const incomingName = toTrimmedText(incoming)
  if (hasMeaningfulName(incomingName, placeholders)) return incomingName

  if (existingName && !isRedactedText(existingName)) return existingName
  if (incomingName && !isRedactedText(incomingName)) return incomingName

  return fallback
}

function mergeDriverInfoPreservingDetail(
  existing: NormalizedOrder['driverInfo'] | undefined,
  incoming: NormalizedOrder['driverInfo'] | undefined,
) {
  // Detect driver reassignment: if both sides have a meaningful phone and the phones differ,
  // Grab changed the driver — incoming data takes priority over existing.
  const existingPhone = hasMeaningfulPhone(existing?.phone) ? normalizeCompactPhone(toTrimmedText(existing!.phone)) : undefined
  const incomingPhone = hasMeaningfulPhone(incoming?.phone) ? normalizeCompactPhone(toTrimmedText(incoming!.phone)) : undefined
  const isDriverReassignment = Boolean(
    existingPhone && incomingPhone && existingPhone !== incomingPhone && hasMeaningfulDriverName(incoming?.name),
  )

  const merged = mergeInfoObject(existing, incoming)
  if (!merged) return undefined

  const nextDriverInfo = { ...merged } as Record<string, unknown>

  // On reassignment, incoming name and phone win unconditionally.
  const driverName = isDriverReassignment
    ? toTrimmedText(incoming?.name)
    : pickPreferredName(incoming?.name, existing?.name, DRIVER_NAME_PLACEHOLDERS)
  const driverPhone = isDriverReassignment
    ? incomingPhone
    : pickPreferredPhone(incoming?.phone, existing?.phone)

  if (driverName) nextDriverInfo.name = driverName
  else delete nextDriverInfo.name

  if (driverPhone) nextDriverInfo.phone = driverPhone
  else delete nextDriverInfo.phone

  return Object.keys(nextDriverInfo).length ? (nextDriverInfo as NonNullable<NormalizedOrder['driverInfo']>) : undefined
}

function shouldSuppressDriverInfo(incoming: NormalizedOrder) {
  if (incoming.source !== 'grab') return false
  if (incoming.orderStatus === 'delivering' || incoming.orderStatus === 'waiting_pickup' || incoming.orderStatus === 'completed' || incoming.orderStatus === 'cancelled') {
    return false
  }

  const raw = getRecord(incoming.rawPayload)
  const pageStage = String(raw?._pageStage ?? raw?._pageType ?? raw?.pageType ?? '').trim().toLowerCase()
  if (pageStage.includes('ready') || pageStage.includes('history') || pageStage.includes('complete') || pageStage.includes('cancel')) {
    return false
  }

  const driverSignals = [
    raw?.deliveryStatus,
    raw?.orderState,
    raw?.status,
    raw?.orderStatus,
    raw?.state,
    raw?.deliveryTaskpoolStatus,
    raw?.fulfillmentStatus,
    raw?._pageType,
    raw?.pageType,
  ]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)

  return !driverSignals.some((value) => (
    value.includes('ready')
    || value.includes('collect')
    || value.includes('delivery')
    || value.includes('picking_up')
  ))
}

function hasItems(items: unknown) {
  return Array.isArray(items) && items.length > 0
}

function hasAddons(items: unknown) {
  if (!Array.isArray(items) || items.length === 0) return false
  return items.some((item) => {
    const record = getRecord(item)
    if (!record) return false
    return (
      (Array.isArray(record.addons) && record.addons.length > 0) ||
      (Array.isArray(record.modifiers) && record.modifiers.length > 0) ||
      (Array.isArray(record.modifierGroups) && record.modifierGroups.length > 0)
    )
  })
}

function getRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function hasDetailedItems(items: unknown) {
  if (!Array.isArray(items) || items.length === 0) return false

  return items.some((item) => {
    const record = getRecord(item)
    if (!record) return false

    return Boolean(
      (typeof record.note === 'string' && record.note.trim())
      || (Array.isArray(record.addons) && record.addons.length)
      || (Array.isArray(record.options) && record.options.length)
      || (Array.isArray(record.modifiers) && record.modifiers.length)
      || Number(record.price ?? 0) > 0
      || Number(record.total ?? 0) > 0
    )
  })
}

function getComparableItemsSignature(items: unknown) {
  if (!Array.isArray(items) || items.length === 0) return ''

  return JSON.stringify(items.map((item) => {
    const record = getRecord(item)
    if (!record) return item

    return {
      name: toTrimmedText(record.name) ?? '',
      quantity: Number(record.quantity ?? 0),
      price: Number(record.price ?? 0),
      total: Number(record.total ?? 0),
      note: toTrimmedText(record.note) ?? '',
      addons: Array.isArray(record.addons) ? record.addons.length : 0,
      options: Array.isArray(record.options) ? record.options.length : 0,
      modifiers: Array.isArray(record.modifiers) ? record.modifiers.length : 0,
    }
  }))
}

function numbersDiffer(left: unknown, right: unknown) {
  return Number(left ?? 0) !== Number(right ?? 0)
}

function hasGrabUtensilInfo(rawPayload: unknown) {
  const raw = getRecord(rawPayload)
  if (!raw) return false
  if ('needCutlery' in raw) return true
  const itemInfo = getRecord(raw.itemInfo)
  return Boolean(itemInfo && 'needCutlery' in itemInfo)
}

function hasGrabRawPayloadDetailedItems(rawPayload: unknown) {
  const raw = getRecord(rawPayload)
  if (!raw) return false

  const itemInfo = getRecord(raw.itemInfo)
  const rawItems = Array.isArray(raw.items)
    ? raw.items
    : Array.isArray(raw.orderItems)
    ? raw.orderItems
    : Array.isArray(raw.lineItems)
    ? raw.lineItems
    : Array.isArray(itemInfo?.items)
    ? itemInfo.items
    : []

  return rawItems.some((item) => {
    const record = getRecord(item)
    const fare = getRecord(record?.fare)
    if (!record) return false

    return Boolean(
      (Array.isArray(record.modifiers) && record.modifiers.length)
      || (Array.isArray(record.modifierGroups) && record.modifierGroups.length)
      || (Array.isArray(record.addons) && record.addons.length)
      || (Array.isArray(record.options) && record.options.length)
      || (Array.isArray(record.discountInfo) && record.discountInfo.length)
      || Number(record.price ?? record.itemPrice ?? record.totalPrice ?? record.subtotal ?? record.total ?? 0) > 0
      || Number(fare?.priceFloat ?? fare?.priceInMin ?? fare?.amount ?? fare?.price ?? 0) > 0
    )
  })
}

function hasGrabRawPayloadPromotionDetail(rawPayload: unknown) {
  const raw = getRecord(rawPayload)
  if (!raw) return false

  const itemInfo = getRecord(raw.itemInfo)
  const voucherInfo = getRecord(raw.voucherInfo)
  const rawItems = Array.isArray(raw.items)
    ? raw.items
    : Array.isArray(raw.orderItems)
    ? raw.orderItems
    : Array.isArray(raw.lineItems)
    ? raw.lineItems
    : Array.isArray(itemInfo?.items)
    ? itemInfo.items
    : []

  return Boolean(
    (Array.isArray(raw.orderLevelDiscounts) && raw.orderLevelDiscounts.length)
    || (Array.isArray(voucherInfo?.vouchers) && voucherInfo.vouchers.length)
    || (Array.isArray(voucherInfo?.discounts) && voucherInfo.discounts.length)
    || rawItems.some((item) => Array.isArray(getRecord(item)?.discountInfo) && (getRecord(item)?.discountInfo as unknown[]).length > 0)
  )
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

function mergeRawPayloadPreservingContacts(
  existing: Record<string, unknown> | undefined,
  incoming: Record<string, unknown> | undefined,
) {
  if (!existing && !incoming) return undefined

  const merged: Record<string, unknown> = {
    ...(existing ?? {}),
    ...(incoming ?? {}),
  }

  for (const key of ['customer', 'receiver', 'consumer', 'eater', 'driver', 'rider', 'courier', 'driverDetails', 'driverInfo']) {
    const nextValue = mergeInfoObject(getRecord(existing?.[key]), getRecord(incoming?.[key]))
    if (nextValue) merged[key] = nextValue
  }

  // Preserve promotion/discount detail from existing if incoming doesn't have it
  for (const key of ['orderLevelDiscounts', 'voucherInfo', 'offers', 'order_discount']) {
    if (existing?.[key] !== undefined && incoming?.[key] === undefined) {
      merged[key] = existing[key]
    }
  }

  const mergedDelivery = mergeInfoObject(getRecord(existing?.delivery), getRecord(incoming?.delivery))
  if (mergedDelivery) {
    merged.delivery = mergedDelivery

    const mergedDeliveryDriver = mergeInfoObject(
      getRecord(getRecord(existing?.delivery)?.driver),
      getRecord(getRecord(incoming?.delivery)?.driver),
    )

    if (mergedDeliveryDriver) {
      (merged.delivery as Record<string, unknown>).driver = mergedDeliveryDriver
    }
  }

  return Object.keys(merged).length ? merged : undefined
}

type OrderSnapshot = Partial<NormalizedOrder>

export function mergeNormalizedOrderPreservingDetail(existing: OrderSnapshot | null | undefined, incoming: NormalizedOrder): NormalizedOrder {
  const mergedRawPayload = mergeRawPayloadPreservingContacts(
    getRecord(existing?.rawPayload),
    getRecord(incoming.rawPayload),
  )

  const existingOrder = {
    ...(existing ?? {}),
    rawPayload: existing?.rawPayload,
  } as Order

  const incomingOrder = {
    ...incoming,
    rawPayload: mergedRawPayload ?? incoming.rawPayload,
  } as unknown as Order

  const mergedCustomerName = pickPreferredName(
    getDisplayCustomerName(incomingOrder) || incoming.customerName,
    getDisplayCustomerName(existingOrder) || existing?.customerName,
    CUSTOMER_NAME_PLACEHOLDERS,
    incoming.customerName,
  ) ?? 'Khách hàng'

  const mergedCustomerPhone = pickPreferredPhone(
    getDisplayCustomerPhone(incomingOrder) || incoming.customerPhone,
    getDisplayCustomerPhone(existingOrder) || existing?.customerPhone,
  )

  const mergedDriverName = pickPreferredName(
    getDisplayDriverName(incomingOrder) || incoming.driverInfo?.name,
    getDisplayDriverName(existingOrder) || existing?.driverInfo?.name,
    DRIVER_NAME_PLACEHOLDERS,
  )

  const mergedDriverPhone = pickPreferredPhone(
    getDisplayDriverPhone(incomingOrder) || incoming.driverInfo?.phone,
    getDisplayDriverPhone(existingOrder) || existing?.driverInfo?.phone,
  )

  const mergedDriverInfo = shouldSuppressDriverInfo(incoming)
    ? undefined
    : (() => {
      const nextDriverInfo = {
        ...(mergeDriverInfoPreservingDetail(existing?.driverInfo, incoming.driverInfo) ?? {}),
      } as Record<string, unknown>

      if (mergedDriverName) nextDriverInfo.name = mergedDriverName
      else delete nextDriverInfo.name

      if (mergedDriverPhone) nextDriverInfo.phone = mergedDriverPhone
      else delete nextDriverInfo.phone

      return Object.keys(nextDriverInfo).length
        ? nextDriverInfo as NonNullable<NormalizedOrder['driverInfo']>
        : undefined
    })()

  return {
    ...incoming,
    customerName: mergedCustomerName,
    customerPhone: mergedCustomerPhone,
    // Prefer items that have more detail: addons/modifiers > has prices > any items
    // This prevents DOM-extracted flat items (no addons) from overwriting XHR-captured detailed items
    items: (() => {
      if (hasAddons(incoming.items)) return incoming.items
      if (existing?.items && hasAddons(existing.items)) return existing.items
      if (hasDetailedItems(incoming.items)) return incoming.items
      if (existing?.items && hasDetailedItems(existing.items)) return existing.items
      return hasItems(incoming.items) ? incoming.items : (existing?.items ?? incoming.items)
    })(),
    subtotal: pickNumber(incoming.subtotal, existing?.subtotal),
    discount: pickNumber(incoming.discount, existing?.discount),
    // If incoming has a discount and a clearly-correct net total, always prefer it
    // (fixes cases where existing.total was stored before discount info arrived)
    total: (() => {
      const incomingDiscount = Number(incoming.discount ?? 0)
      const incomingTotal = Number(incoming.total ?? 0)
      const incomingSubtotal = Number(incoming.subtotal ?? 0)
      if (
        incomingDiscount > 0 &&
        incomingTotal > 0 &&
        incomingTotal < (incomingSubtotal || Infinity) &&
        Math.abs(incomingTotal - (incomingSubtotal - incomingDiscount)) < 2
      ) {
        return incomingTotal
      }
      return pickNumber(incoming.total, existing?.total)
    })(),
    platformFee: pickNumber(incoming.platformFee, existing?.platformFee),
    paymentMethod: hasText(incoming.paymentMethod)
      ? String(incoming.paymentMethod).trim()
      : hasText(existing?.paymentMethod)
      ? String(existing?.paymentMethod).trim()
      : undefined,
    deliveryInfo: mergeInfoObject(existing?.deliveryInfo, incoming.deliveryInfo),
    driverInfo: mergedDriverInfo,
    rawPayload: mergedRawPayload ?? {
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

function getGrabScraperFinalizedStatusFromRaw(rawPayload: Record<string, unknown>) {
  const explicitStatus = String(rawPayload._scraperFinalizedStatus ?? '').trim().toLowerCase()
  if (explicitStatus === 'completed' || explicitStatus === 'cancelled') return explicitStatus

  const finalizedStage = String(rawPayload._scraperFinalizedStage ?? '').trim().toLowerCase()
  if (finalizedStage === 'cancelled') return 'cancelled' as const
  if (finalizedStage === 'completed') return 'completed' as const

  return null
}

export function getGrabScraperFinalizedStatus(normalized: Pick<NormalizedOrder, 'source' | 'rawPayload'>) {
  if (normalized.source !== 'grab') return null
  const rawPayload = getRecord(normalized.rawPayload)
  if (!rawPayload) return null
  return getGrabScraperFinalizedStatusFromRaw(rawPayload)
}

function extractNestedTimes(rawPayload: Record<string, unknown>) {
  const times = rawPayload.times && typeof rawPayload.times === 'object' && !Array.isArray(rawPayload.times)
    ? rawPayload.times as Record<string, unknown>
    : undefined

  return {
    createdAt: parseDateValue(times?.createdAt),
    completedAt: parseDateValue(times?.completedAt),
    deliveredAt: parseDateValue(times?.deliveredAt),
    updatedAt: parseDateValue(times?.updatedAt),
  }
}

function hasGrabActiveStatusSignal(normalized: NormalizedOrder) {
  if (normalized.source !== 'grab') return false

  const rawPayload = normalized.rawPayload ?? {}
  const signals = [
    rawPayload._pageStage,
    rawPayload.state,
    rawPayload.orderState,
    rawPayload.deliveryTaskpoolStatus,
    rawPayload.preparationTaskpoolStatus,
    rawPayload.status,
    rawPayload.orderStatus,
    rawPayload.pageType,
    rawPayload._pageType,
  ]
    .map((value) => String(value ?? '').trim().toLowerCase())
    .filter(Boolean)

  if (signals.some((value) => value.includes('cancel') || value.includes('fail') || value.includes('refund'))) {
    return false
  }

  return signals.some((value) => (
    value.includes('prepare')
    || value.includes('ready')
    || value.includes('upcoming')
    || value.includes('pickup')
    || value.includes('accepted')
    || value.includes('allocat')
    || value.includes('execut')
    || value.includes('in_delivery')
    || value.includes('delivering')
    || value.includes('dang giao')
    || value.includes('đang giao')
    || value.includes('collected')
    || value.includes('picked_up')
    || value.includes('delivery')
  ))
}

function extractCancellationReason(rawPayload: Record<string, unknown>) {
  const reason = rawPayload.cancelReason
    ?? rawPayload.cancellationReason
    ?? rawPayload.cancelledReason
    ?? rawPayload.cancel_reason
    ?? rawPayload.status_reason
    ?? rawPayload.driver_cancel_reason
    ?? rawPayload.restaurant_cancel_reason
    ?? rawPayload.customer_cancel_reason
    ?? rawPayload.cancel_note
    ?? rawPayload.reason
  return reason ? String(reason) : undefined
}

function extractCancellationDate(normalized: NormalizedOrder) {
  const rawPayload = normalized.rawPayload ?? {}
  return (
    parseDateValue(rawPayload.cancelledAt) ??
    parseDateValue(rawPayload.canceledAt) ??
    parseDateValue(rawPayload.cancelled_at) ??
    parseDateValue(rawPayload.cancel_time) ??
    parseDateValue(rawPayload.cancel_date) ??
    parseDateValue(rawPayload.updatedAt) ??
    parseDateValue(rawPayload.completedAt) ??
    parseDateValue(normalized.deliveredAt) ??
    parseDateValue(normalized.placedAt) ??
    new Date()
  )
}

export function hasMeaningfulFinalizedOrderChange(existing: Partial<NormalizedOrder> | Record<string, unknown> | null | undefined, incoming: NormalizedOrder) {
  if (!existing) return true

  const existingRecord = getRecord(existing)
  const incomingRecord = getRecord(incoming)
  const existingDriverInfo = getRecord(existing.driverInfo)
  const existingRawPayload = getRecord(existing.rawPayload)
  const incomingRawPayload = getRecord(incoming.rawPayload)

  if (!hasMeaningfulPhone(existing.customerPhone) && hasMeaningfulPhone(incoming.customerPhone)) return true
  if (!hasMeaningfulPhone(existingDriverInfo?.phone) && hasMeaningfulPhone(incoming.driverInfo?.phone)) return true

  if (!hasDetailedItems(existing.items) && hasDetailedItems(incoming.items)) return true
  if (hasItems(incoming.items) && getComparableItemsSignature(existing.items) !== getComparableItemsSignature(incoming.items)) return true

  // Grab browser backfill can enrich the stored raw payload without changing the already-normalized
  // item list. Treat new raw detail as meaningful so finalized orders still get updated and do not
  // remain stuck in /cron/missing-phones forever.
  if (!hasGrabUtensilInfo(existingRawPayload) && hasGrabUtensilInfo(incomingRawPayload)) return true
  if (!hasGrabRawPayloadDetailedItems(existingRawPayload) && hasGrabRawPayloadDetailedItems(incomingRawPayload)) return true
  if (!hasGrabRawPayloadPromotionDetail(existingRawPayload) && hasGrabRawPayloadPromotionDetail(incomingRawPayload)) return true

  if (numbersDiffer(existing.subtotal, incoming.subtotal)) return true
  if (numbersDiffer(existing.discount, incoming.discount)) return true
  if (numbersDiffer(existing.total, incoming.total)) return true
  if (numbersDiffer(existing.platformFee, incoming.platformFee)) return true

  const existingPaymentMethod = toTrimmedText(existing.paymentMethod)
  const incomingPaymentMethod = toTrimmedText(incoming.paymentMethod)
  if (incomingPaymentMethod && existingPaymentMethod !== incomingPaymentMethod) return true

  const existingDeliveredAt = parseDateValue(existing.deliveredAt)
  const incomingDeliveredAt = parseDateValue(incoming.deliveredAt)
    ?? parseDateValue(incomingRawPayload?.deliveredAt)
    ?? parseDateValue(incomingRawPayload?.completedAt)
  if (incomingDeliveredAt && existingDeliveredAt?.getTime() !== incomingDeliveredAt.getTime()) return true

  const existingCancelReason = toTrimmedText(existingRecord?.cancelReason ?? existingRawPayload?.cancelReason ?? existingRawPayload?.cancellationReason)
  const incomingCancelReason = toTrimmedText(incomingRecord?.cancelReason ?? incomingRawPayload?.cancelReason ?? incomingRawPayload?.cancellationReason)
  if (incomingCancelReason && existingCancelReason !== incomingCancelReason) return true

  return false
}

export function shouldSkipFinalizedOrderSync(existing: Partial<NormalizedOrder> | Record<string, unknown> | null | undefined, incoming: NormalizedOrder) {
  const existingRecord = getRecord(existing)
  const existingStatus = String(existingRecord?.status ?? '').trim().toLowerCase()
  const incomingStatus = String(incoming.orderStatus ?? '').trim().toLowerCase()
  const incomingRaw = getRecord(incoming.rawPayload)
  const allowBeCancelledCorrection = incoming.source === 'be'
    && existingStatus === 'completed'
    && incomingStatus === 'cancelled'
    && Boolean(incomingRaw && hasBeCancelSignal(incomingRaw))

  if (!FINALIZED_ORDER_STATUSES.has(existingStatus)) return false

  // Đơn đã được force-complete không được bị historical sync ghi đè thành cancelled.
  // completed có thể ghi đè cancelled (đơn bị hủy nhầm), nhưng không chiều ngược lại.
  if (existingStatus === 'completed' && incomingStatus === 'cancelled' && !allowBeCancelledCorrection) return true

  if (existingStatus !== incomingStatus) return false

  return !hasMeaningfulFinalizedOrderChange(existing, incoming)
}

function extractDeliveredDate(normalized: NormalizedOrder) {
  const rawPayload = normalized.rawPayload ?? {}
  const nestedTimes = extractNestedTimes(rawPayload)

  return (
    parseDateValue(normalized.deliveredAt) ??
    parseDateValue(rawPayload.deliveredAt) ??
    parseDateValue(rawPayload.delivered_at) ??
    parseDateValue(rawPayload.completedAt) ??
    parseDateValue(rawPayload.completed_at) ??
    parseDateValue(rawPayload.deliveryCompletedAt) ??
    parseDateValue(rawPayload.delivered_time) ??
    nestedTimes.deliveredAt ??
    nestedTimes.completedAt ??
    parseDateValue(rawPayload.updated_at) ??
    parseDateValue(rawPayload.updatedAt)
  )
}

export function resolveNormalizedOrderStatus(normalized: NormalizedOrder) {
  const rawPayload = normalized.rawPayload ?? {}
  const nestedTimes = extractNestedTimes(rawPayload)
  const pageStage = String(rawPayload._pageStage ?? '').trim().toLowerCase()
  const pageType = String(rawPayload._pageType ?? rawPayload.pageType ?? '').trim().toLowerCase()
  const scraperFinalizedStatus = getGrabScraperFinalizedStatusFromRaw(rawPayload)
  const isGrabHistoryBucket = normalized.source === 'grab' && (
    pageStage === 'history'
    || pageStage === 'completed'
    || pageType.includes('history')
    || pageType.includes('complet')
    || pageType.includes('past')
    || pageType.includes('deliver')
  )

  if (
    parseDateValue(rawPayload.cancelledAt)
    || parseDateValue(rawPayload.canceledAt)
    || parseDateValue(rawPayload.cancelled_at)
    || rawPayload.cancelCode
    || scraperFinalizedStatus === 'cancelled'
  ) {
    return 'cancelled' as const
  }

  if (scraperFinalizedStatus === 'completed') {
    return 'completed' as const
  }

  // Grab history/completed buckets represent finalized orders even when
  // the payload no longer carries a reliable active/completed status flag.
  if (isGrabHistoryBucket) {
    return 'completed' as const
  }

  if (hasGrabActiveStatusSignal(normalized) && normalized.orderStatus !== 'cancelled') {
    // Nếu order đang ở tab ACTIVE của Grab portal (preparing/ready/upcoming),
    // tin tuyệt đối vào page bucket — KHÔNG check completion timestamps.
    // Các field completedAt/deliveredAt có thể là zero-value hoặc stale từ Grab API
    // khiến đơn mới nhất bị mark nhầm là completed.
    const isActivePageBucket = pageStage === 'preparing' || pageStage === 'ready' || pageStage === 'upcoming'
      || pageType === 'preparingv2' || pageType === 'ready' || pageType === 'upcoming'

    if (!isActivePageBucket) {
      // Order có active signal nhưng không rõ bucket (có thể đang trong history).
      // Kiểm tra completion timestamps để xử lý trường hợp Grab giữ READY_FOR_PICKUP
      // nhưng đơn thực tế đã giao xong.
      const hasCompletionTimestamp = Boolean(
        parseDateValue(normalized.deliveredAt)
        || parseDateValue(rawPayload.deliveredAt)
        || parseDateValue(rawPayload.delivered_at)
        || parseDateValue(rawPayload.completedAt)
        || parseDateValue(rawPayload.completed_at)
        || parseDateValue(rawPayload.deliveryCompletedAt)
        || parseDateValue(rawPayload.delivered_time)
        || nestedTimes.deliveredAt
        || nestedTimes.completedAt
      )
      if (hasCompletionTimestamp) return 'completed'
      // Nếu page rõ ràng là history/completed bucket của Grab → hoàn thành dù không có timestamp
      // (Grab history tab = đơn đã giao xong; active signal chỉ là stale state từ API)
      const isHistoryBucket = pageStage === 'history' || pageStage === 'completed' || pageStage === 'cancelled'
        || pageType.includes('history') || pageType.includes('complet') || pageType.includes('past') || pageType.includes('deliver')
      if (isHistoryBucket) return 'completed'
    }
    return 'waiting_pickup'
  }

  if (
    parseDateValue(normalized.deliveredAt)
    || parseDateValue(rawPayload.deliveredAt)
    || parseDateValue(rawPayload.delivered_at)
    || parseDateValue(rawPayload.completedAt)
    || parseDateValue(rawPayload.completed_at)
    || parseDateValue(rawPayload.deliveryCompletedAt)
    || parseDateValue(rawPayload.delivered_time)
    || nestedTimes.deliveredAt
    || nestedTimes.completedAt
  ) {
    return 'completed' as const
  }

  return normalized.orderStatus
}

export function buildOrderUpsert(integration: IntegrationRef, normalized: NormalizedOrder) {
  const normalizedOrder = repairVietnameseTextDeep(normalized) as NormalizedOrder
  const resolvedOrderStatus = resolveNormalizedOrderStatus(normalizedOrder)
  const financialBreakdown = getFinancialBreakdown(normalizedOrder as unknown as Order)
  const recoveredDriverName = getDisplayDriverName(normalizedOrder as unknown as Order)
  const recoveredCustomerName = resolveOrderCustomerName(normalizedOrder as unknown as Order)
  const recoveredCustomerPhone = resolveOrderCustomerPhone(normalizedOrder as unknown as Order)
  const recoveredPlacedAt = resolveOrderPlacedAtValue(normalizedOrder as unknown as Order)
  const recoveredDeliveredAt = resolveOrderDeliveredAtValue(normalizedOrder as unknown as Order)
  const customerName = pickPreferredName(
    recoveredCustomerName || getDisplayCustomerName(normalizedOrder as unknown as Order) || normalizedOrder.customerName,
    undefined,
    CUSTOMER_NAME_PLACEHOLDERS,
    'Khách hàng'
  ) ?? 'Khách hàng'
  const customerPhone = pickPreferredPhone(recoveredCustomerPhone || getDisplayCustomerPhone(normalizedOrder as unknown as Order) || normalizedOrder.customerPhone, undefined)
  const driverPhone = pickPreferredPhone(getDisplayDriverPhone(normalizedOrder as unknown as Order) || normalizedOrder.driverInfo?.phone, undefined)
  const driverInfo = mergeDriverInfoPreservingDetail(undefined, {
    ...normalizedOrder.driverInfo,
    ...(recoveredDriverName ? { name: recoveredDriverName } : {}),
  })
  const discount = financialBreakdown
    ? Number(financialBreakdown.productDiscount ?? 0) + Number(financialBreakdown.orderDiscount ?? 0)
    : normalizedOrder.discount

  const baseSet: Record<string, unknown> = {
    status: resolvedOrderStatus,
    customerName,
    customerPhone,
    items: normalizedOrder.items,
    subtotal: financialBreakdown?.subtotal ?? normalizedOrder.subtotal,
    discount,
    total: financialBreakdown?.revenueAfterPromotion ?? normalizedOrder.total,
    platformFee: financialBreakdown?.platformFee ?? normalizedOrder.platformFee,
    paymentMethod: normalizedOrder.paymentMethod,
    deliveryInfo: normalizedOrder.deliveryInfo,
    driverInfo: driverInfo ? { ...driverInfo, ...(driverPhone ? { phone: driverPhone } : {}) } : driverPhone ? { phone: driverPhone } : undefined,
    rawPayload: normalizedOrder.rawPayload,
    source: normalizedOrder.source,
    externalOrderId: normalizedOrder.externalOrderId,
    externalStoreId: normalizedOrder.externalStoreId,
  }

  const unsetFields: Record<string, ''> = {}

  // Grab completed orders: store customerPaid + customerDeliveryFee from fare data
  if (resolvedOrderStatus === 'completed' && normalized.source === 'grab') {
    const grabFinancials = extractGrabCustomerFinancials(normalized.rawPayload as Record<string, unknown> | undefined)
    if (grabFinancials) {
      if (grabFinancials.customerPaid > 0) baseSet.customerPaid = grabFinancials.customerPaid
      if (grabFinancials.customerDeliveryFee > 0) baseSet.customerDeliveryFee = grabFinancials.customerDeliveryFee
    }
  }

  if (resolvedOrderStatus === 'completed') {
    // Ưu tiên timestamp thực từ payload; fallback về thời điểm hiện tại nếu Grab không trả về
    // (Grab history orders đôi khi không có deliveredAt nhưng cần có thời gian nhận hàng)
    baseSet.deliveredAt = recoveredDeliveredAt ?? extractDeliveredDate(normalized) ?? new Date()
    unsetFields.cancelledAt = ''
    unsetFields.cancelReason = ''
  } else if (resolvedOrderStatus === 'cancelled') {
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
      placedAt: parseDateValue(recoveredPlacedAt ?? normalizedOrder.placedAt) ?? new Date(),
      brandId: integration.brandId,
      hubId: integration.hubId,
    },
    $set: baseSet,
    ...(Object.keys(unsetFields).length ? { $unset: unsetFields } : {}),
  }
}
