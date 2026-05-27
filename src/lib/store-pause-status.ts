export type PauseMode = 'tomorrow' | 'until-reopen'

export type PauseStoreState = {
  integrationId?: string
  source: 'grab' | 'be'
  label: string
  storeId?: string
  paused: boolean
  loggedIn: boolean
  pausedUntil?: string | null
  pauseMode?: PauseMode | null
  pauseLabel?: string | null
  username?: string
  isUnknown?: boolean
  platformStatus?: string | null
}

export function normalizeStoreSource(value: unknown): 'grab' | 'be' | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'grab' || normalized === 'grabfood') return 'grab'
  if (normalized === 'be' || normalized === 'befood') return 'be'
  return null
}

export function normalizeStoreId(value: unknown) {
  if (value === null || value === undefined) return undefined
  const normalized = String(value).trim()
  return normalized || undefined
}

function normalizePlatformStatusText(value: unknown) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase()
  return normalized || null
}

function classifyPlatformStatus(source: PauseStoreState['source'], platformStatus: string | null) {
  if (!platformStatus) return null

  if (source === 'be' || source === 'grab') {
    if (/(^|_)(OPEN|ACTIVE|ONLINE|AVAILABLE|RESUME|RESUMED)(_|$)/.test(platformStatus)) return 'active'
    if (source === 'grab' && /(^|_)(NORMAL|INFERRED_OPEN|STORE_PAGE_LOADED)(_|$)/.test(platformStatus)) return 'active'
    if (/(^|_)(PAUSE|PAUSED|CLOSE|CLOSED|STOP|STOPPED|BUSY|DISABLE|DISABLED)(_|$)/.test(platformStatus)) return 'paused'
    if (/(^|_)(UNKNOWN|PENDING|CHECKING|UNAVAILABLE|NO_BUTTON|CANDIDATE_OPEN|SUSPEND|SUSPENDED|INACTIVE)(_|$)/.test(platformStatus)) return 'unknown'
  }

  return null
}

export function getStoreIdentityKey(store: Pick<PauseStoreState, 'source' | 'integrationId' | 'storeId' | 'username' | 'label'>) {
  if (store.integrationId) return `id:${store.integrationId}`

  const normalizedStoreId = String(store.storeId ?? '').trim().toLowerCase()
  if (normalizedStoreId) return `src:${store.source}|store:${normalizedStoreId}`

  const normalizedUsername = String(store.username ?? '').trim().toLowerCase()
  if (normalizedUsername) return `src:${store.source}|user:${normalizedUsername}|label:${String(store.label ?? '').trim().toLowerCase()}`

  return `src:${store.source}|label:${String(store.label ?? '').trim().toLowerCase()}`
}

export function getStoreIdentityKeys(store: Pick<PauseStoreState, 'source' | 'integrationId' | 'storeId' | 'username' | 'label'>) {
  const source = store.source
  const keys: string[] = []
  const integrationId = String(store.integrationId ?? '').trim()
  const storeId = String(store.storeId ?? '').trim().toLowerCase()
  const username = String(store.username ?? '').trim().toLowerCase()
  const label = String(store.label ?? '').trim().toLowerCase()

  if (integrationId) keys.push(`id:${integrationId}`)
  if (storeId) keys.push(`src:${source}|store:${storeId}`)
  if (username && label) keys.push(`src:${source}|user:${username}|label:${label}`)
  if (username) keys.push(`src:${source}|user:${username}`)
  if (label) keys.push(`src:${source}|label:${label}`)

  return Array.from(new Set(keys))
}

export function resolvePauseStoreState<T extends { source: 'grab' | 'be'; label?: string }>(
  stores: Record<string, T>,
  identity: Pick<PauseStoreState, 'source' | 'integrationId' | 'storeId' | 'username' | 'label'>
) {
  const keys = getStoreIdentityKeys(identity)
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]
    if (stores[key]) return stores[key]
  }
  return undefined
}

export function canonicalizePauseStoreState(store: PauseStoreState): PauseStoreState {
  const platformStatus = normalizePlatformStatusText(store.platformStatus)
  const platformState = classifyPlatformStatus(store.source, platformStatus)
  const hasPauseMetadata = Boolean(store.pausedUntil || store.pauseMode || store.pauseLabel)

  let paused = Boolean(store.paused) || hasPauseMetadata
  let isUnknown = Boolean(store.isUnknown)

  if (platformState === 'active') {
    paused = false
    isUnknown = false
  } else if (platformState === 'paused') {
    paused = true
    isUnknown = false
  } else if (platformState === 'unknown') {
    isUnknown = true
  }

  return {
    ...store,
    paused,
    isUnknown,
    platformStatus,
  }
}
