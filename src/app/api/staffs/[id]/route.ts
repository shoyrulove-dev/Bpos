import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import UserModel from '@/models/User'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(_req)
  if (res) return res
  await connectDB()
  const user = await UserModel.findById(params.id).lean()
  if (!user) return err('Không tìm thấy', 404)
  return ok(user)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { password: _pw, ...safe } = body
  const user = await UserModel.findByIdAndUpdate(params.id, safe, { new: true, runValidators: true }).lean()
  if (!user) return err('Không tìm thấy', 404)
  return ok(user)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  await UserModel.findByIdAndDelete(params.id)
  return ok({ success: true })
}
