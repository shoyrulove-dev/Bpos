import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import '@/models/Brand'
import '@/models/Hub'
import { ok, requireAuth } from '@/lib/api-helpers'
import { buildOrderFilterFromSearchParams } from '@/lib/order-query'
import { serializeOrderListResponse } from '@/lib/order-response'
import { repairVietnameseTextDeep } from '@/lib/text-normalizer'

const ORDER_LIST_RAW_SELECT = [
  'rawPayload.displayID',
  'rawPayload.shortOrderID',
  'rawPayload.shortOrderId',
  'rawPayload.bookingCode',
  'rawPayload.times',
  'rawPayload.customer',
  'rawPayload.receiver',
  'rawPayload.consumer',
  'rawPayload.eater',
  'rawPayload.delivery',
  'rawPayload.driver',
  'rawPayload.rider',
  'rawPayload.courier',
  'rawPayload.driverDetails',
  'rawPayload.driverInfo',
  'rawPayload.itemInfo',
  'rawPayload.voucherInfo',
  'rawPayload.orderLevelDiscounts',
  'rawPayload.fare',
  'rawPayload.price',
  'rawPayload.pricing',
  'rawPayload.financialBreakdown',
  'rawPayload.deliveryStatus',
  'rawPayload.deliveryTaskpoolStatus',
  'rawPayload.preparationTaskpoolStatus',
  'rawPayload.state',
  'rawPayload._pageType',
  'rawPayload._pageStage',
  'rawPayload._scraperFinalizedStatus',
  'rawPayload.customer_name',
  'rawPayload.receiver_name',
  'rawPayload.customer_phone',
  'rawPayload.customer_phone_no',
  'rawPayload.receiver_phone',
  'rawPayload.receiver_phone_no',
  'rawPayload.placedAt',
  'rawPayload.placed_at',
  'rawPayload.createdAt',
  'rawPayload.created_at',
  'rawPayload.deliveredAt',
  'rawPayload.delivered_at',
  'rawPayload.completedAt',
  'rawPayload.completed_at',
  'rawPayload.deliveryCompletedAt',
  'rawPayload.updatedAt',
  'rawPayload.updated_at',
  'rawPayload.delivered_time',
  'rawPayload.finished_at',
].join(' ')
const ORDER_LIST_SELECT = `shortId source externalOrderId brandId hubId channelId customerName customerPhone items.quantity total platformFee deliveryInfo.address deliveryInfo.estimatedTime driverInfo.name driverInfo.phone status placedAt deliveredAt ${ORDER_LIST_RAW_SELECT}`

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const requestedLimit = parseInt(searchParams.get('limit') || '10', 10) || 10
  const limit = Math.min(500, Math.max(1, requestedLimit))
  const filter = buildOrderFilterFromSearchParams(searchParams)
  const skip = (page - 1) * limit
  const [orderRows, total] = await Promise.all([
    OrderModel.find(filter)
      .select(ORDER_LIST_SELECT)
      .populate('brandId', 'name')
      .populate('hubId', 'name')
      .sort({ placedAt: -1 })
      .skip(skip).limit(limit).lean(),
    OrderModel.countDocuments(filter),
  ])

  const orders = orderRows.map((order) => serializeOrderListResponse(order as Record<string, unknown>, { includeRawPayload: true }))

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return ok({ orders, total, page, limit, totalPages })
}

export async function POST(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = repairVietnameseTextDeep(await req.json()) as Record<string, unknown>
  const shortId = `ORD-${Date.now().toString(36).toUpperCase()}`
  const order = await OrderModel.create({ ...body, shortId, placedAt: body.placedAt || new Date() })
  return ok(order, 201)
}
