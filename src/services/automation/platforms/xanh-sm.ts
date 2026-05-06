/**
 * Xanh SM Merchant Portal – Automation Login
 *
 * Portal: https://merchant.xanhsm.com/login
 * Login flow:
 *   - Phone + Password
 *   - No CAPTCHA reported (as of 2025)
 *
 * Session TTL: ~30 days (Authorization Bearer JWT)
 *
 * Internal API used after session capture:
 *   GET https://merchant.xanhsm.com/api/v1/stores/{storeId}/orders?limit=20
 *   Headers: Authorization: Bearer <JWT from localStorage/cookie>
 *
 * TODO: Verify internal API endpoints via DevTools on merchant.xanhsm.com
 */
import type { PlatformAutomation, AutomationCredentials, AutomationResult } from '../types'
import type { SessionData, PlaywrightCookie } from '@/integrations/types'

const PORTAL_URL  = 'https://merchant.xanhsm.com/login'
const SESSION_TTL = 30 * 24 * 3600  // 30 days

export class XanhSMAutomation implements PlatformAutomation {
  provider = 'xanh_sm' as const
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
      await page.waitForSelector('input[type="text"], input[name="phone"], input[name="username"]', { timeout: 10_000 })
      await page.fill('input[type="text"], input[name="phone"], input[name="username"]', credentials.username)

      // ── 3. Fill password ───────────────────────────────────────────────────
      await page.fill('input[type="password"]', credentials.password)

      // ── 4. Submit ──────────────────────────────────────────────────────────
      await page.click('button[type="submit"]')
      await page.waitForTimeout(3500)

      // ── 5. OTP check ───────────────────────────────────────────────────────
      const otpInput = await page.$('input[placeholder*="OTP"], input[placeholder*="mã xác nhận"]')
      if (otpInput) {
        if (!credentials.otp) {
          await browser.close()
          return { success: false, requiresOtp: true, otpTarget: credentials.username }
        }
        await otpInput.fill(credentials.otp)
        await page.click('button[type="submit"]')
        await page.waitForTimeout(3000)
      }

      // ── 6. Verify success ──────────────────────────────────────────────────
      if (page.url().includes('/login')) {
        const errorMsg = await page.textContent('[class*="error"], .alert, [role="alert"]').catch(() => null)
        await browser.close()
        return { success: false, error: errorMsg?.trim() ?? 'Đăng nhập Xanh SM thất bại' }
      }

      // ── 7. Extract JWT token from localStorage ─────────────────────────────
      const jwtToken = await page.evaluate(() => {
        return localStorage.getItem('token')
          ?? localStorage.getItem('access_token')
          ?? localStorage.getItem('jwt')
          ?? sessionStorage.getItem('token')
      })

      // ── 8. Capture cookies ─────────────────────────────────────────────────
      const rawCookies = await context.cookies('https://merchant.xanhsm.com')
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
