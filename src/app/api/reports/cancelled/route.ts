import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import { ok, requireAuth } from '@/lib/api-helpers'
import { resolveDateRange } from '@/lib/date-range'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const brandId = searchParams.get('brandId') || ''
  const { from, to } = resolveDateRange(searchParams, { defaultDays: 30 })

  const filter: Record<string, unknown> = {
    placedAt: {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    },
    status: 'cancelled',
  }
  if (brandId) filter.brandId = brandId

  const orders = await OrderModel.find(filter)
    .populate('brandId', 'name')
    .populate('channelId', 'name source')
    .select('shortId customerName source total discount cancelReason cancelledAt placedAt brandId channelId status')
    .sort({ cancelledAt: -1 })
    .lean()

  const rows = orders.map((o: Record<string, unknown>) => ({
    _id: o._id,
    shortId: o.shortId,
    customerName: o.customerName,
    source: o.source,
    brandName: (o.brandId as Record<string, unknown>)?.name ?? '',
    channelName: (o.channelId as Record<string, unknown>)?.name ?? '',
    total: o.total,
    cancelReason: o.cancelReason,
    cancelledAt: o.cancelledAt,
    placedAt: o.placedAt,
  }))

  // Group cancel reasons
  const reasonMap: Record<string, number> = {}
  for (const o of orders) {
    const r = (o.cancelReason as string) || 'Không rõ lý do'
    reasonMap[r] = (reasonMap[r] || 0) + 1
  }

  const summary = {
    totalCancelled: orders.length,
    totalLostRevenue: orders.reduce((s, o) => s + ((o.total as number) || 0), 0),
    reasons: Object.entries(reasonMap)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  }

  return ok({ rows, summary })
}
