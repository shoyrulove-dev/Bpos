/**
 * Automation Runner helpers.
 * Actual login automation is handled by the bpos-automation microservice (VPS).
 * These utilities are used by API routes for session TTL and validation.
 */
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

/** Returns the platform automation (used for sessionTtlSeconds). */
export function getAutomation(provider: string) {
  return AUTOMATIONS[provider as SupportedProvider] ?? null
}

/**
 * Check if the stored session is still considered valid (not expired).
 */
export function isSessionValid(expiresAt?: Date | null): boolean {
  if (!expiresAt) return false
  // Consider expired 10 minutes before actual expiry
  return new Date(expiresAt.getTime() - 10 * 60 * 1000) > new Date()
}
