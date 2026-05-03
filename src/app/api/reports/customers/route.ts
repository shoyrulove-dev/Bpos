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

  const filter: Record<string, unknown> = {
    placedAt: { $gte: from },
    status: { $ne: 'cancelled' },
  }
  if (brandId) filter.brandId = brandId

  const orders = await OrderModel.find(filter)
    .select('customerName customerPhone total discount platformFee placedAt source')
    .lean()

  // Aggregate by customer phone
  const customerMap: Record<string, {
    name: string; phone: string; orderCount: number; revenue: number; lastOrderAt: string; source: string
  }> = {}

  for (const order of orders) {
    const key = (order.customerPhone as string) || (order.customerName as string)
    if (!customerMap[key]) {
      customerMap[key] = {
        name: order.customerName as string,
        phone: (order.customerPhone as string) || '',
        orderCount: 0,
        revenue: 0,
        lastOrderAt: order.placedAt as unknown as string,
        source: order.source as string,
      }
    }
    customerMap[key].orderCount++
    customerMap[key].revenue += (order.total as number) || 0
    if (new Date(order.placedAt as Date) > new Date(customerMap[key].lastOrderAt)) {
      customerMap[key].lastOrderAt = order.placedAt as unknown as string
    }
  }

  const rows = Object.values(customerMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 100)

  const summary = {
    totalCustomers: rows.length,
    totalOrders: orders.length,
    revenue: orders.reduce((s, o) => s + ((o.total as number) || 0), 0),
    avgOrderValue: orders.length ? Math.round(orders.reduce((s, o) => s + ((o.total as number) || 0), 0) / orders.length) : 0,
  }

  return ok({ rows, summary })
}
