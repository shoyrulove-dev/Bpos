import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import TableModel from '@/models/Table'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(_req)
  if (res) return res
  await connectDB()
  const t = await TableModel.findById(params.id).lean()
  if (!t) return err('Không tìm thấy', 404)
  return ok(t)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const t = await TableModel.findByIdAndUpdate(params.id, body, { new: true, runValidators: true }).lean()
  if (!t) return err('Không tìm thấy', 404)
  return ok(t)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  await TableModel.findByIdAndDelete(params.id)
  return ok({ success: true })
}
