import type { PlaywrightCookie, SessionData } from '@/integrations/types'
import type { NormalizedOrder } from '@/types'

/** Result returned by a platform automation after login. */
export interface AutomationResult {
  success: boolean
  session?: SessionData
  orders?: NormalizedOrder[]
  /** 'otp_required' → caller must supply OTP and call again. */
  requiresOtp?: boolean
  otpTarget?: string  // phone number OTP was sent to
  error?: string
}

/** Input for an automation login attempt. */
export interface AutomationCredentials {
  username: string   // phone number or email
  password: string
  otp?: string       // if platform requires OTP on this attempt
  storeId?: string   // optional: pre-select store after login
  includeOrders?: boolean
}

/** Common interface every platform automation must implement. */
export interface PlatformAutomation {
  provider: string
  /**
   * Estimated session TTL in seconds after a successful login.
   * Used to set sessionExpiresAt.
   */
  sessionTtlSeconds: number
  /**
   * Perform browser login and return captured session data.
   * On OTP platforms: first call returns { requiresOtp: true }.
   * Second call (with otp) completes login.
   */
  login(credentials: AutomationCredentials): Promise<AutomationResult>
}

/** Playwright browser cookie shape (subset of playwright's Cookie type). */
export type { PlaywrightCookie, SessionData }
