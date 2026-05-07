import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import OrderModel from '@/models/Order'
import SyncLogModel from '@/models/SyncLog'
import { getAdapter } from '@/integrations/registry'
import { decryptJSON } from '@/lib/crypto'
import { generateId } from '@/lib/utils'
import type { NormalizedOrder } from '@/types'
import type { SessionData } from '@/integrations/types'

const CRON_SECRET = process.env.CRON_SECRET

/**
 * GET /api/cron/sync-orders
 * Called by Vercel cron every 1 minute.
 * Iterates all active integrations and upserts orders into DB.
 * Supports both 'api' mode (credentials) and 'auto' mode (session cookies).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secretParam = req.nextUrl.searchParams.get('secret')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await connectDB()

  const integrations = await IntegrationModel.find({ isActive: true })
    .select('+credentials +sessionData +loginPassword')
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
      loginMode?: 'api' | 'auto'
      sessionData?: string
      sessionStatus?: string
      sessionExpiresAt?: Date
    }

    const adapter = getAdapter(intg.provider)
    if (!adapter) continue

    const startedAt = Date.now()
    let upserted = 0
    let updated = 0

    try {
      await IntegrationModel.findByIdAndUpdate(intg._id, { syncStatus: 'syncing' })

      let orders: NormalizedOrder[] = []

      // ── Auto-login (session) mode ─────────────────────────────────────────
      if (intg.loginMode === 'auto') {
        if (!adapter.fetchOrdersWithSession) {
          throw new Error('Provider này không hỗ trợ session auto-login')
        }
        if (!intg.sessionData || intg.sessionStatus !== 'active') {
          throw new Error('Session chưa active – đang chờ refresh hoặc đăng nhập lại')
        }

        const isExpired = intg.sessionExpiresAt
          ? new Date(intg.sessionExpiresAt) < new Date()
          : false

        if (isExpired) {
          await IntegrationModel.findByIdAndUpdate(intg._id, { sessionStatus: 'expired' })
          throw new Error('Session đã hết hạn – đang chờ refresh')
        }

        const session = decryptJSON(intg.sessionData) as SessionData
        const storeId = intg.externalStoreId ?? session.extraHeaders?.['x-grab-store-id'] ?? ''
        const result  = await adapter.fetchOrdersWithSession(session, storeId)
        if (result !== null) {
          orders = result
        } else {
          await IntegrationModel.findByIdAndUpdate(intg._id, { sessionStatus: 'expired' })
          throw new Error('Session hết hạn – cần đăng nhập lại')
        }
      } else {
        // ── API credentials mode ──────────────────────────────────────────
        const rawCreds = intg.credentials as unknown
        const credObj: Record<string, string> =
          rawCreds instanceof Map
            ? Object.fromEntries((rawCreds as Map<string, string>).entries())
            : typeof rawCreds === 'object' && rawCreds !== null
            ? (rawCreds as Record<string, string>)
            : {}

        orders = await adapter.fetchOrders({
          ...credObj,
          storeId: credObj.storeId ?? intg.externalStoreId,
          shopId:  credObj.shopId  ?? intg.externalStoreId,
        })
      }

      // ── Upsert orders ─────────────────────────────────────────────────────
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
                source:        normalized.source,
                externalOrderId: normalized.externalOrderId,
                externalStoreId: normalized.externalStoreId,
              },
            },
            { upsert: true, new: true, includeResultMetadata: true }
          )
          if (result?.lastErrorObject?.updatedExisting === false) upserted++
          else updated++
        } catch { /* skip individual order errors */ }
      }

      await IntegrationModel.findByIdAndUpdate(intg._id, {
        syncStatus: 'success',
        lastSyncAt: new Date(),
        $unset: { syncError: '' },
      })

      await SyncLogModel.create({
        type:    'order',
        status:  'success',
        content: `[cron][${intg.provider}] +${upserted} mới, ${updated} cập nhật (${Date.now() - startedAt}ms)`,
        source:  intg.provider,
        brandId: intg.brandId,
      })

      results.push({ id: String(intg._id), provider: intg.provider, upserted, updated })
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      await IntegrationModel.findByIdAndUpdate(intg._id, {
        syncStatus: 'error',
        syncError:  errMsg,
        lastSyncAt: new Date(),
      })
      results.push({ id: String(intg._id), provider: intg.provider, upserted: 0, updated: 0, error: errMsg })
    }
  }

  return NextResponse.json({ ok: true, ran: results.length, results })
}

