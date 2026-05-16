import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import '@/models/Brand'
import '@/models/Hub'
import '@/models/Channel'
import { ok, err, requireAuth } from '@/lib/api-helpers'

type PopulatedRef = { _id?: { toString(): string } | string; name?: string } | string | null | undefined
type OrderDetailDoc = Record<string, unknown> & {
  brandId?: PopulatedRef
  hubId?: PopulatedRef
  channelId?: PopulatedRef
}

function getRefId(value: PopulatedRef) {
  if (!value || typeof value === 'string') return value
  if ('_id' in value && value._id) return value._id.toString()
  return undefined
}

function getRefName(value: PopulatedRef) {
  if (!value || typeof value === 'string') return undefined
  return typeof value.name === 'string' ? value.name : undefined
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(_req)
  if (res) return res
  await connectDB()

  const populateQuery = (q: ReturnType<typeof OrderModel.findById> | ReturnType<typeof OrderModel.findOne>) =>
    q.populate('brandId', 'name').populate('hubId', 'name').populate('channelId', 'name source').lean() as Promise<OrderDetailDoc | null>

  const id = params.id.trim()
  // Support lookup by MongoDB ObjectId, shortId, or platform displayID (e.g. GF-723)
  const isObjectId = /^[0-9a-f]{24}$/i.test(id)
  let order: OrderDetailDoc | null = isObjectId
    ? await populateQuery(OrderModel.findById(id))
    : null

  if (!order) {
    order = await populateQuery(
      OrderModel.findOne({ $or: [{ shortId: id }, { 'rawPayload.displayID': id }] })
    )
  }

  if (!order) return err('Không tìm thấy', 404)
  return ok({
    ...order,
    brandId: getRefId(order.brandId),
    brandName: getRefName(order.brandId),
    hubId: getRefId(order.hubId),
    hubName: getRefName(order.hubId),
    channelId: getRefId(order.channelId),
    channelName: getRefName(order.channelId),
  })
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

