import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import OrderModel from '@/models/Order'
import SyncLogModel from '@/models/SyncLog'
import { getAdapter } from '@/integrations/registry'
import { decryptJSON } from '@/lib/crypto'
import { buildOrderUpsert, getComparableDriverName, hasMeaningfulDriverName, hasMeaningfulPhone, isDriverNamePlaceholder, mergeNormalizedOrderPreservingDetail, shouldSkipFinalizedOrderSync } from '@/lib/order-upsert'
import { upsertCustomerProfile } from '@/lib/customer-upsert'
import { getOrderContactProfileCandidates } from '@/lib/order-contact-profiles'
import DriverModel from '@/models/Driver'
import { buildSessionStoreId, mergeSessionOrdersWithRecentHistory } from '@/lib/realtime-order-sync'
import type { NormalizedOrder } from '@/types'
import type { SessionData } from '@/integrations/types'

const CRON_SECRET = process.env.CRON_SECRET
const GRAB_HISTORY_PAGE_TYPES = new Set(['Completed', 'CompletedV2', 'History', 'Past', 'PastOrders', 'Delivered', 'Cancelled'])
function getRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function getRawOrderId(raw: unknown) {
  const record = getRecord(raw)
  if (!record) return undefined

  const value = record.orderID ?? record.orderId ?? record.ID ?? record.id
  const normalized = String(value ?? '').trim()
  return normalized || undefined
}

function getRawDebugId(raw: unknown) {
  const record = getRecord(raw)
  if (!record) return undefined

  const value = record.displayID
    ?? record.displayId
    ?? record.bookingCode
    ?? record.booking_code
    ?? record.orderCode
    ?? record.orderDisplayId
    ?? record.merchantOrderID
    ?? record.merchantOrderId
    ?? record.shortId
    ?? record.shortID
    ?? record.orderID
    ?? record.orderId

  const normalized = String(value ?? '').trim()
  return normalized || undefined
}

function summarizeIds(values: Array<string | undefined>, limit = 10) {
  const deduped = Array.from(new Set(values.filter((value): value is string => Boolean(value))))
  return deduped.length ? deduped.slice(0, limit).join(',') : '-'
}

function countGrabHistoryOrders(rawOrders: unknown[]) {
  return rawOrders.reduce<number>((count, rawOrder) => {
    const pageType = String(getRecord(rawOrder)?._pageType ?? '').trim()
    return GRAB_HISTORY_PAGE_TYPES.has(pageType) ? count + 1 : count
  }, 0)
}

function needsGrabSessionDetailEnrichment(order: NormalizedOrder) {
  if (order.source !== 'grab') return false

  const rawPayload = order.rawPayload as Record<string, unknown> | undefined
  const pageType = String(rawPayload?._pageType ?? rawPayload?.pageType ?? '').trim().toLowerCase()
  const pageStage = String(rawPayload?._pageStage ?? '').trim().toLowerCase()
  const isActiveBucket = pageType.includes('ready')
    || pageType.includes('prepar')
    || pageType.includes('upcoming')
    || pageStage === 'ready'
    || pageStage === 'preparing'
    || pageStage === 'upcoming'
  const placedAt = new Date(String(order.placedAt ?? '')).getTime()
  const isAgedActiveOrder = Number.isFinite(placedAt)
    && (Date.now() - placedAt) > (90 * 60 * 1000)
    && order.orderStatus === 'waiting_pickup'
    && isActiveBucket
  const isStatusBucketMismatch = isActiveBucket && order.orderStatus === 'cancelled'

  if (isAgedActiveOrder || isStatusBucketMismatch) return true

  return !hasMeaningfulPhone(order.customerPhone)
    || !hasMeaningfulPhone(order.driverInfo?.phone)
    || !order.items.length
    || order.items.some((item) => Number(item.price ?? 0) <= 0 || Number(item.total ?? 0) <= 0)
}

/**
 * POST /api/cron/push-orders
 * Called by the local browser-based Playwright scraper.
 * Accepts raw Grab portal orders (captured via page.evaluate inside the browser),
 * normalizes them, and upserts into the DB — bypassing the server-side 401 issue.
 *
 * Body: { integrationId: string, rawOrders: unknown[], source?: string }
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { integrationId?: string; rawOrders?: unknown[]; source?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { integrationId, rawOrders, source = 'browser-push' } = body

  if (!integrationId || !Array.isArray(rawOrders)) {
    return NextResponse.json({ error: 'Missing integrationId or rawOrders array' }, { status: 400 })
  }

  await connectDB()

  const intgDoc = await IntegrationModel.findById(integrationId)
    .select('+credentials +sessionData')
    .lean() as Record<string, unknown> | null

  if (!intgDoc) {
    return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
  }

  const intg = intgDoc as {
    _id: string
    provider: string
    brandId: string
    hubId?: string
    externalStoreId?: string
    externalStoreName?: string
    isActive: boolean
  }

  const startedAt = Date.now()

  if (rawOrders.length === 0) {
    // Still update lastSyncAt and write a browser-push log so the UI can mark
    // the scraper healthy even when this cycle has no orders.
    await IntegrationModel.findByIdAndUpdate(integrationId, {
      $set: { syncStatus: 'success', lastSyncAt: new Date(), sessionStatus: 'active', sessionFailureCount: 0 },
      $unset: { syncError: 1, sessionError: 1 },
    })

    await SyncLogModel.create({
      type: 'order',
      status: 'success',
      content: `[browser-push][${intg.provider}][integration:${integrationId}][store:${intg.externalStoreId ?? '-'}][raw:0 normalized:0 active:0 history:0][rawDebugIds:-][rawOrderIds:-][normalizedIds:-] +0 mới, 0 cập nhật (${Date.now() - startedAt}ms) [${source}]`,
      source: intg.provider,
      brandId: intg.brandId,
    })

    return NextResponse.json({ ok: true, total: 0, upserted: 0, updated: 0 })
  }

  const adapter = getAdapter(intg.provider)
  if (!adapter?.normalizeOrder) {
    return NextResponse.json({ error: `No normalizeOrder for provider ${intg.provider}` }, { status: 400 })
  }

  // Normalize raw orders using the provider adapter
  // Pass _fetchType if present so BE adapter can map status correctly
  let normalized: NormalizedOrder[] = rawOrders
    .filter((o) => o !== null && typeof o === 'object' && !Array.isArray(o))
    .map((o) => {
      try {
        const raw = o as Record<string, unknown>
        const fetchType = typeof raw._fetchType === 'string' ? raw._fetchType : undefined
        return adapter.normalizeOrder!(raw, fetchType)
      } catch {
        return null
      }
    })
    .filter((o): o is NormalizedOrder => o !== null && Boolean(o.externalOrderId))

  if (source === 'browser-scraper' && intg.provider === 'grab') {
    const sessionData = typeof intgDoc.sessionData === 'string' ? intgDoc.sessionData : ''

    if (sessionData) {
      try {
        const session = decryptJSON<SessionData>(sessionData)
        const storeId = buildSessionStoreId(intg.externalStoreId, session)

        if (storeId) {
          normalized = await mergeSessionOrdersWithRecentHistory(adapter, session, storeId, normalized)
        }

        if (adapter.fetchOrderDetailWithSession && storeId) {
          const detailCandidates = normalized.filter(needsGrabSessionDetailEnrichment)

          if (detailCandidates.length) {
            const detailMap = new Map<string, NormalizedOrder>()

            for (let index = 0; index < detailCandidates.length; index += 5) {
              const batch = detailCandidates.slice(index, index + 5)
              const details = await Promise.all(batch.map(async (order) => {
                try {
                  return await adapter.fetchOrderDetailWithSession!(String(order.externalOrderId), session, storeId)
                } catch {
                  return null
                }
              }))

              for (const detail of details) {
                if (!detail?.externalOrderId) continue
                detailMap.set(detail.externalOrderId, detail)
              }
            }

            normalized = normalized.map((order) => {
              const detail = detailMap.get(String(order.externalOrderId ?? ''))
              return detail ? mergeNormalizedOrderPreservingDetail(order, detail) : order
            })
          }
        }
      } catch {
        // Fall back to the browser-pushed summary payload when stored session history/detail fetch fails.
      }
    }
  }

  // Fetch existing orders for merge
  const externalIds = normalized.map((o) => o.externalOrderId).filter(Boolean)
  const existingOrders = externalIds.length
    ? await OrderModel.find({ source: intg.provider, externalOrderId: { $in: externalIds } })
        .select('externalOrderId status customerName customerPhone driverInfo deliveryInfo items subtotal discount total rawPayload locked')
        .lean()
    : []

  const existingMap = new Map(existingOrders.map((e) => [String(e.externalOrderId ?? ''), e]))

  let upserted = 0
  let updated = 0
  let skipped = 0
  const customersToSave: Array<{ name: string; phone: string; brandId: string; total: number; isNew: boolean; placedAt?: string | Date }> = []
  const driversToSave: Array<{ name: string; phone: string; platform: string; isNew: boolean; placedAt?: string | Date }> = []
  const historyCount = intg.provider === 'grab' ? countGrabHistoryOrders(rawOrders) : 0
  const activeCount = Math.max(rawOrders.length - historyCount, 0)
  const rawDebugIds = rawOrders.map(getRawDebugId)
  const rawOrderIds = rawOrders.map(getRawOrderId)
  const normalizedIds = normalized.map((order) => order.externalOrderId)

  const ACTIVE_ORDER_STATUSES = new Set(['waiting_confirm', 'waiting_pickup', 'delivering', 'draft', 'pre_order'])
  const AGE_LIMIT_MS = 24 * 60 * 60 * 1000 // 24 hours

  for (const norm of normalized) {
    if (!norm.externalOrderId) continue
    try {
      const existing = existingMap.get(norm.externalOrderId)

      // Skip locked orders — user manually locked this order to prevent auto-updates
      if ((existing as { locked?: boolean } | undefined)?.locked) {
        skipped++
        continue
      }

      const merged = mergeNormalizedOrderPreservingDetail(
        existing as Partial<NormalizedOrder> | undefined,
        norm,
      )

      // Skip auto-sync for existing orders older than 24h — preserve any manual status changes
      if (existing) {
        const placedAt = new Date(String((existing as Record<string, unknown>).placedAt ?? norm.placedAt ?? '')).getTime()
        if (Number.isFinite(placedAt) && Date.now() - placedAt > AGE_LIMIT_MS && ACTIVE_ORDER_STATUSES.has(merged.orderStatus)) {
          skipped++
          continue
        }
      }

      const existingStatus = (existing as { status?: string } | undefined)?.status

      // Don't downgrade: once cancelled keep cancelled; once completed don't revert to active status
      // Exception: if incoming is from an ACTIVE platform bucket (PreparingV2 / in_progress / on_delivery),
      // allow overriding a wrongly-set 'completed' so operators can see the real live status.
      const rawPayloadIncoming = norm.rawPayload as Record<string, unknown> | undefined
      const incomingPageType = String(rawPayloadIncoming?._pageType ?? '').trim()
      const incomingPageStage = String(rawPayloadIncoming?._pageStage ?? '').trim()
      const incomingFetchType = String(rawPayloadIncoming?._fetchType ?? '').trim()
      const isFromActiveBucket = ['PreparingV2', 'Ready', 'Upcoming'].includes(incomingPageType)
        || ['preparing', 'ready', 'upcoming'].includes(incomingPageStage.toLowerCase())
        || ['in_progress', 'on_delivery', 'pending'].includes(incomingFetchType)
      const isIncomingBeCancelledCorrection = intg.provider === 'be'
        && existingStatus === 'completed'
        && merged.orderStatus === 'cancelled'
      // Keep cancelled as final by default, but allow Grab to recover from stale/incorrect
      // cancel snapshots when new payload shows active bucket or explicit completion.
      if (existingStatus === 'cancelled') {
        const canRecoverCancelledGrabOrder = intg.provider === 'grab'
          && (
            isFromActiveBucket
            || merged.orderStatus === 'completed'
          )
        if (!canRecoverCancelledGrabOrder) {
          merged.orderStatus = 'cancelled'
        }
      }
      // Active bucket orders (PreparingV2/Ready/Upcoming) must NEVER be completed
      // — resolveNormalizedOrderStatus may still compute 'completed' from stale timestamps
      if (isFromActiveBucket && merged.orderStatus === 'completed') {
        merged.orderStatus = 'waiting_pickup'
      }
      // Completed orders don't revert to active unless pushed from a live active bucket
      if (!isIncomingBeCancelledCorrection && !isFromActiveBucket && existingStatus === 'completed' && (merged.orderStatus === 'waiting_pickup' || merged.orderStatus === 'waiting_confirm' || merged.orderStatus === 'delivering')) {
        merged.orderStatus = 'completed'
      }
      // Backfill source: never UPGRADE an active order to completed
      // Exception: if coming from a confirmed History/Completed bucket, it IS done
      const isBackfillSource = source === 'browser-grab-backfill'
      const incomingIsHistoryBucket = ['History', 'Completed', 'CompletedV2', 'PastOrders'].includes(incomingPageType)
        || ['history', 'completed'].includes(incomingPageStage.toLowerCase())
      if (isBackfillSource && !incomingIsHistoryBucket && ACTIVE_ORDER_STATUSES.has(existingStatus ?? '') && merged.orderStatus === 'completed') {
        merged.orderStatus = (existingStatus as NormalizedOrder['orderStatus']) ?? 'waiting_pickup'
      }

      if (shouldSkipFinalizedOrderSync(existing as Record<string, unknown> | undefined, merged)) {
        const skippedProfiles = getOrderContactProfileCandidates(merged, {
          brandId: String(intg.brandId),
          platform: intg.provider,
          isNew: false,
        })
        if (skippedProfiles.customer) customersToSave.push(skippedProfiles.customer)
        if (skippedProfiles.driver) driversToSave.push(skippedProfiles.driver)
        skipped++
        continue
      }

      const result = await OrderModel.updateOne(
        { source: merged.source, externalOrderId: merged.externalOrderId },
        buildOrderUpsert(intg, merged),
        { upsert: true },
      )

      const isNew = result.upsertedCount > 0
      const wasModified = result.modifiedCount > 0
      if (isNew) upserted++
      else if (wasModified) updated++

      const savedProfiles = getOrderContactProfileCandidates(merged, {
        brandId: String(intg.brandId),
        platform: intg.provider,
        isNew,
      })
      if (savedProfiles.customer) customersToSave.push(savedProfiles.customer)
      if (savedProfiles.driver) driversToSave.push(savedProfiles.driver)
    } catch { /* skip individual order errors */ }
  }

  // Auto-save customers
  for (const c of customersToSave) {
    try {
      await upsertCustomerProfile({
        phone: c.phone,
        name: c.name,
        brandId: c.brandId,
        source: intg.provider,
        placedAt: c.placedAt,
        orderTotal: c.total,
        isNewOrder: c.isNew,
      })
    } catch { /* skip */ }
  }

  // Auto-save drivers — mirrors sync-orders logic
  for (const d of driversToSave) {
    try {
      const existingDriver = await DriverModel.findOne({ phone: d.phone, platform: d.platform }).select('name').lean() as { name?: string } | null
      const shouldUpdateName = !existingDriver || !hasMeaningfulDriverName(existingDriver.name) || isDriverNamePlaceholder(existingDriver.name)
      const existingNameKey = getComparableDriverName(existingDriver?.name)
      const incomingNameKey = getComparableDriverName(d.name)
      if (existingDriver && existingNameKey && (!incomingNameKey || existingNameKey !== incomingNameKey)) continue
      const parsedPlacedAt = d.placedAt ? new Date(String(d.placedAt)) : null
      const driverDate = parsedPlacedAt && !Number.isNaN(parsedPlacedAt.getTime()) ? parsedPlacedAt : new Date()
      await DriverModel.findOneAndUpdate(
        { phone: d.phone, platform: d.platform },
        {
          $set: { ...(shouldUpdateName ? { name: d.name } : {}) },
          $max: { lastSeenAt: driverDate },
          $setOnInsert: { visitCount: 1 },
        },
        { upsert: true },
      )
    } catch { /* skip */ }
  }

  // Ghost-order detection: orders that were at waiting_pickup/delivering but
  // disappeared from the active push batch → they completed on the platform.
  // Run on every push (including empty batches) — this is exactly when ghost detection is needed:
  // the scraper only sees Active tab; completed orders move to History and disappear from the push.
  let ghostCompleted = 0
  if (intg.provider === 'grab' && intg.externalStoreId) {
    const pushedExternalIds = new Set(normalized.map((n) => n.externalOrderId).filter(Boolean))
    const ghostWindow = new Date(Date.now() - 4 * 60 * 60 * 1000)   // placed within last 4h
    const staleThreshold = new Date(Date.now() - 40 * 60 * 1000)    // not updated for 40+ min
    try {
      const ghostOrders = await OrderModel.find({
        source: 'grab',
        externalStoreId: intg.externalStoreId,
        status: { $in: ['waiting_pickup', 'delivering'] },
        placedAt: { $gte: ghostWindow },
        updatedAt: { $lte: staleThreshold },
        externalOrderId: { $nin: Array.from(pushedExternalIds) },
        locked: { $ne: true },
      }).select('_id shortId externalOrderId').lean()

      if (ghostOrders.length > 0) {
        const now = new Date()
        const ghostResult = await OrderModel.updateMany(
          { _id: { $in: ghostOrders.map((o) => o._id) } },
          { $set: { status: 'completed', deliveredAt: now } },
        )
        ghostCompleted = ghostResult.modifiedCount
      }
    } catch { /* ghost detection is best-effort */ }
  }

  // Update integration to reflect successful push
  await IntegrationModel.findByIdAndUpdate(integrationId, {
    $set: {
      syncStatus: 'success',
      lastSyncAt: new Date(),
      sessionStatus: 'active',
      sessionFailureCount: 0,
    },
    $unset: { syncError: 1, sessionError: 1 },
  })

  await SyncLogModel.create({
    type: 'order',
    status: 'success',
    content: `[browser-push][${intg.provider}][integration:${integrationId}][store:${intg.externalStoreId ?? '-'}][raw:${rawOrders.length} normalized:${normalized.length} active:${activeCount} history:${historyCount}][rawDebugIds:${summarizeIds(rawDebugIds)}][rawOrderIds:${summarizeIds(rawOrderIds)}][normalizedIds:${summarizeIds(normalizedIds)}] +${upserted} mới, ${updated} cập nhật, ${skipped} bỏ qua, ${ghostCompleted} ghost-completed (${Date.now() - startedAt}ms) [${source}]`,
    source: intg.provider,
    brandId: intg.brandId,
  })

  return NextResponse.json({ ok: true, total: normalized.length, upserted, updated, skipped, ghostCompleted })
}
