import type { NormalizedOrder } from '@/types'

// ─── Session types (automation merchant login) ────────────────────────────────

/** A single browser cookie captured by Playwright after merchant login. */
export interface PlaywrightCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: number    // Unix timestamp (-1 = session cookie)
  httpOnly: boolean
  secure: boolean
  sameSite: 'Strict' | 'Lax' | 'None'
}

/** Full session data captured after Playwright login. */
export interface SessionData {
  cookies: PlaywrightCookie[]
  /** Extra auth headers some platforms inject via JS (e.g. x-csrftoken). */
  extraHeaders?: Record<string, string>
  capturedAt: string  // ISO-8601
  /** Estimated expiry in seconds from capturedAt. Platform-specific. */
  sessionTtlSeconds?: number
  /** Optional localStorage snapshot captured during browser login. */
  localStorage?: Record<string, string>
  /** Optional absolute expiry timestamp from the automation service. */
  expiresAt?: string
  /** Optional platform metadata discovered after login. */
  storeInfo?: {
    storeId?: string | null
    storeName?: string | null
    ordersApiUrl?: string | null
    apiToken?: string | null
    [key: string]: unknown
  }
}

// ─── Adapter config ───────────────────────────────────────────────────────────

export interface AdapterConfig {
  // API mode credentials
  accessToken?: string
  refreshToken?: string
  storeId?: string
  shopId?: string
  [key: string]: unknown
  // Auto-login mode
  sessionData?: SessionData
}

// ─── Adapter interface ────────────────────────────────────────────────────────

export interface PlatformAdapter {
  source: string

  /** Fetch orders using official API credentials. */
  fetchOrders(config: AdapterConfig): Promise<NormalizedOrder[]>

  /** Fetch single order detail using official API credentials. */
  fetchOrderDetail(externalOrderId: string, config: AdapterConfig): Promise<NormalizedOrder | null>

  /** Normalize a raw platform order object into NormalizedOrder. */
  normalizeOrder(raw: Record<string, unknown>): NormalizedOrder

  /**
   * Fetch orders using a captured browser session (auto-login mode).
   * Uses the platform's internal web APIs rather than the official Open API.
   * Returns null if the session is expired / invalid.
   */
  fetchOrdersWithSession?(session: SessionData, storeId: string): Promise<NormalizedOrder[] | null>
}

