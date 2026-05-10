import { decryptJSON } from '@/lib/crypto'
import { hasBeCancelSignal } from '@/lib/be-order-status'
import { calcCustomerTier, upsertCustomerProfile } from '@/lib/customer-upsert'
import { getAdapter } from '@/integrations/registry'
import { buildOrderUpsert, hasMeaningfulCustomerName, hasMeaningfulDriverName, hasMeaningfulPhone, isDriverNamePlaceholder, mergeNormalizedOrderPreservingDetail } from '@/lib/order-upsert'
import { getDisplayCustomerName, getDisplayCustomerPhone, getDisplayDriverName, getDisplayDriverPhone, getFinancialBreakdown } from '@/lib/order-financials'
import { buildSessionStoreId } from '@/lib/realtime-order-sync'
import { normalizeCompactPhone } from '@/lib/phone'
import mongoose from 'mongoose'
import IntegrationModel from '@/models/Integration'
import OrderModel from '@/models/Order'
import CustomerModel from '@/models/Customer'
import DriverModel from '@/models/Driver'
import type { SessionData } from '@/integrations/types'
import type { NormalizedOrder, Order } from '@/types'

type StoredOrder = Order & {
  _id: string
  shortId?: string
  brandId?: string
  hubId?: string
  externalStoreId?: string
  driverInfo?: { name?: string; phone?: string; vehiclePlate?: string; status?: string }
  rawPayload?: Record<string, unknown>
  status: string
  cancelReason?: string
  cancelledAt?: string
  deliveredAt?: string
}

type StoredCustomer = {
  _id: string
  phone: string
  name: string
  brandId: string
  source?: string
  sources?: string[]
  points?: number
  totalSpend?: number
  orderCount?: number
  lastOrderAt?: Date | string
  updatedAt?: Date | string
  createdAt?: Date | string
}

type StoredDriver = {
  _id: string
  phone: string
  name: string
  platform: string
  visitCount?: number
  lastSeenAt?: Date | string
  updatedAt?: Date | string
  createdAt?: Date | string
}

function parseDateValue(value: unknown) {
  if (!value) return undefined
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date
}

function getRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function asObjectIdString(value: unknown) {
  return value ? String(value) : undefined
}

function sameNumber(left: unknown, right: unknown) {
  return Number(left ?? 0) === Number(right ?? 0)
}

function buildScopedOrderQuery(options: {
  providers: string[]
  externalOrderIds?: string[]
  shortIds?: string[]
}) {
  const query: Record<string, unknown> = { source: { $in: options.providers } }

  if (options.externalOrderIds?.length) {
    query.externalOrderId = { $in: options.externalOrderIds }
  }

  if (options.shortIds?.length) {
    query.shortId = { $in: options.shortIds }
  }

  return query
}

async function upsertCustomerFromOrder(order: StoredOrder) {
  const phone = getDisplayCustomerPhone(order as unknown as Order) || undefined
  const name = getDisplayCustomerName(order as unknown as Order) || undefined
  const rawBrandId = order.brandId

  if (!mongoose.isValidObjectId(rawBrandId) || !phone || !name || !hasMeaningfulPhone(phone) || !hasMeaningfulCustomerName(name)) {
    return false
  }

  const result = await upsertCustomerProfile({
    phone,
    name,
    brandId: rawBrandId,
    source: String(order.source ?? ''),
    placedAt: parseDateValue(order.placedAt) ?? new Date(),
    orderTotal: Number(order.total ?? 0),
    isNewOrder: false,
  })

  return result.ok
}

async function upsertDriverFromOrder(order: StoredOrder) {
  const phone = getDisplayDriverPhone(order as unknown as Order) || undefined
  if (!phone || !hasMeaningfulPhone(phone)) return false

  const displayName = getDisplayDriverName(order as unknown as Order) || undefined
  const name = displayName && hasMeaningfulDriverName(displayName)
    ? displayName
    : `(Tài xế ${String(order.source ?? '').trim() || 'platform'})`

  await DriverModel.updateOne(
    { phone, platform: String(order.source) },
    {
      $set: {
        name,
        lastSeenAt: new Date(),
      },
      $setOnInsert: {
        phone,
        platform: String(order.source),
        visitCount: 1,
      },
    },
    { upsert: true }
  )

  return true
}

async function upsertHistoricalOrders(days: number, providers: string[], targetExternalOrderIds?: string[]) {
  const integrations = await IntegrationModel.find({ isActive: true, provider: { $in: providers } })
    .select('+credentials +sessionData')
    .lean()

  const summary = {
    integrations: 0,
    fetched: 0,
    updated: 0,
    upserted: 0,
    failed: 0,
  }

  for (const raw of integrations) {
    const intg = raw as unknown as {
      _id: string
      provider: string
      brandId: string
      hubId?: string
      externalStoreId?: string
      credentials?: unknown
      loginMode?: 'api' | 'auto'
      sessionData?: string
    }

    const adapter = getAdapter(intg.provider)
    if (!adapter) continue

    try {
      let orders: NormalizedOrder[] = []

      if (intg.loginMode === 'auto') {
        if (!intg.sessionData || !adapter.fetchHistoricalOrdersWithSession) continue
        const session = decryptJSON<SessionData>(intg.sessionData)
        const storeId = buildSessionStoreId(intg.externalStoreId, session)
        const result = await adapter.fetchHistoricalOrdersWithSession(session, storeId, { days })
        if (result === null) throw new Error('session-history-null')
        orders = result
      } else {
        if (!adapter.fetchHistoricalOrders) continue
        const rawCreds = intg.credentials as unknown
        const credObj: Record<string, string> =
          rawCreds instanceof Map
            ? Object.fromEntries((rawCreds as Map<string, string>).entries())
            : typeof rawCreds === 'object' && rawCreds !== null
            ? (rawCreds as Record<string, string>)
            : {}

        orders = await adapter.fetchHistoricalOrders({
          ...credObj,
          storeId: credObj.storeId ?? intg.externalStoreId,
          shopId: credObj.shopId ?? intg.externalStoreId,
        }, { days })
      }

      if (targetExternalOrderIds?.length) {
        const orderIdSet = new Set(targetExternalOrderIds)
        orders = orders.filter((order) => orderIdSet.has(String(order.externalOrderId ?? '')))
      }

      if (!orders.length) {
        summary.integrations += 1
        continue
      }

      const externalOrderIds = orders
        .map((order) => order.externalOrderId)
        .filter((value): value is string => Boolean(value))

      const existingOrders = externalOrderIds.length
        ? await OrderModel.find({ source: intg.provider, externalOrderId: { $in: externalOrderIds } })
            .select('externalOrderId status customerName customerPhone items subtotal discount total platformFee paymentMethod deliveryInfo driverInfo rawPayload')
            .lean()
        : []

      const existingOrdersByExternalId = new Map(
        existingOrders.map((order) => [String(order.externalOrderId ?? ''), order])
      )

      for (const normalized of orders) {
        if (!normalized.externalOrderId) continue

        const mergedNormalized = mergeNormalizedOrderPreservingDetail(
          existingOrdersByExternalId.get(normalized.externalOrderId) as Partial<NormalizedOrder> | undefined,
          normalized
        )

        const existingDbStatus = (existingOrdersByExternalId.get(normalized.externalOrderId) as { status?: string } | undefined)?.status
        if (existingDbStatus === 'cancelled' && mergedNormalized.orderStatus === 'completed') {
          mergedNormalized.orderStatus = 'cancelled'
        }

        const result = await OrderModel.findOneAndUpdate(
          { source: mergedNormalized.source, externalOrderId: mergedNormalized.externalOrderId },
          buildOrderUpsert(intg, mergedNormalized),
          { upsert: true, new: true, includeResultMetadata: true }
        )

        if (result?.lastErrorObject?.updatedExisting === false) summary.upserted += 1
        else summary.updated += 1
      }

      summary.integrations += 1
      summary.fetched += orders.length
    } catch {
      summary.failed += 1
    }
  }

  return summary
}

async function resolveScopedExternalOrderIds(providers: string[], externalOrderIds?: string[], shortIds?: string[]) {
  const resolved = new Set((externalOrderIds ?? []).map((value) => value.trim()).filter(Boolean))

  if (!shortIds?.length) return Array.from(resolved)

  const scopedOrders = await OrderModel.find(buildScopedOrderQuery({ providers, shortIds }))
    .select('externalOrderId')
    .lean()

  for (const order of scopedOrders) {
    const externalOrderId = String(order.externalOrderId ?? '').trim()
    if (externalOrderId) resolved.add(externalOrderId)
  }

  return Array.from(resolved)
}

function hasGrabDetailedItems(rawPayload?: Record<string, unknown>) {
  const raw = getRecord(rawPayload)
  const itemInfo = getRecord(raw?.itemInfo)
  const rawItems = Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.orderItems)
    ? raw.orderItems
    : Array.isArray(raw?.lineItems)
    ? raw.lineItems
    : Array.isArray(itemInfo?.items)
    ? itemInfo.items
    : []

  return rawItems.length > 0
}

function hasBeDetailedItems(rawPayload?: Record<string, unknown>) {
  const raw = getRecord(rawPayload)
  return Boolean(Array.isArray(raw?.order_items) ? raw.order_items.length : Array.isArray(raw?.items) ? raw.items.length : 0)
}

function hasGrabPromotionDetail(rawPayload?: Record<string, unknown>) {
  const raw = getRecord(rawPayload)
  const itemInfo = getRecord(raw?.itemInfo)
  const voucherInfo = getRecord(raw?.voucherInfo)
  const rawItems = Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.orderItems)
    ? raw.orderItems
    : Array.isArray(raw?.lineItems)
    ? raw.lineItems
    : Array.isArray(itemInfo?.items)
    ? itemInfo.items
    : []

  return Boolean(
    (Array.isArray(raw?.orderLevelDiscounts) && raw.orderLevelDiscounts.length)
    || (Array.isArray(voucherInfo?.vouchers) && voucherInfo.vouchers.length)
    || (Array.isArray(voucherInfo?.discounts) && voucherInfo.discounts.length)
    || rawItems.some((item) => Array.isArray(getRecord(item)?.discountInfo) && (getRecord(item)?.discountInfo as unknown[]).length > 0)
  )
}

function hasBePromotionDetail(rawPayload?: Record<string, unknown>) {
  const raw = getRecord(rawPayload)
  const offers = getRecord(raw?.offers)
  const orderDiscount = getRecord(raw?.order_discount)

  return Boolean(
    (Array.isArray(offers?.food_discounts) && offers.food_discounts.length)
    || (Array.isArray(offers?.delivery_discounts) && offers.delivery_discounts.length)
    || orderDiscount
  )
}

function hasDeliveredAtSignal(rawPayload?: Record<string, unknown>) {
  const raw = getRecord(rawPayload)
  const times = getRecord(raw?.times)

  return Boolean(
    parseDateValue(raw?.deliveredAt)
    || parseDateValue(raw?.delivered_at)
    || parseDateValue(raw?.completedAt)
    || parseDateValue(raw?.completed_at)
    || parseDateValue(raw?.deliveryCompletedAt)
    || parseDateValue(raw?.delivered_time)
    || parseDateValue(raw?.finished_at)
    || parseDateValue(raw?.updatedAt)
    || parseDateValue(raw?.updated_at)
    || parseDateValue(times?.deliveredAt)
    || parseDateValue(times?.completedAt)
  )
}

function needsOrderDetailBackfill(order: StoredOrder) {
  if (!['grab', 'be'].includes(String(order.source ?? ''))) return false
  if (!order.externalOrderId) return false

  const rawPayload = getRecord(order.rawPayload)
  const missingDeliveredAt = order.status === 'completed' && !order.deliveredAt && !hasDeliveredAtSignal(rawPayload)
  const missingItemDetail = order.source === 'grab'
    ? !hasGrabDetailedItems(rawPayload)
    : !hasBeDetailedItems(rawPayload)
  const missingPromotionDetail = Number(order.discount ?? 0) > 0 && (
    order.source === 'grab'
      ? !hasGrabPromotionDetail(rawPayload)
      : !hasBePromotionDetail(rawPayload)
  )

  return missingDeliveredAt || missingItemDetail || missingPromotionDetail
}

function buildAdapterConfigFromIntegration(integration: {
  externalStoreId?: string
  credentials?: unknown
}) {
  const rawCreds = integration.credentials as unknown
  const credObj: Record<string, unknown> =
    rawCreds instanceof Map
      ? Object.fromEntries((rawCreds as Map<string, unknown>).entries())
      : typeof rawCreds === 'object' && rawCreds !== null
      ? rawCreds as Record<string, unknown>
      : {}

  return {
    ...credObj,
    storeId: credObj.storeId ?? credObj.merchantId ?? credObj.restaurantId ?? integration.externalStoreId,
    merchantId: credObj.merchantId ?? credObj.storeId ?? integration.externalStoreId,
    restaurantId: credObj.restaurantId ?? credObj.storeId ?? integration.externalStoreId,
  }
}

function pickIntegrationForOrder<T extends { provider: string; brandId?: unknown; hubId?: unknown; externalStoreId?: string }>(
  order: StoredOrder,
  integrations: T[]
) {
  const source = String(order.source ?? '')
  const orderBrandId = asObjectIdString(order.brandId)
  const orderHubId = asObjectIdString(order.hubId)
  const orderStoreId = String(order.externalStoreId ?? '').trim()

  const sameProvider = integrations.filter((integration) => integration.provider === source)
  if (!sameProvider.length) return undefined

  if (orderStoreId) {
    const exactStore = sameProvider.find((integration) => String(integration.externalStoreId ?? '').trim() === orderStoreId)
    if (exactStore) return exactStore
  }

  if (orderBrandId && orderHubId) {
    const brandHubMatch = sameProvider.find((integration) => asObjectIdString(integration.brandId) === orderBrandId && asObjectIdString(integration.hubId) === orderHubId)
    if (brandHubMatch) return brandHubMatch
  }

  if (orderBrandId) {
    const brandMatch = sameProvider.find((integration) => asObjectIdString(integration.brandId) === orderBrandId)
    if (brandMatch) return brandMatch
  }

  return sameProvider[0]
}

async function backfillOrderDetails(days: number, providers: string[], externalOrderIds?: string[], shortIds?: string[]) {
  const resolvedExternalOrderIds = await resolveScopedExternalOrderIds(providers, externalOrderIds, shortIds)
  const isScoped = Boolean(resolvedExternalOrderIds.length || shortIds?.length)
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const query: Record<string, unknown> = isScoped
    ? buildScopedOrderQuery({ providers, externalOrderIds: resolvedExternalOrderIds, shortIds })
    : {
        source: { $in: providers },
        placedAt: { $gte: cutoff },
      }

  const candidateDocs = await OrderModel.find(query)
    .select('shortId source externalOrderId externalStoreId brandId hubId items discount status deliveredAt deliveryInfo rawPayload')
    .lean()

  const candidates = candidateDocs
    .map((doc) => doc as unknown as StoredOrder)
    .filter((order) => isScoped || needsOrderDetailBackfill(order))

  if (!candidates.length) {
    return { scanned: candidateDocs.length, targeted: 0, refreshed: 0, failed: 0, skipped: 0 }
  }

  const integrations = await IntegrationModel.find({ isActive: true, provider: { $in: providers } })
    .select('+credentials brandId hubId provider externalStoreId loginMode')
    .lean()

  let refreshed = 0
  let failed = 0
  let skipped = 0

  for (const order of candidates) {
    const integration = pickIntegrationForOrder(order, integrations as Array<{ provider: string; brandId?: unknown; hubId?: unknown; externalStoreId?: string; loginMode?: string; credentials?: unknown }>)
    if (!integration) {
      skipped += 1
      continue
    }

    if (integration.loginMode === 'auto') {
      skipped += 1
      continue
    }

    const adapter = getAdapter(String(integration.provider ?? ''))
    if (!adapter?.fetchOrderDetail || !order.externalOrderId) {
      skipped += 1
      continue
    }

    try {
      const normalized = await adapter.fetchOrderDetail(String(order.externalOrderId), buildAdapterConfigFromIntegration(integration))
      if (!normalized?.externalOrderId) {
        skipped += 1
        continue
      }

      const mergedNormalized = mergeNormalizedOrderPreservingDetail(order as unknown as Partial<NormalizedOrder>, normalized)

      await OrderModel.findOneAndUpdate(
        { source: mergedNormalized.source, externalOrderId: mergedNormalized.externalOrderId },
        buildOrderUpsert({ brandId: String(order.brandId ?? integration.brandId ?? ''), hubId: order.hubId ? String(order.hubId) : integration.hubId ? String(integration.hubId) : undefined }, mergedNormalized),
        { upsert: false }
      )
      refreshed += 1
    } catch {
      failed += 1
    }
  }

  return {
    scanned: candidateDocs.length,
    targeted: candidates.length,
    refreshed,
    failed,
    skipped,
  }
}

async function repairStoredOrders(
  providers: string[],
  options?: {
    externalOrderIds?: string[]
    shortIds?: string[]
    driverPhone?: string
    forceCancelledOrderIds?: string[]
    forceCompletedShortIds?: string[]
  }
) {
  let scanned = 0
  let updated = 0
  let failed = 0

  const orderIdSet = options?.externalOrderIds?.length ? new Set(options.externalOrderIds) : null
  const shortIdSet = options?.shortIds?.length ? new Set(options.shortIds) : null
  const driverPhone = normalizeCompactPhone(options?.driverPhone)
  const forceCancelledOrderIdSet = options?.forceCancelledOrderIds?.length ? new Set(options.forceCancelledOrderIds) : null
  const forceCompletedShortIdSet = options?.forceCompletedShortIds?.length ? new Set(options.forceCompletedShortIds) : null

  const cursor = OrderModel.find(buildScopedOrderQuery({ providers, externalOrderIds: options?.externalOrderIds, shortIds: options?.shortIds }))
    .select('shortId source externalOrderId brandId customerName customerPhone driverInfo subtotal discount total platformFee status cancelReason placedAt cancelledAt deliveredAt updatedAt rawPayload')
    .lean()
    .cursor()

  for await (const rawOrder of cursor) {
    const order = rawOrder as unknown as StoredOrder
    if (orderIdSet && !orderIdSet.has(String(order.externalOrderId ?? ''))) continue
    if (shortIdSet && !shortIdSet.has(String(order.shortId ?? ''))) continue
    if (driverPhone && getDisplayDriverPhone(order as unknown as Order) !== driverPhone) continue
    scanned += 1

    try {
      await upsertCustomerFromOrder(order)
      await upsertDriverFromOrder(order)

      const nextCustomerName = getDisplayCustomerName(order as unknown as Order) || undefined
      const nextCustomerPhone = getDisplayCustomerPhone(order as unknown as Order) || undefined
      const nextDriverName = getDisplayDriverName(order as unknown as Order) || undefined
      const nextDriverPhone = getDisplayDriverPhone(order as unknown as Order) || undefined
      const financialBreakdown = getFinancialBreakdown(order as unknown as Order)

      const set: Record<string, unknown> = {}
      const unset: Record<string, ''> = {}

      if (nextCustomerName && !hasMeaningfulCustomerName(order.customerName)) {
        set.customerName = nextCustomerName
      }

      if (nextCustomerPhone && !hasMeaningfulPhone(order.customerPhone)) {
        set.customerPhone = nextCustomerPhone
      }

      const currentDriverInfo = order.driverInfo ?? {}
      const nextDriverInfo = {
        ...currentDriverInfo,
        ...(nextDriverName && !hasMeaningfulDriverName(currentDriverInfo.name) ? { name: nextDriverName } : {}),
        ...(nextDriverPhone && !hasMeaningfulPhone(currentDriverInfo.phone) ? { phone: nextDriverPhone } : {}),
      }
      if (Object.keys(nextDriverInfo).some((key) => nextDriverInfo[key as keyof typeof nextDriverInfo] !== currentDriverInfo[key as keyof typeof currentDriverInfo])) {
        set.driverInfo = {
          ...nextDriverInfo,
        }
      }

      if (financialBreakdown) {
        const nextDiscount = Number(financialBreakdown.productDiscount ?? 0) + Number(financialBreakdown.orderDiscount ?? 0)

        if (!sameNumber(order.subtotal, financialBreakdown.subtotal)) set.subtotal = Number(financialBreakdown.subtotal ?? 0)
        if (!sameNumber(order.discount, nextDiscount)) set.discount = nextDiscount
        if (!sameNumber(order.total, financialBreakdown.revenueAfterPromotion)) set.total = Number(financialBreakdown.revenueAfterPromotion ?? 0)
        if (!sameNumber(order.platformFee, financialBreakdown.platformFee)) set.platformFee = Number(financialBreakdown.platformFee ?? 0)
      }

      if (order.source === 'be' && order.rawPayload && hasBeCancelSignal(order.rawPayload) && order.status !== 'cancelled') {
        set.status = 'cancelled'
        set.cancelReason = String(
          order.rawPayload.cancel_reason
          ?? order.rawPayload.status_reason
          ?? order.rawPayload.driver_cancel_reason
          ?? order.rawPayload.restaurant_cancel_reason
          ?? order.rawPayload.customer_cancel_reason
          ?? order.rawPayload.cancel_note
          ?? order.cancelReason
          ?? 'Đơn đã hủy'
        )
        set.cancelledAt = parseDateValue(
          order.rawPayload.cancelled_at
          ?? order.rawPayload.cancel_time
          ?? order.rawPayload.cancel_date
          ?? order.cancelledAt
          ?? order.rawPayload.updatedAt
        ) ?? new Date()
        unset.deliveredAt = ''
      }

      if (order.source === 'grab' && order.rawPayload && ['waiting_confirm', 'waiting_pickup', 'delivering'].includes(order.status)) {
        const rawGrabStatus = String(
          order.rawPayload.deliveryStatus
          ?? order.rawPayload.orderState
          ?? order.rawPayload.status
          ?? order.rawPayload.orderStatus
          ?? order.rawPayload.state
          ?? ''
        ).toUpperCase()
        const GRAB_COMPLETED = new Set(['DELIVERED', 'COMPLETED', 'BILL_PAID'])
        const GRAB_CANCELLED = new Set(['CANCELLED', 'CANCELLED_MAX', 'CANCELLED_BY_MERCHANT', 'CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_DRIVER', 'FAILED', 'REFUNDED'])
        if (GRAB_COMPLETED.has(rawGrabStatus)) {
          set.status = 'completed'
          set.deliveredAt = parseDateValue(
            order.rawPayload.deliveredAt
            ?? order.rawPayload.completedAt
            ?? order.rawPayload.updatedAt
            ?? order.deliveredAt
          ) ?? new Date()
          unset.cancelledAt = ''
          unset.cancelReason = ''
        } else if (GRAB_CANCELLED.has(rawGrabStatus) && order.status !== 'cancelled') {
          set.status = 'cancelled'
          set.cancelReason = String(order.rawPayload.cancelReason ?? order.rawPayload.cancel_reason ?? order.cancelReason ?? 'Đơn đã hủy')
          set.cancelledAt = parseDateValue(
            order.rawPayload.cancelledAt
            ?? order.rawPayload.cancel_time
            ?? order.rawPayload.updatedAt
            ?? order.cancelledAt
          ) ?? new Date()
          unset.deliveredAt = ''
        }
      }

      if (forceCancelledOrderIdSet?.has(String(order.externalOrderId ?? '')) && order.status !== 'cancelled') {
        set.status = 'cancelled'
        set.cancelReason = String(order.cancelReason ?? order.rawPayload?.cancel_reason ?? order.rawPayload?.status_reason ?? 'BE xác nhận đơn đã hủy')
        set.cancelledAt = parseDateValue(
          order.rawPayload?.cancelled_at
          ?? order.rawPayload?.cancel_time
          ?? order.rawPayload?.cancel_date
          ?? order.cancelledAt
          ?? order.rawPayload?.updatedAt
          ?? order.updatedAt
        ) ?? new Date()
        unset.deliveredAt = ''
      }

      if (forceCompletedShortIdSet?.has(String(order.shortId ?? '')) && order.status !== 'completed') {
        set.status = 'completed'
        set.deliveredAt = parseDateValue(
          order.rawPayload?.deliveredAt
          ?? order.rawPayload?.completedAt
          ?? order.rawPayload?.updatedAt
          ?? order.updatedAt
        ) ?? new Date()
        unset.cancelledAt = ''
        unset.cancelReason = ''
      }

      if (!Object.keys(set).length && !Object.keys(unset).length) continue

      await OrderModel.updateOne(
        { _id: order._id },
        {
          ...(Object.keys(set).length ? { $set: set } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        }
      )
      updated += 1
    } catch {
      failed += 1
    }
  }

  return { scanned, updated, failed }
}

async function backfillDriversFromOrders(options?: {
  providers?: string[]
  externalOrderIds?: string[]
  shortIds?: string[]
  driverPhone?: string
}) {
  const providers = (options?.providers?.length ? options.providers : ['be', 'grab']).map((value) => value.trim()).filter(Boolean)
  const orderIdSet = options?.externalOrderIds?.length ? new Set(options.externalOrderIds) : null
  const shortIdSet = options?.shortIds?.length ? new Set(options.shortIds) : null
  const targetPhone = normalizeCompactPhone(options?.driverPhone)
  let scanned = 0
  let updated = 0

  const cursor = OrderModel.find(buildScopedOrderQuery({ providers, externalOrderIds: options?.externalOrderIds, shortIds: options?.shortIds }))
    .select('shortId source externalOrderId driverInfo rawPayload')
    .lean()
    .cursor()

  for await (const rawOrder of cursor) {
    const order = rawOrder as unknown as StoredOrder
    if (orderIdSet && !orderIdSet.has(String(order.externalOrderId ?? ''))) continue
    if (shortIdSet && !shortIdSet.has(String(order.shortId ?? ''))) continue

    const phone = getDisplayDriverPhone(order as unknown as Order) || undefined
    if (!phone || !hasMeaningfulPhone(phone)) continue
    if (targetPhone && phone !== targetPhone) continue

    scanned += 1
    const displayName = getDisplayDriverName(order as unknown as Order) || undefined
    const name = displayName && hasMeaningfulDriverName(displayName)
      ? displayName
      : `(Tài xế ${String(order.source ?? '').trim() || 'platform'})`

    await DriverModel.updateOne(
      { phone, platform: String(order.source) },
      {
        $set: {
          name,
          lastSeenAt: new Date(),
        },
        $setOnInsert: {
          phone,
          platform: String(order.source),
          visitCount: 1,
        },
      },
      { upsert: true }
    )
    updated += 1
  }

  return { scanned, updated, removed: 0, scoped: true }
}

async function backfillCustomersFromOrders(options?: {
  providers?: string[]
  externalOrderIds?: string[]
  shortIds?: string[]
}) {
  const providers = (options?.providers?.length ? options.providers : ['be', 'grab']).map((value) => value.trim()).filter(Boolean)
  const orderIdSet = options?.externalOrderIds?.length ? new Set(options.externalOrderIds) : null
  const shortIdSet = options?.shortIds?.length ? new Set(options.shortIds) : null
  let scanned = 0
  let updated = 0

  type CustomerAggregate = {
    phone: string
    brandId: string
    name: string
    totalSpend: number
    orderCount: number
    lastOrderAt?: Date
    source?: string
    sources: Set<string>
  }

  const aggregates = new Map<string, CustomerAggregate>()

  const cursor = OrderModel.find(buildScopedOrderQuery({ providers, externalOrderIds: options?.externalOrderIds, shortIds: options?.shortIds }))
    .select('shortId source externalOrderId brandId customerName customerPhone total placedAt rawPayload')
    .lean()
    .cursor()

  for await (const rawOrder of cursor) {
    const order = rawOrder as unknown as StoredOrder
    if (orderIdSet && !orderIdSet.has(String(order.externalOrderId ?? ''))) continue
    if (shortIdSet && !shortIdSet.has(String(order.shortId ?? ''))) continue

    const phone = getDisplayCustomerPhone(order as unknown as Order) || undefined
    const name = getDisplayCustomerName(order as unknown as Order) || undefined
    const brandId = String(order.brandId ?? '').trim()
    if (!brandId || !phone || !name || !hasMeaningfulPhone(phone) || !hasMeaningfulCustomerName(name)) continue

    scanned += 1
    const key = `${brandId}:${phone}`
    const placedAt = parseDateValue(order.placedAt)
    const source = String(order.source ?? '').trim()
    const aggregate = aggregates.get(key)

    if (aggregate) {
      aggregate.totalSpend += Number(order.total ?? 0)
      aggregate.orderCount += 1
      if ((!aggregate.name || !hasMeaningfulCustomerName(aggregate.name)) && hasMeaningfulCustomerName(name)) {
        aggregate.name = name
      }
      if (placedAt && (!aggregate.lastOrderAt || placedAt > aggregate.lastOrderAt)) {
        aggregate.lastOrderAt = placedAt
      }
      if (source) {
        aggregate.source = source
        aggregate.sources.add(source)
      }
      continue
    }

    aggregates.set(key, {
      phone,
      brandId,
      name,
      totalSpend: Number(order.total ?? 0),
      orderCount: 1,
      lastOrderAt: placedAt,
      source: source || undefined,
      sources: new Set(source ? [source] : []),
    })
  }

  for (const aggregate of Array.from(aggregates.values())) {
    const brandId = new mongoose.Types.ObjectId(aggregate.brandId)
    const existingCustomer = await CustomerModel.findOne({ phone: aggregate.phone, brandId })
      .select('name points totalSpend orderCount')
      .lean() as { name?: string; points?: number; totalSpend?: number; orderCount?: number } | null
    const shouldUpdateName = !existingCustomer || !hasMeaningfulCustomerName(existingCustomer.name)
    const nextTotalSpend = Math.max(Number(existingCustomer?.totalSpend ?? 0), aggregate.totalSpend)
    const nextOrderCount = Math.max(Number(existingCustomer?.orderCount ?? 0), aggregate.orderCount)
    const nextTier = calcCustomerTier(nextTotalSpend)

    const updateResult = await CustomerModel.updateOne(
      { phone: aggregate.phone, brandId },
      {
        $set: {
          ...(shouldUpdateName ? { name: aggregate.name } : {}),
          ...(aggregate.lastOrderAt ? { lastOrderAt: aggregate.lastOrderAt } : {}),
          ...(aggregate.source ? { source: aggregate.source } : {}),
          totalSpend: nextTotalSpend,
          orderCount: nextOrderCount,
          tier: nextTier,
          status: 'active',
        },
        $setOnInsert: {
          phone: aggregate.phone,
          brandId,
          points: Number(existingCustomer?.points ?? 0),
        },
      },
      { upsert: true }
    )

    if (updateResult.acknowledged && aggregate.sources.size) {
      await CustomerModel.updateOne(
        { phone: aggregate.phone, brandId },
        { $addToSet: { sources: { $each: Array.from(aggregate.sources) } } }
      ).catch(() => {})
    }
    updated += 1
  }

  return { scanned, updated, removed: 0, scoped: true }
}

async function repairCustomers() {
  const docs = await CustomerModel.find({}).lean() as unknown as StoredCustomer[]
  const grouped = new Map<string, StoredCustomer[]>()
  const invalidIds: string[] = []

  for (const doc of docs) {
    const normalizedPhone = normalizeCompactPhone(doc.phone)
    if (!normalizedPhone || !hasMeaningfulPhone(normalizedPhone) || !hasMeaningfulCustomerName(doc.name)) {
      invalidIds.push(String(doc._id))
      continue
    }
    const key = `${String(doc.brandId)}:${normalizedPhone}`
    const list = grouped.get(key) ?? []
    list.push(doc)
    grouped.set(key, list)
  }

  let updated = 0
  let removed = 0

  if (invalidIds.length) {
    await CustomerModel.deleteMany({ _id: { $in: invalidIds } })
    removed += invalidIds.length
  }

  for (const [key, group] of Array.from(grouped.entries())) {
    const [brandId, normalizedPhone] = key.split(':')
    const primary = group.find((item: StoredCustomer) => item.phone === normalizedPhone && hasMeaningfulCustomerName(item.name))
      ?? group.find((item: StoredCustomer) => hasMeaningfulCustomerName(item.name))
      ?? group[0]
    const duplicates = group.filter((item: StoredCustomer) => String(item._id) !== String(primary._id))
    const totalSpend = group.reduce((sum: number, item: StoredCustomer) => sum + Number(item.totalSpend ?? 0), 0)
    const orderCount = group.reduce((sum: number, item: StoredCustomer) => sum + Number(item.orderCount ?? 0), 0)
    const points = group.reduce((sum: number, item: StoredCustomer) => sum + Number(item.points ?? 0), 0)
    const lastOrderAt = group.reduce((latest: Date | undefined, item: StoredCustomer) => {
      const current = parseDateValue(item.lastOrderAt)
      if (!current) return latest
      if (!latest || current > latest) return current
      return latest
    }, undefined)

    if (duplicates.length) {
      await CustomerModel.deleteMany({ _id: { $in: duplicates.map((item: StoredCustomer) => item._id) } })
      removed += duplicates.length
    }

    await CustomerModel.updateOne(
      { _id: primary._id },
      {
        $set: {
          phone: normalizedPhone,
          brandId,
          name: primary.name,
          ...(primary.source ? { source: primary.source } : {}),
          ...(primary.sources?.length ? { sources: primary.sources } : {}),
          totalSpend,
          orderCount,
          points,
          tier: calcCustomerTier(totalSpend),
          ...(lastOrderAt ? { lastOrderAt } : {}),
        },
      }
    )
    updated += 1
  }

  return { scanned: docs.length, updated, removed }
}

async function repairDrivers() {
  const docs = await DriverModel.find({}).lean() as unknown as StoredDriver[]
  const grouped = new Map<string, StoredDriver[]>()
  const invalidIds: string[] = []

  for (const doc of docs) {
    const normalizedPhone = normalizeCompactPhone(doc.phone)
    if (!normalizedPhone || !hasMeaningfulPhone(normalizedPhone)) {
      invalidIds.push(String(doc._id))
      continue
    }
    // Keep placeholder-named drivers in the grouped map — they'll be merged below
    // (real name wins over placeholder when both exist for same phone)
    if (!hasMeaningfulDriverName(doc.name) && !isDriverNamePlaceholder(doc.name)) {
      invalidIds.push(String(doc._id))
      continue
    }
    const key = `${String(doc.platform)}:${normalizedPhone}`
    const list = grouped.get(key) ?? []
    list.push(doc)
    grouped.set(key, list)
  }

  let updated = 0
  let removed = 0

  if (invalidIds.length) {
    await DriverModel.deleteMany({ _id: { $in: invalidIds } })
    removed += invalidIds.length
  }

  const orderCursor = OrderModel.find({ source: { $in: ['grab', 'be', 'shopee', 'xanh_sm'] } })
    .select('source driverInfo rawPayload')
    .lean()
    .cursor()

  for await (const rawOrder of orderCursor) {
    const order = rawOrder as unknown as StoredOrder
    const phone = getDisplayDriverPhone(order as unknown as Order) || undefined
    if (!phone || !hasMeaningfulPhone(phone)) continue

    const displayName = getDisplayDriverName(order as unknown as Order) || undefined
    const fallbackName = displayName && hasMeaningfulDriverName(displayName)
      ? displayName
      : `(Tài xế ${String(order.source ?? '').trim() || 'platform'})`

    const key = `${String(order.source)}:${phone}`
    const synthetic: StoredDriver = {
      _id: `order:${key}`,
      phone,
      name: fallbackName,
      platform: String(order.source),
      visitCount: 1,
      lastSeenAt: new Date(),
    }
    const list = grouped.get(key) ?? []
    list.push(synthetic)
    grouped.set(key, list)
  }

  for (const [key, group] of Array.from(grouped.entries())) {
    const [platform, normalizedPhone] = key.split(':')
    const primary = group.find((item: StoredDriver) => item.phone === normalizedPhone && hasMeaningfulDriverName(item.name) && !isDriverNamePlaceholder(item.name))
      ?? group.find((item: StoredDriver) => hasMeaningfulDriverName(item.name) && !isDriverNamePlaceholder(item.name))
      ?? group.find((item: StoredDriver) => isDriverNamePlaceholder(item.name))
      ?? group[0]
    const duplicates = group.filter((item: StoredDriver) => String(item._id) !== String(primary._id))
    const visitCount = group.reduce((sum: number, item: StoredDriver) => sum + Number(item.visitCount ?? 0), 0)
    const lastSeenAt = group.reduce((latest: Date | undefined, item: StoredDriver) => {
      const current = parseDateValue(item.lastSeenAt)
      if (!current) return latest
      if (!latest || current > latest) return current
      return latest
    }, undefined)

    if (duplicates.length) {
      await DriverModel.deleteMany({ _id: { $in: duplicates.map((item: StoredDriver) => item._id) } })
      removed += duplicates.length
    }

    if (String(primary._id).startsWith('order:')) {
      await DriverModel.updateOne(
        { phone: normalizedPhone, platform },
        {
          $set: {
            phone: normalizedPhone,
            platform,
            name: primary.name,
            ...(lastSeenAt ? { lastSeenAt } : {}),
          },
          $inc: { visitCount },
        },
        { upsert: true }
      )
    } else {
      await DriverModel.updateOne(
        { _id: primary._id },
        {
          $set: {
            phone: normalizedPhone,
            platform,
            name: primary.name,
            visitCount,
            ...(lastSeenAt ? { lastSeenAt } : {}),
          },
        }
      )
    }
    updated += 1
  }

  return { scanned: docs.length, updated, removed }
}

export async function runOrderRepair(options?: {
  days?: number
  providers?: string[]
  includeHistorical?: boolean
  externalOrderIds?: string[]
  shortIds?: string[]
  driverPhone?: string
  forceCancelledOrderIds?: string[]
  forceCompletedShortIds?: string[]
}) {
  const providers = (options?.providers?.length ? options.providers : ['be', 'grab']).map((value) => value.trim()).filter(Boolean)
  const days = Math.max(1, Math.min(90, Number(options?.days ?? 30) || 30))
  const includeHistorical = options?.includeHistorical !== false
  const externalOrderIds = (options?.externalOrderIds ?? []).map((value) => value.trim()).filter(Boolean)
  const shortIds = (options?.shortIds ?? []).map((value) => value.trim()).filter(Boolean)
  const driverPhone = normalizeCompactPhone(options?.driverPhone)
  const forceCancelledOrderIds = (options?.forceCancelledOrderIds ?? []).map((value) => value.trim()).filter(Boolean)
  const forceCompletedShortIds = (options?.forceCompletedShortIds ?? []).map((value) => value.trim()).filter(Boolean)
  const isScopedRepair = Boolean(externalOrderIds.length || shortIds.length || driverPhone)
  const scopedExternalOrderIds = await resolveScopedExternalOrderIds(providers, externalOrderIds, shortIds)

  const historical = includeHistorical
    ? await upsertHistoricalOrders(days, providers, scopedExternalOrderIds.length ? scopedExternalOrderIds : undefined)
    : {
        integrations: 0,
        fetched: 0,
        updated: 0,
        upserted: 0,
        failed: 0,
        skipped: true,
      }
  const detailBackfill = await backfillOrderDetails(days, providers, scopedExternalOrderIds, shortIds)
  const orders = await repairStoredOrders(providers, { externalOrderIds, shortIds, driverPhone, forceCancelledOrderIds, forceCompletedShortIds })
  const customerBackfill = await backfillCustomersFromOrders({ providers, externalOrderIds, shortIds })
  let customerRepair: Awaited<ReturnType<typeof repairCustomers>> | null = null
  let customerRepairError: string | null = null
  if (!isScopedRepair) {
    try {
      customerRepair = await repairCustomers()
    } catch (error) {
      customerRepairError = error instanceof Error ? error.message : String(error)
    }
  }
  const customers = customerRepair
    ? {
        scanned: customerRepair.scanned + customerBackfill.scanned,
        updated: customerRepair.updated + customerBackfill.updated,
        removed: customerRepair.removed,
      }
    : customerBackfill
  let drivers: Awaited<ReturnType<typeof repairDrivers>> | Awaited<ReturnType<typeof backfillDriversFromOrders>>
  let driverRepairError: string | null = null
  try {
    drivers = isScopedRepair
      ? await backfillDriversFromOrders({ providers, externalOrderIds, shortIds, driverPhone })
      : await repairDrivers()
  } catch (error) {
    driverRepairError = error instanceof Error ? error.message : String(error)
    drivers = isScopedRepair
      ? { scanned: 0, updated: 0 }
      : { scanned: 0, updated: 0, removed: 0 }
  }

  return {
    ok: true,
    providers,
    days,
    includeHistorical,
    externalOrderIds,
    shortIds,
    driverPhone,
    forceCancelledOrderIds,
    forceCompletedShortIds,
    historical,
    detailBackfill,
    orders,
    customers,
    drivers,
    errors: {
      ...(customerRepairError ? { customers: customerRepairError } : {}),
      ...(driverRepairError ? { drivers: driverRepairError } : {}),
    },
  }
}

export async function getOrderRepairReport(options?: { providers?: string[]; limit?: number; externalOrderIds?: string[]; shortIds?: string[]; driverPhone?: string }) {
  const providers = (options?.providers?.length ? options.providers : ['be', 'grab']).map((value) => value.trim()).filter(Boolean)
  const limit = Math.max(1, Math.min(100, Number(options?.limit ?? 20) || 20))
  const orderIdSet = options?.externalOrderIds?.length ? new Set(options.externalOrderIds.map((value) => value.trim()).filter(Boolean)) : null
  const shortIdSet = options?.shortIds?.length ? new Set(options.shortIds.map((value) => value.trim()).filter(Boolean)) : null
  const driverPhone = normalizeCompactPhone(options?.driverPhone)
  const samples: Array<Record<string, unknown>> = []
  let scanned = 0
  let changed = 0

  const cursor = OrderModel.find(buildScopedOrderQuery({ providers, externalOrderIds: options?.externalOrderIds, shortIds: options?.shortIds }))
    .select('shortId source externalOrderId customerPhone driverInfo subtotal discount total platformFee status cancelReason cancelledAt deliveredAt rawPayload')
    .lean()
    .cursor()

  for await (const rawOrder of cursor) {
    const order = rawOrder as unknown as StoredOrder
    if (orderIdSet && !orderIdSet.has(String(order.externalOrderId ?? ''))) continue
    if (shortIdSet && !shortIdSet.has(String(order.shortId ?? ''))) continue
    if (driverPhone && getDisplayDriverPhone(order as unknown as Order) !== driverPhone) continue
    scanned += 1

    const nextCustomerPhone = getDisplayCustomerPhone(order as unknown as Order) || undefined
    const nextDriverPhone = getDisplayDriverPhone(order as unknown as Order) || undefined
    const financialBreakdown = getFinancialBreakdown(order as unknown as Order)
    const nextDiscount = financialBreakdown
      ? Number(financialBreakdown.productDiscount ?? 0) + Number(financialBreakdown.orderDiscount ?? 0)
      : undefined

    const issues: string[] = []
    if (nextCustomerPhone && nextCustomerPhone !== order.customerPhone) issues.push('customerPhone')
    if (nextDriverPhone && nextDriverPhone !== order.driverInfo?.phone) issues.push('driverPhone')
    if (financialBreakdown && !sameNumber(order.subtotal, financialBreakdown.subtotal)) issues.push('subtotal')
    if (typeof nextDiscount === 'number' && !sameNumber(order.discount, nextDiscount)) issues.push('discount')
    if (financialBreakdown && !sameNumber(order.total, financialBreakdown.revenueAfterPromotion)) issues.push('total')
    if (financialBreakdown && !sameNumber(order.platformFee, financialBreakdown.platformFee)) issues.push('platformFee')
    if (order.source === 'be' && order.rawPayload && hasBeCancelSignal(order.rawPayload) && order.status !== 'cancelled') issues.push('status')

    if (!issues.length) continue
    changed += 1

    if (samples.length < limit) {
      samples.push({
        shortId: order.shortId,
        source: order.source,
        externalOrderId: order.externalOrderId,
        current: {
          status: order.status,
          customerPhone: order.customerPhone,
          driverPhone: order.driverInfo?.phone,
          subtotal: order.subtotal,
          discount: order.discount,
          total: order.total,
          platformFee: order.platformFee,
        },
        next: {
          status: order.source === 'be' && order.rawPayload && hasBeCancelSignal(order.rawPayload) ? 'cancelled' : order.status,
          customerPhone: nextCustomerPhone,
          driverPhone: nextDriverPhone,
          subtotal: financialBreakdown?.subtotal,
          discount: nextDiscount,
          total: financialBreakdown?.revenueAfterPromotion,
          platformFee: financialBreakdown?.platformFee,
        },
        issues,
      })
    }
  }

  return {
    ok: true,
    providers,
    scanned,
    changed,
    samples,
  }
}