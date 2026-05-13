/**
 * POST /api/cron/lock-order
 *
 * Locks a specific Grab order so it is never re-queued for backfill.
 * Sets rawPayload.needCutlery = null (sentinel that hasGrabUtensilInfo() reads).
 *
 * Body: { grabDisplayId: "GF-719" }   — Grab short display ID (e.g. GF-xxx)
 *   OR: { externalOrderId: "..." }    — Grab internal order ID
 *
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

  if (!grabDisplayId && !externalOrderId) {
    return NextResponse.json({ error: 'Provide grabDisplayId or externalOrderId' }, { status: 400 })
  }

  await connectDB()

  // Build query: search by Grab display ID in rawPayload, or by externalOrderId
  const query = externalOrderId
    ? { externalOrderId }
    : {
        source: 'grab',
        $or: [
          { 'rawPayload.displayID': grabDisplayId },
          { 'rawPayload.shortOrderID': grabDisplayId },
          { 'rawPayload.shortOrderId': grabDisplayId },
          { 'rawPayload.displayId': grabDisplayId },
        ],
      }

  // Find the order first to verify it exists
  const order = await OrderModel.findOne(query)
    .select('_id externalOrderId shortId source status rawPayload')
    .lean() as { _id: unknown; externalOrderId?: string; shortId?: string; source: string; status: string; rawPayload?: Record<string, unknown> } | null

  if (!order) {
    return NextResponse.json({ error: 'Order not found', query: grabDisplayId || externalOrderId }, { status: 404 })
  }

  // Check if already locked
  const rawPayload = order.rawPayload ?? {}
  const alreadyLocked = 'needCutlery' in rawPayload || (rawPayload.itemInfo && 'needCutlery' in (rawPayload.itemInfo as Record<string, unknown>))

  // Set needCutlery: null sentinel on rawPayload — hasGrabUtensilInfo() checks for key existence
  // Also set on itemInfo if present
  const setFields: Record<string, null> = { 'rawPayload.needCutlery': null }
  if (rawPayload.itemInfo && typeof rawPayload.itemInfo === 'object' && !Array.isArray(rawPayload.itemInfo)) {
    setFields['rawPayload.itemInfo.needCutlery'] = null
  }

  await OrderModel.updateOne({ _id: order._id }, { $set: setFields })

  return NextResponse.json({
    ok: true,
    locked: true,
    wasAlreadyLocked: alreadyLocked,
    order: {
      internalShortId: order.shortId,
      externalOrderId: order.externalOrderId,
      source: order.source,
      status: order.status,
    },
  })
}
