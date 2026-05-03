import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import HubModel from '@/models/Hub'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(_req)
  if (res) return res
  await connectDB()
  const hub = await HubModel.findById(params.id).populate('brandId', 'name').lean()
  if (!hub) return err('Không tìm thấy', 404)
  return ok(hub)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const hub = await HubModel.findByIdAndUpdate(params.id, body, { new: true, runValidators: true }).lean()
  if (!hub) return err('Không tìm thấy', 404)
  return ok(hub)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  await HubModel.findByIdAndDelete(params.id)
  return ok({ success: true })
}
