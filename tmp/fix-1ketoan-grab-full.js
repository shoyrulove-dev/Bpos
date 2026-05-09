// fix-1ketoan-grab-full.js - Login Grab, capture storeId từ URL + save session
const { chromium } = require('playwright')

const BPOS_URL = 'https://bposbin.vercel.app'
const BPOS_ADMIN = { email: 'admin@bpos.vn', password: '123456' }
const INTEGRATION_ID = '69fba901ea2efd407b2e93ca'
const GRAB_USER = '1ketoan@takogroup.com.vn'
const GRAB_PASS = 'Bdt2026@'
const GRAB_MERCHANT_URL = 'https://merchant.grab.com'

async function bposLogin() {
  const csrfR = await fetch(`${BPOS_URL}/api/auth/csrf`)
  const csrfCookies = (csrfR.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ')
  const { csrfToken } = await csrfR.json()
  const loginR = await fetch(`${BPOS_URL}/api/auth/callback/credentials`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: csrfCookies },
    body: new URLSearchParams({ csrfToken, email: BPOS_ADMIN.email, password: BPOS_ADMIN.password, redirect: 'false', callbackUrl: BPOS_URL, json: 'true' }).toString(),
  })
  const sessionCookies = (loginR.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ')
  return [csrfCookies, sessionCookies].filter(Boolean).join('; ')
}

async function grabLogin() {
  const browser = await chromium.launch({
    headless: false,
    executablePath: 'C:\\Users\\Admin\\AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe',
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
  })
  const page = await context.newPage()

  console.log('Mở Grab merchant portal...')
  await page.goto(`${GRAB_MERCHANT_URL}/portal/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(2000)

  // Điền username
  const emailInput = await page.$('input[type="email"], input[name="username"], input[placeholder*="email" i], input[placeholder*="phone" i]')
  if (emailInput) {
    await emailInput.fill(GRAB_USER)
    console.log('✅ Điền username')
  }

  // Điền password
  const passInput = await page.$('input[type="password"]')
  if (passInput) {
    await passInput.fill(GRAB_PASS)
    console.log('✅ Điền password')
  }

  // Click login button
  const loginBtn = await page.$('button[type="submit"], button:has-text("Đăng nhập"), button:has-text("Login"), button:has-text("Sign in")')
  if (loginBtn) {
    await loginBtn.click()
    console.log('✅ Click Login')
  }

  // Chờ redirect hoặc dashboard
  console.log('Đang chờ đăng nhập... (tối đa 60s, nếu có reCAPTCHA hãy giải thủ công)')
  
  let storeId = null
  let dashboardUrl = null

  // Chờ URL thay đổi sang dashboard
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(1000)
    const url = page.url()
    
    // Detect store ID from URL: /portal/5-XXXXX/ or /orders/5-XXXXX/
    const match = url.match(/\/portal\/(5-[A-Z0-9]+)/) || url.match(/\/(5-[A-Z0-9]{5,20})\//) || url.match(/merchantID=([5][A-Z0-9-]+)/) || url.match(/storeId=([5][A-Z0-9-]+)/)
    if (match) {
      storeId = match[1]
      dashboardUrl = url
      console.log(`✅ Tìm thấy Store ID: ${storeId} từ URL: ${url}`)
      break
    }

    // Try to get storeId from localStorage or window vars
    if (i % 10 === 5 && url !== 'about:blank') {
      try {
        const jsData = await page.evaluate(() => {
          const ls = Object.keys(localStorage).reduce((acc, k) => {
            try { acc[k] = JSON.parse(localStorage[k]) } catch { acc[k] = localStorage[k] }
            return acc
          }, {})
          return { url: window.location.href, title: document.title, ls: JSON.stringify(ls).slice(0, 500) }
        })
        if (jsData.url.includes('portal') || jsData.url.includes('merchant')) {
          console.log(`URL hiện tại: ${jsData.url}`)
          // Try regex on JS url too
          const m2 = jsData.url.match(/\/(5-[A-Z0-9]{5,20})/)
          if (m2) { storeId = m2[1]; console.log(`✅ Store ID từ JS: ${storeId}`); break }
        }
        if (i === 25) console.log('Vui lòng đăng nhập trong cửa sổ Chromium... (còn 95s)')
      } catch {}
    }
    if (i === 0) console.log('Vui lòng đăng nhập trong cửa sổ Chromium... (120s)')
  }

  // Get session cookies
  const cookies = await context.cookies()
  const grabCookies = cookies.filter(c => c.domain.includes('grab.com') || c.domain.includes('merchant.grab'))
  console.log(`\nCaptured ${grabCookies.length} Grab cookies`)

  // Discover storeId from grab API if not found yet
  if (!storeId && grabCookies.length > 0) {
    console.log('Thử discover Store ID từ Grab API...')
    const cookieHeader = grabCookies.map(c => `${c.name}=${c.value}`).join('; ')
    try {
      const r = await fetch('https://merchant.grab.com/api/v1/merchant/restaurant/list', {
        headers: { Cookie: cookieHeader, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      })
      if (r.ok) {
        const d = await r.json()
        console.log('API response:', JSON.stringify(d).slice(0, 200))
      }
    } catch (e) {
      console.log('API call failed:', e.message)
    }
  }

  await browser.close()

  return { cookies: grabCookies, storeId }
}

async function saveToApos(bposCookies, grabCookies, storeId) {
  // Save session
  const sessionBody = { cookies: grabCookies }
  if (storeId) sessionBody.extraHeaders = { 'x-grab-store-id': storeId }

  const sessionR = await fetch(`${BPOS_URL}/api/integrations/${INTEGRATION_ID}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: bposCookies },
    body: JSON.stringify(sessionBody),
  })
  const sessionRes = await sessionR.json()
  console.log('Session saved:', JSON.stringify(sessionRes).slice(0, 200))

  // Update externalStoreId if discovered
  if (storeId && storeId.startsWith('5-')) {
    console.log(`\nCập nhật externalStoreId → ${storeId}`)
    const patchR = await fetch(`${BPOS_URL}/api/integrations/${INTEGRATION_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: bposCookies },
      body: JSON.stringify({ externalStoreId: storeId }),
    })
    const patchRes = await patchR.json()
    console.log('externalStoreId updated:', patchRes.externalStoreId)
  } else {
    console.log('\n⚠️  Không tìm được Grab Store ID. Session đã lưu nhưng cần cập nhật externalStoreId thủ công.')
    console.log('   Tìm Store ID từ URL Grab merchant portal: https://merchant.grab.com/portal/{storeId}/...')
  }
}

async function main() {
  console.log(`=== Fix Grab session cho ${GRAB_USER} ===\n`)
  const bposCookies = await bposLogin()
  const { cookies: grabCookies, storeId } = await grabLogin()

  if (grabCookies.length === 0) {
    console.log('❌ Không capture được cookies. Kiểm tra lại login.')
    return
  }

  await saveToApos(bposCookies, grabCookies, storeId)
  
  console.log('\n✅ Xong! Sau khi VPS sync (khoảng 1 phút) kiểm tra lại syncStatus.')
}

main().catch(e => console.error('Lỗi:', e.message, e.stack))
