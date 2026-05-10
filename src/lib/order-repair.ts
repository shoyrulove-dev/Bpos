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
        phone,
        platform: String(order.source),
        name,
        lastSeenAt: new Date(),
      },
      $inc: { visitCount: 1 },
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

    // Grab: if rawPayload shows DELIVERED/COMPLETED/BILL_PAID but DB status is still
    // waiting_confirm/waiting_pickup/delivering, repair the status.
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
  }

  return { scanned, updated }
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
          phone,
          platform: String(order.source),
          name,
          lastSeenAt: new Date(),
        },
        $inc: { visitCount: 1 },
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

    await CustomerModel.updateOne(
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
        ...(aggregate.sources.size ? { $addToSet: { sources: { $each: Array.from(aggregate.sources) } } } : {}),
        $setOnInsert: {
          phone: aggregate.phone,
          brandId,
          name: aggregate.name,
          points: Number(existingCustomer?.points ?? 0),
          totalSpend: nextTotalSpend,
          orderCount: nextOrderCount,
          tier: nextTier,
          status: 'active',
          ...(aggregate.source ? { source: aggregate.source } : {}),
          ...(aggregate.sources.size ? { sources: Array.from(aggregate.sources) } : {}),
        },
      },
      { upsert: true, setDefaultsOnInsert: true }
    )
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

  const historical = includeHistorical
    ? await upsertHistoricalOrders(days, providers, externalOrderIds)
    : {
        integrations: 0,
        fetched: 0,
        updated: 0,
        upserted: 0,
        failed: 0,
        skipped: true,
      }
  const orders = await repairStoredOrders(providers, { externalOrderIds, shortIds, driverPhone, forceCancelledOrderIds, forceCompletedShortIds })
  const customerBackfill = await backfillCustomersFromOrders({ providers, externalOrderIds, shortIds })
  const customerRepair = isScopedRepair ? null : await repairCustomers()
  const customers = customerRepair
    ? {
        scanned: customerRepair.scanned + customerBackfill.scanned,
        updated: customerRepair.updated + customerBackfill.updated,
        removed: customerRepair.removed,
      }
    : customerBackfill
  const drivers = isScopedRepair
    ? await backfillDriversFromOrders({ providers, externalOrderIds, shortIds, driverPhone })
    : await repairDrivers()

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
    orders,
    customers,
    drivers,
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