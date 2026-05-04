import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import OrderModel from '@/models/Order'
import SyncLogModel from '@/models/SyncLog'
import { getAdapter } from '@/integrations/registry'
import { generateId } from '@/lib/utils'
import type { NormalizedOrder } from '@/types'

const CRON_SECRET = process.env.CRON_SECRET

/**
 * GET /api/cron/sync-orders
 * Called by Vercel cron every 5 minutes.
 * Iterates all active integrations and upserts orders into DB.
 */
export async function GET(req: NextRequest) {
  // Verify secret so only Vercel cron (or manual calls with the header) can trigger this
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await connectDB()

  const integrations = await IntegrationModel.find({ isActive: true })
    .select('+credentials')
    .lean()

  const results: Array<{ id: string; provider: string; upserted: number; updated: number; error?: string }> = []

  for (const raw of integrations) {
    const intg = raw as unknown as {
      _id: string
      provider: string
      brandId: string
      hubId?: string
      externalStoreId?: string
      credentials?: unknown
    }

    const adapter = getAdapter(intg.provider)
    if (!adapter) continue

    const rawCreds = intg.credentials as unknown
    const credObj: Record<string, string> =
      rawCreds instanceof Map
        ? Object.fromEntries((rawCreds as Map<string, string>).entries())
        : typeof rawCreds === 'object' && rawCreds !== null
        ? (rawCreds as Record<string, string>)
        : {}

    try {
      await IntegrationModel.findByIdAndUpdate(intg._id, { syncStatus: 'syncing' })

      const orders: NormalizedOrder[] = await adapter.fetchOrders({
        ...credObj,
        storeId: credObj.storeId ?? intg.externalStoreId,
        shopId:  credObj.shopId  ?? intg.externalStoreId,
      })

      let upserted = 0
      let updated = 0

      for (const normalized of orders) {
        if (!normalized.externalOrderId) continue
        try {
          const result = await OrderModel.findOneAndUpdate(
            { source: normalized.source, externalOrderId: normalized.externalOrderId },
            {
              $setOnInsert: {
                shortId:  generateId(),
                placedAt: normalized.placedAt ? new Date(normalized.placedAt) : new Date(),
                brandId:  intg.brandId,
                hubId:    intg.hubId,
              },
              $set: {
                status:        normalized.orderStatus,
                customerName:  normalized.customerName || 'Khách hàng',
                customerPhone: normalized.customerPhone,
                items:         normalized.items,
                subtotal:      normalized.subtotal,
                discount:      normalized.discount,
                total:         normalized.total,
                deliveryInfo:  normalized.deliveryInfo,
                driverInfo:    normalized.driverInfo,
                rawPayload:    normalized.rawPayload,
              },
            },
            { upsert: true, new: true, includeResultMetadata: true }
          )
          if (result?.lastErrorObject?.updatedExisting === false) upserted++
          else updated++
        } catch {
          // skip individual order errors — log at integration level
        }
      }

      await IntegrationModel.findByIdAndUpdate(intg._id, {
        syncStatus: 'success',
        lastSyncAt: new Date(),
        $unset: { syncError: '' },
      })

      await SyncLogModel.create({
        type:    'order',
        status:  'success',
        content: `[cron][${intg.provider}] +${upserted} mới, ${updated} cập nhật`,
        source:  intg.provider,
        brandId: intg.brandId,
      })

      results.push({ id: String(intg._id), provider: intg.provider, upserted, updated })
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      await IntegrationModel.findByIdAndUpdate(intg._id, {
        syncStatus: 'error',
        syncError:  errMsg,
      })
      results.push({ id: String(intg._id), provider: intg.provider, upserted: 0, updated: 0, error: errMsg })
    }
  }

  return NextResponse.json({ ok: true, ran: results.length, results })
}
