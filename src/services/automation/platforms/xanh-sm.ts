/**
 * Xanh SM Merchant Portal – Automation Login
 *
 * Portal: https://merchant.xanhsm.com/login
 * Login flow:
 *   - Phone number
 *   - SMS OTP
 *   - reCAPTCHA may appear before OTP send
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

const PHONE_INPUT_SELECTORS = [
  'input[placeholder*="số điện thoại" i]',
  'input[name="phone"]',
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
].join(', ')

const TOKEN_STORAGE_KEYS = ['token', 'access_token', 'jwt', 'authToken', 'accessToken']

export class XanhSMAutomation implements PlatformAutomation {
  provider = 'xanh_sm' as const
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

  private async waitForEnabledLocator(page: import('playwright').Page, selectors: string, timeoutMs = 15_000) {
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      const locator = page.locator(selectors)
      const count = await locator.count()

      for (let index = 0; index < count; index += 1) {
        const candidate = locator.nth(index)
        const isVisible = await candidate.isVisible().catch(() => false)
        const isEnabled = await candidate.isEnabled().catch(() => false)
        if (isVisible && isEnabled) return candidate
      }

      await page.waitForTimeout(250)
    }

    return null
  }

  private async isOtpStep(page: import('playwright').Page) {
    const otpInput = await this.getFirstVisibleLocator(page, OTP_INPUT_SELECTORS)
    if (otpInput) return true

    const otpDigits = page.locator(OTP_DIGIT_SELECTORS)
    return (await otpDigits.count()) > 0
  }

  private async readAuthToken(page: import('playwright').Page) {
    return page.evaluate((keys) => {
      for (const key of keys) {
        const value = localStorage.getItem(key)
          ?? sessionStorage.getItem(key)
          ?? window.document.cookie.match(new RegExp(`${key}=([^;]+)`))?.[1]
        if (value && value.length > 20) return value
      }
      return null
    }, TOKEN_STORAGE_KEYS).catch(() => null)
  }

  private async hasAuthenticatedShell(page: import('playwright').Page) {
    const selectors = [
      'a[href*="/orders"]',
      'a[href*="/dashboard"]',
      'button[aria-label*="profile" i]',
      'button[aria-label*="menu" i]',
      'text=/Đơn hàng/i',
      'text=/Tổng quan/i',
    ]

    for (const selector of selectors) {
      const isVisible = await page.locator(selector).first().isVisible().catch(() => false)
      if (isVisible) return true
    }

    return false
  }

  private async waitForAuthenticatedSession(page: import('playwright').Page) {
    const startedAt = Date.now()

    while (Date.now() - startedAt < 15_000) {
      const currentUrl = page.url()
      const token = await this.readAuthToken(page)
      const hasShell = await this.hasAuthenticatedShell(page)
      const waitingOtp = await this.isOtpStep(page)

      if ((token || hasShell) && !waitingOtp) {
        return { token, currentUrl, waitingOtp, hasShell }
      }

      if (!currentUrl.includes('/login') && !waitingOtp) {
        return { token, currentUrl, waitingOtp, hasShell }
      }

      await page.waitForTimeout(500)
    }

    return {
      token: await this.readAuthToken(page),
      currentUrl: page.url(),
      waitingOtp: await this.isOtpStep(page),
      hasShell: await this.hasAuthenticatedShell(page),
    }
  }

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
      await page.goto(PORTAL_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })

      // ── 2. Fill phone and request OTP ─────────────────────────────────────
      const phoneInput = await this.getFirstVisibleLocator(page, PHONE_INPUT_SELECTORS)
      if (!phoneInput) {
        await browser.close()
        return { success: false, error: 'Xanh SM: không tìm thấy ô nhập số điện thoại' }
      }

      await phoneInput.fill(credentials.username)
      await phoneInput.press('Tab').catch(() => null)

      // ── 3. Submit phone step ──────────────────────────────────────────────
      const continueButton = await this.waitForEnabledLocator(
        page,
        'button:has-text("Tiếp tục"), button:has-text("Xác nhận"), button[type="submit"]'
      )
      if (!continueButton) {
        const errorMsg = await page.textContent('[class*="error"], .alert, [role="alert"]').catch(() => null)
        await browser.close()
        return { success: false, error: errorMsg?.trim() ?? 'Xanh SM: nút tiếp tục vẫn bị khóa sau khi nhập số điện thoại' }
      }

      await continueButton.click()
      await page.waitForTimeout(3500)

      // ── 4. OTP check ───────────────────────────────────────────────────────
      if (await this.isOtpStep(page)) {
        if (!credentials.otp) {
          await browser.close()
          return { success: false, requiresOtp: true, otpTarget: credentials.username }
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

        const confirmButton = await this.waitForEnabledLocator(
          page,
          'button:has-text("Xác nhận"), button:has-text("Tiếp tục"), button[type="submit"]'
        )
        if (confirmButton) {
          await confirmButton.click()
          await page.waitForTimeout(3000)
        }
      }

      // ── 5. Verify success ──────────────────────────────────────────────────
      const authState = await this.waitForAuthenticatedSession(page)
      if (authState.waitingOtp) {
        await browser.close()
        return { success: false, requiresOtp: true, otpTarget: credentials.username }
      }

      if (authState.currentUrl.includes('/login') && !authState.token && !authState.hasShell) {
        if (await this.isOtpStep(page)) {
          await browser.close()
          return { success: false, requiresOtp: true, otpTarget: credentials.username }
        }

        const errorMsg = await page.textContent('[class*="error"], .alert, [role="alert"]').catch(() => null)
        await browser.close()
        return { success: false, error: errorMsg?.trim() ?? 'Xanh SM: đăng nhập chưa rời khỏi màn OTP/login' }
      }

      // ── 6. Extract JWT token from localStorage ─────────────────────────────
      const jwtToken = authState.token

      // ── 7. Capture cookies ─────────────────────────────────────────────────
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
      if (!jwtToken && rawCookies.length === 0) {
        await browser.close()
        return { success: false, error: 'Xanh SM: chưa lấy được token hoặc cookie phiên hợp lệ' }
      }

      const session: SessionData = {
        cookies,
        extraHeaders,
        capturedAt: new Date().toISOString(),
        sessionTtlSeconds: SESSION_TTL,
        localStorage: jwtToken ? { token: jwtToken } : undefined,
      }

      await browser.close()
      return { success: true, session }

    } catch (error) {
      if (browser) await browser.close().catch(() => null)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}
