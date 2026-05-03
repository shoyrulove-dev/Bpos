import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { ok, err, requireAdmin } from '@/lib/api-helpers'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAdmin(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { credentials: _cred, ...safe } = body
  const intg = await IntegrationModel.findByIdAndUpdate(params.id, safe, { new: true }).lean()
  if (!intg) return err('Không tìm thấy', 404)
  return ok(intg)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAdmin(req)
  if (res) return res
  await connectDB()
  await IntegrationModel.findByIdAndDelete(params.id)
  return ok({ success: true })
}
