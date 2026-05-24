import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import '@/models/Brand'
import '@/models/Hub'
import { ok, requireAuth } from '@/lib/api-helpers'
import { buildOrderFilterFromSearchParams } from '@/lib/order-query'
import { serializeOrderResponse } from '@/lib/order-response'

const ORDER_STATUS_KEYS = ['draft', 'pre_order', 'waiting_confirm', 'waiting_pickup', 'delivering', 'completed', 'cancelled'] as const
const ORDER_LIST_SELECT = 'shortId source externalOrderId brandId hubId channelId customerName customerPhone items.name items.quantity discount subtotal total platformFee paymentMethod deliveryInfo driverInfo note status placedAt deliveredAt createdAt updatedAt rawPayload'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const requestedLimit = parseInt(searchParams.get('limit') || '10', 10) || 10
  const limit = Math.min(500, Math.max(1, requestedLimit))
  const filter = buildOrderFilterFromSearchParams(searchParams)
  const countFilter = { ...filter }
  delete countFilter.status
  // Use Vietnam timezone (UTC+7) for day boundaries
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000
  const vnNowMs = Date.now() + VN_OFFSET_MS
  const vnDayStartMs = Math.floor(vnNowMs / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000)
  const todayStart = new Date(vnDayStartMs - VN_OFFSET_MS)
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  const todayStatusFilter = {
    ...(searchParams.get('source') ? { source: searchParams.get('source') as string } : {}),
    ...(searchParams.get('brandId') ? { brandId: searchParams.get('brandId') as string } : {}),
    placedAt: { $gte: todayStart, $lt: tomorrowStart },
  }
  const skip = (page - 1) * limit
  const [orderRows, total, statusRows, todayStatusRows] = await Promise.all([
    OrderModel.find(filter)
      .select(ORDER_LIST_SELECT)
      .populate('brandId', 'name')
      .populate('hubId', 'name')
      .sort({ placedAt: -1 })
      .skip(skip).limit(limit).lean(),
    OrderModel.countDocuments(filter),
    OrderModel.aggregate([
      { $match: countFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    OrderModel.aggregate([
      { $match: todayStatusFilter },
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

  const todayStatusCounts = ORDER_STATUS_KEYS.reduce((acc, key) => {
    acc[key] = 0
    return acc
  }, {} as Record<(typeof ORDER_STATUS_KEYS)[number], number>)

  todayStatusRows.forEach((row) => {
    if (typeof row._id === 'string' && row._id in todayStatusCounts) {
      todayStatusCounts[row._id as keyof typeof todayStatusCounts] = Number(row.count || 0)
    }
  })

  const orders = orderRows.map((order) => serializeOrderResponse(order as Record<string, unknown>))

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return ok({ orders, total, page, limit, totalPages, statusCounts, todayStatusCounts })
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
