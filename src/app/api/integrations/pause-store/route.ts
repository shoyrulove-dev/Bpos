import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-helpers'
import { connectDB } from '@/lib/db'
import {
  canonicalizePauseStoreState,
  getStoreIdentityKeys,
  normalizeStoreId,
  normalizeStoreSource,
  resolvePauseStoreState,
  type PauseStoreState,
} from '@/lib/store-pause-status'

const SCRAPER_URL = process.env.SCRAPER_CONTROL_URL ?? 'http://127.0.0.1:3845'
const SCRAPER_STATUS_STALE_MS = 5 * 60 * 1000

function isFreshScraperSeenAt(value: unknown) {
  if (!value) return false
  const seenAt = new Date(value as string | Date)
  const time = seenAt.getTime()
  return Number.isFinite(time) && Date.now() - time <= SCRAPER_STATUS_STALE_MS
}

function normalizePauseDuration(source: unknown, duration: unknown) {
  if (source === 'be') {
    const value = String(duration ?? '').trim()
    if (!value) return 'until-reopen'
    if (value === 'until-reopen' || value === 'pause-until-reopen') return 'until-reopen'
    return null
  }

  const value = String(duration ?? '').trim()
  if (!value) return '24h'
  return ['30m', '1h', '24h'].includes(value) ? value : null
}

function getScraperTargetIdentifier(body: Record<string, unknown>) {
  return [
    typeof body.integrationId === 'string' ? body.integrationId.trim() : '',
    normalizeStoreId(body.storeId) ?? '',
    typeof body.username === 'string' ? body.username.trim() : '',
  ].find(Boolean)
}

async function requestScraper(path: string, body: unknown) {
  const res = await fetch(`${SCRAPER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  const data = await res.json().catch(() => ({ ok: false, message: 'Loi parse JSON tu scraper' }))
  return { status: res.status, data }
}

function normalizePauseStoreRow(value: unknown): PauseStoreState | null {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
  if (!record) return null

  const source = normalizeStoreSource(record.source)
  if (!source) return null

  return canonicalizePauseStoreState({
    integrationId: typeof record.integrationId === 'string' ? record.integrationId : undefined,
    source,
    label: String(record.label ?? record.storeName ?? record.storeId ?? 'Unknown store'),
    storeId: normalizeStoreId(record.storeId),
    paused: Boolean(record.paused),
    loggedIn: Boolean(record.loggedIn),
    pausedUntil: typeof record.pausedUntil === 'string' ? record.pausedUntil : null,
    pauseMode: record.pauseMode === 'tomorrow' || record.pauseMode === 'until-reopen' ? record.pauseMode : null,
    pauseLabel: typeof record.pauseLabel === 'string' ? record.pauseLabel : null,
    username: typeof record.username === 'string' ? record.username : undefined,
    isUnknown: Boolean(record.isUnknown),
    platformStatus: typeof record.platformStatus === 'string' ? record.platformStatus : null,
  })
}

async function fetchLiveScraperStores() {
  const res = await fetch(`${SCRAPER_URL}/store-status?live=1`, {
    signal: AbortSignal.timeout(8_000),
    cache: 'no-store',
  })
  const data = await res.json().catch(() => null) as { stores?: unknown[] } | null
  return Array.isArray(data?.stores)
    ? data.stores.map((store) => normalizePauseStoreRow(store)).filter((store): store is PauseStoreState => Boolean(store))
    : []
}

async function waitForExpectedPauseState(
  identity: Pick<PauseStoreState, 'source' | 'integrationId' | 'storeId' | 'username' | 'label'>,
  expectedPaused: boolean,
) {
  const attempts = identity.source === 'be' ? 4 : 3
  const delayMs = identity.source === 'be' ? 4_000 : 2_500

  for (let index = 0; index < attempts; index += 1) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))

    try {
      const stores = await fetchLiveScraperStores()
      const keyedStores = Object.fromEntries(
        stores.flatMap((store) => getStoreIdentityKeys(store).map((key) => [key, store] as const)),
      )
      const matched = resolvePauseStoreState(keyedStores, identity)
      if (!matched) continue
      if (matched.paused === expectedPaused && matched.isUnknown !== true) {
        return { verified: true, store: matched, attempts: index + 1 }
      }
      if (index === attempts - 1) {
        return { verified: false, store: matched, attempts: index + 1 }
      }
    } catch {
      if (index === attempts - 1) {
        return { verified: false, store: null, attempts: index + 1 }
      }
    }
  }

  return { verified: false, store: null, attempts }
}

export async function POST(req: NextRequest) {
  const { res: authRes } = await requireAdmin(req)
  if (authRes) return authRes

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || !body.source || !body.action) {
    return NextResponse.json({ error: 'Thieu source hoac action' }, { status: 400 })
  }

  const scraperTargetIdentifier = getScraperTargetIdentifier(body)
  const identity: Pick<PauseStoreState, 'source' | 'integrationId' | 'storeId' | 'username' | 'label'> = {
    source: normalizeStoreSource(body.source) ?? 'grab',
    integrationId: typeof body.integrationId === 'string' ? body.integrationId : undefined,
    storeId: normalizeStoreId(body.storeId),
    username: typeof body.username === 'string' ? body.username : undefined,
    label: typeof body.label === 'string' ? body.label : String(body.storeId ?? body.integrationId ?? body.username ?? 'Store'),
  }

  try {
    if (body.action === 'pause') {
      const normalizedDuration = normalizePauseDuration(body.source, body.duration)
      if (!normalizedDuration) {
        return NextResponse.json({ error: 'Thoi luong pause khong hop le' }, { status: 400 })
      }

      const payload = {
        integrationId: scraperTargetIdentifier,
        storeId: normalizeStoreId(body.storeId),
        source: body.source,
        username: typeof body.username === 'string' ? body.username : undefined,
        duration: normalizedDuration,
      }
      const scraperResponse = await requestScraper('/pause-store', payload)
      const scraperBody = scraperResponse.data as { ok?: boolean; message?: string }
      if (scraperResponse.status >= 400 || scraperBody?.ok === false) {
        return NextResponse.json(scraperBody, { status: scraperResponse.status >= 400 ? scraperResponse.status : 200 })
      }

      const verification = await waitForExpectedPauseState(identity, true)
      return NextResponse.json({
        ...scraperBody,
        verified: verification.verified,
        verificationAttempts: verification.attempts,
        store: verification.store,
        message: verification.verified
          ? (verification.store?.pauseLabel ? `Da xac nhan tam dung: ${verification.store.pauseLabel}` : 'Da xac nhan cua hang dang tam dung')
          : `${String(scraperBody?.message ?? 'Da gui lenh tam dung')}. Chua xac nhan duoc trang thai that, panel se tiep tuc tu lam moi.`,
      })
    }

    if (body.action === 'resume') {
      const payload = {
        integrationId: scraperTargetIdentifier,
        storeId: normalizeStoreId(body.storeId),
        source: body.source,
        username: typeof body.username === 'string' ? body.username : undefined,
      }
      const scraperResponse = await requestScraper('/resume-store', payload)
      const scraperBody = scraperResponse.data as { ok?: boolean; message?: string }
      if (scraperResponse.status >= 400 || scraperBody?.ok === false) {
        return NextResponse.json(scraperBody, { status: scraperResponse.status >= 400 ? scraperResponse.status : 200 })
      }

      const verification = await waitForExpectedPauseState(identity, false)
      return NextResponse.json({
        ...scraperBody,
        verified: verification.verified,
        verificationAttempts: verification.attempts,
        store: verification.store,
        message: verification.verified
          ? 'Da xac nhan cua hang dang mo lai'
          : `${String(scraperBody?.message ?? 'Da gui lenh mo lai')}. Chua xac nhan duoc trang thai that, panel se tiep tuc tu lam moi.`,
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { ok: false, message: `Khong ket noi duoc scraper: ${msg}` },
      { status: 502 },
    )
  }

  return NextResponse.json({ error: 'Action khong hop le' }, { status: 400 })
}

export async function GET(req: NextRequest) {
  const { res: authRes } = await requireAdmin(req)
  if (authRes) return authRes

  const wantsDbOnly = req.nextUrl.searchParams.get('dbonly') === '1'
  if (wantsDbOnly) {
    try {
      await connectDB()
      const { default: Integration } = await import('@/models/Integration')
      const integrations = await Integration
        .find({ provider: { $in: ['grab', 'be'] }, isActive: true })
        .select('_id provider externalStoreId externalStoreName loginUsername scraperPaused scraperPausedUntil scraperLoggedIn scraperLastSeen scraperPauseMode scraperPauseLabel scraperIsUnknown scraperPlatformStatus')
        .lean()
        .exec() as unknown as Array<{
          _id: unknown
          provider: string
          externalStoreId?: string
          externalStoreName?: string
          loginUsername?: string
          scraperPaused?: boolean
          scraperPausedUntil?: Date | string | null
          scraperLoggedIn?: boolean
          scraperLastSeen?: Date | string | null
          scraperPauseMode?: 'tomorrow' | 'until-reopen' | null
          scraperPauseLabel?: string | null
          scraperIsUnknown?: boolean
          scraperPlatformStatus?: string | null
        }>
      const stores = integrations.map((integ) => ({
        integrationId: String(integ._id),
        source: integ.provider === 'be' ? 'be' : 'grab',
        label: integ.externalStoreName || integ.externalStoreId || 'Unknown store',
        storeId: integ.externalStoreId,
        paused: Boolean(integ.scraperPaused),
        loggedIn: Boolean(integ.scraperLoggedIn && isFreshScraperSeenAt(integ.scraperLastSeen)),
        pausedUntil: integ.scraperPausedUntil ? new Date(integ.scraperPausedUntil).toISOString() : null,
        pauseMode: integ.scraperPauseMode ?? null,
        pauseLabel: integ.scraperPauseLabel ?? null,
        username: integ.loginUsername || undefined,
        isUnknown: Boolean(integ.scraperIsUnknown),
        platformStatus: integ.scraperPlatformStatus ?? null,
      }))
      return NextResponse.json({ ok: true, stores })
    } catch (err) {
      return NextResponse.json({ ok: false, stores: [], message: String(err) }, { status: 500 })
    }
  }

  const wantsLive = req.nextUrl.searchParams.get('live') === '1'
  const scraperPath = wantsLive ? '/store-status?live=1' : '/store-status'
  const [scraperResult, dbResult] = await Promise.allSettled([
    fetch(`${SCRAPER_URL}${scraperPath}`, {
      signal: AbortSignal.timeout(wantsLive ? 8_000 : 5_000),
    }).then((r) => r.json()).catch(() => null),
    (async () => {
      await connectDB()
      const { default: Integration } = await import('@/models/Integration')
      return Integration
        .find({ provider: { $in: ['grab', 'be'] }, isActive: true })
        .select('_id provider externalStoreId externalStoreName loginUsername scraperPaused scraperPausedUntil scraperLoggedIn scraperLastSeen scraperPauseMode scraperPauseLabel scraperIsUnknown scraperPlatformStatus')
        .lean()
        .exec()
    })(),
  ])

  let scraperStores: PauseStoreState[] = []
  let scraperVersion: string | null = null
  if (scraperResult.status === 'fulfilled' && scraperResult.value) {
    const data = scraperResult.value
    scraperVersion = typeof data?.version === 'string' ? data.version : null
    if (data && data.ok !== false && Array.isArray(data.stores)) {
      scraperStores = data.stores
        .map((store: unknown) => normalizePauseStoreRow(store))
        .filter((store: PauseStoreState | null): store is PauseStoreState => Boolean(store))
    }
  }

  try {
    const integrations = dbResult.status === 'fulfilled'
      ? dbResult.value as unknown as Array<{
          _id: { toString(): string }
          provider: string
          externalStoreId?: string
          externalStoreName?: string
          loginUsername?: string
          scraperPaused?: boolean
          scraperPausedUntil?: Date | string | null
          scraperLoggedIn?: boolean
          scraperLastSeen?: Date | string | null
          scraperPauseMode?: 'tomorrow' | 'until-reopen' | null
          scraperPauseLabel?: string | null
          scraperIsUnknown?: boolean
          scraperPlatformStatus?: string | null
        }>
      : []
    const freshestDbSeenAt = integrations
      .map((integ) => integ.scraperLastSeen ? new Date(integ.scraperLastSeen) : null)
      .filter((value): value is Date => Boolean(value && Number.isFinite(value.getTime())))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
    const hasFreshDbHeartbeat = integrations.some((integ) => isFreshScraperSeenAt(integ.scraperLastSeen))

    const dbStores: PauseStoreState[] = integrations.map((integ) => canonicalizePauseStoreState({
      integrationId: integ._id.toString(),
      source: integ.provider === 'be' ? 'be' : 'grab',
      label: integ.externalStoreName || integ.externalStoreId || 'Unknown store',
      storeId: integ.externalStoreId,
      paused: Boolean(integ.scraperPaused),
      loggedIn: Boolean(integ.scraperLoggedIn && isFreshScraperSeenAt(integ.scraperLastSeen)),
      pausedUntil: integ.scraperPausedUntil ? new Date(integ.scraperPausedUntil).toISOString() : null,
      pauseMode: integ.scraperPauseMode ?? null,
      pauseLabel: integ.scraperPauseLabel ?? null,
      username: integ.loginUsername || undefined,
      isUnknown: Boolean(integ.scraperIsUnknown),
      platformStatus: integ.scraperPlatformStatus ?? null,
    }))

    if (scraperStores.length === 0) {
      return NextResponse.json({
        ok: true,
        scraperOnline: hasFreshDbHeartbeat,
        version: scraperVersion,
        scraperLastSeenAt: freshestDbSeenAt?.toISOString() ?? null,
        stores: dbStores,
        message: hasFreshDbHeartbeat
          ? 'Scraper heartbeat con moi trong BPOS DB, dang hien thi trang thai persisted'
          : 'Khong lay duoc trang thai tu scraper, dang hien thi danh sach tu DB',
      })
    }

    const mergedByKey = new Map<string, PauseStoreState>()

    for (const store of dbStores) {
      for (const key of getStoreIdentityKeys(store)) {
        mergedByKey.set(key, store)
      }
    }

    for (const scraperStore of scraperStores) {
      const keys = getStoreIdentityKeys(scraperStore)
      const existing = keys.map((key) => mergedByKey.get(key)).find(Boolean)
      const mergedStore = existing
        ? canonicalizePauseStoreState({
            ...existing,
            ...scraperStore,
            label: scraperStore.label || existing.label,
            storeId: scraperStore.storeId || existing.storeId,
            username: scraperStore.username || existing.username,
          })
        : scraperStore
      for (const key of keys) {
        mergedByKey.set(key, mergedStore)
      }
    }

    const stores = Array.from(
      new Map(
        Array.from(mergedByKey.values()).map((store) => [
          store.integrationId || `${store.source}:${store.storeId || store.label}`,
          store,
        ]),
      ).values(),
    )

    return NextResponse.json({
      ok: true,
      scraperOnline: true,
      version: scraperVersion,
      scraperLastSeenAt: freshestDbSeenAt?.toISOString() ?? null,
      stores,
      message: `Merged ${scraperStores.length} trang thai scraper voi ${dbStores.length} cua hang DB`,
    })
  } catch {
    if (scraperStores.length > 0) {
      return NextResponse.json({
        ok: true,
        scraperOnline: true,
        version: scraperVersion,
        scraperLastSeenAt: null,
        stores: scraperStores,
        message: 'Khong tai duoc DB, dang hien thi trang thai tu scraper',
      })
    }

    return NextResponse.json({
      ok: false,
      scraperOnline: false,
      version: scraperVersion,
      scraperLastSeenAt: null,
      stores: [],
      message: 'Scraper offline va khong tai duoc danh sach tu DB',
    })
  }
}
