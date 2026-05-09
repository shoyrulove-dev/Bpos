/**
 * ShopeeFood Merchant Portal – Automation Login
 *
 * Portal: https://merchant.shopeefood.vn/account/login
 * Login flow:
 *   - Phone + SMS OTP
 *   - Optional password fallback may still exist on some merchant accounts
 *   - Possible slider CAPTCHA → handled by retry / mouse simulation
 *
 * Session TTL: ~7 days (SPC_ST cookie)
 *
 * Internal API used after session capture:
 *   POST https://merchant.shopeefood.vn/api/v4/order/get_order_list
 *   Headers: cookie: <captured>, x-csrftoken: <from SPC_F cookie>
 *
 * TODO: Verify internal API endpoints by inspecting Network tab in merchant.shopeefood.vn
 */
import type { PlatformAutomation, AutomationCredentials, AutomationResult } from '../types'
import type { SessionData, PlaywrightCookie } from '@/integrations/types'

const PORTAL_URL  = 'https://merchant.shopeefood.vn/account/login'
const SHOPEE_SMS_LOGIN_URL = 'https://gsso.shopeefood.vn/sms_login?app_id=nowotpapp_MCQzBi2SyApYgKGCYWsmVD4t0954cr&app_type=1001&api_version=1&client_type=1&client_version=3.0.0&client_id=1.0&client_language=vi'
const SESSION_TTL = 7 * 24 * 3600  // 7 days

const PHONE_INPUT_SELECTORS = [
  'input[placeholder*="số điện thoại" i]',
  'input[placeholder*="điện thoại" i]',
  'input[name="phone"]',
  'input[name="loginKey"]',
  'input[type="tel"]',
].join(', ')

const OTP_INPUT_SELECTORS = [
  'input[placeholder*="otp" i]',
  'input[placeholder*="mã" i]',
  'input[name*="otp" i]',
  'input[inputmode="numeric"]',
].join(', ')

const OTP_DIGIT_SELECTORS = [
  'input[inputmode="numeric"][maxlength="1"]',
  'input[name^="otp"]',
  'input[data-testid*="otp"] input',
  'input.input-one-number',
].join(', ')

export class ShopeeAutomation implements PlatformAutomation {
  provider = 'shopee' as const
  sessionTtlSeconds = SESSION_TTL

  private async getFirstVisibleLocator(page: import('playwright').Page, selectors: string) {
    const locator = page.locator(selectors)
    const count = await locator.count()

    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index)
      if (await candidate.isVisible().catch(() => false)) return candidate
    }

    return null
  }

  private async isOtpStep(page: import('playwright').Page) {
    const otpInput = await this.getFirstVisibleLocator(page, OTP_INPUT_SELECTORS)
    if (otpInput) return true

    const otpDigits = page.locator(OTP_DIGIT_SELECTORS)
    return (await otpDigits.count()) > 0
  }

  private async getRateLimitMessage(page: import('playwright').Page) {
    const text = await page.textContent('body').catch(() => '')
    const normalizedText = text?.replace(/\s+/g, ' ').trim() ?? ''
    if (!normalizedText.includes('hành vi bất thường từ mạng của bạn')) return null

    const matchedMessage = normalizedText.match(/Rất tiếc![^.?!]*(?:\d+\s*giây)?[.?!]?/i)?.[0]?.trim()
    return matchedMessage || normalizedText
  }

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

      // ── 1. Enter the OTP flow from the merchant login page first. ─────────
      await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForTimeout(1200)

      const phoneLoginButton = await this.getFirstVisibleLocator(page, 'button:has-text("Đăng nhập bằng số điện thoại")')
      if (phoneLoginButton) {
        await phoneLoginButton.click()
        await page.waitForTimeout(1000)
      }

      if (page.url().includes('/account/login')) {
        await page.goto(SHOPEE_SMS_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      }

      const rateLimitMessage = await this.getRateLimitMessage(page)
      if (rateLimitMessage) {
        await browser.close()
        return { success: false, error: rateLimitMessage }
      }

      // ── 2. If we're not already on OTP, fill phone and request OTP once. ──
      if (!(await this.isOtpStep(page))) {
        const phoneInput = await this.getFirstVisibleLocator(page, PHONE_INPUT_SELECTORS)
        if (!phoneInput) {
          await browser.close()
          return { success: false, error: 'Shopee: không tìm thấy ô nhập số điện thoại ở flow OTP' }
        }

        await phoneInput.fill(credentials.username)

        const continueButton = await this.getFirstVisibleLocator(
          page,
          'button:has-text("Tiếp tục"), button:has-text("Gửi OTP"), button:has-text("Gửi mã"), button:has-text("Kế tiếp"), button[type="submit"]'
        )
        if (!continueButton) {
          await browser.close()
          return { success: false, error: 'Shopee: không tìm thấy nút tiếp tục của flow OTP' }
        }

        await continueButton.click()
        await page.waitForTimeout(2500)

        const postSubmitRateLimitMessage = await this.getRateLimitMessage(page)
        if (postSubmitRateLimitMessage) {
          await browser.close()
          return { success: false, error: postSubmitRateLimitMessage }
        }
      }

      // ── 4. OTP screen is a valid intermediate state, not a password failure. ──
      if (await this.isOtpStep(page)) {
        if (!credentials.otp) {
          const otpTargetText = await page.textContent('body').catch(() => '')
          const otpTarget = otpTargetText?.match(/(\+?84\d{7,11}|0\d{8,10})/)?.[1] ?? credentials.username
          await browser.close()
          return { success: false, requiresOtp: true, otpTarget: otpTarget.trim() }
        }

        const otpDigits = page.locator(OTP_DIGIT_SELECTORS)
        const otpDigitCount = await otpDigits.count()
        const otpInput = await this.getFirstVisibleLocator(page, OTP_INPUT_SELECTORS)

        if (otpDigitCount >= credentials.otp.length && credentials.otp.length > 1) {
          for (let index = 0; index < credentials.otp.length && index < otpDigitCount; index += 1) {
            await otpDigits.nth(index).fill(credentials.otp[index])
          }
        } else if (otpInput) {
          await otpInput.fill(credentials.otp)
        }

        const confirmButton = await this.getFirstVisibleLocator(
          page,
          'button:has-text("Xác nhận"), button:has-text("Đăng nhập"), button:has-text("Tiếp tục"), button[type="submit"]'
        )
        if (confirmButton) {
          await confirmButton.click()
          await page.waitForTimeout(3000)
        }
      }

      // ── 5. Verify login success ────────────────────────────────────────────
      const currentUrl = page.url()
      if (currentUrl.includes('/login') || currentUrl.includes('/auth') || currentUrl.includes('/sms_login')) {
        if (await this.isOtpStep(page)) {
          await browser.close()
          return { success: false, requiresOtp: true, otpTarget: credentials.username }
        }

        const errorMsg = await page.textContent('[class*="error"], [class*="alert"], [role="alert"]').catch(() => null)
        await browser.close()
        return { success: false, error: errorMsg?.trim() ?? 'Shopee: đăng nhập chưa rời khỏi màn OTP/login' }
      }

      // ── 6. Capture cookies ─────────────────────────────────────────────────
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
