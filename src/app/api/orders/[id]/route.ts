import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(_req)
  if (res) return res
  await connectDB()
  const order = await OrderModel.findById(params.id)
    .populate('brandId', 'name')
    .populate('hubId', 'name')
    .populate('channelId', 'name source')
    .lean()
  if (!order) return err('Không tìm thấy', 404)
  return ok(order)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const order = await OrderModel.findByIdAndUpdate(params.id, body, { new: true, runValidators: true }).lean()
  if (!order) return err('Không tìm thấy', 404)
  return ok(order)
}
