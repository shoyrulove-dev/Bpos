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

  const orders = await OrderModel.find(filter).select('items').lean()

  // Aggregate by product
  const productMap: Record<string, { name: string; quantity: number; revenue: number }> = {}
  for (const order of orders) {
    for (const item of (order.items as { productId?: string; name: string; quantity: number; price: number; total: number }[]) || []) {
      const key = item.productId ? String(item.productId) : item.name
      if (!productMap[key]) {
        productMap[key] = { name: item.name, quantity: 0, revenue: 0 }
      }
      productMap[key].quantity += item.quantity || 0
      productMap[key].revenue += item.total || 0
    }
  }

  const rows = Object.entries(productMap)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 100)

  const summary = {
    totalProducts: rows.length,
    totalQuantity: rows.reduce((s, r) => s + r.quantity, 0),
    revenue: rows.reduce((s, r) => s + r.revenue, 0),
  }

  return ok({ rows, summary })
}
