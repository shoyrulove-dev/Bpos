import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import ChannelModel from '@/models/Channel'
import { ok, requireAuth } from '@/lib/api-helpers'
import { resolveDateRange } from '@/lib/date-range'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const brandId = searchParams.get('brandId') || ''
  const { from, to } = resolveDateRange(searchParams, { defaultDays: 30 })

  const channelFilter: Record<string, unknown> = {}
  if (brandId) channelFilter.brandId = brandId
  const channels = await ChannelModel.find(channelFilter).lean()

  const orderFilter: Record<string, unknown> = {
    placedAt: {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    },
    status: { $ne: 'cancelled' },
  }
  if (brandId) orderFilter.brandId = brandId
  const orders = await OrderModel.find(orderFilter).select('channelId source total discount platformFee status').lean()

  const rows = channels.map(ch => {
    const chOrders = orders.filter(o => String(o.channelId) === String(ch._id))
    const revenue = chOrders.reduce((s, o) => s + (o.total || 0), 0)
    const discount = chOrders.reduce((s, o) => s + (o.discount || 0), 0)
    const platformFee = chOrders.reduce((s, o) => s + (o.platformFee || 0), 0)
    return {
      _id: ch._id,
      name: ch.name,
      source: ch.source,
      status: ch.status,
      orderCount: chOrders.length,
      revenue,
      discount,
      platformFee,
      netRevenue: revenue - discount - platformFee,
    }
  }).sort((a, b) => b.revenue - a.revenue)

  const summary = {
    totalChannels: channels.length,
    totalOrders: orders.length,
    revenue: orders.reduce((s, o) => s + (o.total || 0), 0),
    totalRevenue: orders.reduce((s, o) => s + (o.total || 0), 0),
    totalPlatformFee: orders.reduce((s, o) => s + (o.platformFee || 0), 0),
  }

  return ok({ rows, summary })
}
