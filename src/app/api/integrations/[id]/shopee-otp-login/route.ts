/**
 * POST /api/integrations/[id]/shopee-otp-login
 *
 * Step 1 – initiate login: body { step: 'login', phone, password }
 *   → Calls Shopee Food merchant portal auth API.
 *   → Returns { requiresOtp: true, otpTarget: '0xxx', sessionKey: '...' }
 *     or { success: true } if no OTP required.
 *
 * Step 2 – submit OTP: body { step: 'otp', phone, otp, sessionKey }
 *   → Verifies OTP and stores session in DB.
 *   → Returns { success: true, sessionExpiresAt: '...' }
 */
import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { ok, err, requireAdmin } from '@/lib/api-helpers'
import { encryptJSON, encrypt } from '@/lib/crypto'
import type { SessionData } from '@/integrations/types'

const SHOPEE_MERCHANT_BASE = 'https://merchant.shopeefood.vn'
const SESSION_TTL = 24 * 3600 // 24h default

type ShopeeLoginBody = {
  step: 'login' | 'otp'
  phone?: string
  password?: string
  otp?: string
  sessionKey?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { res } = await requireAdmin(req)
  if (res) return res

  await connectDB()
  const integ = await IntegrationModel.findById(params.id)
  if (!integ) return err('Không tìm thấy integration', 404)
  if (integ.provider !== 'shopee') return err('Chỉ dùng cho Shopee Food')

  const body = (await req.json()) as ShopeeLoginBody
  const { step } = body

  if (step === 'login') {
    const phone    = (body.phone ?? '').trim()
    const password = (body.password ?? '').trim()
    if (!phone || !password) return err('Thiếu số điện thoại hoặc mật khẩu')

    // Save username to DB
    await IntegrationModel.updateOne(
      { _id: params.id },
      { loginUsername: phone, loginPassword: encrypt(password), loginMode: 'auto' },
    )

    // ── Attempt Shopee Food merchant portal login ─────────────────────────
    // We try multiple known endpoints in sequence, recording the first
    // successful or OTP-requiring response.
    const loginAttempts = [
      // Attempt 1 – shopeefood merchant portal internal API
      {
        url: `${SHOPEE_MERCHANT_BASE}/api/v1/merchant/auth/login`,
        body: { phone, password },
      },
      // Attempt 2 – shopeefood partner API login (phone+password)
      {
        url: `https://partner.shopeefood.vn/api/v1/merchant/auth/login`,
        body: { phone, password },
      },
      // Attempt 3 – Shopee unified account (member API)
      {
        url: `https://member.shopee.vn/api/v2/login/`,
        body: { username: phone, password, client_type: 1, support_whatsapp: false },
      },
    ]

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Referer: SHOPEE_MERCHANT_BASE,
      Origin: SHOPEE_MERCHANT_BASE,
    }

    const results: Array<{ url: string; status: number; body: unknown; error?: string }> = []

    for (const attempt of loginAttempts) {
      try {
        const r = await fetch(attempt.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(attempt.body),
          signal: AbortSignal.timeout(15_000),
        })
        const data = await r.json()
        results.push({ url: attempt.url, status: r.status, body: data })

        // Check for OTP requirement
        const needsOtp =
          data?.requires_otp === true ||
          data?.need_otp === true ||
          data?.otp_required === true ||
          data?.error_code === 'OTP_REQUIRED' ||
          (typeof data?.message === 'string' &&
            data.message.toLowerCase().includes('otp'))

        if (needsOtp) {
          const sessionKey = data?.session_key ?? data?.login_session ?? data?.otp_session ?? String(Date.now())
          return ok({
            requiresOtp: true,
            otpTarget:   data?.otp_target ?? data?.phone_masked ?? phone.replace(/(\d{3})\d+(\d{3})/, '$1***$2'),
            sessionKey,
            debug:       results,
          })
        }

        // Check for direct success (no OTP)
        const token =
          data?.access_token ?? data?.token ?? data?.data?.access_token ?? null
        const storeId = data?.store_id ?? data?.restaurant_id ?? null

        if ((r.ok || r.status === 200) && token) {
          await storeSession(params.id, token, storeId, phone, SESSION_TTL)
          return ok({ success: true, debug: results })
        }
      } catch (e) {
        results.push({
          url: attempt.url,
          status: 0,
          body: null,
          error: e instanceof Error ? e.message : 'timeout',
        })
      }
    }

    // None of the attempts returned a clear success – return debug info
    return ok({
      requiresOtp:  false,
      success:      false,
      message:
        'Không kết nối được với Shopee API. Xem debug bên dưới để xác định endpoint đúng.',
      debug: results,
    })
  }

  // ── Step: OTP verification ──────────────────────────────────────────────
  if (step === 'otp') {
    const phone      = (body.phone ?? integ.loginUsername ?? '').trim()
    const otp        = (body.otp ?? '').trim()
    const sessionKey = (body.sessionKey ?? '').trim()
    if (!otp) return err('Thiếu mã OTP')

    const otpAttempts = [
      {
        url: `${SHOPEE_MERCHANT_BASE}/api/v1/merchant/auth/verify_otp`,
        body: { phone, otp, session_key: sessionKey },
      },
      {
        url: `${SHOPEE_MERCHANT_BASE}/api/v1/merchant/auth/login_otp`,
        body: { phone, otp, session_key: sessionKey },
      },
      {
        url: `https://partner.shopeefood.vn/api/v1/merchant/auth/verify_otp`,
        body: { phone, otp, session_key: sessionKey },
      },
      {
        url: `https://member.shopee.vn/api/v2/login/otp`,
        body: { username: phone, otp, session_key: sessionKey, client_type: 1 },
      },
    ]

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Referer: SHOPEE_MERCHANT_BASE,
      Origin: SHOPEE_MERCHANT_BASE,
    }

    const results: Array<{ url: string; status: number; body: unknown; error?: string }> = []

    for (const attempt of otpAttempts) {
      try {
        const r = await fetch(attempt.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(attempt.body),
          signal: AbortSignal.timeout(15_000),
        })
        const data = await r.json()
        results.push({ url: attempt.url, status: r.status, body: data })

        const token =
          data?.access_token ?? data?.token ?? data?.data?.access_token ?? null
        const storeId = data?.store_id ?? data?.restaurant_id ?? null

        if ((r.ok || r.status === 200) && token) {
          await storeSession(params.id, token, storeId, phone, SESSION_TTL)
          return ok({ success: true, debug: results })
        }
      } catch (e) {
        results.push({
          url: attempt.url,
          status: 0,
          body: null,
          error: e instanceof Error ? e.message : 'timeout',
        })
      }
    }

    return ok({
      success: false,
      message: 'OTP không khớp hoặc đã hết hạn. Xem debug để điều chỉnh endpoint.',
      debug: results,
    })
  }

  return err('step không hợp lệ — dùng "login" hoặc "otp"')
}

async function storeSession(
  integId: string,
  token: string,
  storeId: string | null,
  phone: string,
  ttlSeconds: number,
) {
  const session: SessionData = {
    cookies: [],
    extraHeaders: { Authorization: `Bearer ${token}` },
    capturedAt: new Date().toISOString(),
    sessionTtlSeconds: ttlSeconds,
  }
  if (storeId) session.extraHeaders!['x-store-id'] = String(storeId)

  const capturedAt = new Date()
  const expiresAt  = new Date(capturedAt.getTime() + ttlSeconds * 1000)

  const updates: Record<string, unknown> = {
    loginMode:         'auto',
    sessionData:       encryptJSON(session),
    sessionStatus:     'active',
    sessionCapturedAt: capturedAt,
    sessionExpiresAt:  expiresAt,
    sessionError:      undefined,
    automationRunning: false,
  }
  if (phone)   updates.loginUsername   = phone
  if (storeId) updates.externalStoreId = String(storeId)

  await IntegrationModel.updateOne({ _id: integId }, updates)
}
