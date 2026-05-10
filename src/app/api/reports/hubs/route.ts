import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import HubModel from '@/models/Hub'
import { ok, requireAuth } from '@/lib/api-helpers'
import { resolveDateRange } from '@/lib/date-range'
import { getActualReceived } from '@/lib/order-financials'
import type { Order } from '@/types'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const brandId = searchParams.get('brandId') || ''
  const { from, to } = resolveDateRange(searchParams, { defaultDays: 30 })

  const hubFilter: Record<string, unknown> = {}
  if (brandId) hubFilter.brandId = brandId
  const hubs = await HubModel.find(hubFilter).lean()

  const orderFilter: Record<string, unknown> = {
    placedAt: {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    },
    status: { $ne: 'cancelled' },
  }
  if (brandId) orderFilter.brandId = brandId
  const orders = await OrderModel.find(orderFilter).select('hubId source total discount platformFee rawPayload status').lean()

  const rows = hubs.map(h => {
    const hOrders = orders.filter(o => String(o.hubId) === String(h._id))
    const revenue = hOrders.reduce((s, o) => s + (o.total || 0), 0)
    const discount = hOrders.reduce((s, o) => s + (o.discount || 0), 0)
    const platformFee = hOrders.reduce((s, o) => s + (o.platformFee || 0), 0)
    const netRevenue = hOrders.reduce((s, o) => s + getActualReceived(o as unknown as Order), 0)
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
      netRevenue,
    }
  }).sort((a, b) => b.revenue - a.revenue)

  const summary = {
    totalHubs: hubs.length,
    totalOrders: orders.length,
    revenue: orders.reduce((s, o) => s + (o.total || 0), 0),
    totalRevenue: orders.reduce((s, o) => s + (o.total || 0), 0),
    totalDiscount: orders.reduce((s, o) => s + (o.discount || 0), 0),
    totalPlatformFee: orders.reduce((s, o) => s + (o.platformFee || 0), 0),
    totalNetRevenue: orders.reduce((s, o) => s + getActualReceived(o as unknown as Order), 0),
  }

  return ok({ rows, summary })
}
