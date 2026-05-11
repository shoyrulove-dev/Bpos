import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import SyncLogModel from '@/models/SyncLog'

const CRON_SECRET = process.env.CRON_SECRET

type ScraperHeartbeatPhase = 'starting' | 'login-start' | 'login-ok' | 'login-failed'
type ScraperHeartbeatSource = 'browser-scraper' | 'vps-be-scraper'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return unauthorized()
  }

  let body: {
    integrationId?: string
    phase?: ScraperHeartbeatPhase
    source?: ScraperHeartbeatSource
    detail?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const integrationId = String(body.integrationId ?? '').trim()
  const phase = String(body.phase ?? '').trim() as ScraperHeartbeatPhase
  const source = String(body.source ?? '').trim() as ScraperHeartbeatSource
  const detail = String(body.detail ?? '').trim()

  if (!integrationId || !phase || !source) {
    return NextResponse.json({ error: 'Missing integrationId, phase, or source' }, { status: 400 })
  }

  if (!['starting', 'login-start', 'login-ok', 'login-failed'].includes(phase)) {
    return NextResponse.json({ error: 'Invalid heartbeat phase' }, { status: 400 })
  }

  if (!['browser-scraper', 'vps-be-scraper'].includes(source)) {
    return NextResponse.json({ error: 'Invalid heartbeat source' }, { status: 400 })
  }

  await connectDB()

  const integration = await IntegrationModel.findById(integrationId)
    .select('provider brandId externalStoreId')
    .lean() as { provider?: string; brandId?: string; externalStoreId?: string } | null

  if (!integration) {
    return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
  }

  const syncLogStatus = phase === 'login-failed' ? 'failed' : 'pending'
  const detailSection = detail ? `[detail:${detail.replace(/[\r\n\]]+/g, ' ').trim()}]` : ''

  await SyncLogModel.create({
    type: 'order',
    status: syncLogStatus,
    source: integration.provider,
    brandId: integration.brandId,
    content: `[scraper-heartbeat][${integration.provider ?? 'unknown'}][integration:${integrationId}][store:${integration.externalStoreId ?? '-'}][phase:${phase}]${detailSection}[${source}]`,
  })

  return NextResponse.json({ ok: true })
}