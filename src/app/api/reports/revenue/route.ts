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
  const from = new Date()
  from.setDate(from.getDate() - days)
  from.setHours(0, 0, 0, 0)
  const filter: Record<string, unknown> = { placedAt: { $gte: from }, status: { $ne: 'cancelled' } }
  if (brandId) filter.brandId = brandId

  const orders = await OrderModel.find(filter).select('placedAt total discount platformFee source').lean()

  // Group by date
  const byDate: Record<string, { date: string; orders: number; revenue: number; discount: number; platformFee: number }> = {}
  orders.forEach(o => {
    const d = new Date(o.placedAt).toISOString().slice(0, 10)
    if (!byDate[d]) byDate[d] = { date: d, orders: 0, revenue: 0, discount: 0, platformFee: 0 }
    byDate[d].orders++
    byDate[d].revenue += o.total || 0
    byDate[d].discount += o.discount || 0
    byDate[d].platformFee += o.platformFee || 0
  })

  const data = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
  const summary = {
    totalOrders: orders.length,
    revenue: orders.reduce((s, o) => s + (o.total || 0), 0),
    discount: orders.reduce((s, o) => s + (o.discount || 0), 0),
    platformFee: orders.reduce((s, o) => s + (o.platformFee || 0), 0),
  }
  return ok({ data, summary })
}
