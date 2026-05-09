// extract-1ketoan-storeid.js - Dùng session đã lưu để tìm Grab StoreId
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
  const bposCookies = await bposLogin()
  
  // Lấy session đã lưu từ BPOS integration detail
  const intgR = await fetch(`${BPOS_URL}/api/integrations`, { headers: { Cookie: bposCookies } })
  const intgList = await intgR.json()
  const intg = (Array.isArray(intgList) ? intgList : []).find(i => i._id === INTEGRATION_ID)
  
  if (!intg) {
    console.log('❌ Không tìm thấy integration')
    return
  }
  
  // sessionData is encrypted in DB, not returned by API directly
  // Use the cookies captured from the previous script run (stored in BPOS)
  // We'll use Playwright to navigate with the BPOS integration's session
  
  console.log(`Integration: ${intg.loginUsername} | sessionStatus: ${intg.sessionStatus} | externalStoreId: ${intg.externalStoreId}`)
  console.log('Sẽ dùng Playwright để tìm storeId từ Grab portal...')
  
  // Use Playwright - open browser visible for user to navigate
  const browser = await chromium.launch({
    headless: false,
    executablePath: 'C:\\Users\\Admin\\AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe',
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  })
  
  const page = await context.newPage()
  
  // Capture network requests để tìm merchantId từ API calls
  let foundStoreId = null
  page.on('response', async (response) => {
    const url = response.url()
    // Look for storeId in API response URLs or headers
    const m = url.match(/merchantID=([A-Z0-9-]+)/) || url.match(/merchant_id=([A-Z0-9-]+)/) || url.match(/\/stores?\/([A-Z0-9-]{5,})/)
    if (m && !foundStoreId) {
      foundStoreId = m[1]
      console.log(`🔍 StoreId từ API URL: ${foundStoreId} (từ ${url.slice(0, 80)})`)
    }
    // Also check JSON responses
    if (url.includes('grab.com') && response.headers()['content-type']?.includes('json') && !foundStoreId) {
      try {
        const body = await response.text()
        const mId = body.match(/"merchantID"\s*:\s*"([^"]+)"/) || body.match(/"storeId"\s*:\s*"([^"]+)"/) || body.match(/"store_id"\s*:\s*"([^"]+)"/)
        if (mId && mId[1].length > 3) {
          foundStoreId = mId[1]
          console.log(`🔍 StoreId từ JSON response: ${foundStoreId}`)
        }
      } catch {}
    }
  })
  
  console.log('Điều hướng đến Grab merchant portal...')
  await page.goto(`${GRAB_MERCHANT_URL}/portal`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(e => console.log('goto error:', e.message))
  await page.waitForTimeout(5000)
  
  let currentUrl = page.url()
  console.log(`URL sau navigate: ${currentUrl}`)
  
  // Try to get storeId from URL
  const urlMatch = currentUrl.match(/\/portal\/([A-Z0-9-]{5,})/) || currentUrl.match(/storeId=([A-Z0-9-]+)/) || currentUrl.match(/merchantId=([A-Z0-9-]+)/)
  if (urlMatch) {
    foundStoreId = urlMatch[1]
    console.log(`✅ StoreId từ URL: ${foundStoreId}`)
  }
  
  // Try to get storeId from page content
  if (!foundStoreId) {
    try {
      const pageData = await page.evaluate(() => {
        const url = window.location.href
        const scripts = Array.from(document.querySelectorAll('script')).map(s => s.textContent || '').join('\n')
        const storeMatch = scripts.match(/storeId['":\s]+['"]([A-Z0-9-]{5,})['"]/) || 
                          scripts.match(/merchantId['":\s]+['"]([A-Z0-9-]{5,})['"]/) ||
                          url.match(/\/([5]-[A-Z0-9]+)\//)
        return { url, found: storeMatch?.[1] || null }
      })
      console.log(`Page URL: ${pageData.url}`)
      if (pageData.found) {
        foundStoreId = pageData.found
        console.log(`✅ StoreId từ page: ${foundStoreId}`)
      }
    } catch (e) {
      console.log('Lỗi evaluate:', e.message)
    }
  }
  
  // Try orders page
  if (!foundStoreId) {
    await page.goto(`${GRAB_MERCHANT_URL}/portal/orders`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(3000)
    currentUrl = page.url()
    console.log(`Orders URL: ${currentUrl}`)
    const m2 = currentUrl.match(/\/portal\/([A-Z0-9-]{5,})/) || currentUrl.match(/\/([5]-[A-Z0-9]+)\//)
    if (m2) { foundStoreId = m2[1]; console.log(`✅ StoreId từ orders: ${foundStoreId}`) }
  }
  
  await browser.close()
  
  if (foundStoreId) {
    console.log(`\n✅ Đã tìm thấy StoreId: ${foundStoreId}`)
    console.log('Cập nhật externalStoreId trong BPOS...')
    const r = await fetch(`${BPOS_URL}/api/integrations/${INTEGRATION_ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: bposCookies },
      body: JSON.stringify({ externalStoreId: foundStoreId }),
    })
    const res = await r.json()
    console.log('Kết quả:', res.externalStoreId)
  } else {
    console.log('\n⚠️  Không tìm được StoreId tự động.')
    console.log('Vào Grab merchant portal (merchant.grab.com) với tài khoản 1ketoan@takogroup.com.vn')
    console.log('Kiểm tra URL sau khi đăng nhập - StoreId thường xuất hiện trong URL hoặc cài đặt cửa hàng')
  }
}

main().catch(e => console.error('Lỗi:', e.message))
