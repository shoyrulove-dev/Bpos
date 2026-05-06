// Patch to apply to VPS /app/platforms/grab.js
// After collecting cookies, navigate to food page to discover store ID

// Add before "await context.close()":
/*
  // Discover store ID by navigating to food page
  let storeId = null, storeName = null
  const capturedStoreApis = []
  context.on('response', async (resp) => {
    const url = resp.url()
    // Intercept any API call that may contain store/restaurant IDs
    if (url.includes('merchant.grab.com') && url.includes('/api/')) {
      try {
        const ct = resp.headers()['content-type'] || ''
        if (ct.includes('json')) {
          const body = await resp.json().catch(() => null)
          if (body) capturedStoreApis.push({ url, body })
        }
      } catch {}
    }
  })
  try {
    await page.goto('https://merchant.grab.com/food', { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(5000)
    const foodUrl = page.url()
    const urlMatch = foodUrl.match(/\/(?:restaurant|store|merchant)\/([A-Z0-9_-]{8,40})/i)
    if (urlMatch) storeId = urlMatch[1]
    // Try from page JS state
    const storeFromJs = await page.evaluate(() => {
      try {
        const nd = window.__NEXT_DATA__
        const str = JSON.stringify(nd || window.__REDUX_STATE__ || {})
        const m = str.match(/"(?:merchantID|merchantId|storeId|restaurantId)":"([A-Z0-9_-]{8,40})"/)
        return m ? m[1] : null
      } catch { return null }
    }).catch(() => null)
    if (storeFromJs && !storeId) storeId = storeFromJs
    // Check captured API calls
    for (const { body } of capturedStoreApis) {
      const str = JSON.stringify(body)
      const m = str.match(/"(?:merchantID|merchantId|storeId|restaurantId)":"([A-Z0-9_-]{8,40})"/)
      if (m && !storeId) { storeId = m[1]; break }
      const nameM = str.match(/"(?:merchantName|storeName|restaurantName)":"([^"]{3,60})"/)
      if (nameM && !storeName) storeName = nameM[1]
    }
  } catch (e) {
    console.log('[grab] store discovery failed:', e.message)
  }
*/
