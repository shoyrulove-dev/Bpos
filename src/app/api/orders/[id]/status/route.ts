import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import { ok, err, requireAuth } from '@/lib/api-helpers'

const VALID_STATUSES = new Set([
  'draft',
  'pre_order',
  'waiting_confirm',
  'waiting_pickup',
  'delivering',
  'completed',
  'cancelled',
])

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res

  let body: { status?: string }
  try {
    body = await req.json()
  } catch {
    return err('Invalid JSON', 400)
  }

  const { status } = body
  if (!status || !VALID_STATUSES.has(status)) {
    return err('Trạng thái không hợp lệ', 400)
  }

  await connectDB()

  const order = await OrderModel.findByIdAndUpdate(
    params.id,
    {
      $set: {
        status,
        ...(status === 'completed' ? { deliveredAt: new Date() } : {}),
      },
    },
    { new: true, lean: true },
  )

  if (!order) return err('Không tìm thấy đơn hàng', 404)

  return ok({ status: (order as Record<string, unknown>).status })
}
