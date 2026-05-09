// GET /api/cron/refresh-sessions
// Finds integrations in auto-login mode whose session expires within 30 minutes
// and re-runs automation login via the bpos-automation microservice to refresh them.
// Runs every 15 minutes via vercel.json cron.
// Env: AUTOMATION_SERVICE_URL, AUTOMATION_SECRET, CRON_SECRET
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { requestAutomationLogin } from '@/lib/automation-login'
import { decrypt, encryptJSON } from '@/lib/crypto'
import { applySessionStoreDefaults, normalizeAutomationSession } from '@/lib/automation-session'
import { buildSessionFailureUpdate, buildSessionSuccessUpdate } from '@/lib/session-health'
import type { SessionData } from '@/integrations/types'

const AUTOMATION_URL    = process.env.AUTOMATION_SERVICE_URL ?? ''
const AUTOMATION_SECRET = process.env.AUTOMATION_SECRET ?? ''
const SESSION_REFRESH_BATCH_SIZE = Math.max(1, Number(process.env.SESSION_REFRESH_BATCH_SIZE ?? 2))

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? req.nextUrl.searchParams.get('secret') ?? ''
    if (auth !== `Bearer ${cronSecret}` && auth !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  if (!AUTOMATION_URL) {
    return NextResponse.json({ error: 'AUTOMATION_SERVICE_URL not configured' }, { status: 500 })
  }

  await connectDB()

  // Reset any integrations stuck with automationRunning:true for more than 10 minutes.
  // This can happen if a Vercel function hard-timed-out before cleanup ran.
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000)
  const stuckReset = await IntegrationModel.updateMany(
    { loginMode: 'auto', isActive: true, automationRunning: true, updatedAt: { $lt: tenMinAgo } },
    { $set: { automationRunning: false } }
  )
  const stuckCount = stuckReset.modifiedCount ?? 0

  const thirtyMinFromNow = new Date(Date.now() + 30 * 60 * 1000)
  const query = {
    loginMode:         'auto',
    isActive:          true,
    automationRunning: false,
    $or: [
      { sessionStatus: 'expired' },
      { sessionStatus: 'error' },
      { sessionStatus: 'active', sessionExpiresAt: { $lt: thirtyMinFromNow } },
    ],
  }

  const pendingCount = await IntegrationModel.countDocuments(query)
  const integrations = await IntegrationModel.find(query)
    .sort({ sessionExpiresAt: 1, updatedAt: 1 })
    .limit(SESSION_REFRESH_BATCH_SIZE)
    .select('+loginPassword')

  if (integrations.length === 0) {
    return NextResponse.json({ refreshed: 0, stuckReset: stuckCount, message: 'Không có session nào cần refresh' })
  }

  const results: { id: string; provider: string; success: boolean; error?: string }[] = []

  for (const integ of integrations) {
    const username = integ.loginUsername
    const password = integ.loginPassword ? decrypt(integ.loginPassword) : null

    if (!username || !password) {
      results.push({ id: String(integ._id), provider: integ.provider, success: false, error: 'Thiếu credentials' })
      continue
    }

    await IntegrationModel.updateOne({ _id: integ._id }, {
      sessionStatus: 'expired',
      automationRunning: true,
    })

    try {
      const { serviceRes, data, parseError } = await requestAutomationLogin({
        automationUrl: AUTOMATION_URL,
        automationSecret: AUTOMATION_SECRET,
        provider: integ.provider,
        body: {
          provider: integ.provider,
          username,
          password,
          preferredStoreId: integ.externalStoreId ?? undefined,
          preferredStoreName: integ.externalStoreName ?? undefined,
        },
      })

      if (!data) {
        const errorMessage = parseError ?? `Automation service lỗi (${serviceRes.status})`
        await IntegrationModel.updateOne({ _id: integ._id }, buildSessionFailureUpdate({
          provider: integ.provider,
          currentFailureCount: integ.sessionFailureCount,
          errorMessage,
          fallbackStatus: 'error',
          extraSet: { automationRunning: false },
        }))
        results.push({ id: String(integ._id), provider: integ.provider, success: false, error: errorMessage })
        continue
      }

      if (!serviceRes.ok && !data.success && !data.requiresOtp) {
        const errorMessage = data.error ?? `Automation service lỗi (${serviceRes.status})`
        await IntegrationModel.updateOne({ _id: integ._id }, buildSessionFailureUpdate({
          provider: integ.provider,
          currentFailureCount: integ.sessionFailureCount,
          errorMessage,
          fallbackStatus: 'error',
          extraSet: { automationRunning: false },
        }))
        results.push({ id: String(integ._id), provider: integ.provider, success: false, error: errorMessage })
        continue
      }

      const normalizedSession = normalizeAutomationSession(data)
      const session = normalizedSession
        ? applySessionStoreDefaults(normalizedSession, {
            provider: integ.provider,
            externalStoreId: integ.externalStoreId ?? null,
            externalStoreName: integ.externalStoreName ?? null,
          })
        : null

      if (data.success && session) {
        const capturedAt = new Date()
        const ttl        = session.sessionTtlSeconds ?? 86400
        const expiresAt  = new Date(capturedAt.getTime() + ttl * 1000)
        await IntegrationModel.updateOne({ _id: integ._id }, buildSessionSuccessUpdate({
          sessionData:       encryptJSON(session),
          sessionStatus:     'active',
          sessionCapturedAt: capturedAt,
          sessionExpiresAt:  expiresAt,
          automationRunning: false,
        }))
        results.push({ id: String(integ._id), provider: integ.provider, success: true })
      } else if (data.requiresOtp) {
        // Can't auto-refresh OTP-protected sessions (needs manual OTP input)
        await IntegrationModel.updateOne({ _id: integ._id }, buildSessionFailureUpdate({
          provider: integ.provider,
          currentFailureCount: integ.sessionFailureCount,
          errorMessage: 'Cần nhập OTP thủ công để refresh session',
          fallbackStatus: 'error',
          extraSet: { automationRunning: false },
        }))
        results.push({ id: String(integ._id), provider: integ.provider, success: false, error: 'OTP required' })
      } else {
        await IntegrationModel.updateOne({ _id: integ._id }, buildSessionFailureUpdate({
          provider: integ.provider,
          currentFailureCount: integ.sessionFailureCount,
          errorMessage: data.error ?? 'Auto-refresh thất bại',
          fallbackStatus: 'error',
          extraSet: { automationRunning: false },
        }))
        results.push({ id: String(integ._id), provider: integ.provider, success: false, error: data.error })
      }
    } catch (e) {
      await IntegrationModel.updateOne({ _id: integ._id }, buildSessionFailureUpdate({
        provider: integ.provider,
        currentFailureCount: integ.sessionFailureCount,
        errorMessage: e instanceof Error ? e.message : 'Network error',
        fallbackStatus: 'error',
        extraSet: { automationRunning: false },
      }))
      results.push({ id: String(integ._id), provider: integ.provider, success: false, error: String(e) })
    }
  }

  return NextResponse.json({
    refreshed: integrations.length,
    remaining: Math.max(pendingCount - integrations.length, 0),
    batchSize: SESSION_REFRESH_BATCH_SIZE,
    stuckReset: stuckCount,
    results,
  })
}

