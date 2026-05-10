import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import BrandModel from '@/models/Brand'
import { ok, requireAuth } from '@/lib/api-helpers'
import { resolveDateRange } from '@/lib/date-range'
import { getActualReceived } from '@/lib/order-financials'
import type { Order } from '@/types'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const { from, to } = resolveDateRange(searchParams, { defaultDays: 30 })

  const brands = await BrandModel.find().lean()

  const orders = await OrderModel.find({
    placedAt: {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    },
    status: { $ne: 'cancelled' },
  }).select('brandId source total discount platformFee rawPayload status').lean()

  const rows = brands.map(b => {
    const bOrders = orders.filter(o => String(o.brandId) === String(b._id))
    const revenue = bOrders.reduce((s, o) => s + (o.total || 0), 0)
    const discount = bOrders.reduce((s, o) => s + (o.discount || 0), 0)
    const platformFee = bOrders.reduce((s, o) => s + (o.platformFee || 0), 0)
    const netRevenue = bOrders.reduce((s, o) => s + getActualReceived(o as unknown as Order), 0)
    return {
      _id: b._id,
      name: b.name,
      type: b.type,
      status: b.status,
      orderCount: bOrders.length,
      revenue,
      discount,
      platformFee,
      netRevenue,
    }
  }).sort((a, b) => b.revenue - a.revenue)

  const summary = {
    totalBrands: brands.length,
    totalOrders: orders.length,
    revenue: orders.reduce((s, o) => s + (o.total || 0), 0),
    totalRevenue: orders.reduce((s, o) => s + (o.total || 0), 0),
    totalDiscount: orders.reduce((s, o) => s + (o.discount || 0), 0),
    totalPlatformFee: orders.reduce((s, o) => s + (o.platformFee || 0), 0),
    totalNetRevenue: orders.reduce((s, o) => s + getActualReceived(o as unknown as Order), 0),
  }

  return ok({ rows, summary })
}
