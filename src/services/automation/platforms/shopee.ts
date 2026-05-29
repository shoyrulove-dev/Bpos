/**
 * ShopeeFood Partner Portal automation login.
 *
 * Current live flow:
 * 1. Login at https://partner.business.accounts.shopee.vn/
 * 2. Confirm / continue if Shopee shows an intermediate button
 * 3. Select merchant on https://partner.shopee.vn/account/onboarding
 * 4. Land in partner dashboard and reuse browser session cookies
 *
 * This should be treated like Grab browser/session login, not like BE direct API.
 */
import type { PlatformAutomation, AutomationCredentials, AutomationResult } from '../types'
import type { SessionData, PlaywrightCookie } from '@/integrations/types'

const PARTNER_LOGIN_URL = 'https://partner.business.accounts.shopee.vn/'
const PARTNER_HOME_URL = 'https://partner.shopee.vn/'
const PARTNER_ORDER_MANAGEMENT_URL = 'https://partner.shopee.vn/shopee-food/order-management'
const ORDERS_API_URL = 'https://partner.food.shopee.vn/api/seller/web/orders/action/search'
const SESSION_TTL = 24 * 3600

const OTP_INPUT_SELECTORS = [
  'input[placeholder*="otp" i]',
  'input[placeholder*="ma" i]',
  'input[name*="otp" i]',
  'input[inputmode="numeric"]',
].join(', ')

const OTP_DIGIT_SELECTORS = [
  'input[inputmode="numeric"][maxlength="1"]',
  'input[name^="otp"]',
  'input[data-testid*="otp"] input',
].join(', ')

type PartnerUserInfo = {
  merchantId?: string | number
  merchantName?: string
  store_id?: string | number
  tocEmail?: string
}

type MerchantCandidate = {
  merchantId?: string | number
  isActive?: boolean
  staffTobUid?: string | number
}

export class ShopeeAutomation implements PlatformAutomation {
  provider = 'shopee' as const
  sessionTtlSeconds = SESSION_TTL

  private async getFirstVisibleLocator(page: import('playwright').Page, selectors: string) {
    const locator = page.locator(selectors)
    const count = await locator.count()
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index)
      if (await candidate.isVisible().catch(() => false)) return candidate
    }
    return null
  }

  private async isOtpStep(page: import('playwright').Page) {
    const otpInput = await this.getFirstVisibleLocator(page, OTP_INPUT_SELECTORS)
    if (otpInput) return true
    return (await page.locator(OTP_DIGIT_SELECTORS).count()) > 0
  }

  private async fillOtp(page: import('playwright').Page, otp: string) {
    const otpDigits = page.locator(OTP_DIGIT_SELECTORS)
    const otpDigitCount = await otpDigits.count()
    const otpInput = await this.getFirstVisibleLocator(page, OTP_INPUT_SELECTORS)

    if (otpDigitCount >= otp.length && otp.length > 1) {
      for (let index = 0; index < otp.length && index < otpDigitCount; index += 1) {
        await otpDigits.nth(index).fill(otp[index])
      }
      return
    }

    if (otpInput) {
      await otpInput.fill(otp)
    }
  }

  private async clickFirstVisibleButton(page: import('playwright').Page) {
    const buttons = page.locator('button')
    const count = await buttons.count()
    for (let index = 0; index < count; index += 1) {
      const button = buttons.nth(index)
      if (await button.isVisible().catch(() => false)) {
        await button.click().catch(() => null)
        return true
      }
    }
    return false
  }

  private async selectMerchant(
    page: import('playwright').Page,
    credentials: AutomationCredentials,
    discoveredStoreName?: string,
  ) {
    const merchantCards = page.locator('.listItem')
    const count = await merchantCards.count()
    if (!count) return

    if (credentials.storeId) {
      for (let index = 0; index < count; index += 1) {
        const card = merchantCards.nth(index)
        const text = await card.innerText().catch(() => '')
        if (text.includes(credentials.storeId)) {
          await card.click()
          return
        }
      }
    }

    if (discoveredStoreName) {
      for (let index = 0; index < count; index += 1) {
        const card = merchantCards.nth(index)
        const text = await card.innerText().catch(() => '')
        if (text.includes(discoveredStoreName)) {
          await card.click()
          return
        }
      }
    }

    await merchantCards.first().click().catch(() => null)
  }

  async login(credentials: AutomationCredentials): Promise<AutomationResult> {
    let browser: import('playwright').Browser | null = null

    try {
      const { chromium } = await import('playwright')
      let userInfo: PartnerUserInfo | null = null
      let merchantCandidates: MerchantCandidate[] = []

      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
        ],
      })

      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        viewport: { width: 1440, height: 900 },
        locale: 'vi-VN',
      })

      const page = await context.newPage()
      page.on('response', async (response) => {
        const url = response.url()
        try {
          if (url.includes('PartnerAccountServer/GetUserInfo')) {
            const payload = await response.json().catch(() => null) as { data?: PartnerUserInfo } | null
            if (payload?.data) userInfo = payload.data
          }
          if (url.includes('PartnerMerchantDetectServer/MerchantDetect')) {
            const payload = await response.json().catch(() => null) as { data?: { merchantList?: MerchantCandidate[] } } | null
            merchantCandidates = payload?.data?.merchantList ?? merchantCandidates
          }
        } catch {
          // best-effort telemetry only
        }
      })

      await page.goto(PARTNER_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForTimeout(1200)

      const inputs = page.locator('input')
      if (await inputs.count() < 2) {
        await browser.close()
        return { success: false, error: 'Shopee: khong tim thay form dang nhap partner' }
      }

      await inputs.nth(0).fill(credentials.username)
      await inputs.nth(1).fill(credentials.password)
      await this.clickFirstVisibleButton(page)
      await page.waitForTimeout(2500)

      if (await this.isOtpStep(page)) {
        if (!credentials.otp) {
          await browser.close()
          return {
            success: false,
            requiresOtp: true,
            otpTarget: credentials.username,
          }
        }
        await this.fillOtp(page, credentials.otp)
        await page.waitForTimeout(300)
        await this.clickFirstVisibleButton(page)
        await page.waitForTimeout(2500)
      }

      // Some partner flows show an extra "continue" button after password login.
      await this.clickFirstVisibleButton(page)
      await page.waitForTimeout(4000)

      const resolvedUserInfo = userInfo as PartnerUserInfo | null

      if (page.url().includes('/account/onboarding')) {
        await this.selectMerchant(page, credentials, resolvedUserInfo?.merchantName)
        await page.waitForTimeout(8000)
      }

      if (!page.url().startsWith(PARTNER_HOME_URL)) {
        await browser.close()
        return { success: false, error: 'Shopee: dang nhap xong nhung chua vao duoc partner dashboard' }
      }

      await page.goto(PARTNER_ORDER_MANAGEMENT_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => null)
      await page.waitForTimeout(5000)

      const cookies = (await context.cookies()).map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: (cookie.sameSite as PlaywrightCookie['sameSite']) ?? 'Lax',
      }))

      const localStorage = await page.evaluate(() => {
        const snapshot: Record<string, string> = {}
        for (let index = 0; index < window.localStorage.length; index += 1) {
          const key = window.localStorage.key(index)
          if (!key) continue
          const value = window.localStorage.getItem(key)
          if (value !== null) snapshot[key] = value
        }
        return snapshot
      }).catch(() => ({} as Record<string, string>))

      const currentStoreId = localStorage.currentStoreId
        ?? localStorage.shopee_tob_entity_id
        ?? (resolvedUserInfo?.store_id ? String(resolvedUserInfo.store_id) : '')
      const currentStoreName = resolvedUserInfo?.merchantName ?? null

      const session: SessionData = {
        cookies,
        capturedAt: new Date().toISOString(),
        sessionTtlSeconds: SESSION_TTL,
        localStorage,
        storeInfo: {
          storeId: currentStoreId || null,
          storeName: currentStoreName,
          ordersApiUrl: ORDERS_API_URL,
          merchantId: resolvedUserInfo?.merchantId ? String(resolvedUserInfo.merchantId) : undefined,
          merchantCandidates,
        },
        extraHeaders: {
          ...(currentStoreId ? { 'x-store-id': String(currentStoreId) } : {}),
          ...(currentStoreName ? { 'x-store-name': String(currentStoreName) } : {}),
        },
      }

      await browser.close()
      return { success: true, session }
    } catch (error) {
      if (browser) await browser.close().catch(() => null)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}
