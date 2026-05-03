import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import EInvoiceModel from '@/models/EInvoiceConnection'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const conn = await EInvoiceModel.findByIdAndUpdate(params.id, body, { new: true }).lean()
  if (!conn) return err('Không tìm thấy', 404)
  return ok(conn)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  await EInvoiceModel.findByIdAndDelete(params.id)
  return ok({ success: true })
}
