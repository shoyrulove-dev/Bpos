/**
 * Be Food Merchant Portal – Automation Login
 *
 * Portal: https://merchant.be.com.vn/login
 * Login flow:
 *   - Email + Password  (hoặc SĐT + Password)
 *   - OTP SMS nếu cần
 *
 * Session TTL: ~8 hours (JWT lưu trong localStorage)
 *   → Auto-refresh mỗi 15 phút bởi cron job.
 *
 * Sau khi login, JWT được trích từ localStorage và lưu vào extraHeaders['Authorization'].
 * fetchOrdersWithSession() dùng JWT này để gọi Be Partner API endpoint.
 */
import type { PlatformAutomation, AutomationCredentials, AutomationResult } from '../types'
import type { SessionData, PlaywrightCookie } from '@/integrations/types'

const PORTAL_URL  = 'https://merchant.be.com.vn/login'
const SESSION_TTL = 8 * 3600  // 8 hours (thực tế JWT Be ~8h)

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

      // ── 2. Fill email or phone ─────────────────────────────────────────────
      // merchant.be.com.vn/login has email field (type="email" or name="email" or "username")
      const emailSelector = 'input[type="email"], input[name="email"], input[name="username"], input[name="phone"], input[type="text"]:first-of-type'
      await page.waitForSelector(emailSelector, { timeout: 15_000 })
      await page.fill(emailSelector, credentials.username)

      // ── 3. Fill password ───────────────────────────────────────────────────
      const passwordInput = await page.$('input[type="password"]')
      if (passwordInput) {
        await passwordInput.fill(credentials.password)
      }

      // ── 4. Submit ──────────────────────────────────────────────────────────
      await page.click('button[type="submit"]')
      await page.waitForTimeout(4000)

      // ── 5. Handle OTP if prompted ──────────────────────────────────────────
      const otpInput = await page.$('input[placeholder*="OTP"], input[placeholder*="mã"], input[maxlength="6"], input[name="otp"]')
      if (otpInput) {
        if (!credentials.otp) {
          await browser.close()
          return { success: false, requiresOtp: true, otpTarget: credentials.username }
        }
        await otpInput.fill(credentials.otp)
        await page.click('button[type="submit"]')
        await page.waitForTimeout(4000)
      }

      // ── 6. Verify login succeeded (should redirect away from /login) ───────
      const finalUrl = page.url()
      if (finalUrl.includes('/login') || finalUrl.includes('/auth')) {
        const errorMsg = await page.textContent('[class*="error"], .alert, [role="alert"]').catch(() => null)
        await browser.close()
        return { success: false, error: errorMsg?.trim() ?? 'Đăng nhập Be Food thất bại – kiểm tra email/mật khẩu' }
      }

      // ── 7. Extract JWT from localStorage (Be stores token here) ───────────
      const jwtToken = await page.evaluate(() =>
        localStorage.getItem('token')
        ?? localStorage.getItem('access_token')
        ?? localStorage.getItem('be_token')
        ?? localStorage.getItem('merchant_token')
        ?? sessionStorage.getItem('token')
      )

      // Also capture restaurantId from localStorage / URL if available
      const restaurantId = await page.evaluate(() =>
        localStorage.getItem('restaurant_id')
        ?? localStorage.getItem('restaurantId')
        ?? localStorage.getItem('store_id')
      )

      // ── 8. Capture cookies ─────────────────────────────────────────────────
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
      if (restaurantId) extraHeaders['x-restaurant-id'] = restaurantId

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
