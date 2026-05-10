/**
 * GrabFood Merchant Portal – Automation Login + Order Scraping
 *
 * Portal: https://merchant.grab.com/food
 * Login flow supports:
 *   - Email + Password  (ketoan@takogroup.com.vn)
 *   - Username + Password (ooo.cashier.ds3, dmx.nexdor.bdt) → uses Grab Business / phone login
 *
 * Session TTL: ~24 hours
 *
 * After login, the automation navigates to the orders page and intercepts
 * all XHR/fetch requests to discover the internal Grab merchant portal API.
 * The captured API endpoint is stored in extraHeaders['x-grab-orders-api']
 * so subsequent polls can use it directly without re-running Playwright.
 *
 * Internal API (Vietnam):
 *   GET https://merchant.grab.com/grabfood/v1/restaurants/{storeId}/orders
 *   Headers: Cookie, x-grab-tenant: GF_VN, Authorization: Bearer <token>
 */
import type { PlatformAutomation, AutomationCredentials, AutomationResult } from '../types'
import type { SessionData, PlaywrightCookie } from '@/integrations/types'

const PORTAL_ORDERS_URL = 'https://merchant.grab.com/food/orders'
const LOGIN_URL          = 'https://merchant.grab.com/login'
const WEBLOGIN_URL       = 'https://weblogin.grab.com/merchant/login?service_id=MEXUSERS&redirect=https%3A%2F%2Fmerchant.grab.com%2Fportal'
const SESSION_TTL        = 20 * 3600  // 20 hours (refresh before 24h expiry)

export class GrabAutomation implements PlatformAutomation {
  provider = 'grab' as const
  sessionTtlSeconds = SESSION_TTL

  private randomBetween(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  private async humanPause(page: import('playwright').Page, minMs = 90, maxMs = 240) {
    await page.waitForTimeout(this.randomBetween(minMs, maxMs))
  }

  private async humanClick(page: import('playwright').Page, locator: import('playwright').Locator) {
    await locator.scrollIntoViewIfNeeded().catch(() => null)

    const box = await locator.boundingBox().catch(() => null)
    if (box) {
      const targetX = box.x + Math.min(Math.max(10, box.width / 2), Math.max(10, box.width - 10))
      const targetY = box.y + Math.min(Math.max(10, box.height / 2), Math.max(10, box.height - 10))
      await page.mouse.move(targetX, targetY, { steps: this.randomBetween(8, 18) }).catch(() => null)
      await this.humanPause(page, 60, 160)
    }

    await locator.click({ delay: this.randomBetween(40, 120) }).catch(async () => {
      await locator.focus().catch(() => null)
    })
    await this.humanPause(page, 80, 180)
  }

  private async humanType(page: import('playwright').Page, locator: import('playwright').Locator, value: string) {
    await this.humanClick(page, locator)
    await locator.press('Control+A').catch(() => null)
    await this.humanPause(page, 40, 120)
    await locator.press('Backspace').catch(() => null)
    await this.humanPause(page, 80, 160)

    for (const character of value) {
      await page.keyboard.type(character, { delay: this.randomBetween(70, 180) })
      if (Math.random() < 0.18) {
        await this.humanPause(page, 120, 260)
      }
    }

    await this.humanPause(page, 180, 360)
  }

  private async getFirstVisibleLocator(page: import('playwright').Page, selectors: string) {
    const locator = page.locator(selectors)
    const count = await locator.count()

    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index)
      if (await candidate.isVisible().catch(() => false)) return candidate
    }

    return null
  }

  private async hasAuthenticatedShell(page: import('playwright').Page) {
    if (page.url().includes('/portal') || page.url().includes('/order/')) return true

    const shellSelectors = [
      'img[alt="Grab Logo"]',
      'button[aria-label="settings"]',
      'text=/Truy cập chưa được cấp quyền/i',
      'text=/Quay lại trang chủ/i',
    ]

    for (const selector of shellSelectors) {
      const isVisible = await page.locator(selector).first().isVisible().catch(() => false)
      if (isVisible) return true
    }

    return false
  }

  private matchesPreferredStore(storeId: string | null | undefined, preferredStoreId: string | null | undefined) {
    if (!storeId || !preferredStoreId) return false
    const normalizedStoreId = storeId.trim().toLowerCase()
    const normalizedPreferredStoreId = preferredStoreId.trim().toLowerCase()
    return normalizedStoreId === normalizedPreferredStoreId
      || normalizedStoreId.includes(normalizedPreferredStoreId)
      || normalizedPreferredStoreId.includes(normalizedStoreId)
  }

  private async waitForEnabledLocator(page: import('playwright').Page, selectors: string, timeoutMs = 10_000) {
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      const locator = await this.getFirstVisibleLocator(page, selectors)
      if (!locator) {
        await page.waitForTimeout(250)
        continue
      }

      const isDisabled = await locator.isDisabled().catch(() => false)
      if (!isDisabled) return locator

      await page.waitForTimeout(250)
    }

    return null
  }

  private async openLoginSurface(page: import('playwright').Page, usernameSelectors: string) {
    const targets = [LOGIN_URL, WEBLOGIN_URL, PORTAL_ORDERS_URL]

    for (const target of targets) {
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null)
      await page.waitForTimeout(target === WEBLOGIN_URL ? 5000 : 3000)

      const emailTab = await page.$('button:has-text("Email"), [data-testid="email-tab"], a:has-text("Email")')
      if (emailTab) await emailTab.click().catch(() => null)

      const accountInput = await this.getFirstVisibleLocator(page, usernameSelectors)
      if (accountInput || await this.hasAuthenticatedShell(page)) return accountInput
    }

    return null
  }

  private async summarizeAuthSurface(page: import('playwright').Page) {
    return page.locator('input, button, a, [role="button"]').evaluateAll((elements) => {
      return elements
        .slice(0, 20)
        .map((element) => {
          const htmlElement = element as HTMLElement
          const text = (htmlElement.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)
          return {
            tag: htmlElement.tagName,
            type: htmlElement.getAttribute('type'),
            name: htmlElement.getAttribute('name'),
            placeholder: htmlElement.getAttribute('placeholder'),
            text,
          }
        })
    }).catch(() => [])
  }

  async login(credentials: AutomationCredentials): Promise<AutomationResult> {
    let browser: import('playwright').Browser | null = null
    try {
      const { chromium } = await import('playwright')
      const headless = process.env.GRAB_AUTOMATION_HEADLESS !== 'false'

      browser = await chromium.launch({
        headless,
        args: [
          '--no-sandbox', '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
        ],
      })

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
        locale: 'vi-VN',
        timezoneId: 'Asia/Ho_Chi_Minh',
      })

      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
        Object.defineProperty(navigator, 'languages', { get: () => ['vi-VN', 'vi', 'en-US', 'en'] })
        Object.defineProperty(navigator, 'platform', { get: () => 'Win32' })
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4] })

        const chromeLike = { runtime: {} }
        Object.defineProperty(window, 'chrome', {
          get: () => chromeLike,
        })
      })

      // ── Intercept XHR to capture the orders API endpoint + token ───────────
      const capturedApis: { url: string; body?: string; auth?: string }[] = []
      await context.route('**/*', async route => {
        const req = route.request()
        const url = req.url()
        // Capture Grab internal order-related API calls
        if (
          (url.includes('merchant.grab.com') || url.includes('grab.com')) &&
          (url.includes('/order') || url.includes('/restaurant') || url.includes('/store')) &&
          ['GET', 'POST'].includes(req.method())
        ) {
          const auth = req.headers()['authorization'] ?? req.headers()['x-grab-access-token'] ?? ''
          capturedApis.push({ url, body: req.postData() ?? undefined, auth })
        }
        await route.continue()
      })

      const page = await context.newPage()

      const preferredStoreId = credentials.storeId?.trim() || null

      // ── 1. Navigate to login ───────────────────────────────────────────────
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 })
      await page.waitForTimeout(3000)

      // ── 2. Detect login form type and fill credentials ─────────────────────
      // Try to click "Email" tab if present (some portals show email/phone toggle)
      const emailTab = await page.$('button:has-text("Email"), [data-testid="email-tab"], a:has-text("Email")')
      if (emailTab) await emailTab.click()

      const usernameSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="Email"]',
        'input[autocomplete="username"]',
        'input[name="username"]',
        'input[name="phone"]',
        'input[type="text"]',
        'input[type="tel"]',
        'input[placeholder*="phone" i]',
        'input[placeholder*="số điện thoại" i]',
        'input[placeholder*="tài khoản" i]',
      ].join(', ')
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[autocomplete="current-password"]',
      ].join(', ')
      const nextSelectors = [
        'button:has-text("Next")',
        'button:has-text("Tiếp")',
        'button:has-text("Continue")',
        '[role="button"]:has-text("Next")',
        '[role="button"]:has-text("Tiếp")',
        '[role="button"]:has-text("Continue")',
      ].join(', ')
      const submitSelectors = 'button[type="submit"], button:has-text("Đăng nhập"), button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Continue"), button:has-text("Tiếp")'

      const accountInput = await this.openLoginSurface(page, usernameSelectors)

      if (!accountInput && !(await this.hasAuthenticatedShell(page))) {
        await browser.close()
        return { success: false, error: `Không tìm thấy ô nhập tài khoản Grab (url: ${page.url()})` }
      }

      if (accountInput) {
        await this.humanType(page, accountInput, credentials.username)

        const continueButton = await this.waitForEnabledLocator(page, nextSelectors, 5_000)
        if (continueButton) {
          await this.humanClick(page, continueButton)
          await this.humanPause(page, 1200, 2400)
        }

        let passwordInput = await this.getFirstVisibleLocator(page, passwordSelectors)
        const onPasswordChallenge = page.url().includes('/challenge/password')
        const onRecaptchaChallenge = page.url().includes('/challenge/recaptcha')

        if (onRecaptchaChallenge) {
          await browser.close()
          return {
            success: false,
            error: `Grab yeu cau reCAPTCHA, can dang nhap thu cong de lay JWT/session (url=${page.url()})`,
          }
        }

        if (!passwordInput && !onPasswordChallenge && !(await this.hasAuthenticatedShell(page))) {
          try {
            await page.waitForSelector(passwordSelectors, { timeout: 15_000 })
          } catch (error) {
            if (page.url().includes('/challenge/recaptcha')) {
              await browser.close()
              return {
                success: false,
                error: `Grab yeu cau reCAPTCHA, can dang nhap thu cong de lay JWT/session (url=${page.url()})`,
              }
            }
            const authSurface = await this.summarizeAuthSurface(page)
            await browser.close()
            return {
              success: false,
              error: `${error instanceof Error ? error.message : String(error)} | url=${page.url()} | controls=${JSON.stringify(authSurface)}`,
            }
          }
          passwordInput = await this.getFirstVisibleLocator(page, passwordSelectors)
        }

        if (!passwordInput) {
          await browser.close()
          return { success: false, error: `Không tìm thấy ô mật khẩu Grab (url: ${page.url()})` }
        }

        await this.humanType(page, passwordInput, credentials.password)

        const submitButton = await this.getFirstVisibleLocator(
          page,
          submitSelectors
        )
        if (submitButton) {
          const enabledSubmitButton = await this.waitForEnabledLocator(page, submitSelectors, 5_000)
          const targetSubmitButton = enabledSubmitButton ?? submitButton
          await this.humanClick(page, targetSubmitButton)
          await this.humanPause(page, 3200, 5400)
        } else if (!(await this.hasAuthenticatedShell(page))) {
          await browser.close()
          return { success: false, error: `Không tìm thấy nút đăng nhập Grab (url: ${page.url()})` }
        }

        const otpInput = await this.getFirstVisibleLocator(
          page,
          'input[placeholder*="code" i], input[placeholder*="OTP" i], input[name*="otp" i], input[maxlength="6"]'
        )
        if (otpInput) {
          if (!credentials.otp) {
            const otpTarget = await page.textContent('[class*="phone"], [class*="email"], [class*="sent"]').catch(() => null)
            await browser.close()
            return { success: false, requiresOtp: true, otpTarget: otpTarget?.trim() ?? credentials.username }
          }
          await this.humanType(page, otpInput, credentials.otp)
          const otpSubmit = await this.getFirstVisibleLocator(page, 'button[type="submit"], button:has-text("Verify"), button:has-text("Continue"), button:has-text("Tiếp")')
          if (otpSubmit) {
            await this.humanClick(page, otpSubmit)
          }
          await this.humanPause(page, 3200, 5200)
        }
      }

      // ── 6. Verify login success ────────────────────────────────────────────
      const currentUrl = page.url()
      const isLoginPage = currentUrl.includes('/login') || currentUrl.includes('/signin')
      if (isLoginPage) {
        const errEl = await page.$('[class*="error" i], [class*="alert" i], [role="alert"]')
        const errMsg = errEl ? await errEl.textContent() : null
        await browser.close()
        return { success: false, error: errMsg?.trim() || 'Đăng nhập thất bại – kiểm tra lại tài khoản/mật khẩu' }
      }

      // ── 7. Navigate to orders page + wait for API calls ───────────────────
      await page.goto(PORTAL_ORDERS_URL, { waitUntil: 'networkidle', timeout: 30_000 })
      await page.waitForTimeout(5000) // let order API calls fire

      // ── 8. Extract storeId from URL or captured APIs ───────────────────────
      const pageUrl = page.url()
      const storeIdMatch = pageUrl.match(/(?:restaurant|store|merchant)(?:Id|ID|_id)?[=/]([A-Z0-9_-]{5,30})/i)
      const storeIdFromUrl = storeIdMatch?.[1] ?? null

      // Try to get storeId from JS context
      const storeIdFromJs = await page.evaluate(() => {
        try {
          const state = (window as unknown as Record<string, unknown>).__NEXT_DATA__ as Record<string, unknown> | undefined
          const reduxState = (window as unknown as Record<string, unknown>).__REDUX_STATE__ as Record<string, unknown> | undefined
          const stateStr = JSON.stringify(state ?? reduxState ?? {})
          const match = stateStr.match(/"(?:merchantID|merchantId|storeId|restaurantId)":"([A-Z0-9_-]{5,30})"/i)
          return match?.[1] ?? null
        } catch { return null }
      })

      // Try to fetch store list from the Grab internal API using cookies
      const rawCookiesEarly = await context.cookies(['https://merchant.grab.com', 'https://api.grab.com', 'https://grab.com'])
      const cookieStr = rawCookiesEarly.map(c => `${c.name}=${c.value}`).join('; ')

      let storeIdFromApi: string | null = null
      let storeNameFromApi: string | null = null
      let storesFromApi: Array<{ id: string; name: string }> = []

      const storeListCandidates = [
        'https://merchant.grab.com/grabfood/api/v1/merchants/stores',
        'https://merchant.grab.com/grabfood/v1/merchants/stores',
        'https://merchant.grab.com/mex-api/v1/merchants/stores',
        'https://merchant.grab.com/portal/merchant/v1/stores',
        'https://merchant.grab.com/portal/v1/stores',
      ]
      for (const endpoint of storeListCandidates) {
        try {
          const r = await page.evaluate(async ({ url, cookies }: { url: string; cookies: string }) => {
            const resp = await fetch(url, {
              headers: {
                'Cookie': cookies,
                'x-grab-tenant': 'GF_VN',
                'x-grab-country': 'VN',
                'Accept': 'application/json',
              },
            })
            if (!resp.ok) return null
            return await resp.json()
          }, { url: endpoint, cookies: cookieStr })
          if (r && typeof r === 'object') {
            const rObj = r as Record<string, unknown>
            // Look for array of stores in various shapes
            const storeArray =
              (Array.isArray(rObj.stores) ? rObj.stores : null) ??
              (Array.isArray(rObj.data) ? rObj.data : null) ??
              (Array.isArray(rObj.restaurants) ? rObj.restaurants : null)
            if (storeArray && storeArray.length > 0) {
              storesFromApi = storeArray.map((s: Record<string, unknown>) => ({
                id: String(s.id ?? s.merchantID ?? s.storeId ?? s.restaurantId ?? ''),
                name: String(s.name ?? s.storeName ?? s.restaurantName ?? ''),
              })).filter(s => s.id)
              if (storesFromApi.length > 0) {
                const matchedStore = storesFromApi.find((store) => this.matchesPreferredStore(store.id, preferredStoreId))
                const selectedStore = matchedStore ?? storesFromApi[0]
                storeIdFromApi = selectedStore.id
                storeNameFromApi = selectedStore.name
                break
              }
            }
          }
        } catch { /* try next */ }
      }

      // Also try from captured API calls
      const storeIdFromCaptured = capturedApis
        .map(a => {
          const m = a.url.match(/(?:restaurant|store|merchant)(?:Id|ID|_id)?[=/]([A-Z0-9_-]{5,30})/i)
          return m?.[1] ?? null
        })
        .find(Boolean) ?? null

      const storeId = preferredStoreId ?? storeIdFromApi ?? storeIdFromJs ?? storeIdFromUrl ?? storeIdFromCaptured

      // ── 9. Capture Bearer token from storage / headers ────────────────────
      const tokenFromStorage = await page.evaluate(() => {
        const keys = ['token', 'access_token', 'grabToken', 'merchant_token', 'idToken', 'bearerToken']
        for (const k of keys) {
          const v = localStorage.getItem(k) ?? sessionStorage.getItem(k)
          if (v && v.length > 20) return v
        }
        return null
      })

      const apiToken = tokenFromStorage ?? capturedApis.find(a => a.auth)?.auth ?? null

      // Find the orders API endpoint from captured requests
      const ordersApiCall = capturedApis.find(a =>
        a.url.includes('/order')
        && !a.url.includes('/login')
        && this.matchesPreferredStore(a.url, storeId)
      ) ?? capturedApis.find(a =>
        a.url.includes('/order') && !a.url.includes('/login')
      )

      // ── 10. Collect cookies ────────────────────────────────────────────────
      const rawCookies = await context.cookies(['https://merchant.grab.com', 'https://api.grab.com', 'https://grab.com'])
      const seenCookies = new Set<string>()
      const cookies: PlaywrightCookie[] = rawCookies
        .filter((cookie) => {
          const key = `${cookie.name}|${cookie.domain}|${cookie.path}`
          if (seenCookies.has(key)) return false
          seenCookies.add(key)
          return true
        })
        .map(c => ({
        name: c.name, value: c.value, domain: c.domain, path: c.path,
        expires: c.expires, httpOnly: c.httpOnly, secure: c.secure,
        sameSite: (c.sameSite as PlaywrightCookie['sameSite']) ?? 'Lax',
      }))

      // ── 11. Build extraHeaders ─────────────────────────────────────────────
      const extraHeaders: Record<string, string> = {
        'x-grab-tenant':   'GF_VN',
        'x-grab-country':  'VN',
        'x-grab-language': 'vi',
      }
      if (apiToken)               extraHeaders['x-grab-token']      = apiToken
      if (storeId)                extraHeaders['x-grab-store-id']   = storeId
      if (storeNameFromApi)       extraHeaders['x-grab-store-name'] = storeNameFromApi
      if (ordersApiCall?.url)     extraHeaders['x-grab-orders-api'] = ordersApiCall.url
      if (ordersApiCall?.auth)    extraHeaders['Authorization']      = ordersApiCall.auth
      if (storesFromApi.length > 0) {
        extraHeaders['x-grab-stores'] = JSON.stringify(storesFromApi)
      }

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
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
