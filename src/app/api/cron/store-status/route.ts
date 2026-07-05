import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import ChannelModel from '@/models/Channel'
import IntegrationModel from '@/models/Integration'
import { runRecentGrabEnrich } from '@/lib/grab-recent-enrich'

const CRON_SECRET = process.env.CRON_SECRET

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// POST /api/cron/store-status
// Called by scraper every ~60s to push pause/login status for each store session.
// Body: {
//   sessions: [{
//     integrationId, username, externalStoreId, source,
//     paused, pausedUntil, loggedIn, pauseMode, pauseLabel, isUnknown, platformStatus
//   }]
// }
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return unauthorized()
  }

  let body: { sessions?: unknown[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const sessions = Array.isArray(body.sessions) ? body.sessions : []
  if (!sessions.length) return NextResponse.json({ ok: true, updated: 0 })

  await connectDB()

  const now = new Date()
  let updated = 0
  let shouldRunGrabRecentEnrich = false

  for (const session of sessions) {
    const s = session as Record<string, unknown>
    const integrationId = String(s.integrationId ?? '').trim()
    const username = String(s.username ?? '').trim()
    const externalStoreId = String(s.externalStoreId ?? '').trim()
    const source = String(s.source ?? '').trim()
    if (!source || (!integrationId && !externalStoreId && !username)) continue

    const scraperPaused = Boolean(s.paused)
    const scraperPausedUntil = s.pausedUntil ? new Date(String(s.pausedUntil)) : null
    const scraperLoggedIn = Boolean(s.loggedIn)
    if (source === 'grab' && scraperLoggedIn) shouldRunGrabRecentEnrich = true
    const scraperPauseMode = s.pauseMode === 'tomorrow' || s.pauseMode === 'until-reopen' ? s.pauseMode : null
    const scraperPauseLabel = typeof s.pauseLabel === 'string' ? s.pauseLabel : null
    const scraperIsUnknown = Boolean(s.isUnknown)
    const scraperPlatformStatus = typeof s.platformStatus === 'string' ? s.platformStatus : null

    const update = {
      scraperPaused,
      scraperPausedUntil,
      scraperLoggedIn,
      scraperLastSeen: now,
      scraperPauseMode,
      scraperPauseLabel,
      scraperIsUnknown,
      scraperPlatformStatus,
    }

    const integrationFilter = integrationId
      ? { _id: integrationId, provider: source, isActive: true }
      : externalStoreId
        ? { externalStoreId, provider: source, isActive: true }
        : { loginUsername: username, provider: source, isActive: true }

    const result = externalStoreId
      ? await ChannelModel.updateMany({ externalStoreId, source }, { $set: update })
      : { modifiedCount: 0 }
    await IntegrationModel.updateMany(integrationFilter, { $set: update })
    updated += result.modifiedCount
  }

  let grabRecentEnrich: Record<string, unknown> | null = null
  if (shouldRunGrabRecentEnrich) {
    try {
      const result = await runRecentGrabEnrich({ hours: 168, limit: 200 })
      grabRecentEnrich = {
        scanned: result.scanned,
        updated: result.updated,
        skipped: result.skipped,
      }
    } catch (error) {
      grabRecentEnrich = {
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return NextResponse.json({ ok: true, updated, ...(grabRecentEnrich ? { grabRecentEnrich } : {}) })
}
