/**
 * Automation Runner
 *
 * Dispatches login jobs to the correct platform automation.
 * Persists session data (AES-256-GCM encrypted) back to the Integration document.
 */
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { encryptJSON, decryptJSON } from '@/lib/crypto'
import type { AutomationCredentials, AutomationResult } from './types'
import type { SessionData } from '@/integrations/types'

import { ShopeeAutomation } from './platforms/shopee'
import { GrabAutomation }   from './platforms/grab'
import { XanhSMAutomation } from './platforms/xanh-sm'
import { BeAutomation }     from './platforms/be'

const AUTOMATIONS = {
  shopee:  new ShopeeAutomation(),
  grab:    new GrabAutomation(),
  xanh_sm: new XanhSMAutomation(),
  be:      new BeAutomation(),
} as const

type SupportedProvider = keyof typeof AUTOMATIONS

export function getAutomation(provider: string) {
  return AUTOMATIONS[provider as SupportedProvider] ?? null
}

/**
 * Run automation login for an integration and persist the result.
 * Safe to call in the background (no HTTP response needed).
 */
export async function runAutoLogin(
  integrationId: string,
  credentials: AutomationCredentials,
): Promise<AutomationResult> {
  await connectDB()

  const integ = await IntegrationModel.findById(integrationId).select('+loginPassword')
  if (!integ) return { success: false, error: 'Không tìm thấy integration' }

  const automation = getAutomation(integ.provider)
  if (!automation) return { success: false, error: `Chưa hỗ trợ automation cho ${integ.provider}` }

  // Mark as running
  await IntegrationModel.updateOne({ _id: integrationId }, { automationRunning: true, sessionError: undefined })

  let result: AutomationResult
  try {
    result = await automation.login(credentials)
  } catch (err) {
    result = { success: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (result.success && result.session) {
    const encryptedSession = encryptJSON(result.session)
    const capturedAt       = new Date()
    const expiresAt        = new Date(capturedAt.getTime() + automation.sessionTtlSeconds * 1000)

    await IntegrationModel.updateOne({ _id: integrationId }, {
      sessionData:       encryptedSession,
      sessionStatus:     'active',
      sessionCapturedAt: capturedAt,
      sessionExpiresAt:  expiresAt,
      sessionError:      undefined,
      automationRunning: false,
    })
  } else {
    await IntegrationModel.updateOne({ _id: integrationId }, {
      sessionStatus:     result.requiresOtp ? 'none' : 'error',
      sessionError:      result.error,
      automationRunning: false,
    })
  }

  return result
}

/**
 * Retrieve and decrypt the session data for an integration.
 * Returns null if no session or decryption fails.
 */
export async function getDecryptedSession(integrationId: string): Promise<SessionData | null> {
  await connectDB()
  const integ = await IntegrationModel.findById(integrationId).select('+sessionData')
  if (!integ?.sessionData) return null
  try {
    return decryptJSON<SessionData>(integ.sessionData)
  } catch {
    return null
  }
}

/**
 * Check if the stored session is still considered valid (not expired).
 */
export function isSessionValid(expiresAt?: Date | null): boolean {
  if (!expiresAt) return false
  // Consider expired 10 minutes before actual expiry
  return new Date(expiresAt.getTime() - 10 * 60 * 1000) > new Date()
}
