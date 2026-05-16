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
  // When completing an order, auto-set deliveredAt = now (unless already set via rawPayload)
  if (status === 'completed') setFields.deliveredAt = new Date()
  if (customerName) setFields.customerName = customerName
  if (customerPhone) setFields.customerPhone = customerPhone

  if (Object.keys(setFields).length === 1) {
    return NextResponse.json({ error: 'Provide at least one field to update: status, customerName, customerPhone' }, { status: 400 })
  }

  await connectDB()

  const before = await OrderModel.find({ shortId: { $in: shortIds } })
    .select('shortId status customerName customerPhone source externalOrderId rawPayload deliveredAt')
    .lean() as Array<Record<string, unknown>>

  // When completing, prefer deliveredAt from rawPayload.times.deliveredAt over current time
  if (status === 'completed') {
    for (const order of before) {
      const existingDeliveredAt = order.deliveredAt as Date | undefined
      if (existingDeliveredAt) continue // already set — keep it
      const times = (order.rawPayload as Record<string, unknown> | undefined)?.times
      const rawDeliveredAt = times && typeof times === 'object'
        ? String((times as Record<string, unknown>).deliveredAt ?? '').trim()
        : ''
      if (rawDeliveredAt) {
        // Per-order update to use the correct rawPayload time
        const deliveredAtDate = new Date(rawDeliveredAt)
        if (!Number.isNaN(deliveredAtDate.getTime())) {
          await OrderModel.updateOne(
            { shortId: order.shortId as string },
            { $set: { status: 'completed', deliveredAt: deliveredAtDate, updatedAt: new Date() } },
          )
          continue
        }
      }
      // Fallback: set deliveredAt = now for this order
      await OrderModel.updateOne(
        { shortId: order.shortId as string },
        { $set: { status: 'completed', deliveredAt: setFields.deliveredAt as Date, updatedAt: new Date() } },
      )
    }
    const result2 = { matchedCount: before.length, modifiedCount: before.length }
    return NextResponse.json({
      ok: true,
      shortIds,
      fields: { status: 'completed' },
      matched: result2.matchedCount,
      modified: result2.modifiedCount,
      before: before.map((o) => ({ shortId: o.shortId, oldStatus: o.status, source: o.source, externalOrderId: o.externalOrderId })),
    })
  }

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
