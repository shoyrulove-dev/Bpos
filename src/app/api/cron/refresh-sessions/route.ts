// GET /api/cron/refresh-sessions
// Finds integrations in auto-login mode whose session expires within 30 minutes
// and re-runs automation login via the bpos-automation microservice to refresh them.
// Runs every 15 minutes via vercel.json cron.
// Env: AUTOMATION_SERVICE_URL, AUTOMATION_SECRET, CRON_SECRET
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { decrypt, encryptJSON } from '@/lib/crypto'
import { normalizeAutomationSession } from '@/lib/automation-session'
import type { SessionData } from '@/integrations/types'

const AUTOMATION_URL    = process.env.AUTOMATION_SERVICE_URL ?? ''
const AUTOMATION_SECRET = process.env.AUTOMATION_SECRET ?? ''
const SESSION_REFRESH_BATCH_SIZE = Math.max(1, Number(process.env.SESSION_REFRESH_BATCH_SIZE ?? 2))

type AutomationLoginResponse = {
  success?: boolean
  session?: SessionData
  requiresOtp?: boolean
  error?: string
  token?: string
  expiresAt?: string | number
  extraHeaders?: Record<string, string>
  storeId?: string | number
  storeName?: string
}

async function parseAutomationLoginResponse(serviceRes: Response): Promise<{
  data: AutomationLoginResponse | null
  error?: string
}> {
  const raw = await serviceRes.text()
  const trimmed = raw.trim()

  if (!trimmed) {
    return {
      data: null,
      error: `Automation service trả về rỗng (${serviceRes.status})`,
    }
  }

  try {
    return {
      data: JSON.parse(trimmed) as AutomationLoginResponse,
    }
  } catch {
    return {
      data: null,
      error: `Automation service trả về JSON không hợp lệ (${serviceRes.status})`,
    }
  }
}

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

  const thirtyMinFromNow = new Date(Date.now() + 30 * 60 * 1000)
  const query = {
    loginMode:         'auto',
    isActive:          true,
    automationRunning: false,
    $or: [
      { sessionStatus: 'expired' },
      { sessionStatus: 'active', sessionExpiresAt: { $lt: thirtyMinFromNow } },
    ],
  }

  const pendingCount = await IntegrationModel.countDocuments(query)
  const integrations = await IntegrationModel.find(query)
    .sort({ sessionExpiresAt: 1, updatedAt: 1 })
    .limit(SESSION_REFRESH_BATCH_SIZE)
    .select('+loginPassword')

  if (integrations.length === 0) {
    return NextResponse.json({ refreshed: 0, message: 'Không có session nào cần refresh' })
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
      const serviceRes = await fetch(`${AUTOMATION_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AUTOMATION_SECRET}`,
        },
        body: JSON.stringify({
          provider: integ.provider,
          username,
          password,
          preferredStoreId: integ.externalStoreId ?? undefined,
          preferredStoreName: integ.externalStoreName ?? undefined,
        }),
        signal: AbortSignal.timeout(120_000),
      })

      const { data, error: parseError } = await parseAutomationLoginResponse(serviceRes)

      if (!data) {
        const errorMessage = parseError ?? `Automation service lỗi (${serviceRes.status})`
        await IntegrationModel.updateOne({ _id: integ._id }, {
          sessionStatus:     'error',
          sessionError:      errorMessage,
          automationRunning: false,
        })
        results.push({ id: String(integ._id), provider: integ.provider, success: false, error: errorMessage })
        continue
      }

      if (!serviceRes.ok && !data.success && !data.requiresOtp) {
        const errorMessage = data.error ?? `Automation service lỗi (${serviceRes.status})`
        await IntegrationModel.updateOne({ _id: integ._id }, {
          sessionStatus:     'error',
          sessionError:      errorMessage,
          automationRunning: false,
        })
        results.push({ id: String(integ._id), provider: integ.provider, success: false, error: errorMessage })
        continue
      }

      const session = normalizeAutomationSession(data)

      if (data.success && session) {
        const capturedAt = new Date()
        const ttl        = session.sessionTtlSeconds ?? 86400
        const expiresAt  = new Date(capturedAt.getTime() + ttl * 1000)
        await IntegrationModel.updateOne({ _id: integ._id }, {
          sessionData:       encryptJSON(session),
          sessionStatus:     'active',
          sessionCapturedAt: capturedAt,
          sessionExpiresAt:  expiresAt,
          sessionError:      undefined,
          automationRunning: false,
        })
        results.push({ id: String(integ._id), provider: integ.provider, success: true })
      } else if (data.requiresOtp) {
        // Can't auto-refresh OTP-protected sessions (needs manual OTP input)
        await IntegrationModel.updateOne({ _id: integ._id }, {
          sessionStatus:     'error',
          sessionError:      'Cần nhập OTP thủ công để refresh session',
          automationRunning: false,
        })
        results.push({ id: String(integ._id), provider: integ.provider, success: false, error: 'OTP required' })
      } else {
        await IntegrationModel.updateOne({ _id: integ._id }, {
          sessionStatus:     'error',
          sessionError:      data.error ?? 'Auto-refresh thất bại',
          automationRunning: false,
        })
        results.push({ id: String(integ._id), provider: integ.provider, success: false, error: data.error })
      }
    } catch (e) {
      await IntegrationModel.updateOne({ _id: integ._id }, {
        automationRunning: false,
        sessionError: e instanceof Error ? e.message : 'Network error',
      })
      results.push({ id: String(integ._id), provider: integ.provider, success: false, error: String(e) })
    }
  }

  return NextResponse.json({
    refreshed: integrations.length,
    remaining: Math.max(pendingCount - integrations.length, 0),
    batchSize: SESSION_REFRESH_BATCH_SIZE,
    results,
  })
}

