import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'

const CRON_SECRET = process.env.CRON_SECRET
const ACTIVE_STATUSES = ['waiting_confirm', 'waiting_pickup', 'delivering']

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secretParam = req.nextUrl.searchParams.get('secret')

  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const storeId = (req.nextUrl.searchParams.get('storeId') ?? '').trim()
  const hours = Math.max(1, Math.min(24, Number(req.nextUrl.searchParams.get('hours') ?? 8) || 8))
  const limit = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get('limit') ?? 25) || 25))

  await connectDB()

  const activeAfter = new Date(Date.now() - (hours * 60 * 60 * 1000))
  const query: Record<string, unknown> = {
    source: 'grab',
    status: { $in: ACTIVE_STATUSES },
    externalOrderId: { $exists: true, $ne: '' },
    $or: [
      { updatedAt: { $gte: activeAfter } },
      { placedAt: { $gte: activeAfter } },
    ],
  }

  if (storeId) {
    query.$or = [
      { externalStoreId: storeId },
      { 'rawPayload.merchant.ID': storeId },
      { 'rawPayload.merchantId': storeId },
      { 'rawPayload.merchantID': storeId },
    ]
  }

  const orders = await OrderModel.find(query)
    .sort({ placedAt: -1, updatedAt: -1 })
    .limit(limit)
    .select('shortId externalOrderId externalStoreId status placedAt updatedAt rawPayload')
    .lean<Array<Record<string, unknown>>>()

  const items = orders.map((order) => {
    const raw = (order.rawPayload && typeof order.rawPayload === 'object' && !Array.isArray(order.rawPayload))
      ? order.rawPayload as Record<string, unknown>
      : {}
    const merchant = (raw.merchant && typeof raw.merchant === 'object' && !Array.isArray(raw.merchant))
      ? raw.merchant as Record<string, unknown>
      : {}
    const times = (raw.times && typeof raw.times === 'object' && !Array.isArray(raw.times))
      ? raw.times as Record<string, unknown>
      : {}

    return {
      shortId: String(order.shortId ?? ''),
      externalOrderId: String(order.externalOrderId ?? ''),
      externalStoreId: String(order.externalStoreId ?? merchant.ID ?? raw.merchantID ?? raw.merchantId ?? ''),
      displayId: String(raw.displayID ?? raw.displayId ?? ''),
      bookingCode: String(raw.bookingCode ?? ''),
      status: String(order.status ?? ''),
      placedAt: order.placedAt ?? null,
      updatedAt: order.updatedAt ?? null,
      pageType: String(raw._pageType ?? ''),
      pageStage: String(raw._pageStage ?? ''),
      hasCompletionEvidence: Boolean(
        times.completedAt || times.deliveredAt || raw.completedAt || raw.deliveredAt
      ),
    }
  })

  return NextResponse.json({
    ok: true,
    storeId,
    hours,
    limit,
    count: items.length,
    items,
  })
}
