import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import MenuModel from '@/models/Menu'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(_req)
  if (res) return res
  await connectDB()
  const menu = await MenuModel.findById(params.id).populate('brandId', 'name').lean()
  if (!menu) return err('Không tìm thấy', 404)
  return ok(menu)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const menu = await MenuModel.findByIdAndUpdate(params.id, body, { new: true, runValidators: true }).lean()
  if (!menu) return err('Không tìm thấy', 404)
  return ok(menu)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  await MenuModel.findByIdAndDelete(params.id)
  return ok({ success: true })
}
