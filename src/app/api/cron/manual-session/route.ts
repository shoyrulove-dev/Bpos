import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { encryptJSON } from '@/lib/crypto'
import { buildSessionSuccessUpdate } from '@/lib/session-health'
import type { PlaywrightCookie, SessionData } from '@/integrations/types'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const secretParam = req.nextUrl.searchParams.get('secret')

    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json() as {
      integrationId?: string
      provider?: string
      manualJwt?: string
      cookies?: PlaywrightCookie[]
      extraHeaders?: Record<string, string>
      localStorage?: Record<string, string>
      storeId?: string
      username?: string
      ttlSeconds?: number
    }

    const integrationId = String(body.integrationId ?? '').trim()
    const provider = String(body.provider ?? 'grab').trim()
    const jwt = String(body.manualJwt ?? '').replace(/^Bearer\s+/i, '').trim()
    const cookies = Array.isArray(body.cookies) ? body.cookies : []
    const extraHeaders = body.extraHeaders && typeof body.extraHeaders === 'object'
      ? Object.fromEntries(
          Object.entries(body.extraHeaders)
            .filter(([key, value]) => key && typeof value === 'string' && value.trim())
            .map(([key, value]) => [key, value.trim()])
        )
      : undefined
    const localStorage = body.localStorage && typeof body.localStorage === 'object' ? body.localStorage : undefined
    const storeId = String(body.storeId ?? '').trim() || undefined
    const username = String(body.username ?? '').trim() || undefined
    const ttlSeconds = Math.max(300, Number(body.ttlSeconds ?? 8 * 3600) || 8 * 3600)

    if (!jwt && !cookies.length) {
      return NextResponse.json({ error: 'Missing manualJwt or cookies' }, { status: 400 })
    }

    await connectDB()

    const integration = integrationId
      ? await IntegrationModel.findById(integrationId)
      : storeId
      ? await IntegrationModel.findOne({ provider, externalStoreId: storeId, isActive: true })
      : username
      ? await IntegrationModel.findOne({ provider, loginUsername: username, isActive: true }).select('+loginPassword')
      : null
    const resolvedIntegration = integration ?? (username
      ? await IntegrationModel.findOne({ provider, loginUsername: username, isActive: true })
      : null)
    if (!resolvedIntegration) {
      return NextResponse.json({ error: 'Integration not found', provider, storeId, integrationId }, { status: 404 })
    }

    const session: SessionData = {
      cookies,
      ...(jwt || extraHeaders
        ? {
            extraHeaders: {
              ...(extraHeaders ?? {}),
              ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
            },
          }
        : {}),
      capturedAt: new Date().toISOString(),
      sessionTtlSeconds: ttlSeconds,
      ...(localStorage ? { localStorage } : {}),
    }

    if (storeId) {
      session.extraHeaders = {
        ...session.extraHeaders,
        'x-store-id': storeId,
        'x-grab-store-id': storeId,
      }
    }

    const capturedAt = new Date()
    const expiresAt = new Date(capturedAt.getTime() + ttlSeconds * 1000)

    await IntegrationModel.updateOne(
      { _id: resolvedIntegration._id },
      buildSessionSuccessUpdate({
        loginMode: 'auto',
        ...(username ? { loginUsername: username } : {}),
        ...(storeId ? { externalStoreId: storeId } : {}),
        sessionData: encryptJSON(session),
        sessionStatus: 'active',
        sessionCapturedAt: capturedAt,
        sessionExpiresAt: expiresAt,
        automationRunning: false,
      })
    )

    return NextResponse.json({
      ok: true,
      integrationId: String(resolvedIntegration._id),
      provider: resolvedIntegration.provider,
      loginUsername: username ?? resolvedIntegration.loginUsername,
      externalStoreId: storeId ?? resolvedIntegration.externalStoreId,
      sessionExpiresAt: expiresAt,
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'manual-session-failed',
    }, { status: 500 })
  }
}