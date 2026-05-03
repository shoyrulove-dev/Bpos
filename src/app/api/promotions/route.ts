import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import PromotionModel from '@/models/Promotion'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const brandId = searchParams.get('brandId') || ''
  const status = searchParams.get('status') || ''
  const filter: Record<string, unknown> = {}
  if (brandId) filter.brandId = brandId
  if (status) filter.status = status
  const promos = await PromotionModel.find(filter).populate('brandId', 'name').sort({ createdAt: -1 }).lean()
  return ok(promos)
}

export async function POST(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { name, type, brandId, startAt, endAt, quantity } = body
  if (!name || !type || !brandId || !startAt || !endAt) return err('Thiếu thông tin bắt buộc')
  const now = new Date()
  const start = new Date(startAt)
  const autoStatus = start > now ? 'upcoming' : 'active'
  const promo = await PromotionModel.create({ name, type, brandId, startAt, endAt, quantity, status: autoStatus })
  return ok(promo, 201)
}
