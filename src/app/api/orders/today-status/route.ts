import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import { ok, requireAuth } from '@/lib/api-helpers'

const ORDER_STATUS_KEYS = [
  'draft',
  'pre_order',
  'waiting_confirm',
  'waiting_pickup',
  'delivering',
  'completed',
  'cancelled',
] as const

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res

  await connectDB()

  const { searchParams } = new URL(req.url)
  const source = searchParams.get('source') || ''
  const brandId = searchParams.get('brandId') || ''

  const filter: Record<string, unknown> = {}
  if (source) filter.source = source
  if (brandId) filter.brandId = brandId

  const VN_OFFSET_MS = 7 * 60 * 60 * 1000
  const vnNowMs = Date.now() + VN_OFFSET_MS
  const vnDayStartMs = Math.floor(vnNowMs / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000)
  const todayStart = new Date(vnDayStartMs - VN_OFFSET_MS)
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)

  const rows = await OrderModel.aggregate([
    {
      $match: {
        ...filter,
        placedAt: { $gte: todayStart, $lt: tomorrowStart },
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ])

  const todayStatusCounts = Object.fromEntries(ORDER_STATUS_KEYS.map((status) => [status, 0])) as Record<string, number>
  for (const row of rows) {
    const key = String(row?._id ?? '')
    if (key) todayStatusCounts[key] = Number(row?.count ?? 0)
  }

  return ok({ todayStatusCounts })
}
