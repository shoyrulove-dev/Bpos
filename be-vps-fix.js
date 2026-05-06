'use strict'
/**
 * Be Food automation – fixed with better error logging and selectors
 */
const { chromium } = require('playwright')

const SESSION_TTL = 8 * 3600  // 8h

const LAUNCH_ARGS = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--disable-extensions', '--disable-background-networking',
  '--disable-renderer-backgrounding',
]

const PORTAL_URL = 'https://merchant.be.com.vn/login'

async function loginBe({ username, password, otp, pendingSession }) {
  let browser = null, context = null, page = null
  let capturedToken = null
  let capturedRestaurantId = null
  const isResume = !!pendingSession
  try {
    if (isResume) {
      browser = pendingSession.browser
      context = pendingSession.context
      page    = pendingSession.page
    } else {
      console.log('[be] Launching Chromium...')
      browser = await chromium.launch({
        headless: true,
        args: LAUNCH_ARGS,
        timeout: 30000,
        env: { ...process.env },
      })
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
      })
      page = await context.newPage()

      // Force Flutter HTML renderer (creates real DOM elements instead of Canvas)
      await page.addInitScript(() => {
        window.flutterConfiguration = { renderer: 'html' }
      })

      // Log browser console errors and page errors
      page.on('console', msg => {
        if (msg.type() === 'error') console.log('[be-browser-error]', msg.text().substring(0, 200))
      })
      page.on('pageerror', err => console.log('[be-pageerror]', err.message.substring(0, 300)))

      // Intercept ALL API calls to discover Be backend domain
      page.on('response', async resp => {
        const url = resp.url()
        // Skip CDN/static resources
        if (url.includes('gstatic') || url.includes('jsdelivr') || url.includes('firebase') || 
            url.includes('.js') || url.includes('.wasm') || url.includes('.png') || 
            url.includes('.ico') || url.includes('google') || url.includes('tagmanager') ||
            url.includes('clevertap') || url.includes('analytics')) return
        console.log('[be-req]', resp.status(), url.substring(0, 120))
        // Capture any API responses with tokens
        const contentType = resp.headers()['content-type'] || ''
        if (contentType.includes('json')) {
          try {
            const body = await resp.text()
            if (body.includes('token') || body.includes('Token')) {
              console.log('[be-api] JSON with token from:', url.substring(0, 100), '=', body.substring(0, 400))
              try {
                const json = JSON.parse(body)
                const tok = json.token || json.access_token || json.accessToken || json.data?.token || json.data?.access_token
                if (tok && !capturedToken) {
                  capturedToken = tok
                  console.log('[be] CAPTURED TOKEN from network:', tok.substring(0, 80))
                }
                const rid = json.restaurant_id || json.restaurantId || json.storeId || json.merchant_id || json.data?.restaurant_id
                if (rid && !capturedRestaurantId) capturedRestaurantId = String(rid)
              } catch {}
            }
          } catch {}
        }
      })

      // Do NOT block any scripts — let Flutter load normally
      console.log('[be] Navigating to portal...')
      await page.goto(PORTAL_URL, { waitUntil: 'load', timeout: 60000 })
      // Wait for network to settle
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => null)
      console.log('[be] DOM ready, current URL:', page.url())

      // Wait for Flutter HTML renderer to create input elements (up to 90s)
      // Flutter HTML renderer creates <input> inside flt-text-editing-host
      console.log('[be] Waiting for Flutter HTML renderer inputs...')
      await page.screenshot({ path: '/tmp/be-portal-1.png', fullPage: true }).catch(() => null)
      
      // Wait for flt-text-editing-host or any input
      try {
        await page.waitForFunction(() => {
          return document.querySelector('flt-text-editing-host input') ||
                 document.querySelector('input') ||
                 document.querySelector('flt-scene-host') // flutter rendered something
        }, { timeout: 90000 })
      } catch {}
      
      await page.screenshot({ path: '/tmp/be-portal-2.png', fullPage: true }).catch(() => null)
      const bodyHtml = await page.innerHTML('body').catch(() => '')
      const snippet = bodyHtml.replace(/\s+/g, ' ').substring(0, 800)
      console.log('[be] Body after Flutter load. len:', bodyHtml.length, 'snippet:', JSON.stringify(snippet))
      
      // Check if Flutter HTML renderer created real inputs
      const inputCount = await page.locator('input').count()
      console.log('[be] Input count:', inputCount)
      
      // Log Flutter semantics tree for debugging
      const semanticsHtml = await page.evaluate(() => {
        const sem = document.querySelector('flt-semantics-host')
        return sem ? sem.innerHTML.substring(0, 2000) : 'no flt-semantics-host'
      })
      console.log('[be] Flutter semantics:', semanticsHtml.substring(0, 600))
      
      // Enable Flutter accessibility by clicking the placeholder button
      // This causes Flutter to build the full semantics tree
      const accBtn = page.locator('flt-semantics-placeholder[aria-label="Enable accessibility"]')
      if (await accBtn.count() > 0) {
        // Element at -1,-1 (outside viewport) — trigger via JS
        await page.evaluate(() => {
          const btn = document.querySelector('flt-semantics-placeholder')
          if (btn) btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        })
        console.log('[be] Triggered Enable accessibility via JS')
        await page.waitForTimeout(1000)
        // Wait for flt-semantics-host to appear
        await page.waitForSelector('flt-semantics-host', { timeout: 10000 }).catch(() => null)
      }
      
      // Re-check semantics after enabling accessibility
      const semanticsHtml2 = await page.evaluate(() => {
        const sem = document.querySelector('flt-semantics-host')
        return sem ? sem.innerHTML : 'no flt-semantics-host'
      })
      console.log('[be] Flutter semantics after enable (FULL len):', semanticsHtml2.length)
      // Find all flt-semantics nodes and dump their attributes
      const allNodes = await page.evaluate(() => {
        const nodes = document.querySelectorAll('flt-semantics')
        return Array.from(nodes).slice(0, 30).map(n => {
          const attrs = Array.from(n.attributes).map(a => `${a.name}="${a.value}"`).join(' ')
          return `<flt-semantics ${attrs}>`
        }).join('\n')
      })
      console.log('[be] All flt-semantics nodes:\n', allNodes)
      
      if (inputCount === 0) {
        // Flutter HTML renderer — click on flt-semantics textbox elements
        // Flutter creates flt-semantics with role="textbox" for text fields
        const emailField = page.locator('flt-semantics[role="textbox"]').first()
        const emailFieldCount = await emailField.count()
        console.log('[be] flt-semantics textbox count:', emailFieldCount)
        
        if (emailFieldCount > 0) {
          // Click the Flutter semantics element — this triggers Flutter to inject real <input>
          await emailField.click()
          await page.waitForTimeout(500)
          // Now wait for Flutter to inject input
          const injectedInput = await page.waitForSelector('flt-text-editing-host input, input', { timeout: 5000 }).catch(() => null)
          if (injectedInput) {
            await injectedInput.fill(username)
            console.log('[be] Filled username via flt-semantics click')
            // Click password field (second textbox)
            const pwField = page.locator('flt-semantics[role="textbox"]').nth(1)
            if (await pwField.count() > 0) {
              await pwField.click()
              await page.waitForTimeout(300)
              const pwInput = await page.waitForSelector('flt-text-editing-host input, input[type="password"]', { timeout: 3000 }).catch(() => null)
              if (pwInput) await pwInput.fill(password)
            }
          } else {
            // Fallback: type via keyboard after clicking semantics
            await page.keyboard.type(username)
            await page.keyboard.press('Tab')
            await page.keyboard.type(password)
          }
        } else {
          // No semantics — try clicking at known login form coordinates
          // Be login form: email ~(640, 400), password ~(640, 480) on 1280x800
          console.log('[be] No textbox semantics — using coordinate clicks')
          await page.mouse.click(640, 400)
          await page.waitForTimeout(500)
          const injected = await page.waitForSelector('input', { timeout: 3000 }).catch(() => null)
          if (injected) {
            await injected.fill(username)
            await page.keyboard.press('Tab')
            await page.waitForTimeout(300)
            const pw = await page.$('input[type="password"]') || await page.$('input')
            if (pw) await pw.fill(password)
          } else {
            await page.keyboard.type(username)
            await page.keyboard.press('Tab')
            await page.keyboard.type(password)
          }
        }
        // Submit
        const submitSem = page.locator('flt-semantics[role="button"]').filter({ hasText: /đăng nhập|login/i })
        if (await submitSem.count() > 0) {
          await submitSem.first().click()
        } else {
          await page.keyboard.press('Enter')
        }
        console.log('[be] Submitted via Flutter semantics/keyboard')
        await page.waitForTimeout(6000)
      } else {
        console.log('[be] DOM inputs found, filling form...')
        const firstInput = page.locator('input').first()
        await firstInput.fill(username)
        console.log('[be] Filled username:', username)

        const pwInput = page.locator('input[type="password"]')
        if (await pwInput.count() > 0) {
          await pwInput.first().fill(password)
        } else {
          await page.locator('input').nth(1).fill(password)
        }
        console.log('[be] Filled password')

        const submitBtn = page.locator('button[type="submit"], button:has-text("Đăng nhập")')
        if (await submitBtn.count() > 0) {
          await submitBtn.first().click()
        } else {
          await page.keyboard.press('Enter')
        }
        console.log('[be] Submitted login form')
        await page.waitForTimeout(4000)
      }
    }

    // OTP check
    const otpInput = await page.$('input[placeholder*="OTP"], input[placeholder*="ma xac"], input[maxlength="4"], input[maxlength="6"]')
    if (otpInput && !otp) {
      console.log('[be] OTP required')
      return { success: false, requiresOtp: true, otpTarget: username, _pendingSession: { browser, context, page } }
    }
    if (otpInput && otp) {
      await otpInput.fill(otp)
      const otpSubmit = await page.$('button[type="submit"], button:has-text("Xac nhan"), button:has-text("Confirm")')
      if (otpSubmit) await otpSubmit.click()
      await page.waitForTimeout(4000)
    }

    const finalUrl = page.url()
    console.log('[be] Final URL after login:', finalUrl)
    if (finalUrl.includes('login') || finalUrl.includes('auth')) {
      const errMsg = await page.textContent('[class*="error"], .alert, [class*="message"]').catch(() => null)
      await browser.close()
      return { success: false, error: errMsg?.trim() || 'Be Food: Dang nhap that bai (van o trang login)' }
    }

    // Use captured token from network intercept if available, else check localStorage
    const jwtToken = capturedToken || await page.evaluate(() => {
      // Dump ALL localStorage keys for debugging
      const allLS = {}
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        allLS[k] = localStorage.getItem(k).substring(0, 200)
      }
      const allSS = {}
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i)
        allSS[k] = sessionStorage.getItem(k).substring(0, 200)
      }
      console.log('[be] localStorage:', JSON.stringify(allLS))
      console.log('[be] sessionStorage:', JSON.stringify(allSS))
      const keys = ['token', 'access_token', 'be_token', 'merchant_token', 'accessToken', 'auth_token', 'jwt', 'id_token', 'bearerToken']
      for (const k of keys) {
        const v = localStorage.getItem(k) || sessionStorage.getItem(k)
        if (v) return v
      }
      // Try to find any key that looks like a token
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        const v = localStorage.getItem(k)
        if (v && v.length > 50 && (v.startsWith('ey') || v.includes('Bearer'))) return v
      }
      return null
    }).catch(() => null)
    console.log('[be] JWT found:', !!jwtToken)

    const restaurantId = capturedRestaurantId || await page.evaluate(() =>
      localStorage.getItem('restaurant_id') || localStorage.getItem('restaurantId') || localStorage.getItem('storeId')
    ).catch(() => null)

    const rawCookies = await context.cookies()
    const cookies = rawCookies.map(c => ({
      name: c.name, value: c.value, domain: c.domain, path: c.path,
      expires: c.expires, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite || 'Lax',
    }))

    const extraHeaders = {}
    if (jwtToken) extraHeaders['Authorization'] = 'Bearer ' + jwtToken
    if (restaurantId) extraHeaders['x-restaurant-id'] = restaurantId

    await browser.close()
    return {
      success: true,
      session: { cookies, extraHeaders, capturedAt: new Date().toISOString(), sessionTtlSeconds: SESSION_TTL },
    }
  } catch (err) {
    console.log('[be] Error:', err.message)
    if (browser) await browser.close().catch(() => null)
    throw err
  }
}

module.exports = { loginBe }
