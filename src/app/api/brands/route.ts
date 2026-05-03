import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import BrandModel from '@/models/Brand'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const type = searchParams.get('type') || ''
  const filter: Record<string, unknown> = {}
  if (q) filter.$or = [
    { name: { $regex: q, $options: 'i' } },
    { phone: { $regex: q, $options: 'i' } },
  ]
  if (type) filter.type = type
  const brands = await BrandModel.find(filter).sort({ createdAt: -1 }).lean()
  return ok(brands)
}

export async function POST(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { name, phone, type, address, note, logo, status } = body
  if (!name || !phone || !address) return err('Thiếu thông tin bắt buộc')
  const brand = await BrandModel.create({ name, phone, type: type || 'fnb', address, note, logo, status: status || 'active' })
  return ok(brand, 201)
}
