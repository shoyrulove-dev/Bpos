import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { requireAdmin } from '@/lib/api-helpers'
import { requestAutomationLogin } from '@/lib/automation-login'
import { decrypt, encryptJSON } from '@/lib/crypto'
import { applySessionStoreDefaults, normalizeAutomationSession } from '@/lib/automation-session'
import { buildSessionFailureUpdate, buildSessionSuccessUpdate } from '@/lib/session-health'

const CRON_SECRET = process.env.CRON_SECRET
const AUTOMATION_URL = process.env.AUTOMATION_SERVICE_URL ?? ''
const AUTOMATION_SECRET = process.env.AUTOMATION_SECRET ?? ''
const DEFAULT_PROVIDER = 'grab'
const DEFAULT_BATCH_LIMIT = 10

type SupportedProvider = 'grab' | 'be' | 'shopee' | 'xanh_sm'

type BatchBrowserRelogBody = {
  provider?: SupportedProvider
  ids?: string[]
  limit?: number
  force?: boolean
}

function normalizeIds(ids: unknown) {
  if (!Array.isArray(ids)) return []
  return ids
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
}

function normalizeProvider(value: unknown): SupportedProvider {
  return value === 'be' || value === 'shopee' || value === 'xanh_sm' || value === 'grab'
    ? value
    : DEFAULT_PROVIDER
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secretParam = req.nextUrl.searchParams.get('secret')
  const secretAuthorized = Boolean(
    CRON_SECRET && (authHeader === `Bearer ${CRON_SECRET}` || secretParam === CRON_SECRET)
  )

  if (!secretAuthorized) {
    const { res } = await requireAdmin(req)
    if (res) return res
  }

  if (!AUTOMATION_URL) {
    return NextResponse.json({ error: 'AUTOMATION_SERVICE_URL chưa được cấu hình trên server' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({})) as BatchBrowserRelogBody
  const provider = normalizeProvider(body.provider)
  const ids = normalizeIds(body.ids)
  const force = Boolean(body.force)
  const limit = Math.max(1, Math.min(50, Number(body.limit) || DEFAULT_BATCH_LIMIT))

  await connectDB()

  const now = new Date()
  const query: Record<string, unknown> = {
    provider,
    loginMode: 'auto',
    isActive: true,
    automationRunning: false,
  }

  if (ids.length) {
    query._id = { $in: ids }
  }

  if (!force) {
    query.$or = [
      { sessionStatus: { $in: ['expired', 'error', 'none'] } },
      { sessionExpiresAt: { $exists: false } },
      { sessionExpiresAt: { $lt: now } },
    ]
  }

  const totalMatching = await IntegrationModel.countDocuments(query)
  const integrations = await IntegrationModel.find(query)
    .sort({ sessionExpiresAt: 1, updatedAt: 1 })
    .limit(limit)
    .select('+loginPassword')

  const results: Array<Record<string, unknown>> = []
  let successCount = 0
  let failureCount = 0

  for (const integration of integrations) {
    const username = integration.loginUsername?.trim() ?? ''
    const password = integration.loginPassword ? decrypt(integration.loginPassword) : ''

    if (!username || !password) {
      failureCount += 1
      await IntegrationModel.updateOne({ _id: integration._id }, buildSessionFailureUpdate({
        provider: integration.provider,
        currentFailureCount: integration.sessionFailureCount,
        errorMessage: 'Thiếu username hoặc password để relog browser',
        fallbackStatus: 'error',
      }))
      results.push({
        id: String(integration._id),
        provider: integration.provider,
        loginUsername: integration.loginUsername,
        externalStoreId: integration.externalStoreId,
        ok: false,
        error: 'Thiếu username hoặc password để relog browser',
      })
      continue
    }

    await IntegrationModel.updateOne({ _id: integration._id }, {
      $set: {
        automationRunning: true,
      },
    })

    try {
      const { serviceRes, data, parseError } = await requestAutomationLogin({
        automationUrl: AUTOMATION_URL,
        automationSecret: AUTOMATION_SECRET,
        provider: integration.provider,
        body: {
          provider: integration.provider,
          username,
          password,
          preferredStoreId: integration.externalStoreId ?? undefined,
          preferredStoreName: integration.externalStoreName ?? undefined,
        },
      })

      if (!data) {
        const errorMessage = parseError ?? `Automation service lỗi (${serviceRes.status})`
        failureCount += 1
        await IntegrationModel.updateOne({ _id: integration._id }, buildSessionFailureUpdate({
          provider: integration.provider,
          currentFailureCount: integration.sessionFailureCount,
          errorMessage,
          fallbackStatus: 'error',
          extraSet: { automationRunning: false },
        }))
        results.push({
          id: String(integration._id),
          provider: integration.provider,
          loginUsername: integration.loginUsername,
          externalStoreId: integration.externalStoreId,
          ok: false,
          error: errorMessage,
        })
        continue
      }

      if (data.requiresOtp) {
        failureCount += 1
        await IntegrationModel.updateOne({ _id: integration._id }, buildSessionFailureUpdate({
          provider: integration.provider,
          currentFailureCount: integration.sessionFailureCount,
          errorMessage: 'Automation yêu cầu OTP, không thể relog batch',
          fallbackStatus: 'error',
          extraSet: { automationRunning: false },
        }))
        results.push({
          id: String(integration._id),
          provider: integration.provider,
          loginUsername: integration.loginUsername,
          externalStoreId: integration.externalStoreId,
          ok: false,
          error: 'Automation yêu cầu OTP, không thể relog batch',
        })
        continue
      }

      const normalizedSession = normalizeAutomationSession(data)
      const session = normalizedSession
        ? applySessionStoreDefaults(normalizedSession, {
            provider: integration.provider,
            externalStoreId: integration.externalStoreId ?? null,
            externalStoreName: integration.externalStoreName ?? null,
          })
        : null

      if (!serviceRes.ok || !data.success || !session) {
        const errorMessage = data.error ?? parseError ?? `Đăng nhập thất bại (${serviceRes.status})`
        failureCount += 1
        await IntegrationModel.updateOne({ _id: integration._id }, buildSessionFailureUpdate({
          provider: integration.provider,
          currentFailureCount: integration.sessionFailureCount,
          errorMessage,
          fallbackStatus: 'error',
          extraSet: { automationRunning: false },
        }))
        results.push({
          id: String(integration._id),
          provider: integration.provider,
          loginUsername: integration.loginUsername,
          externalStoreId: integration.externalStoreId,
          ok: false,
          error: errorMessage,
        })
        continue
      }

      const capturedAt = new Date()
      const ttlSeconds = session.sessionTtlSeconds ?? 86400
      const expiresAt = new Date(capturedAt.getTime() + ttlSeconds * 1000)

      await IntegrationModel.updateOne({ _id: integration._id }, buildSessionSuccessUpdate({
        sessionData: encryptJSON(session),
        sessionStatus: 'active',
        sessionCapturedAt: capturedAt,
        sessionExpiresAt: expiresAt,
        automationRunning: false,
      }))

      successCount += 1
      results.push({
        id: String(integration._id),
        provider: integration.provider,
        loginUsername: integration.loginUsername,
        externalStoreId: integration.externalStoreId,
        ok: true,
        sessionExpiresAt: expiresAt,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Lỗi relog browser không xác định'
      failureCount += 1
      await IntegrationModel.updateOne({ _id: integration._id }, buildSessionFailureUpdate({
        provider: integration.provider,
        currentFailureCount: integration.sessionFailureCount,
        errorMessage,
        fallbackStatus: 'error',
        extraSet: { automationRunning: false },
      }))
      results.push({
        id: String(integration._id),
        provider: integration.provider,
        loginUsername: integration.loginUsername,
        externalStoreId: integration.externalStoreId,
        ok: false,
        error: errorMessage,
      })
    }
  }

  return NextResponse.json({
    ok: true,
    provider,
    requestedIds: ids.length,
    matched: totalMatching,
    processed: integrations.length,
    successCount,
    failureCount,
    results,
  })
}