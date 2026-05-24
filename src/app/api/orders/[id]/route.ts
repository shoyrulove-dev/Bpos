import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import '@/models/Brand'
import '@/models/Hub'
import '@/models/Channel'
import { ok, err, requireAuth } from '@/lib/api-helpers'
import { serializeOrderResponse } from '@/lib/order-response'

type OrderDetailDoc = Record<string, unknown>

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()

  const populateQuery = (q: ReturnType<typeof OrderModel.findById> | ReturnType<typeof OrderModel.findOne>) =>
    q.populate('brandId', 'name').populate('hubId', 'name').populate('channelId', 'name source').lean() as Promise<OrderDetailDoc | null>

  const id = params.id.trim()
  const isObjectId = /^[0-9a-f]{24}$/i.test(id)

  let order: OrderDetailDoc | null = isObjectId
    ? await populateQuery(OrderModel.findById(id))
    : null

  if (!order) {
    order = await populateQuery(
      OrderModel.findOne({
        $or: [
          { shortId: id },
          { externalOrderId: id },
          { 'rawPayload.displayID': id },
          { 'rawPayload.shortOrderID': id },
          { 'rawPayload.shortOrderId': id },
          { 'rawPayload.bookingCode': id },
        ],
      })
    )
  }

  if (!order) return err('Không tìm thấy', 404)
  return ok(serializeOrderResponse(order))
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()

  const body = await req.json()
  const order = await OrderModel.findByIdAndUpdate(params.id, body, { new: true, runValidators: true }).lean()
  if (!order) return err('Không tìm thấy', 404)
  return ok(serializeOrderResponse(order as Record<string, unknown>))
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()

  const body = await req.json() as { locked?: boolean }
  if (typeof body.locked !== 'boolean') return err('locked phải là true hoặc false', 400)

  const order = await OrderModel.findByIdAndUpdate(
    params.id,
    { $set: { locked: body.locked } },
    { new: true }
  ).lean()

  if (!order) return err('Không tìm thấy', 404)
  return ok({ locked: (order as Record<string, unknown>).locked })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()

  const id = params.id.trim()
  const isObjectId = /^[0-9a-f]{24}$/i.test(id)

  const deleted = isObjectId
    ? await OrderModel.findByIdAndDelete(id).lean()
    : await OrderModel.findOneAndDelete({
        $or: [
          { shortId: id },
          { externalOrderId: id },
          { 'rawPayload.displayID': id },
          { 'rawPayload.shortOrderID': id },
          { 'rawPayload.shortOrderId': id },
          { 'rawPayload.bookingCode': id },
        ],
      }).lean()

  if (!deleted) return err('Không tìm thấy', 404)
  return ok({ deleted: true, orderId: (deleted as { _id?: { toString(): string } | string })._id?.toString?.() ?? null })
}
