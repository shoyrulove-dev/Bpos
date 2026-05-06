'use strict'
/**
 * GrabFood Merchant Portal – browser automation (Playwright)
 *
 * SSO Flow: merchant.grab.com/login → SSO tab → email → weblogin.grab.com → password → redirect back
 *
 * Direct API note: Grab SSO uses x-hydraweb-jwt browser fingerprint protection.
 * Can't be replicated from Node without a real browser. Browser automation is required.
 *
 * Session TTL: ~24h (mexusers_authn_token cookie)
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

      // Intercept API calls on weblogin domain for debugging
      let capturedAuthnToken = null
      page.on('response', async (resp) => {
        const url = resp.url()
        if (url.includes('weblogin.grab.com')) {
          const status = resp.status()
          const shortUrl = url.replace('https://weblogin.grab.com', '')
          console.log('[grab-net]', status, shortUrl.substring(0, 80))
          // Capture authnv4/login response to extract token
          if (url.includes('/authnv4/login') || url.includes('/risk_login')) {
            try {
              const body = await resp.text()
              console.log('[grab-login-resp]', body.substring(0, 300))
            } catch {}
          }
        }
        if (url.includes('merchant.grab.com') && url.includes('/api/')) {
          console.log('[grab-merchant-api]', resp.status(), url.replace('https://merchant.grab.com', '').substring(0, 80))
        }
      })

      console.log('[grab] Navigating to login page...')
      await page.goto(GRAB_LOGIN, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForTimeout(3000)
      const urlAfterLoad = page.url()
      console.log('[grab] After load URL:', urlAfterLoad)

      // If already redirected to weblogin (means SSO auto-started)
      if (urlAfterLoad.includes('weblogin.grab.com')) {
        console.log('[grab] Already on weblogin, skipping SSO tab click')
        await page.waitForTimeout(1000)
      } else {
        // Find and click SSO tab
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
      // Fill email/username using Playwright fill() which properly triggers React synthetic events
      // First try to find the input quickly, then fill with Playwright
      await page.waitForTimeout(500)
      const emailInputs = await page.$$('input:visible')
      if (emailInputs.length > 0) {
        await emailInputs[0].fill(username)
        console.log('[grab] Email filled via first visible input')
      } else {
        // Wait longer if no input found yet (page still loading)
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

      // Screenshot
      try { await page.screenshot({ path: '/tmp/grab-before-continue.png' }) } catch {}

      // Click Continue
      console.log('[grab] Clicking Continue...')
      const continueBtn = page.locator('button[type="submit"], button.dui-btn-primary, button:has-text("Tiếp tục"), button:has-text("Continue"), button:has-text("Next")').first()
      await continueBtn.click({ timeout: 15000 })
      await page.waitForTimeout(2000)
      console.log('[grab] After continue, URL:', page.url())

      // Wait for password screen
      try {
        await page.waitForFunction(
          () => window.location.href.includes('challenge/password') || window.location.href.includes('/password'),
          { timeout: 20000 }
        )
      } catch (e) {
        console.log('[grab] Did not navigate to password URL, current:', page.url())
        // Try waiting for password input anyway
        await page.waitForTimeout(2000)
      }
      console.log('[grab] Password screen URL:', page.url())

      // Screenshot before password
      try { await page.screenshot({ path: '/tmp/grab-password.png' }) } catch {}

      // Fill password
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

      // Submit
      console.log('[grab] Submitting...')
      const submitBtn = page.locator('button[type="submit"], button.dui-btn-primary, button:has-text("Đăng nhập"), button:has-text("Sign in"), button:has-text("Login")').first()
      await submitBtn.click({ timeout: 15000 })

      // Wait for redirect back to merchant domain
      try {
        await page.waitForFunction(
          () => !window.location.hostname.includes('weblogin'),
          { timeout: 30000 }
        )
        console.log('[grab] Logged in, URL:', page.url())
      } catch (e) {
        const curUrl = page.url()
        console.log('[grab] Timeout waiting for redirect. URL:', curUrl)
        // Check if on error page
        const errText = await page.evaluate(() => document.body.innerText).catch(() => '')
        if (errText.length < 2000) console.log('[grab] Page text:', errText.substring(0, 500))
      }
    }

    // Handle OTP if needed (rare for Grab)
    if (otp) {
      const otpInput = page.locator('input[placeholder*="OTP" i], input[placeholder*="otp" i]').first()
      const hasOtp = await otpInput.isVisible().catch(() => false)
      if (hasOtp) {
        await otpInput.fill(otp)
        await page.locator('button.dui-btn-primary, button[type="submit"]').first().click({ timeout: 10000 })
        await page.waitForTimeout(2000)
      }
    }

    // Collect cookies + localStorage
    const cookies = await context.cookies()
    const localStorageData = await page.evaluate(() => {
      var result = {}
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i)
        result[k] = localStorage.getItem(k)
      }
      return result
    }).catch(() => ({}))

    // Log important cookies
    const authCookies = cookies.filter(c => c.name.includes('authn') || c.name.includes('token') || c.name.includes('session') || c.name.includes('mex'))
    console.log('[grab] Total cookies:', cookies.length, '| Auth cookies:', authCookies.map(c => c.name).join(', '))
    console.log('[grab] localStorage keys:', Object.keys(localStorageData).join(', '))

    // Check for important tokens
    const mexToken = cookies.find(c => c.name === 'mexusers_authn_token')
    if (mexToken) console.log('[grab] Found mexusers_authn_token:', mexToken.value.substring(0, 30) + '...')

    await context.close()
    await browser.close()

    if (cookies.length === 0) {
      return { success: false, error: 'Grab: no cookies captured - login may have failed' }
    }

    if (!mexToken) {
      return { success: false, error: 'Grab: login failed - no auth token (wrong password or MFA required)' }
    }

    return {
      success: true,
      session: {
        cookies,
        localStorage: localStorageData,
        capturedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + SESSION_TTL * 1000).toISOString(),
      },
    }
  } catch (err) {
    console.error('[grab] Error:', err.message)
    try { if (page) await page.screenshot({ path: '/tmp/grab-error.png' }).catch(() => {}) } catch {}
    try { if (context) await context.close() } catch {}
    try { if (browser) await browser.close() } catch {}
    return { success: false, error: err.message }
  }
}

module.exports = { loginGrab }
