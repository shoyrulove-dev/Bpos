import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import { ok, err, requireAuth } from '@/lib/api-helpers'

const ORDER_STATUS_KEYS = ['draft', 'pre_order', 'waiting_confirm', 'waiting_pickup', 'delivering', 'completed', 'cancelled'] as const

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const status = searchParams.get('status') || ''
  const source = searchParams.get('source') || ''
  const brandId = searchParams.get('brandId') || ''
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const requestedLimit = parseInt(searchParams.get('limit') || '10', 10) || 10
  const limit = Math.min(500, Math.max(1, requestedLimit))
  const filter: Record<string, unknown> = {}
  if (q) filter.$or = [
    { shortId: { $regex: q, $options: 'i' } },
    { customerName: { $regex: q, $options: 'i' } },
    { customerPhone: { $regex: q, $options: 'i' } },
  ]
  if (status) {
    const statuses = status.split(',').map(s => s.trim()).filter(Boolean)
    filter.status = statuses.length === 1 ? statuses[0] : { $in: statuses }
  }
  if (source) filter.source = source
  if (brandId) filter.brandId = brandId
  const countFilter = { ...filter }
  delete countFilter.status
  const skip = (page - 1) * limit
  const [orders, total, statusRows] = await Promise.all([
    OrderModel.find(filter)
      .populate('brandId', 'name')
      .populate('hubId', 'name')
      .sort({ placedAt: -1 })
      .skip(skip).limit(limit).lean(),
    OrderModel.countDocuments(filter),
    OrderModel.aggregate([
      { $match: countFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ])

  const statusCounts = ORDER_STATUS_KEYS.reduce((acc, key) => {
    acc[key] = 0
    return acc
  }, {} as Record<(typeof ORDER_STATUS_KEYS)[number], number>)

  statusRows.forEach((row) => {
    if (typeof row._id === 'string' && row._id in statusCounts) {
      statusCounts[row._id as keyof typeof statusCounts] = Number(row.count || 0)
    }
  })

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return ok({ orders, total, page, limit, totalPages, statusCounts })
}

export async function POST(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const shortId = `ORD-${Date.now().toString(36).toUpperCase()}`
  const order = await OrderModel.create({ ...body, shortId, placedAt: body.placedAt || new Date() })
  return ok(order, 201)
}
