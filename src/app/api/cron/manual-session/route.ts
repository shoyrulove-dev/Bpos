import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { encryptJSON } from '@/lib/crypto'
import { buildSessionSuccessUpdate } from '@/lib/session-health'
import type { SessionData } from '@/integrations/types'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secretParam = req.nextUrl.searchParams.get('secret')

  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json() as {
    integrationId?: string
    manualJwt?: string
    storeId?: string
    username?: string
    ttlSeconds?: number
  }

  const integrationId = String(body.integrationId ?? '').trim()
  const jwt = String(body.manualJwt ?? '').replace(/^Bearer\s+/i, '').trim()
  const storeId = String(body.storeId ?? '').trim() || undefined
  const username = String(body.username ?? '').trim() || undefined
  const ttlSeconds = Math.max(300, Number(body.ttlSeconds ?? 8 * 3600) || 8 * 3600)

  if (!integrationId) {
    return NextResponse.json({ error: 'Missing integrationId' }, { status: 400 })
  }
  if (!jwt) {
    return NextResponse.json({ error: 'Missing manualJwt' }, { status: 400 })
  }

  await connectDB()

  const integration = await IntegrationModel.findById(integrationId)
  if (!integration) {
    return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
  }

  const session: SessionData = {
    cookies: [],
    extraHeaders: { Authorization: `Bearer ${jwt}` },
    capturedAt: new Date().toISOString(),
    sessionTtlSeconds: ttlSeconds,
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
    { _id: integrationId },
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
    integrationId,
    provider: integration.provider,
    loginUsername: username ?? integration.loginUsername,
    externalStoreId: storeId ?? integration.externalStoreId,
    sessionExpiresAt: expiresAt,
  })
}