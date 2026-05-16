import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import BillTemplateModel from '@/models/BillTemplate'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(_req)
  if (res) return res
  await connectDB()
  const t = await BillTemplateModel.findById(params.id).lean()
  if (!t) return err('Không tìm thấy', 404)
  return ok(t)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json() as Record<string, unknown>
  // Strip empty brandId to avoid ObjectId CastError; use $unset if explicitly cleared
  const { brandId, ...rest } = body
  const updateDoc: Record<string, unknown> = brandId ? { $set: { ...rest, brandId } } : { $set: rest, $unset: { brandId: '' } }
  try {
    const t = await BillTemplateModel.findByIdAndUpdate(params.id, updateDoc, { new: true, runValidators: true }).lean()
    if (!t) return err('Không tìm thấy', 404)
    return ok(t)
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Lỗi cập nhật mẫu in', 500)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  await BillTemplateModel.findByIdAndDelete(params.id)
  return ok({ success: true })
}
