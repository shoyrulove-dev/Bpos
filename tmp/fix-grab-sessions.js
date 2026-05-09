/**
 * fix-grab-sessions.js
 * Chạy: node tmp/fix-grab-sessions.js
 *
 * - Mở Chrome có giao diện (non-headless) — local IP không bị Grab reCAPTCHA
 * - Login Grab, capture JWT, lưu vào BPOS qua API manualJwt
 * - Xử lý tuần tự cả 3 account
 */

const { chromium } = require('playwright')
const https = require('https')
const http = require('http')

// ─── CẤU HÌNH ────────────────────────────────────────────────────────────────

const BPOS_BASE = 'https://bposbin.vercel.app'
const BPOS_ADMIN = { email: 'admin@bpos.vn', password: '123456' }

const ACCOUNTS = [
  {
    label:    'ooo.tech.ds33',
    username: 'ooo.tech.ds33',
    password: 'Nexdor@123',
    bposId:   '69fba901ea2efd407b2e93cc',
    storeId:  '5-C63FDBAKC7MVRX',
  },
  {
    label:    '1ketoan@takogroup.com.vn',
    username: '1ketoan@takogroup.com.vn',
    password: 'Bdt2026@',
    bposId:   '69fba901ea2efd407b2e93ca',
    storeId:  'VNMG20240823094523016218',
  },
  {
    label:    'dmx.nexdor.bdt',
    username: 'dmx.nexdor.bdt',
    password: 'Nexdor@123',
    bposId:   '69fba900ea2efd407b2e93c6',
    storeId:  '5-C2EWWAD3ECCWNX',
  },
]

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function log(label, ...args) {
  const time = new Date().toTimeString().slice(0, 8)
  console.log(`[${time}] [${label}]`, ...args)
}

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const mod = parsed.protocol === 'https:' ? https : http
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    }
    const req = mod.request(reqOptions, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'] || []
        let parsed = null
        try { parsed = JSON.parse(body) } catch {}
        resolve({ status: res.status || res.statusCode, headers: res.headers, setCookie, data: parsed, raw: body })
      })
    })
    req.on('error', reject)
    if (options.body) req.write(options.body)
    req.end()
  })
}

// Login BPOS via NextAuth credentials và trả về session cookie string
async function bposLogin() {
  log('BPOS', 'Lấy CSRF token...')
  const csrfRes = await fetchJson(`${BPOS_BASE}/api/auth/csrf`)
  const csrfToken = csrfRes.data?.csrfToken
  if (!csrfToken) throw new Error('Không lấy được CSRF token từ BPOS')

  const csrfCookie = (csrfRes.setCookie || []).map(c => c.split(';')[0]).join('; ')

  log('BPOS', 'Đăng nhập...')
  const body = new URLSearchParams({
    email: BPOS_ADMIN.email,
    password: BPOS_ADMIN.password,
    csrfToken,
    callbackUrl: `${BPOS_BASE}/`,
    json: 'true',
  }).toString()

  const loginRes = await fetchJson(`${BPOS_BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': csrfCookie,
      'Content-Length': Buffer.byteLength(body),
    },
    body,
  })

  // collect all session cookies
  const allCookies = [
    ...(csrfRes.setCookie || []),
    ...(loginRes.setCookie || []),
  ].map(c => c.split(';')[0])

  if (!allCookies.some(c => c.includes('authjs.session-token') || c.includes('next-auth.session-token'))) {
    // try to get session token from redirected URL header or do a session check
    const sessionCookieStr = allCookies.join('; ')
    const sessCheck = await fetchJson(`${BPOS_BASE}/api/auth/session`, {
      headers: { 'Cookie': sessionCookieStr }
    })
    if (!sessCheck.data?.user?.email) {
      throw new Error(`BPOS login thất bại. Status: ${loginRes.status}. Body: ${loginRes.raw.slice(0, 200)}`)
    }
    const sessionCookies = [...allCookies, ...(sessCheck.setCookie || []).map(c => c.split(';')[0])]
    log('BPOS', `Login OK: ${sessCheck.data.user.email}`)
    return sessionCookies.join('; ')
  }

  log('BPOS', 'Login OK (session token captured)')
  return allCookies.join('; ')
}

// Lưu browser cookies vào BPOS integration
async function saveSessionToBpos(bposCookies, account, grabCookies) {
  log(account.label, `Lưu ${grabCookies.length} cookies vào BPOS (integration ${account.bposId})...`)
  const body = JSON.stringify({ cookies: grabCookies })
  const res = await fetchJson(`${BPOS_BASE}/api/integrations/${account.bposId}/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': bposCookies,
      'Content-Length': Buffer.byteLength(body),
    },
    body,
  })
  if (res.status === 200 && (res.data?.success || res.data?.ok)) {
    log(account.label, `✅ Session saved! Expires: ${res.data?.sessionExpiresAt ?? '(ttl default)'}`)
    return true
  }
  log(account.label, `❌ Save failed (${res.status}):`, JSON.stringify(res.data || res.raw?.slice(0, 200)))
  return false
}

// Login Grab + capture browser cookies
async function grabLogin(account) {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--start-maximized',
    ],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: null,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  })

  const page = await context.newPage()

  // ─── GRAB LOGIN FLOW ───────────────────────────────────────────────────────
  log(account.label, 'Mở merchant.grab.com/login...')
  await page.goto('https://merchant.grab.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(4000)

  // Click tab Email nếu có
  const emailTab = page.locator('button:has-text("Email"), [data-testid="email-tab"], a:has-text("Email")').first()
  if (await emailTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await emailTab.click()
    await page.waitForTimeout(1000)
  }

  // Tìm username input
  const usernameSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    'input[autocomplete="username"]',
    'input[placeholder*="email" i]',
    'input[placeholder*="Email"]',
    'input[type="text"]',
  ]
  let accountInput = null
  for (const sel of usernameSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 5000, state: 'visible' })
      accountInput = page.locator(sel).first()
      break
    } catch {}
  }

  if (!accountInput) {
    log(account.label, 'Thử weblogin URL trực tiếp...')
    await page.goto(
      'https://weblogin.grab.com/merchant/login?service_id=MEXUSERS&redirect=https%3A%2F%2Fmerchant.grab.com%2Fportal',
      { waitUntil: 'domcontentloaded', timeout: 60000 }
    )
    await page.waitForTimeout(5000)
    for (const sel of usernameSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000, state: 'visible' })
        accountInput = page.locator(sel).first()
        break
      } catch {}
    }
  }

  // Nếu không thấy form — có thể reCAPTCHA hoặc spinner
  if (!accountInput) {
    log(account.label, '⚠️  Không thấy form login. Cửa sổ trình duyệt đang mở.')
    log(account.label, '   Vui lòng giải captcha / thao tác thủ công, sau đó nhấn Enter ở đây.')
    await new Promise(res => process.stdin.once('data', res))
    for (const sel of usernameSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000, state: 'visible' })
        accountInput = page.locator(sel).first()
        break
      } catch {}
    }
  }

  if (accountInput) {
    log(account.label, `Điền username: ${account.username}`)
    await accountInput.click()
    await accountInput.fill(account.username)
    await page.waitForTimeout(500)

    // Click Next nếu có
    const nextBtn = page.locator([
      'button:has-text("Next")',
      'button:has-text("Tiếp")',
      'button:has-text("Continue")',
      '[role="button"]:has-text("Next")',
    ].join(', ')).first()
    if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.click()
      await page.waitForTimeout(2000)
    }

    // Điền password
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[autocomplete="current-password"]',
    ]
    let passwordInput = null
    for (const sel of passwordSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 12000, state: 'visible' })
        passwordInput = page.locator(sel).first()
        break
      } catch {}
    }

    if (!passwordInput && page.url().includes('/challenge/recaptcha')) {
      log(account.label, '⚠️  reCAPTCHA! Vui lòng giải trong trình duyệt, sau đó nhấn Enter.')
      await new Promise(res => process.stdin.once('data', res))
      for (const sel of passwordSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 15000, state: 'visible' })
          passwordInput = page.locator(sel).first()
          break
        } catch {}
      }
    }

    if (passwordInput) {
      log(account.label, 'Điền password...')
      await passwordInput.fill(account.password)
      await page.waitForTimeout(500)

      // Submit
      const submitBtn = page.locator([
        'button[type="submit"]',
        'button:has-text("Đăng nhập")',
        'button:has-text("Log in")',
        'button:has-text("Sign in")',
      ].join(', ')).first()
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click()
      } else {
        await passwordInput.press('Enter')
      }
      log(account.label, 'Đã submit, chờ redirect vào portal...')
    } else {
      log(account.label, '❌ Không tìm thấy password input.')
    }
  }

  // Chờ đến khi vào được merchant portal (tối đa 90s)
  log(account.label, 'Chờ vào merchant portal...')
  try {
    await page.waitForURL('**/food/orders**', { timeout: 90000 })
  } catch {
    // Có thể URL khác một chút, thử check localStorage
    try {
      await page.waitForURL('**/portal**', { timeout: 10000 })
    } catch {}
  }
  await page.waitForTimeout(3000)

  const finalUrl = page.url()
  log(account.label, `Final URL: ${finalUrl}`)

  if (!finalUrl.includes('merchant.grab.com') || finalUrl.includes('login') || finalUrl.includes('weblogin')) {
    log(account.label, '❌ Chưa vào được merchant portal. URL:', finalUrl)
    await browser.close()
    return null
  }

  // Capture tất cả cookies
  const cookies = await context.cookies('https://merchant.grab.com')
  log(account.label, `Captured ${cookies.length} cookies từ merchant.grab.com`)

  // Thêm cookies từ grab.com và grabtaxi.com nếu có
  const allCookies = await context.cookies()
  const grabCookies = allCookies.filter(c =>
    c.domain.includes('grab.com') || c.domain.includes('grabtaxi.com')
  )
  log(account.label, `Total Grab-domain cookies: ${grabCookies.length}`)

  await browser.close()
  return grabCookies.length > 0 ? grabCookies : cookies
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60))
  console.log('  GRAB SESSION FIX — 3 accounts')
  console.log('='.repeat(60))

  // Login BPOS một lần dùng cho cả 3 account
  let bposCookies
  try {
    bposCookies = await bposLogin()
  } catch (err) {
    console.error('❌ BPOS login failed:', err.message)
    process.exit(1)
  }

  const results = []

  for (const account of ACCOUNTS) {
    console.log('\n' + '-'.repeat(60))
    console.log(`  Account: ${account.label}`)
    console.log('-'.repeat(60))

    let grabCookies = null
    try {
      grabCookies = await grabLogin(account)
    } catch (err) {
      log(account.label, '❌ Grab login error:', err.message)
    }

    if (grabCookies && grabCookies.length > 0) {
      const saved = await saveSessionToBpos(bposCookies, account, grabCookies)
      results.push({ label: account.label, status: saved ? 'OK' : 'SAVE_FAILED' })
    } else {
      log(account.label, '❌ Không lấy được cookies')
      results.push({ label: account.label, status: 'NO_COOKIES' })
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('  KẾT QUẢ')
  console.log('='.repeat(60))
  for (const r of results) {
    const icon = r.status === 'OK' ? '✅' : '❌'
    console.log(`  ${icon} ${r.label}: ${r.status}`)
  }
  console.log('')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
