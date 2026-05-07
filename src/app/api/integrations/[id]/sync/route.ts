import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import OrderModel from '@/models/Order'
import SyncLogModel from '@/models/SyncLog'
import { ok, err, requireAdmin } from '@/lib/api-helpers'
import { getAdapter } from '@/integrations/registry'
import { decryptJSON } from '@/lib/crypto'
import { buildOrderUpsert } from '@/lib/order-upsert'
import { buildSessionStoreId, mergeApiOrdersWithRecentHistory, mergeSessionOrdersWithRecentHistory } from '@/lib/realtime-order-sync'
import type { NormalizedOrder } from '@/types'
import type { SessionData } from '@/integrations/types'

/**
 * POST /api/integrations/[id]/sync
 * Fetch orders from provider and upsert them into the Order collection.
 * Supports both 'api' mode (credentials) and 'auto' mode (session cookies).
 * Idempotent: running twice for the same orders produces no duplicates.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAdmin(req)
  if (res) return res

  await connectDB()

  const raw = await IntegrationModel.findById(params.id)
    .select('+credentials +sessionData')
    .lean()
  if (!raw || Array.isArray(raw)) return err('Không tìm thấy tích hợp', 404)

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
    isActive: boolean
  }

  if (!intg.isActive) return err('Tích hợp đang bị tắt', 400)

  const adapter = getAdapter(intg.provider)
  if (!adapter) return err(`Không hỗ trợ provider: ${intg.provider}`, 400)

  const startedAt = Date.now()
  let upserted = 0
  let updated = 0
  const errors: string[] = []
  let orders: NormalizedOrder[] = []

  try {
    await IntegrationModel.findByIdAndUpdate(params.id, { syncStatus: 'syncing' })

    // ── Auto-login (session) mode ─────────────────────────────────────────────
    if (intg.loginMode === 'auto') {
      if (!adapter.fetchOrdersWithSession) {
        return err('Provider này không hỗ trợ session auto-login', 400)
      }
      if (!intg.sessionData || intg.sessionStatus !== 'active') {
        return err('Session chưa active – vui lòng đăng nhập lại', 400)
      }
      const isExpired = intg.sessionExpiresAt
        ? new Date(intg.sessionExpiresAt) < new Date()
        : false
      if (isExpired) {
        await IntegrationModel.findByIdAndUpdate(params.id, { sessionStatus: 'expired' })
        return err('Session đã hết hạn – vui lòng đăng nhập lại', 400)
      }

      const session = decryptJSON<SessionData>(intg.sessionData)
      const storeId = buildSessionStoreId(intg.externalStoreId, session)
      const result  = await adapter.fetchOrdersWithSession(session, storeId)
      if (result === null) {
        await IntegrationModel.findByIdAndUpdate(params.id, { sessionStatus: 'expired' })
        return err('Session hết hạn – đăng nhập lại để tiếp tục', 401)
      }
      orders = await mergeSessionOrdersWithRecentHistory(adapter, session, storeId, result)
    } else {
      // ── API credentials mode ────────────────────────────────────────────────
      const rawCreds = intg.credentials as unknown
      const credObj: Record<string, string> =
        rawCreds instanceof Map
          ? Object.fromEntries((rawCreds as Map<string, string>).entries())
          : typeof rawCreds === 'object' && rawCreds !== null
          ? (rawCreds as Record<string, string>)
          : {}

      const config = {
        ...credObj,
        storeId: credObj.storeId ?? intg.externalStoreId,
        shopId:  credObj.shopId  ?? intg.externalStoreId,
      }

      orders = await adapter.fetchOrders(config)
      orders = await mergeApiOrdersWithRecentHistory(adapter, config, orders)
    }

    // ── Upsert orders ─────────────────────────────────────────────────────────
    for (const normalized of orders) {
      try {
        if (!normalized.externalOrderId) continue

        const result = await OrderModel.findOneAndUpdate(
          { source: normalized.source, externalOrderId: normalized.externalOrderId },
          buildOrderUpsert(intg, normalized),
          { upsert: true, new: true, includeResultMetadata: true }
        )

        if (result?.lastErrorObject?.updatedExisting === false) upserted++
        else updated++
      } catch (orderErr) {
        errors.push(`${normalized.externalOrderId}: ${orderErr instanceof Error ? orderErr.message : String(orderErr)}`)
      }
    }

    const durationMs = Date.now() - startedAt
    const status = errors.length === 0 ? 'success' : 'error'

    await IntegrationModel.findByIdAndUpdate(params.id, {
      syncStatus: status,
      lastSyncAt: new Date(),
      ...(status === 'error' ? { syncError: errors.slice(0, 3).join('; ') } : { $unset: { syncError: '' } }),
    })

    await SyncLogModel.create({
      type:    'order',
      status:  errors.length === 0 ? 'success' : 'failed',
      content: `[${intg.provider}] Sync xong: +${upserted} mới, ${updated} cập nhật, ${errors.length} lỗi (${durationMs}ms)`,
      source:  intg.provider,
      brandId: intg.brandId,
    })

    return ok({
      ok:        true,
      upserted,
      updated,
      errors:    errors.slice(0, 10),
      durationMs,
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Lỗi không xác định'

    await IntegrationModel.findByIdAndUpdate(params.id, {
      syncStatus: 'error',
      syncError:  errMsg,
    })

    await SyncLogModel.create({
      type:    'order',
      status:  'failed',
      content: `[${intg.provider}] Sync thất bại: ${errMsg}`,
      source:  intg.provider,
      brandId: intg.brandId,
    })

    return err(`Sync thất bại: ${errMsg}`, 502)
  }
}
