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
const SESSION_TTL        = 20 * 3600  // 20 hours (refresh before 24h expiry)

export class GrabAutomation implements PlatformAutomation {
  provider = 'grab' as const
  sessionTtlSeconds = SESSION_TTL

  async login(credentials: AutomationCredentials): Promise<AutomationResult> {
    let browser: import('playwright').Browser | null = null
    try {
      const { chromium } = await import('playwright')

      browser = await chromium.launch({
        headless: true,
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

      // ── 1. Navigate to login ───────────────────────────────────────────────
      await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 30_000 })
      await page.waitForTimeout(2000)

      // ── 2. Detect login form type and fill credentials ─────────────────────
      const isEmail = credentials.username.includes('@')

      // Try to click "Email" tab if present (some portals show email/phone toggle)
      const emailTab = await page.$('button:has-text("Email"), [data-testid="email-tab"], a:has-text("Email")')
      if (emailTab) await emailTab.click()

      // Fill username/email - try multiple selectors
      const emailInput = await page.$(
        'input[type="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="Email"]'
      )
      if (emailInput) {
        await emailInput.fill(credentials.username)
      } else {
        // Try generic text/tel input (phone or username)
        const textInput = await page.$(
          'input[type="text"], input[type="tel"], input[name="username"], input[name="phone"]'
        )
        if (textInput) {
          await textInput.fill(credentials.username)
        } else {
          await browser.close()
          return { success: false, error: 'Không tìm thấy ô nhập tài khoản' }
        }
      }

      await page.waitForTimeout(500)

      // Click Next/Continue if email-first flow
      const nextBtn = await page.$('button:has-text("Next"), button:has-text("Tiếp"), button:has-text("Continue")')
      if (nextBtn) {
        await nextBtn.click()
        await page.waitForTimeout(2000)
      }

      // ── 3. Fill password ───────────────────────────────────────────────────
      await page.waitForSelector('input[type="password"]', { timeout: 10_000 })
      await page.fill('input[type="password"]', credentials.password)

      // ── 4. Submit ──────────────────────────────────────────────────────────
      await page.click('button[type="submit"]')
      await page.waitForTimeout(5000)

      // ── 5. OTP / 2FA check ────────────────────────────────────────────────
      const otpInput = await page.$('input[placeholder*="code" i], input[placeholder*="OTP" i], input[name*="otp" i], input[maxlength="6"]')
      if (otpInput) {
        if (!credentials.otp) {
          const otpTarget = await page.textContent('[class*="phone"], [class*="email"], [class*="sent"]').catch(() => null)
          await browser.close()
          return { success: false, requiresOtp: true, otpTarget: otpTarget?.trim() ?? credentials.username }
        }
        await otpInput.fill(credentials.otp)
        await page.click('button[type="submit"]')
        await page.waitForTimeout(5000)
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
      const rawCookiesEarly = await context.cookies(['https://merchant.grab.com', 'https://grab.com'])
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
                storeIdFromApi = storesFromApi[0].id
                storeNameFromApi = storesFromApi[0].name
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

      const storeId = storeIdFromApi ?? storeIdFromJs ?? storeIdFromUrl ?? storeIdFromCaptured

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
        a.url.includes('/order') && !a.url.includes('/login')
      )

      // ── 10. Collect cookies ────────────────────────────────────────────────
      const rawCookies = await context.cookies('https://merchant.grab.com')
      const cookies: PlaywrightCookie[] = rawCookies.map(c => ({
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
