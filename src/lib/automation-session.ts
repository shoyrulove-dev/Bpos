import type { SessionData } from '@/integrations/types'

type LegacyAutomationResponse = {
  success?: boolean
  session?: SessionData
  token?: string
  expiresAt?: string | number
  extraHeaders?: Record<string, string>
  storeId?: string | number
  storeName?: string
}

function parseTtlSeconds(expiresAt?: string | number): number | undefined {
  if (expiresAt === undefined || expiresAt === null) return undefined

  const expiresMs = typeof expiresAt === 'number'
    ? (expiresAt > 1e12 ? expiresAt : expiresAt * 1000)
    : Date.parse(String(expiresAt))

  if (!Number.isFinite(expiresMs)) return undefined

  const ttlSeconds = Math.floor((expiresMs - Date.now()) / 1000)
  return ttlSeconds > 0 ? ttlSeconds : undefined
}

export function normalizeAutomationSession(data: LegacyAutomationResponse): SessionData | null {
  if (data.session) return data.session
  if (!data.success) return null

  const extraHeaders: Record<string, string> = { ...(data.extraHeaders ?? {}) }
  if (data.token && !extraHeaders.Authorization) {
    extraHeaders.Authorization = data.token.startsWith('Bearer ')
      ? data.token
      : `Bearer ${data.token}`
  }
  if (data.storeId && !extraHeaders['x-restaurant-id'] && !extraHeaders['x-store-id']) {
    extraHeaders['x-restaurant-id'] = String(data.storeId)
  }
  if (data.storeName && !extraHeaders['x-restaurant-name']) {
    extraHeaders['x-restaurant-name'] = data.storeName
  }

  if (!Object.keys(extraHeaders).length) return null

  return {
    cookies: [],
    extraHeaders,
    capturedAt: new Date().toISOString(),
    sessionTtlSeconds: parseTtlSeconds(data.expiresAt) ?? 8 * 3600,
  }
}