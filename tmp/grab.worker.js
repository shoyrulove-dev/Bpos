'use strict'

const { chromium } = require('playwright')

const PORTAL_ORDERS_URL = 'https://merchant.grab.com/food/orders'
const LOGIN_URL = 'https://merchant.grab.com/login'
const WEBLOGIN_URL = 'https://weblogin.grab.com/merchant/login?service_id=MEXUSERS&redirect=https%3A%2F%2Fmerchant.grab.com%2Fportal'
const SESSION_TTL = 20 * 3600
const GRAB_PORTAL_ACTIVE_PAGE_TYPES = ['PreparingV2', 'Ready', 'Upcoming']
const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-web-security',
]

function mapGrabStatus(rawStatus) {
  const statusMap = {
    PENDING: 'waiting_confirm',
    ORDER_RECEIVED: 'waiting_confirm',
    NEW: 'waiting_confirm',
    ACCEPTED: 'waiting_pickup',
    CONFIRMED: 'waiting_pickup',
    PREPARING: 'waiting_pickup',
    ORDER_IN_PREPARE: 'waiting_pickup',
    ORDER_EXECUTING: 'waiting_pickup',
    DRIVER_ALLOCATED: 'waiting_pickup',
    DRIVER_ARRIVED: 'waiting_pickup',
    READY_FOR_PICKUP: 'waiting_pickup',
    COLLECTED: 'delivering',
    IN_DELIVERY: 'delivering',
    DELIVERED: 'completed',
    COMPLETED: 'completed',
    BILL_PAID: 'completed',
    CANCELLED: 'cancelled',
    CANCELLED_MAX: 'cancelled',
    CANCELLED_BY_MERCHANT: 'cancelled',
    CANCELLED_BY_CUSTOMER: 'cancelled',
    CANCELLED_BY_DRIVER: 'cancelled',
    FAILED: 'cancelled',
    REFUNDED: 'cancelled',
  }

  return statusMap[String(rawStatus || '')] || 'waiting_confirm'
}

function parseGrabDisplayAmount(value) {
  if (typeof value === 'number') return value
  const text = String(value || '').replace(/[^\d-]/g, '')
  return text ? Number(text) : 0
}

function extractGrabPortalPhone(segment) {
  const match = String(segment || '').match(/((?:\+?84|0)\d[\d .-]{7,13}\d)/)
  return match && match[1] ? match[1].trim() : ''
}

function normalizeGrabPortalOrder(raw, fallbackStoreId) {
  const itemInfo = raw.itemInfo || {}
  const itemsRaw = Array.isArray(raw.items)
    ? raw.items
    : Array.isArray(raw.orderItems)
      ? raw.orderItems
      : Array.isArray(raw.lineItems)
        ? raw.lineItems
        : Array.isArray(itemInfo.items)
          ? itemInfo.items
          : []
  const items = itemsRaw.map((item) => {
    const quantity = Number(item.quantity || 1)
    const price = Number(item.itemPrice || item.price || item.unitPrice || 0)
    return {
      name: String(item.name || item.itemName || ''),
      quantity,
      price,
      total: quantity * price,
    }
  })

  const rawStatus = String(raw.deliveryStatus || raw.orderState || raw.status || raw.orderStatus || raw.state || '')
  const consumer = raw.consumer || raw.customer || raw.receiver || raw.eater || {}
  const consumerPhone = String(
    consumer.phones ||
    consumer.phone ||
    consumer.phoneNumber ||
    consumer.mobileNumber ||
    extractGrabPortalPhone(consumer.comment || '') ||
    ''
  ).replace(/\s+/g, '')

  const priceObj = raw.price || raw.pricing || {}
  const subtotal = Number(
    priceObj.subtotal ||
    raw.subtotal ||
    raw.subTotal ||
    parseGrabDisplayAmount(raw.cancelledOriginalPriceDisplay || raw.priceDisplay || raw.orderValue)
  )
  const discount = Number(priceObj.basketPromo || priceObj.discount || raw.discount || raw.discountAmount || 0)
  const total = Number(
    priceObj.eaterPayment ||
    priceObj.total ||
    raw.total ||
    raw.orderTotal ||
    parseGrabDisplayAmount(raw.priceDisplay || raw.orderValue)
  )
  const actualReceived = Number(
    priceObj.merchantPayment ||
    priceObj.merchantReceivable ||
    priceObj.payToMerchant ||
    raw.merchantReceivable ||
    raw.receivedAmount ||
    0
  )
  const platformFee = actualReceived > 0 ? Math.max(0, total - actualReceived) : 0

  const delivery = raw.delivery || {}
  const dropoff = delivery.dropoff || {}
  const driver = delivery.driver || raw.driver || raw.rider || {}

  return {
    source: 'grab',
    externalOrderId: String(raw.orderID || raw.ID || raw.id || raw.orderId || ''),
    externalStoreId: String(raw.merchantID || raw.merchantId || raw.storeId || fallbackStoreId || ''),
    customerName: String(consumer.name || consumer.displayName || 'Khach hang'),
    customerPhone: consumerPhone,
    items,
    subtotal,
    discount,
    total,
    platformFee,
    paymentMethod: String(raw.paymentType || raw.paymentMethod || (raw.isTakeawayOrder ? 'pickup' : 'delivery')),
    deliveryInfo: {
      address: String(dropoff.address || dropoff.formattedAddress || delivery.address || raw.deliveryAddress || ''),
    },
    driverInfo: {
      name: String(driver.name || driver.displayName || ''),
      phone: String(driver.phone || driver.phoneNumber || driver.mobileNumber || ''),
    },
    orderStatus: mapGrabStatus(rawStatus),
    placedAt: String(raw.orderTime || raw.createdAt || raw.createTime || new Date().toISOString()),
    deliveredAt: mapGrabStatus(rawStatus) === 'completed'
      ? String(raw.updatedAt || raw.completedAt || raw.createdAt || '')
      : undefined,
    rawPayload: raw,
  }
}

function extractOrdersFromPortalResponse(data) {
  if (!data || typeof data !== 'object') return null
  if (Array.isArray(data)) return data
  if (Array.isArray(data.orders)) return data.orders
  if (Array.isArray(data.orderList)) return data.orderList
  if (Array.isArray(data.orderCards)) return data.orderCards
  if (Array.isArray(data.data)) return data.data
  if (Array.isArray(data.result)) return data.result
  if (Array.isArray(data.results)) return data.results
  if (data.data && typeof data.data === 'object') {
    if (Array.isArray(data.data.orders)) return data.data.orders
    if (Array.isArray(data.data.orderList)) return data.data.orderList
    if (Array.isArray(data.data.results)) return data.data.results
  }
  if (data.result && typeof data.result === 'object' && Array.isArray(data.result.orders)) {
    return data.result.orders
  }
  return null
}

async function browserFetchJson(page, url, headers) {
  return page.evaluate(async ({ targetUrl, requestHeaders }) => {
    try {
      const response = await fetch(targetUrl, {
        credentials: 'include',
        headers: requestHeaders,
      })
      const text = await response.text()
      let data = null
      try {
        data = text ? JSON.parse(text) : null
      } catch (_err) {
        data = null
      }
      return {
        ok: response.ok,
        status: response.status,
        data,
        text,
      }
    } catch (error) {
      return {
        ok: false,
        status: 0,
        data: null,
        text: error && error.message ? error.message : String(error),
      }
    }
  }, {
    targetUrl: url,
    requestHeaders: headers,
  })
}

async function fetchGrabOrdersInBrowser(page, storeId) {
  if (!storeId) return []

  const headers = {
    Accept: 'application/json',
    'x-grab-tenant': 'GF_VN',
    'x-grab-country': 'VN',
    'x-grab-language': 'vi',
    merchantid: storeId,
    requestsource: 'troyPortal',
  }
  const merged = new Map()

  for (const pageType of GRAB_PORTAL_ACTIVE_PAGE_TYPES) {
    const url = new URL('https://api.grab.com/delvplatformapi/merchant/v4/orders-pagination')
    url.searchParams.set('AutoAcceptGroup', '1')
    url.searchParams.set('merchantID', storeId)
    url.searchParams.set('PageType', pageType)
    url.searchParams.set('searchToken', '')
    url.searchParams.set('size', '50')

    const response = await browserFetchJson(page, url.toString(), headers)
    if (!response.ok || !response.data) continue

    const orders = extractOrdersFromPortalResponse(response.data)
    if (!orders) continue

    for (const order of orders) {
      const orderId = String(order.orderID || order.orderId || order.id || '')
      if (!orderId || merged.has(orderId)) continue
      merged.set(orderId, normalizeGrabPortalOrder(order, storeId))
    }
  }

  const endDate = new Date()
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - 1)
  const startTime = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}T00:00:00+07:00`
  const endTime = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}T23:59:59+07:00`

  for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
    const url = new URL('https://api.grab.com/delvplatformapi/merchant/v1/reports/daily-pagination')
    url.searchParams.set('states', '')
    url.searchParams.set('startTime', startTime)
    url.searchParams.set('endTime', endTime)
    url.searchParams.set('pageIndex', String(pageIndex))
    url.searchParams.set('pageSize', '50')

    const response = await browserFetchJson(page, url.toString(), headers)
    if (!response.ok || !response.data) break

    const statements = Array.isArray(response.data.statements) ? response.data.statements : []
    for (const statement of statements) {
      const orderId = String(statement.ID || statement.id || statement.orderID || statement.orderId || '')
      if (!orderId || merged.has(orderId)) continue
      merged.set(orderId, normalizeGrabPortalOrder(statement, storeId))
    }

    if (!response.data.hasMore) break
  }

  return Array.from(merged.values()).sort((left, right) => {
    return new Date(right.placedAt).getTime() - new Date(left.placedAt).getTime()
  })
}

async function getFirstVisibleLocator(page, selectors) {
  const locator = page.locator(selectors)
  const count = await locator.count()

  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index)
    if (await candidate.isVisible().catch(() => false)) return candidate
  }

  return null
}

async function hasAuthenticatedShell(page) {
  if (page.url().includes('/portal') || page.url().includes('/order/')) return true

  const shellSelectors = [
    'img[alt="Grab Logo"]',
    'button[aria-label="settings"]',
    'text=/Truy cập chưa được cấp quyền/i',
    'text=/Quay lại trang chủ/i',
  ]

  for (const selector of shellSelectors) {
    const isVisible = await page.locator(selector).first().isVisible().catch(() => false)
    if (isVisible) return true
  }

  return false
}

function matchesPreferredStore(storeId, preferredStoreId) {
  if (!storeId || !preferredStoreId) return false
  const normalizedStoreId = String(storeId).trim().toLowerCase()
  const normalizedPreferredStoreId = String(preferredStoreId).trim().toLowerCase()
  return normalizedStoreId === normalizedPreferredStoreId
    || normalizedStoreId.includes(normalizedPreferredStoreId)
    || normalizedPreferredStoreId.includes(normalizedStoreId)
}

async function waitForEnabledLocator(page, selectors, timeoutMs = 10000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const locator = await getFirstVisibleLocator(page, selectors)
    if (!locator) {
      await page.waitForTimeout(250)
      continue
    }

    const isDisabled = await locator.isDisabled().catch(() => false)
    if (!isDisabled) return locator

    await page.waitForTimeout(250)
  }

  return null
}

async function openLoginSurface(page, usernameSelectors) {
  const targets = [LOGIN_URL, WEBLOGIN_URL, PORTAL_ORDERS_URL]

  for (const target of targets) {
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null)
    await page.waitForTimeout(target === WEBLOGIN_URL ? 5000 : 3000)

    const emailTab = await page.$('button:has-text("Email"), [data-testid="email-tab"], a:has-text("Email")')
    if (emailTab) await emailTab.click().catch(() => null)

    const accountInput = await getFirstVisibleLocator(page, usernameSelectors)
    if (accountInput || await hasAuthenticatedShell(page)) return accountInput
  }

  return null
}

async function summarizeAuthSurface(page) {
  return page.locator('input, button, a, [role="button"]').evaluateAll((elements) => {
    return elements
      .slice(0, 20)
      .map((element) => {
        const text = (element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)
        return {
          tag: element.tagName,
          type: element.getAttribute('type'),
          name: element.getAttribute('name'),
          placeholder: element.getAttribute('placeholder'),
          text,
        }
      })
  }).catch(() => [])
}

async function loginGrab({ username, password, otp, pendingSession, preferredStoreId, includeOrders }) {
  let browser = null
  let context = null
  let page = null
  let capturedApis = []
  const isResume = !!pendingSession

  try {
    if (isResume) {
      browser = pendingSession.browser
      context = pendingSession.context
      page = pendingSession.page
      capturedApis = Array.isArray(pendingSession.capturedApis) ? pendingSession.capturedApis : []
    } else {
      browser = await chromium.launch({
        headless: true,
        args: LAUNCH_ARGS,
        timeout: 30000,
      })

      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
        locale: 'vi-VN',
        timezoneId: 'Asia/Ho_Chi_Minh',
      })

      await context.route('**/*', async route => {
        const req = route.request()
        const url = req.url()
        if (
          (url.includes('merchant.grab.com') || url.includes('grab.com')) &&
          (url.includes('/order') || url.includes('/restaurant') || url.includes('/store')) &&
          ['GET', 'POST'].includes(req.method())
        ) {
          const headers = req.headers()
          const auth = headers.authorization || headers['x-grab-access-token'] || ''
          capturedApis.push({
            url,
            body: req.postData() || undefined,
            auth,
          })
        }
        await route.continue()
      })

      page = await context.newPage()
      const normalizedPreferredStoreId = preferredStoreId ? String(preferredStoreId).trim() : null

      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(3000)

      const emailTab = await page.$('button:has-text("Email"), [data-testid="email-tab"], a:has-text("Email")')
      if (emailTab) await emailTab.click()

      const usernameSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="Email"]',
        'input[autocomplete="username"]',
        'input[name="username"]',
        'input[name="phone"]',
        'input[type="text"]',
        'input[type="tel"]',
        'input[placeholder*="phone" i]',
        'input[placeholder*="số điện thoại" i]',
        'input[placeholder*="tài khoản" i]',
      ].join(', ')
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[autocomplete="current-password"]',
      ].join(', ')
      const nextSelectors = [
        'button:has-text("Next")',
        'button:has-text("Tiếp")',
        'button:has-text("Continue")',
        '[role="button"]:has-text("Next")',
        '[role="button"]:has-text("Tiếp")',
        '[role="button"]:has-text("Continue")',
      ].join(', ')
      const submitSelectors = 'button[type="submit"], button:has-text("Đăng nhập"), button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Continue"), button:has-text("Tiếp")'

      const accountInput = await openLoginSurface(page, usernameSelectors)

      if (!accountInput && !(await hasAuthenticatedShell(page))) {
        console.log('[grab-worker] login form not found', JSON.stringify({
          username,
          preferredStoreId: normalizedPreferredStoreId,
          url: page.url(),
        }))
        await browser.close().catch(() => null)
        return { success: false, error: 'Khong tim thay o nhap tai khoan Grab (url: ' + page.url() + ')' }
      }

      if (accountInput) {
        await accountInput.fill(username)
        await page.waitForTimeout(500)

        const continueButton = await waitForEnabledLocator(page, nextSelectors, 5000)
        if (continueButton) {
          await continueButton.click()
          await page.waitForTimeout(2000)
        }

        let passwordInput = await getFirstVisibleLocator(page, passwordSelectors)
        const onPasswordChallenge = page.url().includes('/challenge/password')
        const onRecaptchaChallenge = page.url().includes('/challenge/recaptcha')

        if (onRecaptchaChallenge) {
          await browser.close().catch(() => null)
          return {
            success: false,
            error: 'Grab yeu cau reCAPTCHA, can dang nhap thu cong de lay JWT/session (url=' + page.url() + ')',
          }
        }

        if (!passwordInput && !onPasswordChallenge && !(await hasAuthenticatedShell(page))) {
          try {
            await page.waitForSelector(passwordSelectors, { timeout: 15000 })
          } catch (error) {
            if (page.url().includes('/challenge/recaptcha')) {
              await browser.close().catch(() => null)
              return {
                success: false,
                error: 'Grab yeu cau reCAPTCHA, can dang nhap thu cong de lay JWT/session (url=' + page.url() + ')',
              }
            }
            const authSurface = await summarizeAuthSurface(page)
            await browser.close().catch(() => null)
            return {
              success: false,
              error: String((error && error.message) ? error.message : error) + ' | url=' + page.url() + ' | controls=' + JSON.stringify(authSurface),
            }
          }
          passwordInput = await getFirstVisibleLocator(page, passwordSelectors)
        }

        if (!passwordInput) {
          console.log('[grab-worker] password input not found', JSON.stringify({
            username,
            preferredStoreId: normalizedPreferredStoreId,
            url: page.url(),
          }))
          await browser.close().catch(() => null)
          return { success: false, error: 'Khong tim thay o mat khau Grab (url: ' + page.url() + ')' }
        }

        await passwordInput.fill(password)

        const submitButton = await getFirstVisibleLocator(
          page,
          submitSelectors
        )
        if (submitButton) {
          const enabledSubmitButton = await waitForEnabledLocator(page, submitSelectors, 5000)
          await (enabledSubmitButton || submitButton).click()
          await page.waitForTimeout(5000)
        } else if (!(await hasAuthenticatedShell(page))) {
          console.log('[grab-worker] submit button not found', JSON.stringify({
            username,
            preferredStoreId: normalizedPreferredStoreId,
            url: page.url(),
          }))
          await browser.close().catch(() => null)
          return { success: false, error: 'Khong tim thay nut dang nhap Grab (url: ' + page.url() + ')' }
        }

        const otpInput = await page.$('input[placeholder*="code" i], input[placeholder*="OTP" i], input[name*="otp" i], input[maxlength="6"]')
        if (otpInput) {
          if (!otp) {
            const otpTarget = await page.textContent('[class*="phone"], [class*="email"], [class*="sent"]').catch(() => null)
            return {
              success: false,
              requiresOtp: true,
              otpTarget: (otpTarget && otpTarget.trim()) || username,
              _pendingSession: { browser, context, page, capturedApis },
            }
          }
          await otpInput.fill(otp)
          await page.click('button[type="submit"]')
          await page.waitForTimeout(5000)
        }
      }

      if (normalizedPreferredStoreId) {
        pendingSession = { capturedApis, browser, context, page }
      }
    }

    const currentUrl = page.url()
    const isLoginPage = currentUrl.includes('/login') || currentUrl.includes('/signin')
    if (isLoginPage) {
      const errEl = await page.$('[class*="error" i], [class*="alert" i], [role="alert"]')
      const errMsg = errEl ? await errEl.textContent() : null
      await browser.close().catch(() => null)
      return { success: false, error: (errMsg && errMsg.trim()) || 'Dang nhap Grab that bai - kiem tra lai tai khoan/mat khau' }
    }

    await page.goto(PORTAL_ORDERS_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(5000)

    const pageUrl = page.url()
    const storeIdMatch = pageUrl.match(/(?:restaurant|store|merchant)(?:Id|ID|_id)?[=/]([A-Z0-9_-]{5,30})/i)
    const storeIdFromUrl = storeIdMatch && storeIdMatch[1] ? storeIdMatch[1] : null

    const storeIdFromJs = await page.evaluate(() => {
      try {
        const state = window.__NEXT_DATA__
        const reduxState = window.__REDUX_STATE__
        const stateStr = JSON.stringify(state || reduxState || {})
        const match = stateStr.match(/"(?:merchantID|merchantId|storeId|restaurantId)":"([A-Z0-9_-]{5,30})"/i)
        return match && match[1] ? match[1] : null
      } catch (_err) {
        return null
      }
    })

    const rawCookiesEarly = await context.cookies(['https://merchant.grab.com', 'https://api.grab.com', 'https://grab.com'])
    const cookieStr = rawCookiesEarly.map(cookie => cookie.name + '=' + cookie.value).join('; ')

    let storeIdFromApi = null
    let storeNameFromApi = null
    let storesFromApi = []

    const storeListCandidates = [
      'https://merchant.grab.com/grabfood/api/v1/merchants/stores',
      'https://merchant.grab.com/grabfood/v1/merchants/stores',
      'https://merchant.grab.com/mex-api/v1/merchants/stores',
      'https://merchant.grab.com/portal/merchant/v1/stores',
      'https://merchant.grab.com/portal/v1/stores',
    ]

    const normalizedPreferredStoreId = preferredStoreId ? String(preferredStoreId).trim() : null

    for (const endpoint of storeListCandidates) {
      try {
        const response = await page.evaluate(async ({ url, cookies }) => {
          const resp = await fetch(url, {
            headers: {
              Cookie: cookies,
              'x-grab-tenant': 'GF_VN',
              'x-grab-country': 'VN',
              Accept: 'application/json',
            },
          })
          if (!resp.ok) return null
          return resp.json()
        }, { url: endpoint, cookies: cookieStr })

        if (!response || typeof response !== 'object') continue

        const storeArray = Array.isArray(response.stores)
          ? response.stores
          : Array.isArray(response.data)
            ? response.data
            : Array.isArray(response.restaurants)
              ? response.restaurants
              : null

        if (!storeArray || !storeArray.length) continue

        storesFromApi = storeArray
          .map(store => ({
            id: String(store.id || store.merchantID || store.storeId || store.restaurantId || ''),
            name: String(store.name || store.storeName || store.restaurantName || ''),
          }))
          .filter(store => store.id)

        if (!storesFromApi.length) continue

        const matchedStore = storesFromApi.find(store => matchesPreferredStore(store.id, normalizedPreferredStoreId))
        const selectedStore = matchedStore || storesFromApi[0]
        storeIdFromApi = selectedStore.id
        storeNameFromApi = selectedStore.name
        break
      } catch (_err) {
      }
    }

    const storeIdFromCaptured = capturedApis
      .map(api => {
        const match = api.url.match(/(?:restaurant|store|merchant)(?:Id|ID|_id)?[=/]([A-Z0-9_-]{5,30})/i)
        return match && match[1] ? match[1] : null
      })
      .find(Boolean) || null

    const storeId = normalizedPreferredStoreId || storeIdFromApi || storeIdFromJs || storeIdFromUrl || storeIdFromCaptured

    const tokenFromStorage = await page.evaluate(() => {
      const keys = ['token', 'access_token', 'grabToken', 'merchant_token', 'idToken', 'bearerToken']
      for (const key of keys) {
        const value = localStorage.getItem(key) || sessionStorage.getItem(key)
        if (value && value.length > 20) return value
      }
      return null
    })

    const cookieToken = (rawCookiesEarly.find(cookie => cookie.name === 'mexusers_authn_token') || {}).value || null
    const apiToken = tokenFromStorage || ((capturedApis.find(api => api.auth) || {}).auth) || cookieToken || null
    const hasOrdersPage = pageUrl.includes('/food/orders') || pageUrl.includes('/order/')

    const ordersApiCall = capturedApis.find(api =>
      api.url.includes('/order') &&
      !api.url.includes('/login') &&
      matchesPreferredStore(api.url, storeId)
    ) || capturedApis.find(api => api.url.includes('/order') && !api.url.includes('/login'))

    if (!hasOrdersPage || !apiToken) {
      console.log('[grab-worker] invalid auth state', JSON.stringify({
        username,
        preferredStoreId: normalizedPreferredStoreId,
        pageUrl,
        hasOrdersPage,
        hasApiToken: Boolean(apiToken),
        tokenSource: tokenFromStorage ? 'storage' : ((capturedApis.find(api => api.auth) || {}).auth ? 'captured-auth' : (cookieToken ? 'mexusers_authn_token' : 'none')),
      }))
      await browser.close().catch(() => null)
      return {
        success: false,
        error: 'Dang nhap Grab chua hoan tat - khong lay duoc phien hop le',
      }
    }

    const rawCookies = await context.cookies(['https://merchant.grab.com', 'https://api.grab.com', 'https://grab.com'])
    const seenCookies = new Set()
    const cookies = rawCookies
      .filter(cookie => {
        const key = cookie.name + '|' + cookie.domain + '|' + cookie.path
        if (seenCookies.has(key)) return false
        seenCookies.add(key)
        return true
      })
      .map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite || 'Lax',
      }))

    const extraHeaders = {
      'x-grab-tenant': 'GF_VN',
      'x-grab-country': 'VN',
      'x-grab-language': 'vi',
    }
    if (apiToken) extraHeaders['x-grab-token'] = apiToken
    if (storeId) extraHeaders['x-grab-store-id'] = storeId
    if (storeNameFromApi) extraHeaders['x-grab-store-name'] = storeNameFromApi
    if (ordersApiCall && ordersApiCall.url) extraHeaders['x-grab-orders-api'] = ordersApiCall.url
    if (ordersApiCall && ordersApiCall.auth) extraHeaders.Authorization = ordersApiCall.auth
    if (storesFromApi.length > 0) extraHeaders['x-grab-stores'] = JSON.stringify(storesFromApi)

    console.log('[grab-worker] session captured', JSON.stringify({
      username,
      preferredStoreId: normalizedPreferredStoreId,
      pageUrl,
      storeId,
      storeIdFromApi,
      storeIdFromJs,
      storeIdFromUrl,
      storeIdFromCaptured,
      storeNameFromApi,
      hasApiToken: Boolean(apiToken),
      tokenSource: tokenFromStorage ? 'storage' : ((capturedApis.find(api => api.auth) || {}).auth ? 'captured-auth' : (cookieToken ? 'mexusers_authn_token' : 'none')),
      cookieDomains: cookies.map(cookie => cookie.domain),
      cookieNames: cookies.map(cookie => cookie.name),
      ordersApiUrl: ordersApiCall && ordersApiCall.url,
      storesFromApi,
    }))

    const orders = includeOrders ? await fetchGrabOrdersInBrowser(page, storeId).catch(() => []) : []

    await browser.close().catch(() => null)
    return {
      success: true,
      orders,
      session: {
        cookies,
        extraHeaders,
        capturedAt: new Date().toISOString(),
        sessionTtlSeconds: SESSION_TTL,
      },
    }
  } catch (err) {
    if (browser) await browser.close().catch(() => null)
    return { success: false, error: err && err.message ? err.message : String(err) }
  }
}

module.exports = { loginGrab }
