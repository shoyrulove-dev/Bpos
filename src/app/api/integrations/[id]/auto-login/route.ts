/**
 * POST /api/integrations/[id]/auto-login
 *   Trigger automation login via the bpos-automation microservice (VPS).
 *   Body: { username?, password?, otp?, sessionKey? }
 *   - First call (no otp): starts browser, may return { requiresOtp, sessionKey }
 *   - Second call (with otp + sessionKey): resumes browser, fills OTP, captures session
 *
 * GET /api/integrations/[id]/auto-login
 *   Return current session status.
 *
 * Env: AUTOMATION_SERVICE_URL, AUTOMATION_SECRET
 */
import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { ok, err, requireAdmin } from '@/lib/api-helpers'
import { encryptJSON, encrypt, decrypt } from '@/lib/crypto'
import { applySessionStoreDefaults, normalizeAutomationSession } from '@/lib/automation-session'
import { isSessionValid } from '@/services/automation/runner'
import type { SessionData } from '@/integrations/types'

const AUTOMATION_URL    = process.env.AUTOMATION_SERVICE_URL ?? ''
const AUTOMATION_SECRET = process.env.AUTOMATION_SECRET ?? ''
const SESSION_LOGIN_PROVIDERS = new Set(['shopee', 'grab', 'xanh_sm', 'be'])
const SMS_OTP_PROVIDERS = new Set(['shopee', 'xanh_sm'])

// ─── GET – session status ─────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAdmin(req)
  if (res) return res

  await connectDB()
  const integ = await IntegrationModel.findById(params.id)
  if (!integ) return err('Không tìm thấy integration', 404)

  return ok({
    loginMode:         integ.loginMode,
    sessionStatus:     integ.sessionStatus,
    sessionCapturedAt: integ.sessionCapturedAt,
    sessionExpiresAt:  integ.sessionExpiresAt,
    sessionError:      integ.sessionError,
    automationRunning: integ.automationRunning,
    sessionValid:      isSessionValid(integ.sessionExpiresAt),
  })
}

// ─── POST – trigger login via microservice ────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAdmin(req)
  if (res) return res

  if (!AUTOMATION_URL) {
    return err('AUTOMATION_SERVICE_URL chưa được cấu hình trên server')
  }

  await connectDB()
  const integ = await IntegrationModel.findById(params.id).select('+loginPassword')
  if (!integ) return err('Không tìm thấy integration', 404)

  if (!SESSION_LOGIN_PROVIDERS.has(integ.provider)) {
    return err('Provider này chưa hỗ trợ lưu session đăng nhập')
  }

  if (integ.automationRunning) {
    return err('Automation đang chạy, vui lòng chờ')
  }

  const body = await req.json() as {
    username?: string; password?: string; otp?: string; sessionKey?: string
    // Manual mode: user pastes JWT token directly from browser DevTools
    manualJwt?: string; storeId?: string
  }

  // ─── Manual session mode (no Playwright needed) ─────────────────────────
  if (body.manualJwt) {
    const jwt = body.manualJwt.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return err('JWT token không hợp lệ')

    const session: SessionData = {
      cookies: [],
      extraHeaders: { Authorization: `Bearer ${jwt}` },
      capturedAt: new Date().toISOString(),
      sessionTtlSeconds: 8 * 3600,  // assume 8h, user can re-login when expired
    }
    if (body.storeId) session.extraHeaders!['x-store-id'] = body.storeId

    const encryptedSession = encryptJSON(session)
    const capturedAt = new Date()
    const expiresAt  = new Date(capturedAt.getTime() + 8 * 3600 * 1000)

    const updates: Record<string, unknown> = {
      loginMode: 'auto',
      sessionData: encryptedSession,
      sessionStatus: 'active',
      sessionCapturedAt: capturedAt,
      sessionExpiresAt: expiresAt,
      sessionError: undefined,
      automationRunning: false,
    }
    if (body.username) { updates.loginUsername = body.username }
    if (body.storeId)  { updates.externalStoreId = body.storeId }

    await IntegrationModel.updateOne({ _id: params.id }, updates)
    return ok({ success: true, sessionExpiresAt: expiresAt, manual: true })
  }
  // ────────────────────────────────────────────────────────────────────────

  const username = body.username ?? integ.loginUsername ?? ''
  const password = body.password ?? (integ.loginPassword ? decrypt(integ.loginPassword) : '')
  const otp        = body.otp ?? undefined
  const sessionKey = body.sessionKey ?? undefined

  if (!username) return err('Thiếu username')
  if (!sessionKey && !password && !SMS_OTP_PROVIDERS.has(integ.provider)) {
    return err('Thiếu password (bắt buộc cho lần đăng nhập đầu tiên)')
  }

  // Persist updated credentials if provided
  const credUpdates: Record<string, unknown> = { loginMode: 'auto', automationRunning: true }
  if (body.username) credUpdates.loginUsername = body.username
  if (body.password) credUpdates.loginPassword = encrypt(body.password)
  await IntegrationModel.updateOne({ _id: params.id }, credUpdates)

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
        otp,
        sessionKey,
        preferredStoreId: integ.externalStoreId ?? body.storeId ?? undefined,
        preferredStoreName: integ.externalStoreName ?? undefined,
      }),
      signal: AbortSignal.timeout(120_000),  // 2 minute timeout
    })

    const data = await serviceRes.json() as {
      success?: boolean
      requiresOtp?: boolean
      otpTarget?: string
      sessionKey?: string
      session?: SessionData
      token?: string
      expiresAt?: string | number
      extraHeaders?: Record<string, string>
      storeId?: string | number
      storeName?: string
      error?: string
    }

    if (data.requiresOtp) {
      // OTP required – browser is paused at OTP input screen in the microservice
      await IntegrationModel.updateOne({ _id: params.id }, {
        automationRunning: false,
        sessionStatus: 'none',
      })
      return ok({ requiresOtp: true, otpTarget: data.otpTarget, sessionKey: data.sessionKey })
    }

    const normalizedSession = normalizeAutomationSession(data)
    const session = normalizedSession
      ? applySessionStoreDefaults(normalizedSession, {
          provider: integ.provider,
          externalStoreId: integ.externalStoreId ?? body.storeId ?? null,
          externalStoreName: integ.externalStoreName ?? null,
        })
      : null

    if (data.success && session) {
      const encryptedSession = encryptJSON(session)
      const capturedAt       = new Date()
      const ttl              = session.sessionTtlSeconds ?? 86400
      const expiresAt        = new Date(capturedAt.getTime() + ttl * 1000)

      await IntegrationModel.updateOne({ _id: params.id }, {
        sessionData:       encryptedSession,
        sessionStatus:     'active',
        sessionCapturedAt: capturedAt,
        sessionExpiresAt:  expiresAt,
        sessionError:      undefined,
        automationRunning: false,
      })
      return ok({ success: true, sessionExpiresAt: expiresAt })
    }

    await IntegrationModel.updateOne({ _id: params.id }, {
      sessionStatus: 'error',
      sessionError:  data.error ?? 'Đăng nhập thất bại',
      automationRunning: false,
    })
    return err(data.error ?? 'Đăng nhập thất bại')

  } catch (e) {
    await IntegrationModel.updateOne({ _id: params.id }, {
      sessionStatus: 'error',
      sessionError:  e instanceof Error ? e.message : 'Lỗi kết nối tới automation service',
      automationRunning: false,
    })
    return err(e instanceof Error ? e.message : 'Lỗi kết nối tới automation service')
  }
}

