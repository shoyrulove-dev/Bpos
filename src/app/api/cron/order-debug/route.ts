import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import DriverModel from '@/models/Driver'
import IntegrationModel from '@/models/Integration'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secretParam = req.nextUrl.searchParams.get('secret')

  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shortId = (req.nextUrl.searchParams.get('shortId') ?? '').trim()
  const externalOrderId = (req.nextUrl.searchParams.get('externalOrderId') ?? '').trim()
  const source = (req.nextUrl.searchParams.get('source') ?? '').trim()
  const phone = (req.nextUrl.searchParams.get('phone') ?? '').trim()

  await connectDB()

  const filter: Record<string, unknown> = {}
  if (shortId) filter.shortId = shortId
  if (externalOrderId) filter.externalOrderId = externalOrderId
  if (source) filter.source = source

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
  const integrations = brandId
    ? await IntegrationModel.find({ brandId, ...(source ? { provider: source } : {}) })
        .select('provider externalStoreId externalStoreName loginMode loginUsername sessionStatus sessionCapturedAt sessionExpiresAt sessionError sessionFailureCount automationRunning isActive lastSyncAt syncStatus syncError updatedAt')
        .lean()
    : []

  return NextResponse.json({
    ok: true,
    query: { shortId, externalOrderId, source, phone },
    foundOrder: Boolean(order),
    order,
    driver,
    integrations,
  })
}