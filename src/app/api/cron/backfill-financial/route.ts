/**
 * POST /api/cron/backfill-financial
 * Backfill customerPaid + customerDeliveryFee cho đơn Grab đã hoàn thành trong 30 ngày gần đây.
 * Đọc từ rawPayload.fare đã lưu trong DB — không cần gọi lại Grab API.
 * Auth: Bearer <CRON_SECRET>
 */
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import { extractGrabCustomerFinancials } from '@/lib/order-financials'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = req.nextUrl
  const days   = Math.min(Number(url.searchParams.get('days')  ?? 30), 90)
  const limit  = Math.min(Number(url.searchParams.get('limit') ?? 500), 2000)
  const force  = url.searchParams.get('force') === '1'   // '1' = cập nhật kể cả đã có customerPaid

  await connectDB()

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // Tìm đơn Grab completed trong N ngày — ưu tiên đơn chưa có customerPaid
  const filter: Record<string, unknown> = {
    source: 'grab',
    status: 'completed',
    placedAt: { $gte: since },
  }
  if (!force) {
    filter.customerPaid = { $exists: false }
  }

  const orders = await OrderModel.find(filter)
    .select('_id shortId externalOrderId rawPayload customerPaid customerDeliveryFee')
    .limit(limit)
    .lean() as Array<{
      _id: unknown
      shortId: string
      externalOrderId?: string
      rawPayload?: Record<string, unknown>
      customerPaid?: number
      customerDeliveryFee?: number
    }>

  let updated = 0
  let skipped = 0
  let noFare  = 0

  for (const order of orders) {
    const financials = extractGrabCustomerFinancials(order.rawPayload)
    if (!financials || (financials.customerPaid === 0 && financials.customerDeliveryFee === 0)) {
      noFare++
      continue
    }

    const setFields: Record<string, number> = {}
    if (financials.customerPaid > 0) setFields.customerPaid = financials.customerPaid
    if (financials.customerDeliveryFee > 0) setFields.customerDeliveryFee = financials.customerDeliveryFee

    if (!force &&
      order.customerPaid === setFields.customerPaid &&
      order.customerDeliveryFee === setFields.customerDeliveryFee) {
      skipped++
      continue
    }

    await OrderModel.updateOne({ _id: order._id }, { $set: setFields })
    updated++
  }

  return NextResponse.json({
    ok: true,
    scanned: orders.length,
    updated,
    skipped,
    noFare,
    days,
    since: since.toISOString(),
    force,
  })
}
