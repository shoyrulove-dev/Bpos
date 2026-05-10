import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import OrderModel from '@/models/Order'
import SyncLogModel from '@/models/SyncLog'
import { getAdapter } from '@/integrations/registry'
import { buildOrderUpsert, mergeNormalizedOrderPreservingDetail } from '@/lib/order-upsert'
import { upsertCustomerProfile } from '@/lib/customer-upsert'
import { getDisplayCustomerName, getDisplayCustomerPhone } from '@/lib/order-financials'
import { hasMeaningfulCustomerName, hasMeaningfulPhone } from '@/lib/order-upsert'
import type { NormalizedOrder, Order } from '@/types'

const CRON_SECRET = process.env.CRON_SECRET

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

  if (rawOrders.length === 0) {
    // Still update lastSyncAt so the UI reflects a recent sync
    await connectDB()
    await IntegrationModel.findByIdAndUpdate(integrationId, {
      $set: { syncStatus: 'success', lastSyncAt: new Date(), sessionStatus: 'active', sessionFailureCount: 0 },
      $unset: { syncError: 1, sessionError: 1 },
    })
    return NextResponse.json({ ok: true, total: 0, upserted: 0, updated: 0 })
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

  const adapter = getAdapter(intg.provider)
  if (!adapter?.normalizeOrder) {
    return NextResponse.json({ error: `No normalizeOrder for provider ${intg.provider}` }, { status: 400 })
  }

  const startedAt = Date.now()

  // Normalize raw orders using the provider adapter
  const normalized: NormalizedOrder[] = rawOrders
    .filter((o) => o !== null && typeof o === 'object' && !Array.isArray(o))
    .map((o) => {
      try {
        return adapter.normalizeOrder!(o as Record<string, unknown>)
      } catch {
        return null
      }
    })
    .filter((o): o is NormalizedOrder => o !== null && Boolean(o.externalOrderId))

  // Fetch existing orders for merge
  const externalIds = normalized.map((o) => o.externalOrderId).filter(Boolean)
  const existingOrders = externalIds.length
    ? await OrderModel.find({ source: intg.provider, externalOrderId: { $in: externalIds } })
        .select('externalOrderId status customerName customerPhone items subtotal discount total rawPayload')
        .lean()
    : []

  const existingMap = new Map(existingOrders.map((e) => [String(e.externalOrderId ?? ''), e]))

  let upserted = 0
  let updated = 0
  const customersToSave: Array<{ name: string; phone: string; brandId: string; total: number; isNew: boolean; placedAt?: string | Date }> = []

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
    content: `[browser-push][${intg.provider}] +${upserted} mới, ${updated} cập nhật (${Date.now() - startedAt}ms) [${source}]`,
    source: intg.provider,
    brandId: intg.brandId,
  })

  return NextResponse.json({ ok: true, total: normalized.length, upserted, updated })
}
