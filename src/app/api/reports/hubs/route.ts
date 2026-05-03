import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import HubModel from '@/models/Hub'
import { ok, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const days = parseInt(searchParams.get('days') || '30')
  const brandId = searchParams.get('brandId') || ''
  const from = new Date()
  from.setDate(from.getDate() - days)
  from.setHours(0, 0, 0, 0)

  const hubFilter: Record<string, unknown> = {}
  if (brandId) hubFilter.brandId = brandId
  const hubs = await HubModel.find(hubFilter).lean()

  const orderFilter: Record<string, unknown> = {
    placedAt: { $gte: from },
    status: { $ne: 'cancelled' },
  }
  if (brandId) orderFilter.brandId = brandId
  const orders = await OrderModel.find(orderFilter).select('hubId total discount platformFee status').lean()

  const rows = hubs.map(h => {
    const hOrders = orders.filter(o => String(o.hubId) === String(h._id))
    const revenue = hOrders.reduce((s, o) => s + (o.total || 0), 0)
    const discount = hOrders.reduce((s, o) => s + (o.discount || 0), 0)
    const platformFee = hOrders.reduce((s, o) => s + (o.platformFee || 0), 0)
    return {
      _id: h._id,
      code: h.code,
      name: h.name,
      address: h.address,
      servicePackage: h.servicePackage,
      status: h.status,
      orderCount: hOrders.length,
      revenue,
      discount,
      platformFee,
      netRevenue: revenue - discount - platformFee,
    }
  }).sort((a, b) => b.revenue - a.revenue)

  const summary = {
    totalHubs: hubs.length,
    totalOrders: orders.length,
    revenue: orders.reduce((s, o) => s + (o.total || 0), 0),
  }

  return ok({ rows, summary })
}
