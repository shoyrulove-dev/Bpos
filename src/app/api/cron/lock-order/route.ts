/**
 * POST /api/cron/lock-order
 *
 * Locks a specific order to prevent auto-updates from the scraper.
 * - Always sets `locked: true` on the order document (new field)
 * - For Grab orders: also sets rawPayload.needCutlery = null (backfill sentinel)
 *
 * Body: { grabDisplayId?: string, externalOrderId?: string, source?: string, locked?: boolean }
 * Auth: Bearer <CRON_SECRET>
 */
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const grabDisplayId   = String(body?.grabDisplayId   ?? '').trim()
  const externalOrderId = String(body?.externalOrderId ?? '').trim()
  const source          = String(body?.source ?? '').trim()
  const locked          = body?.locked !== false

  if (!grabDisplayId && !externalOrderId) {
    return NextResponse.json({ error: 'Provide grabDisplayId or externalOrderId' }, { status: 400 })
  }

  await connectDB()

  // Build query: support source filter for disambiguation
  const query = externalOrderId
    ? (source ? { externalOrderId, source } : { externalOrderId })
    : {
        source: 'grab',
        $or: [
          { 'rawPayload.displayID': grabDisplayId },
          { 'rawPayload.shortOrderID': grabDisplayId },
          { 'rawPayload.shortOrderId': grabDisplayId },
          { 'rawPayload.displayId': grabDisplayId },
        ],
      }

  const order = await OrderModel.findOne(query)
    .select('_id externalOrderId shortId source status rawPayload locked')
    .lean() as { _id: unknown; externalOrderId?: string; shortId?: string; source: string; status: string; rawPayload?: Record<string, unknown>; locked?: boolean } | null

  if (!order) {
    return NextResponse.json({ error: 'Order not found', query: grabDisplayId || externalOrderId }, { status: 404 })
  }

  const setFields: Record<string, unknown> = { locked }

  // For Grab orders: also apply backfill lock sentinel
  if (order.source === 'grab') {
    const rawPayload = order.rawPayload ?? {}
    setFields['rawPayload.needCutlery'] = null
    if (rawPayload.itemInfo && typeof rawPayload.itemInfo === 'object' && !Array.isArray(rawPayload.itemInfo)) {
      setFields['rawPayload.itemInfo.needCutlery'] = null
    }
  }

  await OrderModel.updateOne({ _id: order._id }, { $set: setFields })

  return NextResponse.json({
    ok: true,
    locked,
    order: {
      internalShortId: order.shortId,
      externalOrderId: order.externalOrderId,
      source: order.source,
      status: order.status,
    },
  })
}
