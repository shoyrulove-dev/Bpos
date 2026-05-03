import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import CustomerModel from '@/models/Customer'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(_req)
  if (res) return res
  await connectDB()
  const c = await CustomerModel.findById(params.id).lean()
  if (!c) return err('Không tìm thấy', 404)
  return ok(c)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  // Recalculate tier based on totalSpend
  if (body.totalSpend !== undefined) {
    const spend = body.totalSpend
    if (spend >= 10_000_000) body.tier = 'platinum'
    else if (spend >= 5_000_000) body.tier = 'gold'
    else if (spend >= 1_000_000) body.tier = 'silver'
    else body.tier = 'bronze'
  }
  const c = await CustomerModel.findByIdAndUpdate(params.id, body, { new: true, runValidators: true }).lean()
  if (!c) return err('Không tìm thấy', 404)
  return ok(c)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  await CustomerModel.findByIdAndDelete(params.id)
  return ok({ success: true })
}
