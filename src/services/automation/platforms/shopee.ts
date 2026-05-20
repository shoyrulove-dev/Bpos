/**
 * ShopeeFood Merchant Portal – Automation Login
 *
 * Portal: https://merchant.shopeefood.vn/account/login
 * Login flows (tried in order):
 *   1. Password login ("Đăng nhập bằng mật khẩu") – phone + password
 *      First login from a new browser context requires OTP; subsequent sessions do not.
 *   2. SMS OTP fallback ("Đăng nhập bằng số điện thoại") – for accounts with no password.
 *
 * Session TTL: ~7 days (SPC_ST cookie)
 *
 * Internal API used after session capture:
 *   POST https://merchant.shopeefood.vn/api/v4/order/get_order_list
 *   Headers: cookie: <captured>, x-csrftoken: <from SPC_F cookie>
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

      // ── 1. Navigate to merchant portal ────────────────────────────────────
      await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForTimeout(1200)

      // ── 2. Try password login first if credentials.password is supplied ───
      //       Password login is preferred because it doesn't require SMS OTP
      //       on every session — only on the very first login from a new context.
      const hasPassword = Boolean(credentials.password?.trim())
      let usedPasswordFlow = false

      if (hasPassword) {
        const passwordLoginBtn = await this.getFirstVisibleLocator(page, 'button:has-text("Đăng nhập bằng mật khẩu")')
        if (passwordLoginBtn) {
          await passwordLoginBtn.click()
          await page.waitForTimeout(800)

          const usernameInput = await this.getFirstVisibleLocator(
            page,
            'input[placeholder*="Username"], input[placeholder*="email"], input[placeholder*="Email"], input[name="username"], input[name="email"]'
          )
          const passwordInput = await this.getFirstVisibleLocator(
            page,
            'input[type="password"], input[placeholder*="Password"], input[placeholder*="password"]'
          )

          if (usernameInput && passwordInput) {
            await usernameInput.fill(credentials.username)
            await passwordInput.fill(credentials.password)
            const submitBtn = await this.getFirstVisibleLocator(page, 'button[type="submit"], button:has-text("Đăng nhập")')
            if (submitBtn) {
              await submitBtn.click()
              await page.waitForTimeout(3000)
              usedPasswordFlow = true
            }
          }
        }
      }

      // ── 3. Fallback: SMS OTP flow ─────────────────────────────────────────
      if (!usedPasswordFlow) {
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

          const postSubmitRateLimit = await this.getRateLimitMessage(page)
          if (postSubmitRateLimit) {
            await browser.close()
            return { success: false, error: postSubmitRateLimit }
          }
        }
      }

      // ── 4. Check for password-login error (wrong credentials) ─────────────
      if (usedPasswordFlow && page.url().includes('/account/login')) {
        const errorText = await page.textContent('[class*="error"], [class*="Error"], [class*="alert"]').catch(() => null)
        if (errorText?.trim()) {
          // Wrong password → surface the error so caller can retry or use OTP
          await browser.close()
          return { success: false, error: `Shopee mật khẩu: ${errorText.trim()}` }
        }
      }

      // ── 5. Handle OTP step (required on first password login from new context) ──
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

      // ── 6. Verify login success ────────────────────────────────────────────
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
