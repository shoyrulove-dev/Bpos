/**
 * ShopeeFood Merchant Portal – Automation Login
 *
 * Portal: https://merchant.shopee.vn/portal/login
 * Login flow:
 *   - Phone + Password (or Phone + OTP)
 *   - Possible slider CAPTCHA → handled by retry / mouse simulation
 *
 * Session TTL: ~7 days (SPC_ST cookie)
 *
 * Internal API used after session capture:
 *   POST https://merchant.shopee.vn/api/v4/order/get_order_list
 *   Headers: cookie: <captured>, x-csrftoken: <from SPC_F cookie>
 *
 * TODO: Verify internal API endpoints by inspecting Network tab in merchant.shopee.vn
 */
import type { PlatformAutomation, AutomationCredentials, AutomationResult } from '../types'
import type { SessionData, PlaywrightCookie } from '@/integrations/types'

const PORTAL_URL  = 'https://merchant.shopee.vn/portal/login'
const SESSION_TTL = 7 * 24 * 3600  // 7 days

export class ShopeeAutomation implements PlatformAutomation {
  provider = 'shopee' as const
  sessionTtlSeconds = SESSION_TTL

  async login(credentials: AutomationCredentials): Promise<AutomationResult> {
    let browser: import('playwright').Browser | null = null
    try {
      // Dynamic import – playwright is a devDependency / optional peer on Vercel,
      // but must be installed on the VPS worker.
      const { chromium } = await import('playwright')

      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
        ],
      })

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        locale: 'vi-VN',
      })

      const page = await context.newPage()

      // ── 1. Navigate to login page ──────────────────────────────────────────
      await page.goto(PORTAL_URL, { waitUntil: 'networkidle', timeout: 30_000 })

      // ── 2. Fill phone / username ───────────────────────────────────────────
      await page.waitForSelector('input[name="loginKey"], input[type="text"]', { timeout: 10_000 })
      await page.fill('input[name="loginKey"], input[type="text"]', credentials.username)

      // ── 3. Fill password ───────────────────────────────────────────────────
      await page.fill('input[name="password"], input[type="password"]', credentials.password)

      // ── 4. Click login ─────────────────────────────────────────────────────
      await page.click('button[type="submit"], button:has-text("Đăng nhập"), button:has-text("Log in")')

      // ── 5. Wait for navigation or OTP prompt ───────────────────────────────
      await page.waitForTimeout(3000)

      // Check for OTP input
      const otpInput = await page.$('input[placeholder*="OTP"], input[placeholder*="mã"], input[data-testid*="otp"]')
      if (otpInput) {
        if (!credentials.otp) {
          // Extract phone/email the OTP was sent to
          const otpTarget = await page.textContent('[class*="otp-hint"], [class*="phone-hint"]') ?? credentials.username
          await browser.close()
          return { success: false, requiresOtp: true, otpTarget: otpTarget.trim() }
        }
        // Fill OTP if provided
        await otpInput.fill(credentials.otp)
        await page.click('button[type="submit"], button:has-text("Xác nhận"), button:has-text("Confirm")')
        await page.waitForTimeout(3000)
      }

      // ── 6. Verify login success ────────────────────────────────────────────
      const currentUrl = page.url()
      if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
        const errorMsg = await page.textContent('[class*="error"], [class*="alert"], [role="alert"]').catch(() => null)
        await browser.close()
        return { success: false, error: errorMsg?.trim() ?? 'Đăng nhập thất bại – sai thông tin hoặc CAPTCHA' }
      }

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

      // Extract CSRF token from SPC_F cookie (Shopee-specific)
      const spcF = cookies.find(c => c.name === 'SPC_F')
      const extraHeaders: Record<string, string> = {}
      if (spcF) extraHeaders['x-csrftoken'] = spcF.value

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
