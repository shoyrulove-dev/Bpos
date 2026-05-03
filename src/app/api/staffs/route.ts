import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { connectDB } from '@/lib/db'
import UserModel from '@/models/User'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const role = searchParams.get('role') || ''
  const filter: Record<string, unknown> = {}
  if (q) filter.$or = [
    { name: { $regex: q, $options: 'i' } },
    { email: { $regex: q, $options: 'i' } },
    { phone: { $regex: q, $options: 'i' } },
  ]
  if (role) filter.role = role
  const staffs = await UserModel.find(filter).sort({ createdAt: -1 }).lean()
  return ok(staffs)
}

export async function POST(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { name, email, phone, role, brandId, status, password } = body
  if (!name || !email) return err('Thiếu thông tin bắt buộc')
  const exists = await UserModel.findOne({ email }).lean()
  if (exists) return err('Email đã tồn tại')
  const hash = await bcrypt.hash(password || '123456', 10)
  const user = await UserModel.create({ name, email, phone, role: role || 'cashier', brandId, status: status || 'active', password: hash })
  const { password: _pw, ...safe } = user.toObject()
  return ok(safe, 201)
}
