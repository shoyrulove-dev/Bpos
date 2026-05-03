import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const status = searchParams.get('status') || ''
  const source = searchParams.get('source') || ''
  const brandId = searchParams.get('brandId') || ''
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const filter: Record<string, unknown> = {}
  if (q) filter.$or = [
    { shortId: { $regex: q, $options: 'i' } },
    { customerName: { $regex: q, $options: 'i' } },
    { customerPhone: { $regex: q, $options: 'i' } },
  ]
  if (status) filter.status = status
  if (source) filter.source = source
  if (brandId) filter.brandId = brandId
  const skip = (page - 1) * limit
  const [orders, total] = await Promise.all([
    OrderModel.find(filter)
      .populate('brandId', 'name')
      .populate('hubId', 'name')
      .sort({ placedAt: -1 })
      .skip(skip).limit(limit).lean(),
    OrderModel.countDocuments(filter),
  ])
  return ok({ orders, total, page, limit })
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
