'use strict'
/**
 * Shopee Food Merchant Portal – browser automation login (Playwright)
 *
 * Login flow:
 * 1. Navigate to merchant.shopeefood.vn/account/login
 * 2. Click "ĐĂNG NHẬP BẰNG SỐ ĐIỆN THOẠI" (phone login)
 * 3. Fill phone number → click next/login
 * 4. Fill password → submit
 * 5. Wait for redirect to dashboard
 * 6. Collect cookies + localStorage token
 *
 * Auth token is stored in Redux/localStorage by the React app.
 * Session TTL: ~12 hours (assumed, no documented value)
 */
const { chromium } = require('playwright')

const SHOPEE_LOGIN = 'https://merchant.shopeefood.vn/account/login'
const SESSION_TTL  = 12 * 3600
const LAUNCH_ARGS  = [
  '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
  '--disable-gpu', '--disable-blink-features=AutomationControlled',
]

async function loginShopee({ username, password }) {
  let browser = null, context = null, page = null

  try {
    console.log('[shopee] Starting browser automation for:', username)

    browser = await chromium.launch({
      headless: true,
      args: LAUNCH_ARGS,
      timeout: 30000,
    })
    context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'vi-VN',
      viewport: { width: 1280, height: 800 },
    })
    page = await context.newPage()

    // Intercept auth API calls to capture token directly from network
    let capturedToken = null
    page.on('response', async (resp) => {
      const url = resp.url()
      if (url.includes('gsso.deliverynow.vn') || url.includes('gsso.shopeefood.vn')) {
        const status = resp.status()
        console.log('[shopee-net]', status, url.replace(/https:\/\/[^/]+/, '').substring(0, 80))
        if (url.includes('/secure_login') || url.includes('/social_login')) {
          try {
            const body = await resp.json()
            if (body?.result === 'success' && body?.reply?.access_token) {
              capturedToken = body.reply.access_token
              console.log('[shopee] Captured access_token from network:', capturedToken.substring(0, 30) + '...')
            }
          } catch {}
        }
      }
    })

    // Navigate to login page
    console.log('[shopee] Navigating to login page...')
    await page.goto(SHOPEE_LOGIN, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(2000)
    console.log('[shopee] Page loaded, URL:', page.url())

    try { await page.screenshot({ path: '/tmp/shopee-login-page.png' }) } catch {}

    // Dump visible text for debugging
    const pageText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').substring(0, 500)).catch(() => '')
    console.log('[shopee] Page text (500ch):', pageText)
    // Dump all inputs
    const allInputs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).map(i => `${i.type}|${i.name}|${i.placeholder}|vis:${i.offsetParent !== null}`)
    ).catch(() => [])
    console.log('[shopee] Inputs on page:', allInputs.join(' ; '))

    // ── Step 1: Click "ĐĂNG NHẬP BẰNG SỐ ĐIỆN THOẠI" (phone login button) ──
    // Skip this step - go directly to password mode
    // We'll click "Đăng nhập bằng mật khẩu" directly if visible

    // ── Step 2: Look for "Đăng nhập bằng mật khẩu" link to switch to password mode ──
    const pwdModeSelectors = [
      'button:has-text("Đăng nhập bằng mật khẩu")',
      'button:has-text("mật khẩu")',
      'a:has-text("mật khẩu")',
      'span:has-text("Đăng nhập bằng mật khẩu")',
    ]
    for (const sel of pwdModeSelectors) {
      try {
        const el = page.locator(sel).first()
        if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
          await el.click()
          console.log('[shopee] Switched to password mode with:', sel)
          await page.waitForTimeout(1500)
          break
        }
      } catch {}
    }

    // Dump inputs again after mode switch
    const allInputs2 = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input')).map(i => `${i.type}|${i.name}|${i.placeholder}|vis:${i.offsetParent !== null}`)
    ).catch(() => [])
    console.log('[shopee] Inputs after mode switch:', allInputs2.join(' ; '))

    try { await page.screenshot({ path: '/tmp/shopee-before-fill.png' }) } catch {}

    // ── Step 3: Fill phone number ──────────────────────────────────────────────
    console.log('[shopee] Filling phone number:', username)
    // Try common selectors for phone input - be specific to avoid search boxes
    const phoneSelectors = [
      'input[name="account"]',
      'input[name="phone"]',
      'input[name="username"]',
      'input[placeholder*="số điện thoại" i]',
      'input[placeholder*="phone" i]',
      'input[placeholder*="Username" i]',
      'input[placeholder*="email" i]',
      'input[type="tel"]',
    ]
    let phoneFilled = false
    for (const sel of phoneSelectors) {
      try {
        const el = page.locator(sel).first()
        const vis = await el.isVisible({ timeout: 2000 }).catch(() => false)
        if (vis) {
          await el.fill(username)
          phoneFilled = true
          console.log('[shopee] Phone filled with selector:', sel)
          break
        }
      } catch {}
    }
    if (!phoneFilled) {
      // Fallback: use all visible text inputs, skip search boxes by placeholder
      const allVis = await page.$$('input[type="text"]:visible, input:not([type]):visible')
      for (const inp of allVis) {
        const ph = await inp.getAttribute('placeholder').catch(() => '')
        if (ph && ph.toLowerCase().includes('tìm kiếm')) continue // skip search
        await inp.fill(username)
        phoneFilled = true
        console.log('[shopee] Phone filled via fallback, placeholder:', ph)
        break
      }
    }
    if (!phoneFilled) {
      return { success: false, error: 'Shopee: could not find phone input field' }
    }
    await page.waitForTimeout(300)

    // ── Step 4: Fill password ─────────────────────────────────────────────────
    console.log('[shopee] Filling password...')
    const passSelectors = [
      'input[name="password"]',
      'input[type="password"]',
      'input[placeholder*="mật khẩu" i]',
      'input[placeholder*="password" i]',
    ]
    let passFilled = false
    for (const sel of passSelectors) {
      try {
        const el = page.locator(sel).first()
        const vis = await el.isVisible({ timeout: 2000 }).catch(() => false)
        if (vis) {
          await el.fill(password)
          passFilled = true
          console.log('[shopee] Password filled with selector:', sel)
          break
        }
      } catch {}
    }
    if (!passFilled) {
      // Maybe it's a two-step form: need to click "Tiếp tục" first
      console.log('[shopee] No password field visible, trying to click Tiếp tục/Continue...')
      const nextBtnSelectors = [
        'button:has-text("Tiếp tục")',
        'button:has-text("Continue")',
        'button:has-text("Đăng nhập")',
        'button[type="submit"]',
      ]
      for (const sel of nextBtnSelectors) {
        try {
          const el = page.locator(sel).first()
          if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
            await el.click()
            console.log('[shopee] Clicked next/continue with:', sel)
            await page.waitForTimeout(2000)
            break
          }
        } catch {}
      }
      try { await page.screenshot({ path: '/tmp/shopee-after-continue.png' }) } catch {}
      // Dump inputs after continue
      const allInputs3 = await page.evaluate(() =>
        Array.from(document.querySelectorAll('input')).map(i => `${i.type}|${i.name}|${i.placeholder}|vis:${i.offsetParent !== null}`)
      ).catch(() => [])
      console.log('[shopee] Inputs after continue:', allInputs3.join(' ; '))
      // Now try password again
      for (const sel of passSelectors) {
        try {
          const el = page.locator(sel).first()
          const vis = await el.isVisible({ timeout: 3000 }).catch(() => false)
          if (vis) {
            await el.fill(password)
            passFilled = true
            console.log('[shopee] Password filled (after continue) with selector:', sel)
            break
          }
        } catch {}
      }
    }
    if (!passFilled) {
      await page.screenshot({ path: '/tmp/shopee-no-password.png' }).catch(() => {})
      // Return page HTML for debugging
      const html = await page.evaluate(() => document.body.innerHTML.substring(0, 2000)).catch(() => '')
      console.log('[shopee] Page HTML snippet:', html)
      return { success: false, error: 'Shopee: could not find password field' }
    }
    await page.waitForTimeout(300)

    try { await page.screenshot({ path: '/tmp/shopee-before-submit.png' }) } catch {}

    // ── Step 5: Submit ─────────────────────────────────────────────────────────
    console.log('[shopee] Submitting login form...')
    // Log all visible buttons for debugging
    const visButtons = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null).map(b => b.textContent.trim().substring(0, 50))
    ).catch(() => [])
    console.log('[shopee] Visible buttons:', visButtons.join(' | '))
    const submitSelectors = [
      'button[type="submit"]',
      'button:has-text("Đăng nhập")',
      'button:has-text("Sign in")',
      'button:has-text("Login")',
      'button:has-text("Continue")',
      'button:has-text("Tiếp tục")',
    ]
    let submitted = false
    for (const sel of submitSelectors) {
      try {
        const el = page.locator(sel).first()
        if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
          await el.click({ timeout: 10000 })
          console.log('[shopee] Submitted with:', sel)
          submitted = true
          break
        }
      } catch {}
    }
    if (!submitted) {
      // Press Enter in password field
      const pwEl = page.locator('input[type="password"]').first()
      if (await pwEl.isVisible({ timeout: 2000 }).catch(() => false)) {
        await pwEl.press('Enter')
        console.log('[shopee] Submitted via Enter key')
        submitted = true
      }
    }

    // ── Step 6: Wait for authenticated redirect ────────────────────────────────
    console.log('[shopee] Waiting for redirect after login...')
    try {
      await page.waitForFunction(
        () => !window.location.pathname.includes('/account/login'),
        { timeout: 30000 }
      )
      console.log('[shopee] Redirected to:', page.url())
    } catch {
      console.log('[shopee] Timeout waiting for redirect, current URL:', page.url())
      // Check if login failed - get page HTML snippet
      const errMsg = await page.evaluate(() => {
        const errEl = document.querySelector('.error-message, .alert-danger, [class*="error"], [class*="invalid"], [class*="Error"]')
        return errEl ? errEl.innerText : null
      }).catch(() => null)
      if (errMsg) {
        return { success: false, error: `Shopee: login error – ${errMsg}` }
      }
      // Dump buttons and inputs for diagnosis
      const btns = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null).map(b => b.textContent.trim().substring(0, 40))
      ).catch(() => [])
      console.log('[shopee] Buttons after submit:', btns.join(' | '))
      const bodyText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').substring(0, 300)).catch(() => '')
      console.log('[shopee] Body text after submit:', bodyText)
      try { await page.screenshot({ path: '/tmp/shopee-after-submit.png' }) } catch {}
    }

    // ── Step 7: Extract cookies and tokens ───────────────────────────────────
    const cookies = await context.cookies()
    const localStorageData = await page.evaluate(() => {
      const result = {}
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        result[k] = localStorage.getItem(k)
      }
      return result
    }).catch(() => ({}))

    console.log('[shopee] Cookies:', cookies.length, '| localStorage keys:', Object.keys(localStorageData).length)
    console.log('[shopee] localStorage keys:', Object.keys(localStorageData).slice(0, 20).join(', '))

    // Find auth token - check captured network token first, then localStorage
    let token = capturedToken

    if (!token) {
      // Try to extract from localStorage - look for known keys
      const lsKeys = ['access_token', 'token', 'auth_token', 'foody_auth', 'shopeefood_token', 'auth']
      for (const k of lsKeys) {
        if (localStorageData[k]) {
          const val = localStorageData[k]
          try {
            const parsed = JSON.parse(val)
            token = parsed.access_token ?? parsed.token ?? parsed
          } catch {
            token = val
          }
          if (token && typeof token === 'string') {
            console.log('[shopee] Token from localStorage key:', k)
            break
          }
        }
      }
    }

    // Check if we got to dashboard (means login succeeded)
    const currentUrl = page.url()
    const isLoggedIn = !currentUrl.includes('/account/login')

    if (!isLoggedIn && !token) {
      return { success: false, error: 'Shopee: login failed - still on login page (wrong password?)' }
    }

    await context.close()
    await browser.close()

    return {
      success: true,
      token: token || '',
      cookies,
      sessionTtl: SESSION_TTL,
      localStorage: localStorageData,
    }
  } catch (err) {
    console.error('[shopee] Error:', err.message)
    try { if (page) await page.screenshot({ path: '/tmp/shopee-error.png' }).catch(() => {}) } catch {}
    try { if (context) await context.close() } catch {}
    try { if (browser) await browser.close() } catch {}
    return { success: false, error: `Shopee: ${err.message}` }
  }
}

module.exports = { loginShopee }
