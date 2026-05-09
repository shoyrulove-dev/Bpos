import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import OrderModel from '@/models/Order'
import SyncLogModel from '@/models/SyncLog'
import { ok, err, requireAdmin } from '@/lib/api-helpers'
import { getAdapter } from '@/integrations/registry'
import { applySessionStoreDefaults, normalizeAutomationSession } from '@/lib/automation-session'
import { requestAutomationLogin } from '@/lib/automation-login'
import { decrypt, decryptJSON, encryptJSON } from '@/lib/crypto'
import { buildOrderUpsert, mergeNormalizedOrderPreservingDetail } from '@/lib/order-upsert'
import { buildSessionStoreId, mergeApiOrdersWithRecentHistory, mergeOrdersByExternalOrderId, mergeSessionOrdersWithRecentHistory } from '@/lib/realtime-order-sync'
import { buildSessionFailureUpdate, buildSessionSuccessUpdate } from '@/lib/session-health'
import type { NormalizedOrder } from '@/types'
import type { SessionData } from '@/integrations/types'

const AUTOMATION_URL = process.env.AUTOMATION_SERVICE_URL ?? ''
const AUTOMATION_SECRET = process.env.AUTOMATION_SECRET ?? ''

type AutomationRefreshResult = {
  session: SessionData
  orders: NormalizedOrder[]
}

async function refreshSessionIfPossible(integration: {
  _id: string
  provider: string
  externalStoreId?: string
  externalStoreName?: string
  loginUsername?: string
  loginPassword?: string
  sessionFailureCount?: number
}, options?: { includeOrders?: boolean }): Promise<AutomationRefreshResult | null> {
  if (!AUTOMATION_URL || !integration.loginUsername || !integration.loginPassword) return null

  const { serviceRes, data } = await requestAutomationLogin({
    automationUrl: AUTOMATION_URL,
    automationSecret: AUTOMATION_SECRET,
    provider: integration.provider,
    body: {
      provider: integration.provider,
      username: integration.loginUsername,
      password: decrypt(integration.loginPassword),
      preferredStoreId: integration.externalStoreId ?? undefined,
      preferredStoreName: integration.externalStoreName ?? undefined,
      includeOrders: options?.includeOrders ?? false,
    },
  })

  if (!data || !serviceRes.ok || !data.success) return null

  const normalizedSession = normalizeAutomationSession(data)
  if (!normalizedSession) return null

  const session = applySessionStoreDefaults(normalizedSession, {
    provider: integration.provider,
    externalStoreId: integration.externalStoreId ?? null,
    externalStoreName: integration.externalStoreName ?? null,
  })
  const capturedAt = new Date()
  const expiresAt = new Date(capturedAt.getTime() + (session.sessionTtlSeconds ?? 86400) * 1000)

  await IntegrationModel.findByIdAndUpdate(integration._id, buildSessionSuccessUpdate({
    sessionData: encryptJSON(session),
    sessionStatus: 'active',
    sessionCapturedAt: capturedAt,
    sessionExpiresAt: expiresAt,
  }))

  return {
    session,
    orders: (Array.isArray(data.orders) ? data.orders : []) as NormalizedOrder[],
  }
}

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
    .select('+credentials +sessionData +loginPassword')
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
    sessionFailureCount?: number
    sessionExpiresAt?: Date
    loginUsername?: string
    loginPassword?: string
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
      const shouldFetchLiveOrders = intg.provider === 'grab'
      let refreshed: AutomationRefreshResult | null = null
      let session = intg.sessionData ? decryptJSON<SessionData>(intg.sessionData) : null
      const isExpired = intg.sessionExpiresAt ? new Date(intg.sessionExpiresAt) < new Date() : false

      if (!session || isExpired) {
        refreshed = await refreshSessionIfPossible(intg, { includeOrders: shouldFetchLiveOrders })
        session = refreshed?.session ?? null
        if (!session) {
          await IntegrationModel.findByIdAndUpdate(params.id, buildSessionFailureUpdate({
            provider: intg.provider,
            currentFailureCount: intg.sessionFailureCount,
            errorMessage: 'Session đã hết hạn – vui lòng đăng nhập lại',
            fallbackStatus: 'expired',
          }))
          return err('Session đã hết hạn – vui lòng đăng nhập lại', 400)
        }
      }

      let storeId = buildSessionStoreId(intg.externalStoreId, session)
      let result  = await adapter.fetchOrdersWithSession(session, storeId)
      if (result === null && shouldFetchLiveOrders && refreshed) {
        result = refreshed.orders
      }
      if (result === null) {
        refreshed = await refreshSessionIfPossible(intg, { includeOrders: shouldFetchLiveOrders })
        session = refreshed?.session ?? null
        if (!session) {
          await IntegrationModel.findByIdAndUpdate(params.id, buildSessionFailureUpdate({
            provider: intg.provider,
            currentFailureCount: intg.sessionFailureCount,
            errorMessage: 'Session hết hạn – đăng nhập lại để tiếp tục',
            fallbackStatus: 'expired',
          }))
          return err('Session hết hạn – đăng nhập lại để tiếp tục', 401)
        }
        storeId = buildSessionStoreId(intg.externalStoreId, session)
        result = await adapter.fetchOrdersWithSession(session, storeId)
        if (result === null && shouldFetchLiveOrders && refreshed) {
          result = refreshed.orders
        }
        if (result === null) {
          await IntegrationModel.findByIdAndUpdate(params.id, buildSessionFailureUpdate({
            provider: intg.provider,
            currentFailureCount: intg.sessionFailureCount,
            errorMessage: 'Session hết hạn – đăng nhập lại để tiếp tục',
            fallbackStatus: 'expired',
          }))
          return err('Session hết hạn – đăng nhập lại để tiếp tục', 401)
        }
      }
      if (refreshed?.orders.length) {
        result = mergeOrdersByExternalOrderId(result, refreshed.orders)
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
    const externalOrderIds = orders
      .map((order) => order.externalOrderId)
      .filter((value): value is string => Boolean(value))

    const existingOrders = externalOrderIds.length
      ? await OrderModel.find({ source: intg.provider, externalOrderId: { $in: externalOrderIds } })
          .select('externalOrderId customerName customerPhone items subtotal discount total platformFee paymentMethod deliveryInfo driverInfo rawPayload')
          .lean()
      : []

    const existingOrdersByExternalId = new Map(
      existingOrders.map((order) => [String(order.externalOrderId ?? ''), order])
    )

    for (const normalized of orders) {
      try {
        if (!normalized.externalOrderId) continue

        const mergedNormalized = mergeNormalizedOrderPreservingDetail(
          existingOrdersByExternalId.get(normalized.externalOrderId) as Partial<NormalizedOrder> | undefined,
          normalized
        )

        const result = await OrderModel.findOneAndUpdate(
          { source: mergedNormalized.source, externalOrderId: mergedNormalized.externalOrderId },
          buildOrderUpsert(intg, mergedNormalized),
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
    const integrationUpdateSet: Record<string, unknown> = {
      syncStatus: status,
      lastSyncAt: new Date(),
    }
    if (intg.loginMode === 'auto') {
      integrationUpdateSet.sessionStatus = 'active'
      integrationUpdateSet.sessionFailureCount = 0
    }
    if (status === 'error') integrationUpdateSet.syncError = errors.slice(0, 3).join('; ')

    await IntegrationModel.findByIdAndUpdate(params.id, {
      $set: integrationUpdateSet,
      ...(status === 'error'
        ? {}
        : { $unset: intg.loginMode === 'auto' ? { syncError: 1, sessionError: 1 } : { syncError: 1 } }),
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
