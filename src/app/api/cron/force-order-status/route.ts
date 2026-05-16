import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'

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

  if (!shortIds.length) {
    return NextResponse.json({ error: 'shortIds is required' }, { status: 400 })
  }

  const status = (req.nextUrl.searchParams.get('status') ?? '').trim()
  if (status && !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}` }, { status: 400 })
  }

  const customerName = (req.nextUrl.searchParams.get('customerName') ?? '').trim()
  const customerPhone = (req.nextUrl.searchParams.get('customerPhone') ?? '').trim()

  const setFields: Record<string, unknown> = { updatedAt: new Date() }
  if (status) setFields.status = status
  if (customerName) setFields.customerName = customerName
  if (customerPhone) setFields.customerPhone = customerPhone

  if (Object.keys(setFields).length === 1) {
    return NextResponse.json({ error: 'Provide at least one field to update: status, customerName, customerPhone' }, { status: 400 })
  }

  await connectDB()

  const before = await OrderModel.find({ shortId: { $in: shortIds } })
    .select('shortId status customerName customerPhone source externalOrderId')
    .lean()

  const result = await OrderModel.updateMany(
    { shortId: { $in: shortIds } },
    { $set: setFields }
  )

  return NextResponse.json({
    ok: true,
    shortIds,
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
