import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import PromotionModel from '@/models/Promotion'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(_req)
  if (res) return res
  await connectDB()
  const promo = await PromotionModel.findById(params.id).lean()
  if (!promo) return err('Không tìm thấy', 404)
  return ok(promo)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const promo = await PromotionModel.findByIdAndUpdate(params.id, body, { new: true, runValidators: true }).lean()
  if (!promo) return err('Không tìm thấy', 404)
  return ok(promo)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  await PromotionModel.findByIdAndDelete(params.id)
  return ok({ success: true })
}
