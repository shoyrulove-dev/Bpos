import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import ChannelModel from '@/models/Channel'
import { ok, err, requireAuth, requireAdmin } from '@/lib/api-helpers'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(_req)
  if (res) return res
  await connectDB()
  const ch = await ChannelModel.findById(params.id)
    .populate('brandId', 'name')
    .populate('hubId', 'name')
    .lean()
  if (!ch) return err('Không tìm thấy', 404)
  return ok(ch)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const ch = await ChannelModel.findByIdAndUpdate(params.id, body, { new: true, runValidators: true }).lean()
  if (!ch) return err('Không tìm thấy', 404)
  return ok(ch)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAdmin(req)
  if (res) return res
  await connectDB()
  await ChannelModel.findByIdAndDelete(params.id)
  return ok({ success: true })
}
