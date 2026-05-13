/**
 * POST /api/cron/backfill-payment
 *
 * One-time backfill: re-extract paymentMethod from stored rawPayload for all
 * Grab + Be orders placed in the last N days (default: 30).
 *
 * Grab: re-reads raw.paymentType (preferred) → raw.paymentMethod → '' (no wrong fallback)
 * Be:   re-reads raw.payment_method → raw.paymentType → ''
 *
 * Auth: Bearer <CRON_SECRET>
 */
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'

const CRON_SECRET = process.env.CRON_SECRET

function getRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

/** Re-extract paymentMethod from Grab raw payload (no wrong fallbacks) */
function resolveGrabPaymentMethod(rawPayload?: Record<string, unknown>): string | undefined {
  const raw = getRecord(rawPayload)
  if (!raw) return undefined
  const v = String(raw.paymentType ?? raw.paymentMethod ?? '').trim()
  if (!v || v === 'delivery' || v === 'pickup') return undefined   // discard wrong fallbacks
  return v
}

/** Re-extract paymentMethod from Be raw payload */
function resolveBePaymentMethod(rawPayload?: Record<string, unknown>): string | undefined {
  const raw = getRecord(rawPayload)
  if (!raw) return undefined
  const v = String(raw.payment_method ?? raw.paymentType ?? raw.paymentMethod ?? '').trim()
  return v || undefined
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const days = Math.min(Number(body?.days ?? 30), 90)

  await connectDB()

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // Load all Grab + Be orders from the last N days
  const orders = (await OrderModel.find({
    source: { $in: ['grab', 'be'] },
    placedAt: { $gte: cutoff },
  })
    .select('externalOrderId source paymentMethod rawPayload')
    .lean()) as unknown as {
      _id: unknown
      externalOrderId?: string
      source: string
      paymentMethod?: string
      rawPayload?: Record<string, unknown>
    }[]

  let updated = 0
  let skipped = 0
  const errors: string[] = []

  const BATCH = 50
  for (let i = 0; i < orders.length; i += BATCH) {
    const batch = orders.slice(i, i + BATCH)
    const writes = batch
      .map((order) => {
        const newPM = order.source === 'grab'
          ? resolveGrabPaymentMethod(order.rawPayload)
          : resolveBePaymentMethod(order.rawPayload)

        // Nothing better to set
        if (!newPM) { skipped++; return null }
        // Already correct
        if (order.paymentMethod === newPM) { skipped++; return null }

        return {
          updateOne: {
            filter: { _id: order._id },
            update: { $set: { paymentMethod: newPM } },
          },
        }
      })
      .filter((w): w is NonNullable<typeof w> => w !== null)

    if (writes.length > 0) {
      try {
        const res = await OrderModel.bulkWrite(writes, { ordered: false })
        updated += res.modifiedCount
      } catch (err) {
        errors.push(String((err as Error).message ?? err).slice(0, 120))
      }
    }
  }

  return NextResponse.json({
    ok: true,
    days,
    total: orders.length,
    updated,
    skipped,
    errors: errors.slice(0, 10),
  })
}
