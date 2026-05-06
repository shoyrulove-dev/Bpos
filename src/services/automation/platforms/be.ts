/**
 * Be Food Merchant Portal – Automation Login
 *
 * Portal: https://restaurant.be.com.vn  (or merchant.be.com.vn)
 * Login flow:
 *   - Phone + Password
 *   - OTP required (SMS to phone)
 *
 * Session TTL: ~2 hours (JWT from Be auth, same as official API)
 *   → Much shorter than other platforms, needs frequent refresh.
 *
 * Internal API used after session capture:
 *   POST https://gw.be.com.vn/api/v1/be-food-gateway/partner/v1/orders
 *   Headers: Authorization: Bearer <JWT>, cookie: <captured>
 *
 * NOTE: Be uses short-lived JWTs. The automation needs to re-login every ~2h.
 * This is already handled by the cron refresh job.
 *
 * TODO: Verify portal URL and internal API endpoints via DevTools on restaurant.be.com.vn
 */
import type { PlatformAutomation, AutomationCredentials, AutomationResult } from '../types'
import type { SessionData, PlaywrightCookie } from '@/integrations/types'

const PORTAL_URL  = 'https://restaurant.be.com.vn'
const SESSION_TTL = 2 * 3600  // 2 hours (Be JWT expiry)

export class BeAutomation implements PlatformAutomation {
  provider = 'be' as const
  sessionTtlSeconds = SESSION_TTL

  async login(credentials: AutomationCredentials): Promise<AutomationResult> {
    let browser: import('playwright').Browser | null = null
    try {
      const { chromium } = await import('playwright')

      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
      })

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
      })

      const page = await context.newPage()

      // ── 1. Navigate ────────────────────────────────────────────────────────
      await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 30_000 })

      // ── 2. Fill phone ──────────────────────────────────────────────────────
      await page.waitForSelector('input[type="tel"], input[name="phone"], input[type="text"]', { timeout: 10_000 })
      await page.fill('input[type="tel"], input[name="phone"]', credentials.username)

      // ── 3. Password or OTP-first flow ──────────────────────────────────────
      const passwordInput = await page.$('input[type="password"]')
      if (passwordInput) {
        await passwordInput.fill(credentials.password)
      }

      await page.click('button[type="submit"]')
      await page.waitForTimeout(3000)

      // ── 4. Handle OTP ──────────────────────────────────────────────────────
      const otpInput = await page.$('input[placeholder*="OTP"], input[placeholder*="mã"], input[maxlength="6"]')
      if (otpInput) {
        if (!credentials.otp) {
          await browser.close()
          return { success: false, requiresOtp: true, otpTarget: credentials.username }
        }
        await otpInput.fill(credentials.otp)
        await page.click('button[type="submit"]')
        await page.waitForTimeout(4000)
      }

      // ── 5. Verify success ──────────────────────────────────────────────────
      const finalUrl = page.url()
      if (finalUrl.includes('login') || finalUrl.includes('auth')) {
        const errorMsg = await page.textContent('[class*="error"], .alert').catch(() => null)
        await browser.close()
        return { success: false, error: errorMsg?.trim() ?? 'Đăng nhập Be Food thất bại' }
      }

      // ── 6. Extract JWT from localStorage ──────────────────────────────────
      const jwtToken = await page.evaluate(() => {
        return localStorage.getItem('token')
          ?? localStorage.getItem('access_token')
          ?? localStorage.getItem('be_token')
          ?? sessionStorage.getItem('token')
      })

      // ── 7. Capture cookies ─────────────────────────────────────────────────
      const rawCookies = await context.cookies()
      const cookies: PlaywrightCookie[] = rawCookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: (c.sameSite as PlaywrightCookie['sameSite']) ?? 'Lax',
      }))

      const extraHeaders: Record<string, string> = {}
      if (jwtToken) extraHeaders['Authorization'] = `Bearer ${jwtToken}`

      const session: SessionData = {
        cookies,
        extraHeaders,
        capturedAt: new Date().toISOString(),
        sessionTtlSeconds: SESSION_TTL,
      }

      await browser.close()
      return { success: true, session }

    } catch (error) {
      if (browser) await browser.close().catch(() => null)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}
