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

  if (source === 'be') {
    if (/(^|_)(OPEN|ACTIVE|ONLINE|AVAILABLE|RESUME|RESUMED)(_|$)/.test(platformStatus)) return 'active'
    if (/(^|_)(PAUSE|PAUSED|CLOSE|CLOSED|STOP|STOPPED|SUSPEND|SUSPENDED|DISABLE|DISABLED)(_|$)/.test(platformStatus)) return 'paused'
    if (/(^|_)(UNKNOWN|PENDING|CHECKING|UNAVAILABLE)(_|$)/.test(platformStatus)) return 'unknown'
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
