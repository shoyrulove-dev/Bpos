import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import OrderModel from '@/models/Order'

const CRON_SECRET = process.env.CRON_SECRET

/**
 * GET /api/cron/be-order-ids?integrationId=xxx&limit=300&days=90
 *
 * Returns list of BE orders' externalOrderId for the given integration.
 * Used by the scraper's /be-full-resync to re-enrich old BE orders from BE API.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const integrationId = searchParams.get('integrationId')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '300', 10), 500)
  const days  = Math.min(parseInt(searchParams.get('days') ?? '90', 10), 180)

  if (!integrationId) {
    return NextResponse.json({ error: 'Missing integrationId' }, { status: 400 })
  }

  await connectDB()

  const intg = await IntegrationModel.findById(integrationId)
    .select('provider brandId isActive')
    .lean() as { provider: string; brandId: unknown; isActive: boolean } | null

  if (!intg) return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
  if (intg.provider !== 'be') return NextResponse.json({ ok: true, orderIds: [] })

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const orders = await OrderModel.find({
    source: 'be',
    brandId: intg.brandId,
    externalOrderId: { $exists: true, $ne: '' },
    placedAt: { $gte: cutoff },
  })
    .select('externalOrderId rawPayload')
    .sort({ placedAt: -1 })
    .limit(limit)
    .lean() as Array<{ externalOrderId?: string; rawPayload?: Record<string, unknown> }>

  // Return just the numeric order_id stored in rawPayload (what BE API expects)
  // externalOrderId in DB is usually the BE order_id as string
  const orderIds = orders
    .map(o => {
      const rawId = o.rawPayload?.order_id ?? o.rawPayload?.id
      const extId = o.externalOrderId
      // BE order_id is numeric; prefer rawPayload.order_id, fallback to externalOrderId
      const id = rawId != null ? String(rawId) : extId
      return id && /^\d+$/.test(id) ? id : null
    })
    .filter((id): id is string => id !== null)

  // Deduplicate
  const unique = [...new Set(orderIds)]

  return NextResponse.json({ ok: true, orderIds: unique, total: unique.length })
}
