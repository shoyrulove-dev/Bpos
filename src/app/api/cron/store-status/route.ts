import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import ChannelModel from '@/models/Channel'

const CRON_SECRET = process.env.CRON_SECRET

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// POST /api/cron/store-status
// Called by scraper every ~60s to push pause/login status for each store session.
// Body: { sessions: [{ externalStoreId, source, paused, pausedUntil, loggedIn }] }
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

  for (const session of sessions) {
    const s = session as Record<string, unknown>
    const externalStoreId = String(s.externalStoreId ?? '').trim()
    const source = String(s.source ?? '').trim()
    if (!externalStoreId || !source) continue

    const scraperPaused = Boolean(s.paused)
    const scraperPausedUntil = s.pausedUntil ? new Date(String(s.pausedUntil)) : null
    const scraperLoggedIn = Boolean(s.loggedIn)

    const result = await ChannelModel.updateMany(
      { externalStoreId, source },
      { $set: { scraperPaused, scraperPausedUntil, scraperLoggedIn, scraperLastSeen: now } }
    )
    updated += result.modifiedCount
  }

  return NextResponse.json({ ok: true, updated })
}
