import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import BrandModel from '@/models/Brand'
import HubModel from '@/models/Hub'
import { ok, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()

  // Use Vietnam timezone (UTC+7) for day boundaries
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000
  const vnNowMs = Date.now() + VN_OFFSET_MS
  const vnDayStartMs = Math.floor(vnNowMs / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000)
  const todayStart = new Date(vnDayStartMs - VN_OFFSET_MS)

  const [
    totalOrders,
    ordersToday,
    totalBrands,
    totalHubs,
    pendingOrders,
    allOrders,
  ] = await Promise.all([
    OrderModel.countDocuments(),
    OrderModel.countDocuments({ placedAt: { $gte: todayStart }, status: { $ne: 'cancelled' } }),
    BrandModel.countDocuments({ status: 'active' }),
    HubModel.countDocuments({ status: 'active' }),
    OrderModel.countDocuments({ status: { $in: ['waiting_confirm', 'draft'] } }),
    OrderModel.find({ placedAt: { $gte: todayStart }, status: { $ne: 'cancelled' } }).select('total discount platformFee').lean(),
  ])

  const revenueToday = allOrders.reduce((s, o) => s + (o.total || 0), 0)
  const totalRevenue = revenueToday // for now same day; extend as needed

  return ok({ totalOrders, ordersToday, totalBrands, totalHubs, pendingOrders, revenueToday, totalRevenue })
}
