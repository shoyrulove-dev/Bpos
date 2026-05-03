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

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    totalOrders,
    ordersToday,
    totalBrands,
    totalHubs,
    pendingOrders,
    allOrders,
  ] = await Promise.all([
    OrderModel.countDocuments(),
    OrderModel.countDocuments({ placedAt: { $gte: today } }),
    BrandModel.countDocuments({ status: 'active' }),
    HubModel.countDocuments({ status: 'active' }),
    OrderModel.countDocuments({ status: { $in: ['waiting_confirm', 'draft'] } }),
    OrderModel.find({ placedAt: { $gte: today } }).select('total discount platformFee').lean(),
  ])

  const revenueToday = allOrders.reduce((s, o) => s + (o.total || 0), 0)
  const totalRevenue = revenueToday // for now same day; extend as needed

  return ok({ totalOrders, ordersToday, totalBrands, totalHubs, pendingOrders, revenueToday, totalRevenue })
}
