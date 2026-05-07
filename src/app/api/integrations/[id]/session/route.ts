/**
 * POST /api/integrations/[id]/session
 *   Manually paste session cookies (from browser DevTools) as fallback.
 *   Body: { cookies: PlaywrightCookie[], extraHeaders?: Record<string,string> }
 *
 * DELETE /api/integrations/[id]/session
 *   Clear stored session (force re-login next sync).
 */
import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { ok, err, requireAdmin } from '@/lib/api-helpers'
import { encryptJSON } from '@/lib/crypto'
import { getAutomation } from '@/services/automation/runner'
import type { SessionData, PlaywrightCookie } from '@/integrations/types'

// ─── POST – manual cookie paste ───────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAdmin(req)
  if (res) return res

  await connectDB()
  const integ = await IntegrationModel.findById(params.id)
  if (!integ) return err('Không tìm thấy integration', 404)

  const body = await req.json() as {
    cookies?: PlaywrightCookie[]
    extraHeaders?: Record<string, string>
    cookieString?: string  // raw "name=value; name2=value2" format from DevTools
  }

  let cookies: PlaywrightCookie[] = []

  if (body.cookies && body.cookies.length > 0) {
    cookies = body.cookies
  } else if (body.cookieString) {
    // Parse simple "name=value; ..." string pasted from DevTools
    cookies = body.cookieString.split(';').map(pair => {
      const [name, ...rest] = pair.trim().split('=')
      return {
        name: name.trim(),
        value: rest.join('=').trim(),
        domain: `.${new URL(`https://${integ.provider === 'shopee' ? 'shopee.vn' : integ.provider === 'grab' ? 'grab.com' : integ.provider + '.com'}`).hostname}`,
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: true,
        sameSite: 'Lax' as const,
      }
    }).filter(c => c.name)
  }

  const extraHeaders = { ...(body.extraHeaders ?? {}) }
  if (integ.provider === 'shopee' && !extraHeaders['x-csrftoken']) {
    const csrfCookie = cookies.find(cookie => cookie.name === 'SPC_F')
    if (csrfCookie?.value) extraHeaders['x-csrftoken'] = csrfCookie.value
  }

  if (!cookies.length && !Object.keys(extraHeaders).length) {
    return err('Thiếu session – gửi cookieString, cookies hoặc extraHeaders')
  }

  const automation = getAutomation(integ.provider)
  const ttl = automation?.sessionTtlSeconds ?? 24 * 3600

  const session: SessionData = {
    cookies,
    extraHeaders: Object.keys(extraHeaders).length ? extraHeaders : undefined,
    capturedAt: new Date().toISOString(),
    sessionTtlSeconds: ttl,
  }

  const capturedAt = new Date()
  const expiresAt  = new Date(capturedAt.getTime() + ttl * 1000)

  await IntegrationModel.updateOne({ _id: params.id }, {
    sessionData:       encryptJSON(session),
    sessionStatus:     'active',
    sessionCapturedAt: capturedAt,
    sessionExpiresAt:  expiresAt,
    sessionError:      undefined,
    automationRunning: false,
    loginMode:         'auto',
  })

  return ok({
    message:           'Session đã được lưu thành công',
    sessionCapturedAt: capturedAt,
    sessionExpiresAt:  expiresAt,
    cookieCount:       cookies.length,
  })
}

// ─── DELETE – clear session ───────────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAdmin(req)
  if (res) return res

  await connectDB()
  const integ = await IntegrationModel.findById(params.id)
  if (!integ) return err('Không tìm thấy integration', 404)

  await IntegrationModel.updateOne({ _id: params.id }, {
    $unset: { sessionData: 1, sessionCapturedAt: 1, sessionExpiresAt: 1 },
    sessionStatus: 'none',
    sessionError:  undefined,
  })

  return ok({ message: 'Session đã được xóa' })
}
