import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import ShiftModel from '@/models/Shift'
import OrderModel from '@/models/Order'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(_req)
  if (res) return res
  await connectDB()
  const shift = await ShiftModel.findById(params.id)
    .populate('hubId', 'name code')
    .populate('brandId', 'name')
    .populate('openedById', 'name')
    .populate('closedById', 'name')
    .lean()
  if (!shift) return err('Không tìm thấy ca', 404)
  return ok(shift)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { res, token } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const shiftDoc = await ShiftModel.findById(params.id).lean()
  if (!shiftDoc) return err('Không tìm thấy ca', 404)
  const shift = shiftDoc as Record<string, unknown>

  // Close shift: calculate stats from orders in this period
  if (body.action === 'close') {
    const { closeCash, note } = body
    const orders = await OrderModel.find({
      hubId: shift.hubId,
      placedAt: { $gte: shift.openedAt },
      status: { $ne: 'cancelled' },
    }).select('total discount platformFee').lean()

    const revenue = orders.reduce((s, o) => s + (o.total || 0), 0)
    const discount = orders.reduce((s, o) => s + (o.discount || 0), 0)
    const platformFee = orders.reduce((s, o) => s + (o.platformFee || 0), 0)

    const updated = await ShiftModel.findByIdAndUpdate(
      params.id,
      {
        status: 'closed',
        closedAt: new Date(),
        closedById: (token as { id: string }).id,
        closeCash: closeCash ?? 0,
        note: note ?? shift.note,
        orderCount: orders.length,
        revenue,
        discount,
        platformFee,
      },
      { new: true }
    )
      .populate('hubId', 'name code')
      .populate('brandId', 'name')
      .populate('openedById', 'name')
      .populate('closedById', 'name')
      .lean()

    return ok(updated)
  }

  // Generic update
  const updated = await ShiftModel.findByIdAndUpdate(params.id, body, { new: true }).lean()
  return ok(updated)
}
