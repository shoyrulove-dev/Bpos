// get-1ketoan-storeid.js - Mở browser đã login, bắt API requests để lấy storeId
const { chromium } = require('playwright')

const BPOS_URL = 'https://bposbin.vercel.app'
const BPOS_ADMIN = { email: 'admin@bpos.vn', password: '123456' }
const INTEGRATION_ID = '69fba901ea2efd407b2e93ca'
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

async function main() {
  console.log('=== Tìm Grab Store IDs cho 1ketoan@takogroup.com.vn ===\n')
  const bposCookies = await bposLogin()
  
  const browser = await chromium.launch({
    headless: false,
    executablePath: 'C:\\Users\\Admin\\AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe',
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  })
  
  const page = await context.newPage()
  
  // Capture all StoreIds from network requests
  const storeIds = new Set()
  
  page.on('request', (req) => {
    const url = req.url()
    // Grab portal API endpoints contain merchantID or storeId
    const patterns = [
      /merchantID=([A-Z0-9-]{5,20})/,
      /merchant_id=([A-Z0-9-]{5,20})/,
      /\/stores?\/([A-Z0-9-]{5,20})[/?]/,
      /\/portal\/([A-Z0-9-]{5,20})\//,
      /storeId=([A-Z0-9-]{5,20})/,
      /\/(5-[A-Z0-9]{5,15})/,
    ]
    for (const p of patterns) {
      const m = url.match(p)
      if (m && m[1] && !m[1].includes('undefined')) {
        storeIds.add(m[1])
        process.stdout.write(`  [NET] StoreId: ${m[1]}\n`)
      }
    }
  })
  
  page.on('response', async (response) => {
    const url = response.url()
    if (url.includes('grab.com') && !url.includes('.js') && !url.includes('.css')) {
      try {
        const ct = response.headers()['content-type'] || ''
        if (ct.includes('json')) {
          const body = await response.text()
          const patterns = [
            /"merchantID"\s*:\s*"([^"]{5,})"/g,
            /"storeId"\s*:\s*"([^"]{5,})"/g, 
            /"merchant_id"\s*:\s*"([^"]{5,})"/g,
          ]
          for (const p of patterns) {
            let m
            while ((m = p.exec(body)) !== null) {
              storeIds.add(m[1])
              process.stdout.write(`  [API] StoreId: ${m[1]} (từ ${url.slice(0, 60)})\n`)
            }
          }
        }
      } catch {}
    }
  })
  
  console.log('Đang mở Grab merchant portal...')
  await page.goto(GRAB_MERCHANT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(3000)
  
  console.log('\n📋 HƯỚNG DẪN:')
  console.log('1. Nếu cần đăng nhập: nhập 1ketoan@takogroup.com.vn / Bdt2026@')
  console.log('2. Sau khi vào dashboard: click vào từng cửa hàng trong danh sách')
  console.log('3. Script sẽ tự động capture StoreId từ URL/API requests')
  console.log('4. Chờ 120 giây rồi script sẽ tự đóng\n')
  
  // Monitor URL changes
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(1000)
    const url = page.url()
    
    // URL patterns for Grab portal
    const urlPatterns = [
      /\/portal\/([A-Z0-9-]{5,20})\//,
      /\/([5]-[A-Z0-9]{5,15})[/?]/,
      /merchantId=([A-Z0-9-]+)/,
    ]
    for (const p of urlPatterns) {
      const m = url.match(p)
      if (m) storeIds.add(m[1])
    }
    
    if (i === 30) console.log('(60s còn lại, nhớ click vào các cửa hàng...)')
    if (i === 60) console.log('(60s còn lại...)')
    if (i === 90) console.log('(30s nữa đóng browser...)')
  }
  
  await browser.close()
  
  console.log('\n=== KẾT QUẢ ===')
  if (storeIds.size > 0) {
    console.log(`Tìm thấy ${storeIds.size} StoreId(s):`)
    for (const id of storeIds) console.log(`  - ${id}`)
    
    // Use the first one that looks like a Grab ID (starts with 5-)
    const grabId = [...storeIds].find(id => id.startsWith('5-')) || [...storeIds][0]
    
    if (grabId) {
      console.log(`\nCập nhật externalStoreId → ${grabId}`)
      const r = await fetch(`${BPOS_URL}/api/integrations/${INTEGRATION_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: bposCookies },
        body: JSON.stringify({ externalStoreId: grabId }),
      })
      const res = await r.json()
      console.log('✅ Cập nhật thành công:', res.externalStoreId)
    }
  } else {
    console.log('Không tìm được StoreId tự động.')
    console.log('Cần cung cấp thủ công: xem URL merchant.grab.com/portal/{STORE_ID}/...')
  }
}

main().catch(e => console.error('Lỗi:', e.message))
