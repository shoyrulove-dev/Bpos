import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import BrandModel from '@/models/Brand'
import { ok, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const days = parseInt(searchParams.get('days') || '30')
  const from = new Date()
  from.setDate(from.getDate() - days)
  from.setHours(0, 0, 0, 0)

  const brands = await BrandModel.find().lean()

  const orders = await OrderModel.find({
    placedAt: { $gte: from },
    status: { $ne: 'cancelled' },
  }).select('brandId total discount platformFee status').lean()

  const rows = brands.map(b => {
    const bOrders = orders.filter(o => String(o.brandId) === String(b._id))
    const revenue = bOrders.reduce((s, o) => s + (o.total || 0), 0)
    const discount = bOrders.reduce((s, o) => s + (o.discount || 0), 0)
    const platformFee = bOrders.reduce((s, o) => s + (o.platformFee || 0), 0)
    return {
      _id: b._id,
      name: b.name,
      type: b.type,
      status: b.status,
      orderCount: bOrders.length,
      revenue,
      discount,
      platformFee,
      netRevenue: revenue - discount - platformFee,
    }
  }).sort((a, b) => b.revenue - a.revenue)

  const summary = {
    totalBrands: brands.length,
    totalOrders: orders.length,
    revenue: orders.reduce((s, o) => s + (o.total || 0), 0),
  }

  return ok({ rows, summary })
}
