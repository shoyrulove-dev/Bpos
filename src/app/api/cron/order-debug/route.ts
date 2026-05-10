import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import CustomerModel from '@/models/Customer'
import OrderModel from '@/models/Order'
import DriverModel from '@/models/Driver'
import IntegrationModel from '@/models/Integration'
import { getDisplayCustomerName, getDisplayCustomerPhone } from '@/lib/order-financials'
import mongoose from 'mongoose'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secretParam = req.nextUrl.searchParams.get('secret')

  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shortId = (req.nextUrl.searchParams.get('shortId') ?? '').trim()
  const externalOrderId = (req.nextUrl.searchParams.get('externalOrderId') ?? '').trim()
  const displayId = (req.nextUrl.searchParams.get('displayId') ?? '').trim()
  const bookingCode = (req.nextUrl.searchParams.get('bookingCode') ?? '').trim()
  const source = (req.nextUrl.searchParams.get('source') ?? '').trim()
  const phone = (req.nextUrl.searchParams.get('phone') ?? req.nextUrl.searchParams.get('driverPhone') ?? '').trim()

  await connectDB()

  const filter: Record<string, unknown> = {}
  if (shortId) filter.shortId = shortId
  if (externalOrderId) filter.externalOrderId = externalOrderId
  if (source) filter.source = source
  if (displayId) filter['rawPayload.displayID'] = displayId
  if (bookingCode) filter['rawPayload.bookingCode'] = bookingCode

  const order = Object.keys(filter).length
    ? await OrderModel.findOne(filter)
        .select('shortId source externalOrderId brandId hubId customerName customerPhone driverInfo status placedAt deliveredAt cancelledAt cancelReason updatedAt rawPayload')
        .lean()
    : null

  const driverPhone = phone || String((order as { driverInfo?: { phone?: string } } | null)?.driverInfo?.phone ?? '').trim()
  const driver = driverPhone
    ? await DriverModel.findOne({ phone: driverPhone, ...(source ? { platform: source } : {}) })
        .select('name phone platform visitCount lastSeenAt updatedAt createdAt')
        .lean()
    : null

  const brandId = (order as { brandId?: { toString(): string } | string } | null)?.brandId
  const customerPhone = String((order as { customerPhone?: string } | null)?.customerPhone ?? '').trim()
  const derivedCustomerPhone = order ? getDisplayCustomerPhone(order as never) : ''
  const derivedCustomerName = order ? getDisplayCustomerName(order as never) : undefined
  const derivedBrandIdValid = mongoose.isValidObjectId((order as { brandId?: unknown } | null)?.brandId)
  const customer = customerPhone && brandId
    ? await CustomerModel.findOne({ phone: customerPhone, brandId })
        .select('name phone brandId points totalSpend orderCount tier status lastOrderAt updatedAt createdAt')
        .lean()
    : null
  const customerCandidates = customerPhone
    ? await CustomerModel.find({ phone: customerPhone })
        .select('name phone brandId points totalSpend orderCount tier status lastOrderAt updatedAt createdAt')
        .limit(10)
        .lean()
    : []
  const integrations = brandId
    ? await IntegrationModel.find({ brandId, ...(source ? { provider: source } : {}) })
        .select('provider externalStoreId externalStoreName loginMode sessionRefreshMode loginUsername sessionStatus sessionCapturedAt sessionExpiresAt sessionError sessionFailureCount automationRunning isActive lastSyncAt syncStatus syncError updatedAt')
        .lean()
    : []

  return NextResponse.json({
    ok: true,
    query: { shortId, externalOrderId, displayId, bookingCode, source, phone },
    foundOrder: Boolean(order),
    order,
    derivedCustomerName,
    derivedCustomerPhone,
    derivedBrandIdValid,
    customer,
    customerCandidates,
    driver,
    integrations,
  })
}