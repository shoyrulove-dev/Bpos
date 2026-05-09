import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import OrderModel from '@/models/Order'
import SyncLogModel from '@/models/SyncLog'
import { getAdapter } from '@/integrations/registry'
import { applySessionStoreDefaults, normalizeAutomationSession } from '@/lib/automation-session'
import { requestAutomationLogin } from '@/lib/automation-login'
import { decrypt, decryptJSON, encryptJSON } from '@/lib/crypto'
import { buildOrderUpsert, mergeNormalizedOrderPreservingDetail } from '@/lib/order-upsert'
import CustomerModel from '@/models/Customer'
import DriverModel from '@/models/Driver'
import { buildSessionStoreId, mergeApiOrdersWithRecentHistory, mergeOrdersByExternalOrderId, mergeSessionOrdersWithRecentHistory } from '@/lib/realtime-order-sync'
import { buildSessionFailureUpdate, buildSessionSuccessUpdate } from '@/lib/session-health'
import type { NormalizedOrder } from '@/types'
import type { SessionData } from '@/integrations/types'

const CRON_SECRET = process.env.CRON_SECRET
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
    orders: Array.isArray(data.orders) ? data.orders : [],
  }
}

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
      externalStoreName?: string
      credentials?: unknown
      loginMode?: 'api' | 'auto'
      loginUsername?: string
      loginPassword?: string
      sessionData?: string
      sessionStatus?: string
      sessionFailureCount?: number
      sessionExpiresAt?: Date
      isActive: boolean
    }

    const adapter = getAdapter(intg.provider)
    if (!adapter) continue

    const startedAt = Date.now()
    let upserted = 0
    let updated = 0
    let orders: NormalizedOrder[] = []

    try {
      await IntegrationModel.findByIdAndUpdate(intg._id, { syncStatus: 'syncing' })

      if (intg.loginMode === 'auto') {
        if (!adapter.fetchOrdersWithSession) {
          throw new Error('Provider này không hỗ trợ session auto-login')
        }
        const shouldFetchLiveOrders = intg.provider === 'grab'
        let refreshed: AutomationRefreshResult | null = null
        let session = intg.sessionData ? decryptJSON(intg.sessionData) as SessionData : null
        const isExpired = intg.sessionExpiresAt ? new Date(intg.sessionExpiresAt) < new Date() : false

        if (!session || isExpired) {
          refreshed = await refreshSessionIfPossible(intg, { includeOrders: shouldFetchLiveOrders })
          session = refreshed?.session ?? null
          if (!session) {
            await IntegrationModel.findByIdAndUpdate(intg._id, buildSessionFailureUpdate({
              provider: intg.provider,
              currentFailureCount: intg.sessionFailureCount,
              errorMessage: 'Session đã hết hạn – đang chờ refresh',
              fallbackStatus: 'expired',
            }))
            throw new Error('Session đã hết hạn – đang chờ refresh')
          }
        }

        let storeId = buildSessionStoreId(intg.externalStoreId, session)
        let result = await adapter.fetchOrdersWithSession(session, storeId)
        if (result === null && shouldFetchLiveOrders && refreshed) {
          result = refreshed.orders
        }
        if (result === null) {
          refreshed = await refreshSessionIfPossible(intg, { includeOrders: shouldFetchLiveOrders })
          session = refreshed?.session ?? null
          if (!session) {
            await IntegrationModel.findByIdAndUpdate(intg._id, buildSessionFailureUpdate({
              provider: intg.provider,
              currentFailureCount: intg.sessionFailureCount,
              errorMessage: 'Session hết hạn – cần đăng nhập lại',
              fallbackStatus: 'expired',
            }))
            throw new Error('Session hết hạn – cần đăng nhập lại')
          }
          storeId = buildSessionStoreId(intg.externalStoreId, session)
          result = await adapter.fetchOrdersWithSession(session, storeId)
          if (result === null && shouldFetchLiveOrders && refreshed) {
            result = refreshed.orders
          }
          if (result === null) {
            await IntegrationModel.findByIdAndUpdate(intg._id, buildSessionFailureUpdate({
              provider: intg.provider,
              currentFailureCount: intg.sessionFailureCount,
              errorMessage: 'Session hết hạn – cần đăng nhập lại',
              fallbackStatus: 'expired',
            }))
            throw new Error('Session hết hạn – cần đăng nhập lại')
          }
        }
        if (refreshed?.orders.length) {
          result = mergeOrdersByExternalOrderId(result, refreshed.orders)
        }

        orders = await mergeSessionOrdersWithRecentHistory(adapter, session, storeId, result)
      } else {
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
          shopId: credObj.shopId ?? intg.externalStoreId,
        }

        orders = await adapter.fetchOrders(config)
        orders = await mergeApiOrdersWithRecentHistory(adapter, config, orders)
      }

      // ── Upsert orders ─────────────────────────────────────────────────────
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

      const customersToSave: Array<{ name: string; phone: string; brandId: string }> = []
      const driversToSave: Array<{ name: string; phone: string; platform: string }> = []

      for (const normalized of orders) {
        if (!normalized.externalOrderId) continue
        try {
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

          // Collect customer info for auto-save
          const cName = mergedNormalized.customerName?.trim()
          const cPhone = mergedNormalized.customerPhone?.trim()
          const cLower = cName?.toLowerCase()
          if (cName && cPhone && cLower !== 'khách hàng' && cLower !== 'khach hang') {
            customersToSave.push({ name: cName, phone: cPhone, brandId: String(intg.brandId) })
          }

          // Collect driver info for auto-save
          const dName = mergedNormalized.driverInfo?.name?.trim()
          const dPhone = mergedNormalized.driverInfo?.phone?.trim()
          if (dName && dPhone) {
            driversToSave.push({ name: dName, phone: dPhone, platform: intg.provider })
          }
        } catch { /* skip individual order errors */ }
      }

      // Auto-save customers
      for (const c of customersToSave) {
        try {
          await CustomerModel.findOneAndUpdate(
            { phone: c.phone, brandId: c.brandId },
            { $set: { name: c.name, lastOrderAt: new Date() }, $setOnInsert: { points: 0, totalSpend: 0, orderCount: 0, tier: 'bronze', status: 'active' } },
            { upsert: true }
          )
        } catch { /* skip */ }
      }

      // Auto-save drivers
      for (const d of driversToSave) {
        try {
          await DriverModel.findOneAndUpdate(
            { phone: d.phone, platform: d.platform },
            { $set: { name: d.name, lastSeenAt: new Date() } },
            { upsert: true }
          )
        } catch { /* skip */ }
      }

      await IntegrationModel.findByIdAndUpdate(intg._id, intg.loginMode === 'auto'
        ? {
            ...buildSessionSuccessUpdate({
              syncStatus: 'success',
              lastSyncAt: new Date(),
              sessionStatus: 'active',
            }),
            $unset: { syncError: 1, sessionError: 1 },
          }
        : {
            $set: {
              syncStatus: 'success',
              lastSyncAt: new Date(),
            },
            $unset: { syncError: 1 },
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

