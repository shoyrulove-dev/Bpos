import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import BrandModel from '@/models/Brand'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(_req)
  if (res) return res
  await connectDB()
  const brand = await BrandModel.findById(params.id).lean()
  if (!brand) return err('Không tìm thấy', 404)
  return ok(brand)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const brand = await BrandModel.findByIdAndUpdate(params.id, body, { new: true, runValidators: true }).lean()
  if (!brand) return err('Không tìm thấy', 404)
  return ok(brand)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  await BrandModel.findByIdAndDelete(params.id)
  return ok({ success: true })
}
