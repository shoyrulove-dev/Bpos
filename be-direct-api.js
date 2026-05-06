'use strict'
/**
 * Be Food – Login automation
 * Strategy:
 * 1. Try direct HTTP API first (fast)
 * 2. Browser automation: wait for Flutter, try DOM inputs, then page.evaluate fetch injection
 */
const { chromium } = require('playwright')

const LOGIN_URL   = 'https://merchant.be.com.vn/login'
const GW_LOGIN    = '/be-merchant-gateway/v2/merchant/login'
const GW_BASE     = 'https://gw.be.com.vn/api/v1'
const OP_TOKEN    = '0b28e008bc323838f5ec84f718ef11e6'
const SESSION_TTL = 8 * 3600

async function tryDirectLogin(username, password) {
  const variants = [
    { username, password, operator_token: OP_TOKEN, device_type: 2 },
    { phone_number: username, password, operator_token: OP_TOKEN, device_type: 2 },
    { email: username, password, operator_token: OP_TOKEN, device_type: 2 },
  ]
  for (const body of variants) {
    try {
      const res = await fetch(`${GW_BASE}/be-merchant-gateway/v2/merchant/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://merchant.be.com.vn',
          'Referer': 'https://merchant.be.com.vn/',
          'x-operator-token': OP_TOKEN,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      console.log('[be-direct] variant:', JSON.stringify(body).slice(0, 80), '-> code:', data.code)
      if (data.token && data.token.length > 20) return data.token
    } catch (e) {
      console.log('[be-direct] fetch error:', e.message)
    }
  }
  return null
}

async function loginBe({ username, password }) {
  console.log('[be] Login for:', username)

  const directToken = await tryDirectLogin(username, password)
  if (directToken) {
    console.log('[be] Direct API login succeeded')
    return buildSession(directToken)
  }

  console.log('[be] Direct API failed, trying browser automation')

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'vi-VN',
  })
  const page = await context.newPage()

  let capturedToken = null
  let capturedReqInfo = null

  await context.route('**gw.be.com.vn**', async (route) => {
    const req = route.request()
    const url = req.url()
    const body = req.postData()
    console.log('[be-intercept]', req.method(), url.replace('https://gw.be.com.vn/api/v1/', ''))
    if (body) console.log('[be-intercept-body]', body.slice(0, 300))
    if (url.includes(GW_LOGIN) && req.method() === 'POST') capturedReqInfo = { url, body }
    await route.continue()
  })

  page.on('response', async (response) => {
    if (response.url().includes(GW_LOGIN)) {
      try {
        const text = await response.text()
        console.log('[be-login-resp]', text.slice(0, 400))
        const json = JSON.parse(text)
        if (json.token && json.token.length > 20) capturedToken = json.token
      } catch {}
    }
  })

  try {
    console.log('[be] Navigating to', LOGIN_URL)
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })

    console.log('[be] Waiting 8s for Flutter to initialize...')
    await page.waitForTimeout(8000)

    const domInfo = await page.evaluate(() => ({
      url: location.href,
      inputs: document.querySelectorAll('input').length,
      canvases: document.querySelectorAll('canvas').length,
      fltSem: document.querySelectorAll('flt-semantics').length,
      ls: Object.keys(localStorage),
    }))
    console.log('[be] DOM after 8s:', JSON.stringify(domInfo))

    try { await page.screenshot({ path: '/tmp/be-login.png' }) } catch {}

    // Check localStorage for existing token
    const existingToken = await page.evaluate(() => {
      for (const k of Object.keys(localStorage)) {
        const v = localStorage.getItem(k) || ''
        if (v.startsWith('eyJ')) return v
        try {
          const o = JSON.parse(v)
          const t = o && (o.token || o.access_token)
          if (t && t.startsWith('eyJ')) return t
        } catch {}
      }
      return null
    })
    if (existingToken) {
      capturedToken = existingToken
      console.log('[be] Found token in localStorage')
    }

    if (!capturedToken) {
      // Trigger Flutter accessibility
      await page.evaluate(() => { document.body.click() })
      await page.waitForTimeout(2000)

      const inputsNow = await page.$$('input')
      console.log('[be] Inputs after accessibility trigger:', inputsNow.length)

      if (inputsNow.length >= 2) {
        await inputsNow[0].click()
        await page.keyboard.type(username, { delay: 50 })
        await page.keyboard.press('Tab')
        await page.waitForTimeout(400)
        await page.keyboard.type(password, { delay: 50 })
        await page.keyboard.press('Enter')
        console.log('[be] Typed via DOM inputs')
      } else {
        // Try coordinate clicks
        const { width, height } = page.viewportSize()
        const cx = Math.round(width / 2)
        let typed = false

        for (const yPct of [0.35, 0.40, 0.45, 0.50]) {
          const y = Math.round(height * yPct)
          await page.mouse.click(cx, y)
          await page.waitForTimeout(600)
          const active = await page.evaluate(() => ({
            tag: document.activeElement && document.activeElement.tagName,
            type: document.activeElement && document.activeElement.type,
          }))
          console.log('[be] Click y=' + y + ': active=' + active.tag + '/' + active.type)
          if (active.tag === 'INPUT') {
            await page.keyboard.selectAll()
            await page.keyboard.type(username, { delay: 50 })
            await page.keyboard.press('Tab')
            await page.waitForTimeout(400)
            await page.keyboard.type(password, { delay: 50 })
            await page.keyboard.press('Enter')
            console.log('[be] Typed via coordinate at y=' + y)
            typed = true
            break
          }
        }

        if (!typed) {
          // Inject fetch from page context (same origin cookies/session)
          console.log('[be] Injecting fetch from page context')
          const fetchResult = await page.evaluate(async function(args) {
            try {
              var res = await fetch('https://gw.be.com.vn/api/v1/be-merchant-gateway/v2/merchant/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: args.u, password: args.p, operator_token: args.op, device_type: 2 }),
              })
              return await res.text()
            } catch (e) { return 'err:' + e.message }
          }, { u: username, p: password, op: OP_TOKEN })
          console.log('[be] Page-fetch result:', fetchResult.slice(0, 300))
          try {
            const json = JSON.parse(fetchResult)
            if (json.token && json.token.length > 20) capturedToken = json.token
          } catch {}
        }
      }

      // Wait for token up to 45s
      if (!capturedToken) {
        const deadline = Date.now() + 45000
        while (Date.now() < deadline) {
          await page.waitForTimeout(1000)
          const stored = await page.evaluate(() => {
            for (var k of Object.keys(localStorage)) {
              var v = localStorage.getItem(k) || ''
              if (v.startsWith('eyJ')) return v
              try {
                var o = JSON.parse(v)
                var t = o && (o.token || o.access_token || (o.data && o.data.token))
                if (t && t.startsWith('eyJ')) return t
              } catch (_) {}
            }
            return null
          })
          if (stored) { capturedToken = stored; break }
        }
      }
    }

    if (!capturedToken) {
      const finalUrl = page.url()
      const lsKeys = await page.evaluate(() => Object.keys(localStorage))
      console.error('[be] No token. URL:', finalUrl, '| LS:', lsKeys.join(','))
      await browser.close()
      return { success: false, error: 'Be Food: no auth token captured. URL: ' + finalUrl }
    }

    await browser.close()
    return buildSession(capturedToken)

  } catch (err) {
    console.error('[be] Error:', err.message)
    try { await browser.close() } catch (_) {}
    return { success: false, error: err.message }
  }
}

function buildSession(token) {
  var expiresAt
  try {
    var payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
    console.log('[be] JWT sub:', payload.sub, 'exp:', payload.exp)
    expiresAt = payload.exp ? payload.exp * 1000 : Date.now() + SESSION_TTL * 1000
  } catch (_) {
    expiresAt = Date.now() + SESSION_TTL * 1000
  }
  return {
    success: true,
    token,
    expiresAt,
    extraHeaders: { Authorization: 'Bearer ' + token },
  }
}

module.exports = { loginBe }
