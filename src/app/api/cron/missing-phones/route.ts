import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import OrderModel from '@/models/Order'
import { getDisplayCustomerPhone, getDisplayDriverPhone } from '@/lib/order-financials'
import { hasMeaningfulPhone } from '@/lib/order-upsert'
import type { Order } from '@/types'

const CRON_SECRET = process.env.CRON_SECRET

function getRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
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

  return rawItems.some((item) => {
    const itemRecord = getRecord(item)
    const fare = getRecord(itemRecord?.fare)

    // NOTE: deliberately exclude note/remark/specialInstruction — DOM extraction
    // can inject garbage strings like 'No data', causing false positives.
    // Real signals are prices and modifiers from Grab XHR data.
    return Boolean(
      (Array.isArray(itemRecord?.modifiers) && itemRecord.modifiers.length)
      || (Array.isArray(itemRecord?.modifierGroups) && itemRecord.modifierGroups.length)
      || (Array.isArray(itemRecord?.addons) && itemRecord.addons.length)
      || (Array.isArray(itemRecord?.options) && itemRecord.options.length)
      || (Array.isArray(itemRecord?.discountInfo) && itemRecord.discountInfo.length)
      || Number(itemRecord?.price ?? itemRecord?.itemPrice ?? itemRecord?.totalPrice ?? itemRecord?.subtotal ?? itemRecord?.total ?? 0) > 0
      || Number(fare?.priceFloat ?? fare?.priceInMin ?? fare?.amount ?? fare?.price ?? 0) > 0
    )
  })
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

function parseDateValue(value: unknown) {
  if (!value) return undefined
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date
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

function hasPickupAtSignal(rawPayload?: Record<string, unknown>) {
  const raw = getRecord(rawPayload)
  const times = getRecord(raw?.times)

  return Boolean(
    parseDateValue(raw?.schedulePickupTime)
    || parseDateValue(raw?.scheduledOrderPickUpTime)
    || parseDateValue(raw?.scheduledAt)
    || parseDateValue(raw?.estimatedPickupTime)
    || parseDateValue(raw?.promisedPickupTime)
    || parseDateValue(raw?.estimatedDeliveryTime)
    || parseDateValue(raw?.promisedDeliveryTime)
    || parseDateValue(times?.pickUpTime)
    || parseDateValue(times?.pickupTime)
    || parseDateValue(times?.estimatedPickupTime)
    || parseDateValue(times?.deliveryTime)
    || parseDateValue(times?.dropOffTime)
    || parseDateValue(times?.dropoffTime)
  )
}

function hasGrabUtensilInfo(rawPayload?: Record<string, unknown>) {
  if (!rawPayload) return false
  // Nếu key needCutlery tồn tại (dù false) → đã fetch detail
  if ('needCutlery' in rawPayload) return true
  const itemInfo = getRecord(rawPayload.itemInfo)
  if (itemInfo && 'needCutlery' in itemInfo) return true
  return false
}

function getGrabStoredPageStage(rawPayload?: Record<string, unknown>) {
  const raw = getRecord(rawPayload)
  const explicitStage = String(raw?._pageStage ?? '').trim().toLowerCase()
  if (explicitStage) return explicitStage

  const pageType = String(raw?._pageType ?? raw?.pageType ?? '').trim().toLowerCase()
  if (pageType.includes('cancel')) return 'cancelled'
  if (pageType.includes('complete') || pageType.includes('deliver')) return 'completed'
  if (pageType.includes('history') || pageType.includes('past') || pageType.includes('all')) return 'history'
  if (pageType.includes('ready')) return 'ready'
  if (pageType.includes('upcoming')) return 'upcoming'
  if (pageType.includes('prepar')) return 'preparing'

  const rawStatus = String(raw?.deliveryStatus ?? raw?.orderState ?? raw?.status ?? raw?.orderStatus ?? raw?.state ?? '').trim().toLowerCase()
  if (rawStatus.includes('cancel')) return 'cancelled'
  if (rawStatus.includes('complete') || rawStatus.includes('deliver')) return 'completed'
  if (rawStatus.includes('ready')) return 'ready'
  if (rawStatus.includes('upcoming') || rawStatus.includes('schedule')) return 'upcoming'
  return 'preparing'
}

/**
 * GET /api/cron/missing-phones?integrationId=xxx&days=14&limit=30
 *
 * Returns recent Grab orders for this integration that still need browser-side
 * detail backfill: active customer phone, driver phone, item/note detail, promo
 * detail, or terminal timestamps. The scraper uses the order detail page from the
 * real browser session because Vercel-side Grab history/detail fetch is unreliable.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const integrationId = searchParams.get('integrationId')
  const days  = Math.min(parseInt(searchParams.get('days')  ?? '14', 10), 365)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '30',  10), 200)

  if (!integrationId) {
    return NextResponse.json({ error: 'Missing integrationId' }, { status: 400 })
  }

  await connectDB()

  const intg = await IntegrationModel.findById(integrationId)
    .select('provider externalStoreId brandId isActive')
    .lean() as { provider: string; externalStoreId?: string; brandId: unknown; isActive: boolean } | null

  if (!intg) return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
  if (intg.provider !== 'grab') return NextResponse.json({ ok: true, orders: [] })

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const storeId = intg.externalStoreId
  const AGE_24H_MS = 24 * 60 * 60 * 1000
  const ACTIVE_STATUSES = new Set(['waiting_confirm', 'waiting_pickup', 'delivering', 'preparing'])

  type GrabBackfillCandidate = {
    externalOrderId?: string
    externalStoreId?: string
    rawPayload?: Record<string, unknown>
    customerPhone?: string
    driverInfo?: { phone?: string }
    status?: string
    placedAt?: string | Date
    deliveredAt?: string | Date
    pickupAt?: string | Date
    discount?: number
  }

  const baseQuery = {
    source: 'grab',
    placedAt: { $gte: cutoff },
    status: { $nin: ['draft'] },   // skip draft
  }

  let orders: GrabBackfillCandidate[] = []

  if (storeId) {
    orders = await OrderModel.find({ ...baseQuery, externalStoreId: storeId })
      .select('externalOrderId externalStoreId rawPayload customerPhone driverInfo status placedAt deliveredAt pickupAt discount')
      .sort({ placedAt: -1 })
      .limit(limit * 8)
      .lean() as GrabBackfillCandidate[]
  }

  if (orders.length === 0 && storeId) {
    orders = await OrderModel.find({ ...baseQuery, 'rawPayload.merchantID': storeId })
      .select('externalOrderId externalStoreId rawPayload customerPhone driverInfo status placedAt deliveredAt pickupAt discount')
      .sort({ placedAt: -1 })
      .limit(limit * 8)
      .lean() as GrabBackfillCandidate[]
  }

  if (orders.length === 0 && intg.brandId) {
    orders = await OrderModel.find({
      ...baseQuery,
      brandId: intg.brandId,
    })
      .select('externalOrderId externalStoreId rawPayload customerPhone driverInfo status placedAt deliveredAt pickupAt discount')
      .sort({ placedAt: -1 })
      .limit(limit * 8)
      .lean() as GrabBackfillCandidate[]
  }

  const result = orders
    .map((order) => {
      const rawPayload = getRecord(order.rawPayload)
      const storedStage = getGrabStoredPageStage(rawPayload)
      const isFinalizedStage = ['history', 'completed', 'cancelled'].includes(storedStage)
      const isFinalizedStatus = ['completed', 'cancelled'].includes(String(order.status ?? '').trim().toLowerCase())
      const normalizedStatus = String(order.status ?? '').trim().toLowerCase()
      // Grab không còn dùng 'delivering' — tất cả đang giao vẫn là waiting_pickup
      const isActivelyDelivering = storedStage === 'history' && !isFinalizedStatus
      const skipFinalizedRetry = (isFinalizedStage || isFinalizedStatus) && !isActivelyDelivering
      const placedAtMs = order.placedAt ? new Date(String(order.placedAt)).getTime() : 0
      const isOlderThan24h = placedAtMs > 0 && Date.now() - placedAtMs > AGE_24H_MS
      const isActiveStatus = ACTIVE_STATUSES.has(normalizedStatus)

      // Very old active Grab orders still need pickupAt/status refresh so they can move to
      // completed, but we avoid re-queuing phone/item detail churn for those stale rows.
      const allowOnlyStatusRepair = isOlderThan24h && isActiveStatus

      // Customer/driver phone: try all non-stale orders, including history/completed rows.
      // Grab history detail often still contains receiver/driver info, and older DB rows are
      // exactly the ones that need a second pass to recover this data.
      const canGetContactDetail = !allowOnlyStatusRepair
      const missingCustomerPhone = canGetContactDetail
        && !hasMeaningfulPhone(getDisplayCustomerPhone(order as unknown as Order))
      const missingDriverPhone = canGetContactDetail
        && !hasMeaningfulPhone(getDisplayDriverPhone(order as unknown as Order))
      // Item/promo detail: always try even for history/completed orders — Grab portal
      // still shows items/vouchers/addons on the history detail page.
      // BUT: if needCutlery is present in rawPayload it means the detail page was already fetched
      // for this order (needCutlery is only set from the Grab detail page XHR). Skip re-fetching
      // to avoid hammering the same order repeatedly when items genuinely have no addons/prices.
      const alreadyFetchedDetail = hasGrabUtensilInfo(rawPayload)
      const missingItemDetail = !allowOnlyStatusRepair && !hasGrabDetailedItems(rawPayload) && !alreadyFetchedDetail
      const missingPromotionDetail = !allowOnlyStatusRepair && Number(order.discount ?? 0) > 0 && !hasGrabPromotionDetail(rawPayload) && !alreadyFetchedDetail
      const missingDeliveredAt = order.status === 'completed' && !order.deliveredAt && !hasDeliveredAtSignal(rawPayload)
      const missingPickupAt = isActiveStatus && !order.pickupAt && !hasPickupAtSignal(rawPayload)
      const needsStatusRefresh = normalizedStatus === 'waiting_pickup'
        && placedAtMs > 0
        && (Date.now() - placedAtMs) > 2 * 60 * 60 * 1000
        && !isFinalizedStatus
      const reasons = [
        missingCustomerPhone ? 'customer-phone' : null,
        missingDriverPhone ? 'driver-phone' : null,
        missingItemDetail ? 'item-detail' : null,
        missingPromotionDetail ? 'promotion-detail' : null,
        missingDeliveredAt ? 'delivered-at' : null,
        missingPickupAt ? 'pickup-at' : null,
        needsStatusRefresh ? 'status-refresh' : null,
      ].filter((value): value is string => Boolean(value))

      // Short order ID (GF-xxx style) from raw Grab payload
      const shortOrderId = String(
        rawPayload?.displayID ?? rawPayload?.shortOrderID ?? rawPayload?.shortOrderId ??
        rawPayload?.displayId ?? rawPayload?.shortId ?? ''
      ) || undefined

      return {
        externalOrderId: order.externalOrderId ? String(order.externalOrderId) : '',
        externalStoreId: String(
          order.externalStoreId ??
          (order.rawPayload as Record<string, unknown>)?.merchantID ??
          storeId ?? ''
        ),
        pageStage: storedStage,
        shortOrderId,
        reasons,
      }
    })
    .filter((order) => order.externalOrderId && order.reasons.length > 0)
    .slice(0, limit)

  return NextResponse.json({ ok: true, orders: result, total: result.length })
}
