import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import ShiftModel from '@/models/Shift'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res, token } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const brandId = searchParams.get('brandId') || ''
  const hubId = searchParams.get('hubId') || ''
  const status = searchParams.get('status') || ''
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')

  const filter: Record<string, unknown> = {}
  if (brandId) filter.brandId = brandId
  if (hubId) filter.hubId = hubId
  if (status) filter.status = status

  const [shifts, total] = await Promise.all([
    ShiftModel.find(filter)
      .populate('hubId', 'name code')
      .populate('brandId', 'name')
      .populate('openedById', 'name')
      .populate('closedById', 'name')
      .sort({ openedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ShiftModel.countDocuments(filter),
  ])

  void token

  return ok({ shifts, total, page, limit })
}

export async function POST(req: NextRequest) {
  const { res, token } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { hubId, brandId, openCash, note } = body
  if (!hubId || !brandId) return err('Thiếu thông tin điểm bán')

  // Check if there's already an open shift for this hub
  const existing = await ShiftModel.findOne({ hubId, status: 'open' }).lean()
  if (existing) return err('Điểm bán này đang có ca mở. Vui lòng đóng ca trước.')

  const shift = await ShiftModel.create({
    hubId,
    brandId,
    openedById: (token as { id: string }).id,
    openedAt: new Date(),
    openCash: openCash || 0,
    note,
    status: 'open',
  })

  const populated = await ShiftModel.findById(shift._id)
    .populate('hubId', 'name code')
    .populate('brandId', 'name')
    .populate('openedById', 'name')
    .lean()

  return ok(populated, 201)
}
