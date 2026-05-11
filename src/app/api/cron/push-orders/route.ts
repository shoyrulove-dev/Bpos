import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import OrderModel from '@/models/Order'
import SyncLogModel from '@/models/SyncLog'
import { getAdapter } from '@/integrations/registry'
import { decryptJSON } from '@/lib/crypto'
import { buildOrderUpsert, mergeNormalizedOrderPreservingDetail } from '@/lib/order-upsert'
import { upsertCustomerProfile } from '@/lib/customer-upsert'
import { getDisplayCustomerName, getDisplayCustomerPhone } from '@/lib/order-financials'
import { hasMeaningfulCustomerName, hasMeaningfulPhone } from '@/lib/order-upsert'
import { buildSessionStoreId } from '@/lib/realtime-order-sync'
import type { NormalizedOrder, Order } from '@/types'
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
  const bypass = req.nextUrl.searchParams.get('x-vercel-protection-bypass')
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

  if (source === 'browser-scraper' && intg.provider === 'grab' && adapter.fetchOrderDetailWithSession) {
    const sessionData = typeof intgDoc.sessionData === 'string' ? intgDoc.sessionData : ''

    if (sessionData) {
      try {
        const session = decryptJSON<SessionData>(sessionData)
        const storeId = buildSessionStoreId(intg.externalStoreId, session)
        const detailCandidates = normalized.filter(needsGrabSessionDetailEnrichment)

        if (storeId && detailCandidates.length) {
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
      } catch {
        // Fall back to the browser-pushed summary payload when stored session detail fetch fails.
      }
    }
  }

  // Fetch existing orders for merge
  const externalIds = normalized.map((o) => o.externalOrderId).filter(Boolean)
  const existingOrders = externalIds.length
    ? await OrderModel.find({ source: intg.provider, externalOrderId: { $in: externalIds } })
        .select('externalOrderId status customerName customerPhone driverInfo deliveryInfo items subtotal discount total rawPayload')
        .lean()
    : []

  const existingMap = new Map(existingOrders.map((e) => [String(e.externalOrderId ?? ''), e]))

  let upserted = 0
  let updated = 0
  const customersToSave: Array<{ name: string; phone: string; brandId: string; total: number; isNew: boolean; placedAt?: string | Date }> = []
  const historyCount = intg.provider === 'grab' ? countGrabHistoryOrders(rawOrders) : 0
  const activeCount = Math.max(rawOrders.length - historyCount, 0)
  const rawDebugIds = rawOrders.map(getRawDebugId)
  const rawOrderIds = rawOrders.map(getRawOrderId)
  const normalizedIds = normalized.map((order) => order.externalOrderId)

  for (const norm of normalized) {
    if (!norm.externalOrderId) continue
    try {
      const existing = existingMap.get(norm.externalOrderId)
      const merged = mergeNormalizedOrderPreservingDetail(
        existing as Partial<NormalizedOrder> | undefined,
        norm,
      )

      // Don't downgrade: once cancelled keep cancelled
      const existingStatus = (existing as { status?: string } | undefined)?.status
      if (existingStatus === 'cancelled' && merged.orderStatus === 'completed') {
        merged.orderStatus = 'cancelled'
      }

      const result = await OrderModel.findOneAndUpdate(
        { source: merged.source, externalOrderId: merged.externalOrderId },
        buildOrderUpsert(intg, merged),
        { upsert: true, new: true, includeResultMetadata: true },
      )

      const isNew = result?.lastErrorObject?.updatedExisting === false
      if (isNew) upserted++
      else updated++

      // Collect customer info
      const orderDoc = merged as unknown as Order
      const cName = getDisplayCustomerName(orderDoc) ?? merged.customerName?.trim()
      const cPhone = getDisplayCustomerPhone(orderDoc) || merged.customerPhone?.trim()
      if (cName && cPhone && hasMeaningfulCustomerName(cName) && hasMeaningfulPhone(cPhone)) {
        customersToSave.push({
          name: cName,
          phone: cPhone,
          brandId: String(intg.brandId),
          total: merged.total ?? 0,
          isNew,
          placedAt: merged.placedAt,
        })
      }
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
    content: `[browser-push][${intg.provider}][integration:${integrationId}][store:${intg.externalStoreId ?? '-'}][raw:${rawOrders.length} normalized:${normalized.length} active:${activeCount} history:${historyCount}][rawDebugIds:${summarizeIds(rawDebugIds)}][rawOrderIds:${summarizeIds(rawOrderIds)}][normalizedIds:${summarizeIds(normalizedIds)}] +${upserted} mới, ${updated} cập nhật (${Date.now() - startedAt}ms) [${source}]`,
    source: intg.provider,
    brandId: intg.brandId,
  })

  return NextResponse.json({ ok: true, total: normalized.length, upserted, updated })
}
