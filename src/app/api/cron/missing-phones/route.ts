import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import OrderModel from '@/models/Order'

const CRON_SECRET = process.env.CRON_SECRET

/**
 * GET /api/cron/missing-phones?integrationId=xxx&days=14&limit=30
 *
 * Returns recent Grab orders (for this integration's storeId) that are missing
 * customerPhone OR driverInfo.phone, so the scraper can backfill them by fetching
 * the Grab portal detail page.
 *
 * Only driver phone is reliably recoverable from history (Grab hides customer phone
 * after order completes). Both are attempted anyway.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const integrationId = searchParams.get('integrationId')
  const days  = Math.min(parseInt(searchParams.get('days')  ?? '14', 10), 30)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '30',  10), 100)

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

  // Query orders missing either customer or driver phone
  // Filter by externalStoreId (set on new orders) or fall back to matching storeId in rawPayload
  const missingPhoneFilter = {
    $or: [
      { customerPhone: { $exists: false } },
      { customerPhone: null },
      { customerPhone: '' },
      { 'driverInfo.phone': { $exists: false } },
      { 'driverInfo.phone': null },
      { 'driverInfo.phone': '' },
    ],
  }

  const baseQuery = {
    source: 'grab',
    placedAt: { $gte: cutoff },
    status: { $nin: ['draft'] },   // skip draft
    ...missingPhoneFilter,
  }

  // Try by externalStoreId first (fast, indexed), then fallback by brandId
  let orders: Array<{ externalOrderId?: string; externalStoreId?: string; rawPayload?: Record<string, unknown> }> = []

  if (storeId) {
    orders = await OrderModel.find({ ...baseQuery, externalStoreId: storeId })
      .select('externalOrderId externalStoreId rawPayload')
      .sort({ placedAt: -1 })
      .limit(limit)
      .lean()
  }

  // If we got nothing by storeId (old orders without externalStoreId), try rawPayload.merchantID
  if (orders.length === 0 && storeId) {
    orders = await OrderModel.find({ ...baseQuery, 'rawPayload.merchantID': storeId })
      .select('externalOrderId externalStoreId rawPayload')
      .sort({ placedAt: -1 })
      .limit(limit)
      .lean()
  }

  const result = orders
    .filter(o => o.externalOrderId)
    .map(o => ({
      externalOrderId: String(o.externalOrderId),
      externalStoreId: String(
        o.externalStoreId ??
        (o.rawPayload as Record<string, unknown>)?.merchantID ??
        storeId ?? ''
      ),
    }))

  return NextResponse.json({ ok: true, orders: result, total: result.length })
}
