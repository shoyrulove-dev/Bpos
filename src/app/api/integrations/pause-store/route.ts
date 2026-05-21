import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-helpers'
import { connectDB } from '@/lib/db'

const SCRAPER_URL = process.env.SCRAPER_CONTROL_URL ?? 'http://127.0.0.1:3845'

function normalizePauseDuration(source: unknown, duration: unknown) {
  if (source === 'be') {
    const value = String(duration ?? '').trim()
    if (!value) return 'until-reopen'
    if (value === 'tomorrow' || value === 'pause-tomorrow') return 'tomorrow'
    if (value === 'until-reopen' || value === 'pause-until-reopen') return 'until-reopen'
    return null
  }

  const value = String(duration ?? '').trim()
  if (!value) return '24h'
  return ['30m', '1h', '24h'].includes(value) ? value : null
}

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
 * Body: { integrationId, source: 'grab'|'be', duration?: '30m'|'1h'|'24h'|'tomorrow'|'until-reopen', action: 'pause'|'resume' }
 */
export async function POST(req: NextRequest) {
  const { res: authRes } = await requireAdmin(req)
  if (authRes) return authRes

  const body = await req.json().catch(() => null)
  if (!body || !body.source || !body.action) {
    return NextResponse.json({ error: 'Missing source or action' }, { status: 400 })
  }

  if (body.action === 'pause') {
    const normalizedDuration = normalizePauseDuration(body.source, body.duration)
    if (!normalizedDuration) {
      return NextResponse.json({ error: 'Invalid pause duration' }, { status: 400 })
    }

    return proxyToScraper('/pause-store', {
      integrationId: body.integrationId,
      source: body.source,
      duration: normalizedDuration,
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
 * Returns current pause status from scraper, with DB fallback
 */
export async function GET(req: NextRequest) {
  const { res: authRes } = await requireAdmin(req)
  if (authRes) return authRes

  // ?dbonly=1 — chỉ trả về danh sách DB, không gọi scraper (browser tự gọi trực tiếp)
  const wantsDbOnly = req.nextUrl.searchParams.get('dbonly') === '1'
  if (wantsDbOnly) {
    try {
      await connectDB()
      const { default: Integration } = await import('@/models/Integration')
      const integrations = await Integration
        .find({ provider: { $in: ['grab', 'be'] }, isActive: true })
        .select('_id provider externalStoreId externalStoreName loginUsername')
        .lean()
        .exec() as unknown as Array<{ _id: unknown; provider: string; externalStoreId?: string; externalStoreName?: string; loginUsername?: string }>
      const stores = integrations.map(integ => ({
        integrationId: String(integ._id),
        source: integ.provider === 'be' ? 'be' : 'grab',
        label: integ.externalStoreName || integ.externalStoreId || 'Unknown store',
        storeId: integ.externalStoreId,
        paused: false,
        loggedIn: false,
        username: integ.loginUsername || undefined,
      }))
      return NextResponse.json({ ok: true, stores })
    } catch (err) {
      return NextResponse.json({ ok: false, stores: [], message: String(err) }, { status: 500 })
    }
  }

  type PauseStoreRow = {
    integrationId?: string
    source: 'grab' | 'be'
    label: string
    storeId?: string
    paused: boolean
    loggedIn: boolean
    pausedUntil?: string | null
    pauseMode?: 'tomorrow' | 'until-reopen' | null
    pauseLabel?: string | null
    username?: string
    isUnknown?: boolean
    platformStatus?: string | null
  }

  const normalizeSource = (value: unknown): 'grab' | 'be' | null => {
    const normalized = String(value ?? '').trim().toLowerCase()
    if (normalized === 'grab' || normalized === 'grabfood') return 'grab'
    if (normalized === 'be' || normalized === 'befood') return 'be'
    return null
  }

  const toPauseStoreRow = (value: unknown): PauseStoreRow | null => {
    const record = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null
    if (!record) return null

    const source = normalizeSource(record.source)
    if (!source) return null

    return {
      integrationId: typeof record.integrationId === 'string' ? record.integrationId : undefined,
      source,
      label: String(record.label ?? record.storeName ?? record.storeId ?? 'Unknown store'),
      storeId: typeof record.storeId === 'string' ? record.storeId : undefined,
      paused: Boolean(record.paused),
      loggedIn: Boolean(record.loggedIn),
      pausedUntil: typeof record.pausedUntil === 'string' ? record.pausedUntil : null,
      pauseMode: record.pauseMode === 'tomorrow' || record.pauseMode === 'until-reopen' ? record.pauseMode : null,
      pauseLabel: typeof record.pauseLabel === 'string' ? record.pauseLabel : null,
      username: typeof record.username === 'string' ? record.username : undefined,
      isUnknown: Boolean(record.isUnknown),
      platformStatus: typeof record.platformStatus === 'string' ? record.platformStatus : null,
    }
  }

  const wantsLive = req.nextUrl.searchParams.get('live') === '1'

  // Fetch scraper status and DB integrations in parallel to minimize latency
  const scraperPath = wantsLive ? '/store-status?live=1' : '/store-status'
  const [scraperResult, dbResult] = await Promise.allSettled([
    fetch(`${SCRAPER_URL}${scraperPath}`, {
      signal: AbortSignal.timeout(wantsLive ? 30_000 : 5_000),
    }).then(r => r.json()).catch(() => null),
    (async () => {
      await connectDB()
      const { default: Integration } = await import('@/models/Integration')
      return Integration
        .find({ provider: { $in: ['grab', 'be'] }, isActive: true })
        .select('_id provider externalStoreId externalStoreName loginUsername')
        .lean()
        .exec()
    })(),
  ])

  let scraperStores: PauseStoreRow[] = []
  if (scraperResult.status === 'fulfilled' && scraperResult.value) {
    const data = scraperResult.value
    if (data && data.ok !== false && Array.isArray(data.stores)) {
      scraperStores = data.stores
        .map((store: unknown) => toPauseStoreRow(store))
        .filter((store: PauseStoreRow | null): store is PauseStoreRow => Boolean(store))
    }
  }

  try {
    const integrations = dbResult.status === 'fulfilled' ? dbResult.value as unknown as Array<{ _id: unknown; provider: string; externalStoreId?: string; externalStoreName?: string; loginUsername?: string }> : []

    const dbStores: PauseStoreRow[] = integrations.map((integ: any) => ({
      integrationId: integ._id.toString(),
      source: integ.provider === 'be' ? 'be' : 'grab',
      label: integ.externalStoreName || integ.externalStoreId || 'Unknown store',
      storeId: integ.externalStoreId,
      paused: false,
      loggedIn: false,
      username: integ.loginUsername || undefined,
    }))

    if (scraperStores.length === 0) {
      return NextResponse.json({
        ok: true,
        scraperOnline: false,
        stores: dbStores,
        message: 'Không lấy được trạng thái từ scraper, đang hiển thị danh sách từ DB',
      })
    }

    const mergedByKey = new Map<string, PauseStoreRow>()
    const makeKey = (store: PauseStoreRow) => {
      if (store.integrationId) return `id:${store.integrationId}`
      return `src:${store.source}|store:${String(store.storeId ?? '').trim().toLowerCase()}`
    }

    for (const store of dbStores) {
      mergedByKey.set(makeKey(store), store)
    }

    for (const scraperStore of scraperStores) {
      const key = makeKey(scraperStore)
      const existing = mergedByKey.get(key)
      if (existing) {
        mergedByKey.set(key, {
          ...existing,
          ...scraperStore,
          label: scraperStore.label || existing.label,
          storeId: scraperStore.storeId || existing.storeId,
          username: scraperStore.username || existing.username,
        })
      } else {
        mergedByKey.set(key, scraperStore)
      }
    }

    const stores = Array.from(mergedByKey.values())
    return NextResponse.json({
      ok: true,
      scraperOnline: true,
      stores,
      message: `Merged ${scraperStores.length} trạng thái scraper với ${dbStores.length} cửa hàng DB`,
    })
  } catch {
    if (scraperStores.length > 0) {
      return NextResponse.json({
        ok: true,
        scraperOnline: true,
        stores: scraperStores,
        message: 'Không tải được DB, đang hiển thị trạng thái từ scraper',
      })
    }

    return NextResponse.json({
      ok: false,
      scraperOnline: false,
      stores: [],
      message: 'Scraper offline và không tải được danh sách từ DB',
    })
  }
}
