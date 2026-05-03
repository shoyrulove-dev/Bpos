import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import { ok, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const days = parseInt(searchParams.get('days') || '30')
  const brandId = searchParams.get('brandId') || ''
  const hubId = searchParams.get('hubId') || ''
  const from = new Date()
  from.setDate(from.getDate() - days)
  from.setHours(0, 0, 0, 0)

  const filter: Record<string, unknown> = {
    placedAt: { $gte: from },
    status: { $ne: 'cancelled' },
  }
  if (brandId) filter.brandId = brandId
  if (hubId) filter.hubId = hubId

  const orders = await OrderModel.find(filter)
    .populate('brandId', 'name')
    .populate('channelId', 'name source')
    .select('shortId customerName customerPhone source total discount platformFee subtotal status placedAt channelId brandId')
    .sort({ placedAt: -1 })
    .lean()

  const rows = orders.map((o: Record<string, unknown>) => ({
    _id: o._id,
    shortId: o.shortId,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    source: o.source,
    brandName: (o.brandId as Record<string, unknown>)?.name ?? '',
    channelName: (o.channelId as Record<string, unknown>)?.name ?? '',
    subtotal: o.subtotal ?? 0,
    discount: o.discount ?? 0,
    platformFee: o.platformFee ?? 0,
    total: o.total ?? 0,
    status: o.status,
    placedAt: o.placedAt,
  }))

  const summary = {
    totalOrders: orders.length,
    revenue: orders.reduce((s, o) => s + ((o.total as number) || 0), 0),
    discount: orders.reduce((s, o) => s + ((o.discount as number) || 0), 0),
    platformFee: orders.reduce((s, o) => s + ((o.platformFee as number) || 0), 0),
  }

  return ok({ rows, summary })
}
