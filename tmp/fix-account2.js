/**
 * fix-grab-account2.js
 * Fix riêng cho 1ketoan@takogroup.com.vn (bị VPS override)
 * Sau khi save, verify liên tục 3 phút
 */

const { chromium } = require('playwright')

const BPOS_BASE = 'https://bposbin.vercel.app'
const ACCOUNT = {
  label:    '1ketoan@takogroup.com.vn',
  username: '1ketoan@takogroup.com.vn',
  password: 'Bdt2026@',
  bposId:   '69fba901ea2efd407b2e93ca',
}

function log(...args) {
  console.log(`[${new Date().toTimeString().slice(0,8)}]`, ...args)
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts)
  const text = await res.text()
  try { return { status: res.status, data: JSON.parse(text), headers: res.headers } }
  catch { return { status: res.status, raw: text, headers: res.headers } }
}

async function bposLogin() {
  const csrfR = await fetchJson(`${BPOS_BASE}/api/auth/csrf`)
  const csrfToken = csrfR.data.csrfToken
  const csrfCookie = (csrfR.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ')

  const loginBody = new URLSearchParams({ csrfToken, email: 'admin@bpos.vn', password: '123456', redirect: 'false', callbackUrl: BPOS_BASE, json: 'true' }).toString()
  const loginR = await fetchJson(`${BPOS_BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': csrfCookie },
    body: loginBody,
  })
  const sessionCookie = (loginR.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ')
  return [csrfCookie, sessionCookie].filter(Boolean).join('; ')
}

async function grabLogin() {
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--start-maximized'],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: null,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  })
  const page = await context.newPage()

  log('Mở merchant.grab.com/login...')
  await page.goto('https://merchant.grab.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(4000)

  // Click Email tab nếu có
  const emailTab = page.locator('button:has-text("Email"), a:has-text("Email")').first()
  if (await emailTab.isVisible({ timeout: 3000 }).catch(() => false)) { await emailTab.click(); await page.waitForTimeout(1000) }

  // Tìm username input
  const usernameSelectors = ['input[type="email"]','input[name="email"]','input[name="username"]','input[autocomplete="username"]','input[type="text"]']
  let accountInput = null
  for (const sel of usernameSelectors) {
    try { await page.waitForSelector(sel, { timeout: 5000, state: 'visible' }); accountInput = page.locator(sel).first(); break } catch {}
  }

  if (!accountInput) {
    log('Thử weblogin URL trực tiếp...')
    await page.goto('https://weblogin.grab.com/merchant/login?service_id=MEXUSERS&redirect=https%3A%2F%2Fmerchant.grab.com%2Fportal', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(5000)
    for (const sel of usernameSelectors) {
      try { await page.waitForSelector(sel, { timeout: 5000, state: 'visible' }); accountInput = page.locator(sel).first(); break } catch {}
    }
  }

  if (!accountInput) {
    log('⚠️  Không thấy form login. Vui lòng giải captcha rồi nhấn Enter ở terminal...')
    await new Promise(res => process.stdin.once('data', res))
    for (const sel of usernameSelectors) {
      try { await page.waitForSelector(sel, { timeout: 5000, state: 'visible' }); accountInput = page.locator(sel).first(); break } catch {}
    }
  }

  if (accountInput) {
    log(`Điền username: ${ACCOUNT.username}`)
    await accountInput.click()
    await accountInput.fill(ACCOUNT.username)
    await page.waitForTimeout(500)

    const nextBtn = page.locator('button:has-text("Next"), button:has-text("Tiếp"), button:has-text("Continue")').first()
    if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) { await nextBtn.click(); await page.waitForTimeout(2000) }

    const passwordSelectors = ['input[type="password"]','input[name="password"]','input[autocomplete="current-password"]']
    let passwordInput = null
    for (const sel of passwordSelectors) {
      try { await page.waitForSelector(sel, { timeout: 15000, state: 'visible' }); passwordInput = page.locator(sel).first(); break } catch {}
    }

    if (!passwordInput && page.url().includes('/challenge/recaptcha')) {
      log('⚠️  reCAPTCHA! Vui lòng giải trong trình duyệt, sau đó nhấn Enter ở terminal...')
      await new Promise(res => process.stdin.once('data', res))
      for (const sel of passwordSelectors) {
        try { await page.waitForSelector(sel, { timeout: 20000, state: 'visible' }); passwordInput = page.locator(sel).first(); break } catch {}
      }
    }

    if (passwordInput) {
      log('Điền password...')
      await passwordInput.fill(ACCOUNT.password)
      await page.waitForTimeout(500)
      const submitBtn = page.locator('button[type="submit"], button:has-text("Đăng nhập"), button:has-text("Log in"), button:has-text("Sign in")').first()
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) { await submitBtn.click() }
      else { await passwordInput.press('Enter') }
      log('Submitted, chờ redirect...')
    } else {
      log('❌ Không tìm thấy password input')
    }
  }

  // Chờ vào merchant portal
  log('Chờ vào merchant portal (tối đa 120s)...')
  try { await page.waitForURL('**/food/orders**', { timeout: 120000 }) } catch {
    try { await page.waitForURL('**/portal**', { timeout: 10000 }) } catch {}
  }
  await page.waitForTimeout(4000)

  const finalUrl = page.url()
  log(`Final URL: ${finalUrl}`)

  if (finalUrl.includes('login') || finalUrl.includes('weblogin')) {
    log('❌ Vẫn ở trang login, chưa vào được portal')
    await browser.close()
    return null
  }

  const allCookies = await context.cookies()
  const grabCookies = allCookies.filter(c => c.domain.includes('grab.com') || c.domain.includes('grabtaxi.com'))
  log(`Captured ${grabCookies.length} Grab-domain cookies`)

  await browser.close()
  return grabCookies
}

async function saveSession(bposCookies, grabCookies) {
  log(`Lưu ${grabCookies.length} cookies vào BPOS...`)
  const body = JSON.stringify({ cookies: grabCookies })
  const r = await fetchJson(`${BPOS_BASE}/api/integrations/${ACCOUNT.bposId}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': bposCookies },
    body,
  })
  if (r.status === 200 && r.data?.sessionCapturedAt) {
    log(`✅ Session saved! cookieCount: ${r.data.cookieCount}, expires: ${r.data.sessionExpiresAt?.slice(0,19)}`)
    return true
  }
  log(`❌ Save failed (${r.status}):`, JSON.stringify(r.data || r.raw || ''))
  return false
}

async function checkStatus(bposCookies) {
  const r = await fetchJson(`${BPOS_BASE}/api/integrations?provider=grab`, { headers: { Cookie: bposCookies } })
  const integrations = Array.isArray(r.data) ? r.data : (r.data?.integrations || [])
  const integ = integrations.find(i => i._id === ACCOUNT.bposId || i.loginUsername === ACCOUNT.username)
  return integ ? { status: integ.sessionStatus, error: integ.sessionError } : null
}

async function main() {
  log('=== Fix 1ketoan@takogroup.com.vn ===')

  log('Login BPOS...')
  const bposCookies = await bposLogin()
  log('BPOS session OK')

  const grabCookies = await grabLogin()
  if (!grabCookies || grabCookies.length === 0) {
    log('❌ Không lấy được Grab cookies')
    process.exit(1)
  }

  const saved = await saveSession(bposCookies, grabCookies)
  if (!saved) {
    log('❌ Save thất bại')
    process.exit(1)
  }

  // IMMEDIATELY patch loginMode: 'api' after save (in case /session route reset it to 'auto')
  log('PATCH loginMode: api để VPS không override...')
  const patchR = await fetchJson(`${BPOS_BASE}/api/integrations/${ACCOUNT.bposId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Cookie': bposCookies },
    body: JSON.stringify({ loginMode: 'api' }),
  })
  if (patchR.status === 200) {
    log(`loginMode patched: ${patchR.data?.loginMode}`)
  } else {
    log(`PATCH failed (${patchR.status}):`, JSON.stringify(patchR.data || patchR.raw || ''))
  }

  // Verify trạng thái 3 phút (check mỗi 30s để phát hiện nếu VPS override)
  log('Theo dõi trạng thái trong 3 phút...')
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 30000))
    const info = await checkStatus(bposCookies)
    log(`[${(i+1)*30}s] Status: ${info?.status ?? '?'} | Error: ${info?.error?.slice(0,80) ?? 'none'}`)
    if (info?.status === 'expired') {
      log('⚠️  Session bị expired sau khi lưu! VPS đang override. Cần vô hiệu hóa VPS auto-login.')
    }
  }
}

main().catch(e => { console.error(e.message); process.exit(1) })
