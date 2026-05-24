import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { getOrderRepairReport, runOrderRepair } from '@/lib/order-repair'

export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secretParam = req.nextUrl.searchParams.get('secret')

  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const days = Math.max(1, Math.min(90, Number(req.nextUrl.searchParams.get('days') ?? 30) || 30))
  const providers = (req.nextUrl.searchParams.get('providers') ?? 'be,grab')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const includeHistorical = req.nextUrl.searchParams.get('historical') !== 'false'
  const externalOrderIds = (req.nextUrl.searchParams.get('orderIds') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const shortIds = (req.nextUrl.searchParams.get('shortIds') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const externalStoreIds = (req.nextUrl.searchParams.get('storeIds') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const changedOnly = req.nextUrl.searchParams.get('changedOnly') === 'true'
  const changedLimit = Math.max(1, Math.min(50, Number(req.nextUrl.searchParams.get('limit') ?? 20) || 20))
  const driverPhone = (req.nextUrl.searchParams.get('driverPhone') ?? '').trim()
  const forceCancelledOrderIds = (req.nextUrl.searchParams.get('forceCancelledOrderIds') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const forceCompletedShortIds = (req.nextUrl.searchParams.get('forceCompletedShortIds') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const forceAll = req.nextUrl.searchParams.get('forceAll') === 'true'
  const staleActiveHours = Math.max(0, Math.min(24, Number(req.nextUrl.searchParams.get('staleHours') ?? 0) || 0))
  const staleActiveMax = Math.max(1, Math.min(30, Number(req.nextUrl.searchParams.get('staleMax') ?? 10) || 10))

  await connectDB()
  let scopedExternalOrderIds = externalOrderIds

  if (
    changedOnly
    && !scopedExternalOrderIds.length
    && !shortIds.length
    && !externalStoreIds.length
    && !driverPhone
    && !forceCancelledOrderIds.length
    && !forceCompletedShortIds.length
  ) {
    const report = await getOrderRepairReport({ providers, limit: changedLimit })
    scopedExternalOrderIds = report.samples
      .map((sample) => String((sample as { externalOrderId?: unknown }).externalOrderId ?? '').trim())
      .filter(Boolean)

    if (!scopedExternalOrderIds.length) {
      return NextResponse.json({
        ok: true,
        providers,
        changedOnly: true,
        limit: changedLimit,
        message: 'No changed orders found for scoped repair.',
        externalOrderIds: [],
      })
    }
  }

  const result = await runOrderRepair({
    days,
    providers,
    includeHistorical,
    externalOrderIds: scopedExternalOrderIds,
    shortIds,
    externalStoreIds,
    driverPhone,
    forceCancelledOrderIds,
    forceCompletedShortIds,
    forceAll,
    staleActiveHours,
    staleActiveMax,
  })
  return NextResponse.json(result)
}
