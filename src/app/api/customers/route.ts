import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import CustomerModel from '@/models/Customer'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const tier = searchParams.get('tier') || ''
  const brandId = searchParams.get('brandId') || ''
  const filter: Record<string, unknown> = {}
  if (q) filter.$or = [
    { name: { $regex: q, $options: 'i' } },
    { phone: { $regex: q, $options: 'i' } },
    { email: { $regex: q, $options: 'i' } },
  ]
  if (tier) filter.tier = tier
  if (brandId) filter.brandId = brandId
  const customers = await CustomerModel.find(filter).sort({ totalSpend: -1 }).lean()
  return ok(customers)
}

export async function POST(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { phone, name, email, brandId, note, points } = body
  if (!phone || !name || !brandId) return err('Thiếu thông tin bắt buộc')
  const exists = await CustomerModel.findOne({ phone, brandId }).lean()
  if (exists) return err('Số điện thoại đã tồn tại')
  const customer = await CustomerModel.create({ phone, name, email, brandId, note, points: points ?? 0 })
  return ok(customer, 201)
}
