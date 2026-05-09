'use strict'
/**
 * Xanh SM Merchant Portal automation
 * OTP-first flow using phone + SMS code.
 */
const { chromium } = require('playwright')

const SESSION_TTL = 30 * 24 * 3600
const PORTAL_URL = 'https://merchant.xanhsm.com/login'

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-blink-features=AutomationControlled',
]

const PHONE_INPUT_SELECTORS = [
  'input[placeholder*="số điện thoại" i]',
  'input[name="phone"]',
  'input[type="tel"]',
].join(', ')

const OTP_INPUT_SELECTORS = [
  'input[placeholder*="otp" i]',
  'input[placeholder*="mã" i]',
  'input[name*="otp" i]',
  'input[inputmode="numeric"]',
].join(', ')

const OTP_DIGIT_SELECTORS = [
  'input[inputmode="numeric"][maxlength="1"]',
  'input[name^="otp"]',
  'input[data-testid*="otp"] input',
].join(', ')

const TOKEN_STORAGE_KEYS = ['token', 'access_token', 'jwt', 'authToken', 'accessToken']

async function getFirstVisibleLocator(page, selectors) {
  const locator = page.locator(selectors)
  const count = await locator.count()

  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index)
    if (await candidate.isVisible().catch(() => false)) return candidate
  }

  return null
}

async function waitForEnabledLocator(page, selectors, timeoutMs = 15000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const locator = page.locator(selectors)
    const count = await locator.count()

    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index)
      const isVisible = await candidate.isVisible().catch(() => false)
      const isEnabled = await candidate.isEnabled().catch(() => false)
      if (isVisible && isEnabled) return candidate
    }

    await page.waitForTimeout(250)
  }

  return null
}

async function isOtpStep(page) {
  const otpInput = await getFirstVisibleLocator(page, OTP_INPUT_SELECTORS)
  if (otpInput) return true

  const otpDigits = page.locator(OTP_DIGIT_SELECTORS)
  return (await otpDigits.count()) > 0
}

async function readAuthToken(page) {
  return page.evaluate((keys) => {
    for (const key of keys) {
      const value = localStorage.getItem(key)
        || sessionStorage.getItem(key)
        || (window.document.cookie.match(new RegExp(`${key}=([^;]+)`)) || [])[1]
      if (value && value.length > 20) return value
    }
    return null
  }, TOKEN_STORAGE_KEYS).catch(() => null)
}

async function hasAuthenticatedShell(page) {
  const selectors = [
    'a[href*="/orders"]',
    'a[href*="/dashboard"]',
    'button[aria-label*="profile" i]',
    'button[aria-label*="menu" i]',
    'text=/Đơn hàng/i',
    'text=/Tổng quan/i',
  ]

  for (const selector of selectors) {
    const isVisible = await page.locator(selector).first().isVisible().catch(() => false)
    if (isVisible) return true
  }

  return false
}

async function waitForAuthenticatedSession(page) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < 15000) {
    const currentUrl = page.url()
    const token = await readAuthToken(page)
    const hasShell = await hasAuthenticatedShell(page)
    const waitingOtp = await isOtpStep(page)

    if ((token || hasShell) && !waitingOtp) {
      return { token, currentUrl, waitingOtp, hasShell }
    }

    if (!currentUrl.includes('/login') && !waitingOtp) {
      return { token, currentUrl, waitingOtp, hasShell }
    }

    await page.waitForTimeout(500)
  }

  return {
    token: await readAuthToken(page),
    currentUrl: page.url(),
    waitingOtp: await isOtpStep(page),
    hasShell: await hasAuthenticatedShell(page),
  }
}

async function loginXanhSM({ username, otp, pendingSession }) {
  let browser = null
  let context = null
  let page = null
  const isResume = !!pendingSession

  try {
    if (isResume) {
      browser = pendingSession.browser
      context = pendingSession.context
      page = pendingSession.page
    } else {
      browser = await chromium.launch({
        headless: true,
        args: LAUNCH_ARGS,
        timeout: 30000,
      })
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
      })
      page = await context.newPage()

      await page.goto(PORTAL_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })

      const phoneInput = await getFirstVisibleLocator(page, PHONE_INPUT_SELECTORS)
      if (!phoneInput) {
        await browser.close()
        return { success: false, error: 'Xanh SM: khong tim thay o nhap so dien thoai' }
      }

      await phoneInput.fill(username)
      await phoneInput.press('Tab').catch(() => null)

      const continueButton = await waitForEnabledLocator(
        page,
        'button:has-text("Tiếp tục"), button:has-text("Xác nhận"), button[type="submit"]'
      )
      if (!continueButton) {
        const errorMsg = await page.textContent('[class*="error"], .alert, [role="alert"]').catch(() => null)
        await browser.close()
        return { success: false, error: errorMsg && errorMsg.trim() ? errorMsg.trim() : 'Xanh SM: nut tiep tuc van bi khoa sau khi nhap so dien thoai' }
      }

      await continueButton.click()
      await page.waitForTimeout(3500)
    }

    if (await isOtpStep(page)) {
      if (!otp) {
        return {
          success: false,
          requiresOtp: true,
          otpTarget: username,
          _pendingSession: { browser, context, page },
        }
      }

      const otpDigits = page.locator(OTP_DIGIT_SELECTORS)
      const otpDigitCount = await otpDigits.count()
      const otpInput = await getFirstVisibleLocator(page, OTP_INPUT_SELECTORS)

      if (otpDigitCount >= otp.length && otp.length > 1) {
        for (let index = 0; index < otp.length && index < otpDigitCount; index += 1) {
          await otpDigits.nth(index).fill(otp[index])
        }
      } else if (otpInput) {
        await otpInput.fill(otp)
      }

      const confirmButton = await waitForEnabledLocator(
        page,
        'button:has-text("Xác nhận"), button:has-text("Tiếp tục"), button[type="submit"]'
      )
      if (confirmButton) {
        await confirmButton.click()
        await page.waitForTimeout(3000)
      }
    }

    const authState = await waitForAuthenticatedSession(page)
    if (authState.waitingOtp) {
      return {
        success: false,
        requiresOtp: true,
        otpTarget: username,
        _pendingSession: { browser, context, page },
      }
    }

    if (authState.currentUrl.includes('/login') && !authState.token && !authState.hasShell) {
      if (await isOtpStep(page)) {
        return {
          success: false,
          requiresOtp: true,
          otpTarget: username,
          _pendingSession: { browser, context, page },
        }
      }

      const errMsg = await page.textContent('[class*="error"], .alert, [role="alert"]').catch(() => null)
      await browser.close()
      return { success: false, error: errMsg && errMsg.trim() ? errMsg.trim() : 'Xanh SM: dang nhap chua roi khoi man OTP/login' }
    }

    const jwtToken = authState.token

    const rawCookies = await context.cookies('https://merchant.xanhsm.com')
    const cookies = rawCookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite || 'Lax',
    }))

    const extraHeaders = {}
    if (jwtToken) extraHeaders.Authorization = 'Bearer ' + jwtToken
    if (!jwtToken && rawCookies.length === 0) {
      await browser.close()
      return { success: false, error: 'Xanh SM: chua lay duoc token hoac cookie phien hop le' }
    }

    await browser.close()
    return {
      success: true,
      session: {
        cookies,
        extraHeaders,
        capturedAt: new Date().toISOString(),
        sessionTtlSeconds: SESSION_TTL,
        localStorage: jwtToken ? { token: jwtToken } : undefined,
      },
    }
  } catch (err) {
    if (browser) await browser.close().catch(() => null)
    throw err
  }
}

module.exports = { loginXanhSM }
