import { decryptJSON } from '@/lib/crypto'
import { getAdapter } from '@/integrations/registry'
import { buildOrderUpsert, mergeNormalizedOrderPreservingDetail } from '@/lib/order-upsert'
import { getDisplayCustomerPhone, getDisplayDriverPhone, getFinancialBreakdown } from '@/lib/order-financials'
import { buildSessionStoreId } from '@/lib/realtime-order-sync'
import { normalizeCompactPhone } from '@/lib/phone'
import IntegrationModel from '@/models/Integration'
import OrderModel from '@/models/Order'
import CustomerModel from '@/models/Customer'
import DriverModel from '@/models/Driver'
import type { SessionData } from '@/integrations/types'
import type { NormalizedOrder, Order } from '@/types'

type StoredOrder = Order & {
  _id: string
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

function calcCustomerTier(totalSpend: number): 'bronze' | 'silver' | 'gold' | 'platinum' {
  if (totalSpend >= 20_000_000) return 'platinum'
  if (totalSpend >= 5_000_000) return 'gold'
  if (totalSpend >= 1_000_000) return 'silver'
  return 'bronze'
}

function hasBeCancelSignal(raw: Record<string, unknown>) {
  return Boolean(
    raw.cancel_reason ||
    raw.cancel_time ||
    raw.cancelled_at ||
    raw.cancel_date ||
    raw.cancel_code ||
    raw.cancel_status ||
    raw.cancel_by ||
    raw.cancel_note ||
    raw.order_cancel_reason_id ||
    raw.driver_cancel_reason ||
    raw.restaurant_cancel_reason ||
    raw.customer_cancel_reason ||
    raw.is_cancelled === true ||
    raw.is_cancel === true ||
    raw.cancelled === true ||
    (typeof raw.status_reason === 'string' && raw.status_reason.toLowerCase().includes('cancel'))
  )
}

function parseDateValue(value: unknown) {
  if (!value) return undefined
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date
}

function sameNumber(left: unknown, right: unknown) {
  return Number(left ?? 0) === Number(right ?? 0)
}

async function upsertHistoricalOrders(days: number, providers: string[]) {
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

async function repairStoredOrders(providers: string[]) {
  let scanned = 0
  let updated = 0

  const cursor = OrderModel.find({ source: { $in: providers } })
    .select('source customerPhone driverInfo subtotal discount total platformFee status cancelReason cancelledAt deliveredAt rawPayload')
    .lean()
    .cursor()

  for await (const rawOrder of cursor) {
    const order = rawOrder as unknown as StoredOrder
    scanned += 1

    const nextCustomerPhone = getDisplayCustomerPhone(order as unknown as Order) || undefined
    const nextDriverPhone = getDisplayDriverPhone(order as unknown as Order) || undefined
    const financialBreakdown = getFinancialBreakdown(order as unknown as Order)

    const set: Record<string, unknown> = {}
    const unset: Record<string, ''> = {}

    if (nextCustomerPhone && nextCustomerPhone !== order.customerPhone) {
      set.customerPhone = nextCustomerPhone
    }

    const currentDriverPhone = order.driverInfo?.phone
    if (nextDriverPhone && nextDriverPhone !== currentDriverPhone) {
      set.driverInfo = {
        ...(order.driverInfo ?? {}),
        phone: nextDriverPhone,
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

async function repairCustomers() {
  const docs = await CustomerModel.find({}).lean() as unknown as StoredCustomer[]
  const grouped = new Map<string, StoredCustomer[]>()

  for (const doc of docs) {
    const normalizedPhone = normalizeCompactPhone(doc.phone)
    if (!normalizedPhone) continue
    const key = `${String(doc.brandId)}:${normalizedPhone}`
    const list = grouped.get(key) ?? []
    list.push(doc)
    grouped.set(key, list)
  }

  let updated = 0
  let removed = 0

  for (const [key, group] of Array.from(grouped.entries())) {
    const [brandId, normalizedPhone] = key.split(':')
    const primary = group.find((item: StoredCustomer) => item.phone === normalizedPhone) ?? group[0]
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

  for (const doc of docs) {
    const normalizedPhone = normalizeCompactPhone(doc.phone)
    if (!normalizedPhone) continue
    const key = `${String(doc.platform)}:${normalizedPhone}`
    const list = grouped.get(key) ?? []
    list.push(doc)
    grouped.set(key, list)
  }

  let updated = 0
  let removed = 0

  for (const [key, group] of Array.from(grouped.entries())) {
    const [platform, normalizedPhone] = key.split(':')
    const primary = group.find((item: StoredDriver) => item.phone === normalizedPhone) ?? group[0]
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
    updated += 1
  }

  return { scanned: docs.length, updated, removed }
}

export async function runOrderRepair(options?: { days?: number; providers?: string[] }) {
  const providers = (options?.providers?.length ? options.providers : ['be', 'grab']).map((value) => value.trim()).filter(Boolean)
  const days = Math.max(1, Math.min(90, Number(options?.days ?? 30) || 30))

  const historical = await upsertHistoricalOrders(days, providers)
  const orders = await repairStoredOrders(providers)
  const customers = await repairCustomers()
  const drivers = await repairDrivers()

  return {
    ok: true,
    providers,
    days,
    historical,
    orders,
    customers,
    drivers,
  }
}

export async function getOrderRepairReport(options?: { providers?: string[]; limit?: number }) {
  const providers = (options?.providers?.length ? options.providers : ['be', 'grab']).map((value) => value.trim()).filter(Boolean)
  const limit = Math.max(1, Math.min(100, Number(options?.limit ?? 20) || 20))
  const samples: Array<Record<string, unknown>> = []
  let scanned = 0
  let changed = 0

  const cursor = OrderModel.find({ source: { $in: providers } })
    .select('source externalOrderId customerPhone driverInfo subtotal discount total platformFee status cancelReason cancelledAt deliveredAt rawPayload')
    .lean()
    .cursor()

  for await (const rawOrder of cursor) {
    const order = rawOrder as unknown as StoredOrder
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