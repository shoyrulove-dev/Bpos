import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import mongoose from 'mongoose'

export const maxDuration = 30

const CRON_SECRET = process.env.CRON_SECRET

const ALLOWED_STATUSES = ['draft', 'pre_order', 'waiting_confirm', 'waiting_pickup', 'delivering', 'completed', 'cancelled']

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secretParam = req.nextUrl.searchParams.get('secret')

  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shortIds = (req.nextUrl.searchParams.get('shortIds') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)

  // Also accept MongoDB ObjectIds via ?ids= for unambiguous single-order lookup
  const mongoIds = (req.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter((v) => mongoose.isValidObjectId(v))

  if (!shortIds.length && !mongoIds.length) {
    return NextResponse.json({ error: 'shortIds or ids (MongoDB ObjectId) is required' }, { status: 400 })
  }

  const status = (req.nextUrl.searchParams.get('status') ?? '').trim()
  if (status && !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}` }, { status: 400 })
  }

  const customerName = (req.nextUrl.searchParams.get('customerName') ?? '').trim()
  const customerPhone = (req.nextUrl.searchParams.get('customerPhone') ?? '').trim()
  const driverName = (req.nextUrl.searchParams.get('driverName') ?? '').trim()
  const driverPhone = (req.nextUrl.searchParams.get('driverPhone') ?? '').trim()

  const setFields: Record<string, unknown> = { updatedAt: new Date() }
  if (status) setFields.status = status
  if (customerName) setFields.customerName = customerName
  if (customerPhone) setFields.customerPhone = customerPhone
  if (driverName) setFields['driverInfo.name'] = driverName
  if (driverPhone) setFields['driverInfo.phone'] = driverPhone

  // Accept explicit deliveredAt override, or auto-set when completing
  const deliveredAtParam = (req.nextUrl.searchParams.get('deliveredAt') ?? '').trim()
  if (deliveredAtParam) {
    const d = new Date(deliveredAtParam)
    if (!isNaN(d.getTime())) setFields.deliveredAt = d
  } else if (status === 'completed') {
    setFields.deliveredAt = new Date()
  }

  if (Object.keys(setFields).length === 1) {
    return NextResponse.json({ error: 'Provide at least one field to update: status, customerName, customerPhone, driverName, driverPhone' }, { status: 400 })
  }

  await connectDB()

  const query = shortIds.length && mongoIds.length
    ? { $or: [{ shortId: { $in: shortIds } }, { _id: { $in: mongoIds } }] }
    : shortIds.length
      ? { shortId: { $in: shortIds } }
      : { _id: { $in: mongoIds } }

  const before = await OrderModel.find(query)
    .select('shortId status customerName customerPhone source externalOrderId')
    .lean() as Array<Record<string, unknown>>

  const result = await OrderModel.updateMany(query, { $set: setFields })

  return NextResponse.json({
    ok: true,
    shortIds,
    ids: mongoIds,
    fields: setFields,
    matched: result.matchedCount,
    modified: result.modifiedCount,
    before: before.map((o) => ({
      shortId: o.shortId,
      oldStatus: o.status,
      oldCustomerName: o.customerName,
      source: o.source,
      externalOrderId: o.externalOrderId,
    })),
  })
}
