import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import OrderModel from '@/models/Order'
import { getAdapter } from '@/integrations/registry'
import { decryptJSON } from '@/lib/crypto'
import { buildOrderUpsert, mergeNormalizedOrderPreservingDetail } from '@/lib/order-upsert'
import type { NormalizedOrder } from '@/types'
import type { SessionData } from '@/integrations/types'

const CRON_SECRET = process.env.CRON_SECRET

async function upsertOrders(intg: {
  _id: string
  provider: string
  brandId: string
  hubId?: string
}, orders: NormalizedOrder[]) {
  let upserted = 0
  let updated = 0

  const externalOrderIds = orders
    .map((order) => order.externalOrderId)
    .filter((value): value is string => Boolean(value))

  const existingOrders = externalOrderIds.length
    ? await OrderModel.find({ source: intg.provider, externalOrderId: { $in: externalOrderIds } })
        .select('externalOrderId status customerName customerPhone items subtotal discount total platformFee paymentMethod deliveryInfo driverInfo rawPayload')
        .lean()
    : []

  const existingOrdersByExternalId = new Map(
    existingOrders.map((order) => [String(order.externalOrderId ?? ''), order])
  )

  for (const normalized of orders) {
    if (!normalized.externalOrderId) continue

    try {
      const mergedNormalized = mergeNormalizedOrderPreservingDetail(
        existingOrdersByExternalId.get(normalized.externalOrderId) as Partial<NormalizedOrder> | undefined,
        normalized
      )

      const existingDbStatus = (existingOrdersByExternalId.get(normalized.externalOrderId) as { status?: string } | undefined)?.status
      if (existingDbStatus === 'cancelled' && mergedNormalized.orderStatus === 'completed') {
        mergedNormalized.orderStatus = 'cancelled'
      }

      const result = await OrderModel.findOneAndUpdate(
        { source: mergedNormalized.source, externalOrderId: mergedNormalized.externalOrderId },
        buildOrderUpsert(intg, mergedNormalized),
        { upsert: true, new: true, includeResultMetadata: true }
      )

      if (result?.lastErrorObject?.updatedExisting === false) upserted++
      else updated++
    } catch {
      continue
    }
  }

  return { upserted, updated }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secretParam = req.nextUrl.searchParams.get('secret')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const days = Math.max(1, Math.min(90, Number(req.nextUrl.searchParams.get('days') ?? 30)))

  await connectDB()

  const integrations = await IntegrationModel.find({ isActive: true })
    .select('+credentials +sessionData')
    .lean()

  const results: Array<{ id: string; provider: string; upserted: number; updated: number; fetched: number; error?: string }> = []

  for (const raw of integrations) {
    const intg = raw as unknown as {
      _id: string
      provider: string
      brandId: string
      hubId?: string
      externalStoreId?: string
      credentials?: unknown
      loginMode?: 'api' | 'auto'
      sessionData?: string
      sessionStatus?: string
    }

    const adapter = getAdapter(intg.provider)
    if (!adapter) continue

    try {
      let orders: NormalizedOrder[] = []

      if (intg.loginMode === 'auto') {
        if (!intg.sessionData) {
          throw new Error('Session chưa active – bỏ qua backfill')
        }
        if (!adapter.fetchHistoricalOrdersWithSession) {
          throw new Error('Provider chưa hỗ trợ backfill lịch sử qua session')
        }

        const session = decryptJSON(intg.sessionData) as SessionData
        const storeId = intg.externalStoreId ?? session.extraHeaders?.['x-grab-store-id'] ?? session.extraHeaders?.['x-restaurant-id'] ?? ''
        const result = await adapter.fetchHistoricalOrdersWithSession(session, storeId, { days })
        if (result === null) {
          throw new Error('Session hết hạn hoặc provider không trả được lịch sử')
        }
        orders = result
      } else {
        if (!adapter.fetchHistoricalOrders) {
          throw new Error('Provider chưa hỗ trợ backfill lịch sử qua API')
        }

        const rawCreds = intg.credentials as unknown
        const credObj: Record<string, string> =
          rawCreds instanceof Map
            ? Object.fromEntries((rawCreds as Map<string, string>).entries())
            : typeof rawCreds === 'object' && rawCreds !== null
            ? (rawCreds as Record<string, string>)
            : {}

        orders = await adapter.fetchHistoricalOrders({
          ...credObj,
          storeId: credObj.storeId ?? intg.externalStoreId,
          shopId: credObj.shopId ?? intg.externalStoreId,
        }, { days })
      }

      const { upserted, updated } = await upsertOrders(intg, orders)
      results.push({ id: String(intg._id), provider: intg.provider, fetched: orders.length, upserted, updated })
    } catch (error) {
      results.push({
        id: String(intg._id),
        provider: intg.provider,
        fetched: 0,
        upserted: 0,
        updated: 0,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return NextResponse.json({ ok: true, days, ran: results.length, results })
}
