'use strict'
/**
 * GrabFood Merchant Portal – browser automation (Playwright)
 * Updated: includes store ID discovery via food page navigation + XHR interception
 */
const { chromium } = require('playwright')

const GRAB_LOGIN  = 'https://merchant.grab.com/login'
const SESSION_TTL = 24 * 3600
const LAUNCH_ARGS = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
  '--disable-gpu', '--disable-blink-features=AutomationControlled',
]

async function loginGrab({ username, password, otp, pendingSession }) {
  let browser = null, context = null, page = null
  const isResume = !!pendingSession

  // Store discovery state (needs to be accessible before and after login)
  let storeId = null
  let storeName = null
  let ordersApiUrl = null
  let apiToken = null
  const capturedApiCalls = []

  try {
    if (isResume) {
      browser = pendingSession.browser
      context = pendingSession.context
      page    = pendingSession.page
    } else {
      browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS, timeout: 30000 })
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        locale: 'vi-VN',
        viewport: { width: 1280, height: 800 },
      })
      page = await context.newPage()

      // Intercept API calls for debugging login
      page.on('response', async (resp) => {
        const url = resp.url()
        if (url.includes('weblogin.grab.com')) {
          const status = resp.status()
          const shortUrl = url.replace('https://weblogin.grab.com', '')
          console.log('[grab-net]', status, shortUrl.substring(0, 80))
        }
        if (url.includes('merchant.grab.com') && (url.includes('/api/') || url.includes('/troy/') || url.includes('/mex-'))) {
          console.log('[grab-merchant-api]', resp.status(), url.replace('https://merchant.grab.com', '').substring(0, 100))
        }
      })

      // ── Early store discovery listener (captures API calls during portal load) ──
      page.on('response', async (resp) => {
        const url = resp.url()
        const ct = resp.headers()['content-type'] || ''
        if (!ct.includes('json') || resp.status() !== 200) return
        try {
          const body = await resp.json().catch(() => null)
          if (!body) return
          const str = JSON.stringify(body)
          if (str.length > 10 && (str.includes('merchantId') || str.includes('storeId') || str.includes('merchantID') || str.includes('restaurantId') || str.includes('merchant_group_id') || str.includes('merchantGroupId'))) {
            capturedApiCalls.push({ url, str: str.substring(0, 800) })
            console.log('[grab-store-api]', url.substring(0, 150))
            console.log('[grab-store-data]', str.substring(0, 400))
            const idM = str.match(/"(?:merchantID|merchantId|storeId|restaurantId|merchantGroupId|merchant_group_id)":"([A-Z0-9a-z_-]{6,60})"/)
            if (idM && !storeId) { storeId = idM[1]; console.log('[grab] Found storeId/merchantId:', storeId) }
            const nameM = str.match(/"(?:merchantName|storeName|restaurantName|merchantGroupName)":"([^"]{3,80})"/)
            if (nameM && !storeName) storeName = nameM[1]
          }
          if ((url.includes('order') || url.includes('Order')) && !apiToken) {
            const reqHeaders = resp.request().headers()
            if (reqHeaders['authorization']) {
              apiToken = reqHeaders['authorization']
              ordersApiUrl = url
            }
          }
        } catch {}
      })

      console.log('[grab] Navigating to login page...')
      await page.goto(GRAB_LOGIN, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForTimeout(3000)
      const urlAfterLoad = page.url()
      console.log('[grab] After load URL:', urlAfterLoad)

      if (urlAfterLoad.includes('weblogin.grab.com')) {
        console.log('[grab] Already on weblogin, skipping SSO tab click')
        await page.waitForTimeout(1000)
      } else {
        const tabs = await page.$$('.dui-segmented-item')
        console.log('[grab] Found tabs:', tabs.length)
        let ssoClicked = false
        for (const tab of tabs) {
          const text = await tab.innerText().catch(() => '')
          console.log('[grab] Tab text:', JSON.stringify(text))
          if (text.toLowerCase().includes('sso') || text.toLowerCase().includes('email') || text.toLowerCase().includes('company')) {
            await tab.click()
            ssoClicked = true
            console.log('[grab] Clicked SSO tab:', text)
            break
          }
        }
        if (!ssoClicked && tabs.length >= 3) {
          await tabs[2].click()
          console.log('[grab] Clicked tab[2] as fallback')
        }
        await page.waitForTimeout(1000)
      }

      // Fill email
      console.log('[grab] Filling email:', username)
      await page.waitForTimeout(500)
      const emailInputs = await page.$$('input:visible')
      if (emailInputs.length > 0) {
        await emailInputs[0].fill(username)
        console.log('[grab] Email filled via first visible input')
      } else {
        await page.waitForTimeout(2000)
        const emailInputs2 = await page.$$('input:visible')
        if (emailInputs2.length > 0) {
          await emailInputs2[0].fill(username)
          console.log('[grab] Email filled (delayed)')
        } else {
          console.log('[grab] WARNING: no email input found')
        }
      }
      await page.waitForTimeout(300)

      try { await page.screenshot({ path: '/tmp/grab-before-continue.png' }) } catch {}

      console.log('[grab] Clicking Continue...')
      const continueBtn = page.locator('button[type="submit"], button.dui-btn-primary, button:has-text("Tiếp tục"), button:has-text("Continue"), button:has-text("Next")').first()
      await continueBtn.click({ timeout: 15000 })
      await page.waitForTimeout(2000)
      console.log('[grab] After continue, URL:', page.url())

      try {
        await page.waitForFunction(
          () => window.location.href.includes('challenge/password') || window.location.href.includes('/password'),
          { timeout: 20000 }
        )
      } catch (e) {
        console.log('[grab] Did not navigate to password URL, current:', page.url())
        await page.waitForTimeout(2000)
      }
      console.log('[grab] Password screen URL:', page.url())

      try { await page.screenshot({ path: '/tmp/grab-password.png' }) } catch {}

      console.log('[grab] Filling password...')
      const passSelector = '#password, input[type="password"], input[name="password"]'
      try {
        await page.waitForSelector(passSelector, { timeout: 10000 })
        await page.fill(passSelector, password)
      } catch (e) {
        console.log('[grab] password selector failed:', e.message)
        const inputs = await page.$$('input:visible')
        const passInput = inputs.find(async i => await i.getAttribute('type') === 'password')
        if (passInput) await passInput.fill(password)
      }
      await page.waitForTimeout(300)

      console.log('[grab] Submitting...')
      const submitBtn = page.locator('button[type="submit"], button.dui-btn-primary, button:has-text("Đăng nhập"), button:has-text("Sign in"), button:has-text("Login")').first()
      await submitBtn.click({ timeout: 15000 })

      try {
        await page.waitForFunction(
          () => !window.location.hostname.includes('weblogin'),
          { timeout: 30000 }
        )
        console.log('[grab] Logged in, URL:', page.url())
      } catch (e) {
        const curUrl = page.url()
        console.log('[grab] Timeout waiting for redirect. URL:', curUrl)
        const errText = await page.evaluate(() => document.body.innerText).catch(() => '')
        if (errText.length < 2000) console.log('[grab] Page text:', errText.substring(0, 500))
      }
    }

    // Handle OTP if needed
    if (otp) {
      const otpInput = page.locator('input[placeholder*="OTP" i], input[placeholder*="otp" i]').first()
      const hasOtp = await otpInput.isVisible().catch(() => false)
      if (hasOtp) {
        await otpInput.fill(otp)
        await page.locator('button.dui-btn-primary, button[type="submit"]').first().click({ timeout: 10000 })
        await page.waitForTimeout(2000)
      }
    }

    // Collect cookies
    const cookiesBeforeNav = await context.cookies()
    const mexToken = cookiesBeforeNav.find(c => c.name === 'mexusers_authn_token')
    if (!mexToken) {
      await context.close()
      await browser.close()
      return { success: false, error: 'Grab: login failed - no auth token (wrong password or MFA required)' }
    }

    // ── Store ID discovery ─────────────────────────────────────────────────────
    // Variables are initialized at function top; early listener already set up.
    // The portal loaded during login redirect and triggered API calls.
    // Wait a bit more and try to navigate to grab more data.

    try {
      // Navigate to portal and wait for API calls from the early listener
      await page.goto('https://merchant.grab.com/portal', { waitUntil: 'networkidle', timeout: 20000 })
      await page.waitForTimeout(3000)
      console.log('[grab] on portal, URL:', page.url())

        // Try clicking on Food / GrabFood navigation item
        const navSelectors = [
          'a[href*="food"]', 'a[href*="grabfood"]',
          '[class*="nav"] a', '[class*="sidebar"] a',
          'nav a', '.menu a',
        ]
        let clicked = false
        for (const sel of navSelectors) {
          const els = await page.$$(sel)
          for (const el of els) {
            const text = await el.innerText().catch(() => '')
            const href = await el.getAttribute('href').catch(() => '')
            if (text.toLowerCase().includes('food') || (href && href.includes('food'))) {
              console.log('[grab] clicking nav item:', text.trim(), href)
              await el.click().catch(() => {})
              clicked = true
              await page.waitForTimeout(5000)
              break
            }
          }
          if (clicked) break
        }
        if (!clicked) {
          console.log('[grab] no food nav found, checking page links...')
          const links = await page.evaluate(() =>
            Array.from(document.querySelectorAll('a')).map(a => ({ href: a.href, text: a.innerText.trim().substring(0, 40) }))
          ).catch(() => [])
          links.filter(l => l.href && (l.href.includes('food') || l.text.toLowerCase().includes('food'))).forEach(l => console.log('[grab-link]', l))
        }
        await page.waitForTimeout(3000)
        const afterClickUrl = page.url()
        console.log('[grab] after click URL:', afterClickUrl)
        const urlMatch = afterClickUrl.match(/\/(?:restaurant|store|merchant)\/([A-Z0-9_-]{6,40})/)
        if (urlMatch && !storeId) storeId = urlMatch[1]

      console.log('[grab] captured storeId:', storeId, '| storeName:', storeName)
      console.log('[grab] captured API calls:', capturedApiCalls.length)
    } catch (e) {
      console.log('[grab] store discovery failed:', e.message)
    }

    // Collect final cookies after navigation
    const cookies = await context.cookies()
    const localStorageData = await page.evaluate(() => {
      var result = {}
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i)
        result[k] = localStorage.getItem(k)
      }
      return result
    }).catch(() => ({}))

    const authCookies = cookies.filter(c => c.name.includes('authn') || c.name.includes('token') || c.name.includes('session') || c.name.includes('mex'))
    console.log('[grab] Total cookies:', cookies.length, '| Auth cookies:', authCookies.map(c => c.name).join(', '))

    // Extract store info from localStorage if not found via API responses
    if (!storeId && localStorageData.userprofileInfo) {
      try {
        const up = typeof localStorageData.userprofileInfo === 'string'
          ? JSON.parse(localStorageData.userprofileInfo)
          : localStorageData.userprofileInfo
        console.log('[grab] userprofileInfo keys:', Object.keys(up).join(','))
        // Try top-level grab_food_entity_id
        if (up.grab_food_entity_id) {
          storeId = up.grab_food_entity_id
          console.log('[grab] storeId from grab_food_entity_id:', storeId)
        }
        // Try root-level links array for GF STORE
        if (!storeId && up.links && Array.isArray(up.links)) {
          const gfLink = up.links.find(l => l.link_entity_business_line === 'GF' && l.link_entity_type === 'STORE')
          if (gfLink) { storeId = gfLink.link_entity_id; console.log('[grab] storeId from root links:', storeId) }
        }
        // Try nested user_profile.links array
        if (!storeId && up.user_profile && up.user_profile.links) {
          const gfLink = up.user_profile.links.find(l => l.link_entity_business_line === 'GF' && l.link_entity_type === 'STORE')
          if (gfLink) { storeId = gfLink.link_entity_id; console.log('[grab] storeId from user_profile.links:', storeId) }
        }
        // Also try user_profile.grab_food_entity_id
        if (!storeId && up.user_profile && up.user_profile.grab_food_entity_id) {
          storeId = up.user_profile.grab_food_entity_id
          console.log('[grab] storeId from user_profile.grab_food_entity_id:', storeId)
        }
        if (!storeName && up.user_profile_details && up.user_profile_details.first_name) {
          storeName = up.user_profile_details.first_name
        }
      } catch (e) { console.log('[grab] userprofileInfo parse error:', e.message) }
    }
    if (!storeName && localStorageData.profileInfo) {
      try {
        const pi = typeof localStorageData.profileInfo === 'string'
          ? JSON.parse(localStorageData.profileInfo)
          : localStorageData.profileInfo
        if (pi.name) { storeName = pi.name; console.log('[grab] storeName from localStorage.profileInfo:', storeName) }
        if (!storeId && pi.entity_id) { storeId = pi.entity_id; console.log('[grab] storeId from profileInfo.entity_id:', storeId) }
      } catch (e) {}
    }

    console.log('[grab] storeId final:', storeId, '| storeName:', storeName)

    await context.close()
    await browser.close()

    if (cookies.length === 0) {
      return { success: false, error: 'Grab: no cookies captured - login may have failed' }
    }

    const result = {
      success: true,
      session: {
        cookies,
        localStorage: localStorageData,
        capturedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + SESSION_TTL * 1000).toISOString(),
      },
    }

    // Attach store discovery info if found
    if (storeId || storeName || ordersApiUrl) {
      result.session.storeInfo = { storeId, storeName, ordersApiUrl, apiToken }
      // Also include in extraHeaders for bpos session format compatibility
      result.session.extraHeaders = {
        'x-grab-tenant': 'GF_VN',
        'x-grab-country': 'VN',
      }
      if (storeId) result.session.extraHeaders['x-grab-store-id'] = storeId
      if (storeName) result.session.extraHeaders['x-grab-store-name'] = storeName
      if (ordersApiUrl) result.session.extraHeaders['x-grab-orders-api'] = ordersApiUrl
      if (apiToken) result.session.extraHeaders['Authorization'] = apiToken
    }

    return result
  } catch (err) {
    console.error('[grab] Error:', err.message)
    try { if (page) await page.screenshot({ path: '/tmp/grab-error.png' }).catch(() => {}) } catch {}
    try { if (context) await context.close() } catch {}
    try { if (browser) await browser.close() } catch {}
    return { success: false, error: err.message }
  }
}

module.exports = { loginGrab }
