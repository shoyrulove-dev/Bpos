/**
 * GET /api/cron/order-raw?id=GF-923
 * Diagnostic: trả về rawPayload financial fields để debug "Thông tin khách thanh toán" sai.
 * Auth: Bearer <CRON_SECRET>
 */
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'

const CRON_SECRET = process.env.CRON_SECRET

function getRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function pickFinancialFields(raw: Record<string, unknown>) {
  const fare       = getRecord(raw.fare)
  const price      = getRecord(raw.price ?? raw.pricing)
  const breakdown  = getRecord(raw.financialBreakdown)

  return {
    // Top-level
    paymentType:      raw.paymentType,
    paymentMethod:    raw.paymentMethod,
    // Fare object (merchant portal)
    fare: fare ? {
      passengerTotalDisplay: fare.passengerTotalDisplay,
      eaterPayment:          fare.eaterPayment,
      deliveryFeeDisplay:    fare.deliveryFeeDisplay,
      deliveryFee:           fare.deliveryFee,
      smallOrderFeeDisplay:  fare.smallOrderFeeDisplay,
      serviceFee:            fare.serviceFee,
      merchantTotalDisplay:  fare.merchantTotalDisplay,
      priceFloat:            fare.priceFloat,
      priceInMin:            fare.priceInMin,
    } : undefined,
    // Price/pricing object
    price: price ? {
      passengerTotalDisplay: price.passengerTotalDisplay,
      eaterPayment:          price.eaterPayment,
      deliveryFeeDisplay:    price.deliveryFeeDisplay,
      deliveryFee:           price.deliveryFee,
      merchandiseAmount:     price.merchandiseAmount,
    } : undefined,
    // Financial breakdown object
    financialBreakdown: breakdown ? {
      merchandiseAmount:      breakdown.merchandiseAmount,
      revenueAfterPromotion:  breakdown.revenueAfterPromotion,
      productDiscount:        breakdown.productDiscount,
      orderDiscount:          breakdown.orderDiscount,
      platformCommission:     breakdown.platformCommission,
      taxWithheld:            breakdown.taxWithheld,
      actualReceived:         breakdown.actualReceived,
    } : undefined,
    // Grab page context
    _pageType:  raw._pageType,
    _pageStage: raw._pageStage,
    // Full raw keys (for discovery)
    topLevelKeys: Object.keys(raw).sort(),
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get('id')?.trim()
  if (!id) {
    return NextResponse.json({ error: 'Missing ?id= (shortId or externalOrderId)' }, { status: 400 })
  }

  await connectDB()

  // Try by shortId first, then externalOrderId, then _id prefix
  const order = await OrderModel.findOne({
    $or: [
      { shortId: id },
      { externalOrderId: id },
      { shortId: { $regex: `^${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, $options: 'i' } },
    ],
  })
    .select('shortId externalOrderId source status subtotal discount total platformFee paymentMethod rawPayload')
    .lean() as Record<string, unknown> | null

  if (!order) {
    return NextResponse.json({ error: `Order not found: ${id}` }, { status: 404 })
  }

  const raw = getRecord(order.rawPayload)

  return NextResponse.json({
    shortId:         order.shortId,
    externalOrderId: order.externalOrderId,
    source:          order.source,
    status:          order.status,
    subtotal:        order.subtotal,
    discount:        order.discount,
    total:           order.total,
    platformFee:     order.platformFee,
    paymentMethod:   order.paymentMethod,
    financial:       raw ? pickFinancialFields(raw) : null,
  })
}
