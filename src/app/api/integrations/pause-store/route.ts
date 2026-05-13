import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-helpers'

const SCRAPER_URL = process.env.SCRAPER_CONTROL_URL ?? 'http://127.0.0.1:3845'

async function proxyToScraper(path: string, body: unknown) {
  try {
    const res = await fetch(`${SCRAPER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await res.json().catch(() => ({ ok: false, message: 'Lỗi parse JSON từ scraper' }))
    return NextResponse.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, message: `Không kết nối được scraper: ${msg}` }, { status: 502 })
  }
}

/**
 * POST /api/integrations/pause-store
 * Body: { integrationId, source: 'grab'|'be', duration?: '30m'|'1h'|'24h', action: 'pause'|'resume' }
 */
export async function POST(req: NextRequest) {
  const authErr = await requireAdmin(req)
  if (authErr) return authErr

  const body = await req.json().catch(() => null)
  if (!body || !body.source || !body.action) {
    return NextResponse.json({ error: 'Missing source or action' }, { status: 400 })
  }

  if (body.action === 'pause') {
    return proxyToScraper('/pause-store', {
      integrationId: body.integrationId,
      source: body.source,
      duration: body.duration || '24h',
    })
  }

  if (body.action === 'resume') {
    return proxyToScraper('/resume-store', {
      integrationId: body.integrationId,
      source: body.source,
    })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

/**
 * GET /api/integrations/pause-store
 * Returns current pause status from scraper
 */
export async function GET(req: NextRequest) {
  const authErr = await requireAdmin(req)
  if (authErr) return authErr

  try {
    const res = await fetch(`${SCRAPER_URL}/store-status`, {
      signal: AbortSignal.timeout(10_000),
    })
    const data = await res.json().catch(() => ({ ok: false, stores: [] }))
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ ok: false, stores: [], message: 'Scraper offline hoặc không kết nối được' })
  }
}
