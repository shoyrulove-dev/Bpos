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
import type { NormalizedOrder } from '@/types'

const PARTNER_LOGIN_URL = 'https://partner.business.accounts.shopee.vn/'
const PARTNER_HOME_URL = 'https://partner.shopee.vn/'
const PARTNER_ORDER_MANAGEMENT_URL = 'https://partner.shopee.vn/shopee-food/order-management'
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

type StoreRestaurantInfo = {
  store_id?: string | number
  restaurant_id?: string | number
  delivery_id?: string | number
  name?: string
}

type StoreBasicsResponse = {
  data?: {
    restaurants?: StoreRestaurantInfo[]
  }
}

export class ShopeeAutomation implements PlatformAutomation {
  provider = 'shopee' as const
  sessionTtlSeconds = SESSION_TTL

  private extractPartnerOrders(data: unknown): Record<string, unknown>[] | null {
    if (!data || typeof data !== 'object') return null
    const root = data as Record<string, unknown>
    const candidates = [root.data, root.result, root.response, root.payload, root]
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue
      const current = candidate as Record<string, unknown>
      const list = current.order_list ?? current.orders ?? current.items ?? current.data ?? current.list ?? current.records ?? current.result
      if (Array.isArray(list)) return list as Record<string, unknown>[]
    }
    return Array.isArray(data) ? data as Record<string, unknown>[] : null
  }

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

  private mapVisibleOrderStatus(statusText: string): NormalizedOrder['orderStatus'] {
    const normalized = statusText.trim().toLowerCase()
    if (!normalized) return 'waiting_confirm'
    if (normalized.includes('hủy') || normalized.includes('huy') || normalized.includes('cancel')) return 'cancelled'
    if (normalized.includes('hoàn thành') || normalized.includes('hoan thanh') || normalized.includes('completed')) return 'completed'
    if (normalized.includes('đang giao') || normalized.includes('dang giao') || normalized.includes('delivering')) return 'delivering'
    if (
      normalized.includes('chuẩn bị')
      || normalized.includes('chuan bi')
      || normalized.includes('sẵn sàng')
      || normalized.includes('san sang')
      || normalized.includes('ready')
      || normalized.includes('processing')
      || normalized.includes('xác nhận')
      || normalized.includes('xac nhan')
    ) return 'waiting_pickup'
    return 'waiting_confirm'
  }

  private parseCurrencyText(value: string) {
    const digits = value.replace(/[^\d-]/g, '')
    return digits ? Number(digits) : 0
  }

  private normalizePortalOrder(raw: Record<string, unknown>, storeInfo: {
    storeId?: string | null
    storeName?: string | null
  }): NormalizedOrder {
    const rawDelivery = (raw.delivery_info ?? raw.delivery ?? {}) as Record<string, unknown>
    const rawCustomer = (raw.customer_info ?? raw.customer ?? {}) as Record<string, unknown>
    const rawDriver = (raw.driver_info ?? raw.driver ?? {}) as Record<string, unknown>
    const rawItems = (raw.order_items ?? raw.item_list ?? raw.items ?? raw.foods ?? []) as Record<string, unknown>[]

    const items = rawItems.map((item) => {
      const quantity = Number(item.quantity ?? item.model_quantity_purchased ?? item.count ?? 1)
      const unitPrice = Number(item.unit_price ?? item.price ?? item.model_discounted_price ?? item.discount_price ?? 0)
      const total = Number(item.subtotal ?? item.total ?? unitPrice * quantity)
      const optionGroups = Array.isArray(item.options_groups)
        ? (item.options_groups as Record<string, unknown>[]).map((group) => {
            const title = String(group.name ?? '').trim()
            const values = Array.isArray(group.options)
              ? (group.options as Record<string, unknown>[])
                  .map((option) => {
                    const optionName = String(option.name ?? '').trim()
                    const optionPrice = Number(option.discount_price ?? option.original_price ?? 0)
                    if (!optionName) return ''
                    return optionPrice > 0 ? `${optionName} ${optionPrice}` : optionName
                  })
                  .filter(Boolean)
              : []
            return [title, values.join(', ')].filter(Boolean).join(': ')
          }).filter(Boolean)
        : []
      const note = [String(item.note ?? '').trim(), ...optionGroups].filter(Boolean).join('\n').trim()
      return {
        name: String(
          (item.dish && typeof item.dish === 'object' ? (item.dish as Record<string, unknown>).name : undefined)
          ?? item.name
          ?? item.item_name
          ?? item.food_name
          ?? item.product_name
          ?? ''
        ),
        quantity,
        price: unitPrice,
        total,
        ...(note ? { note } : {}),
      }
    })

    const orderId = String(raw.code ?? raw.order_sn ?? raw.order_id ?? raw.id ?? '')
    const status = this.mapVisibleOrderStatus(String(raw.order_status ?? raw.status ?? raw.state ?? raw.orderStatus ?? ''))
    const createTime = Number(raw.order_time ?? raw.create_time ?? raw.created_at ?? 0)
    const subtotal = Number(raw.customer_bill && typeof raw.customer_bill === 'object' ? ((raw.customer_bill as Record<string, unknown>).sub_total ?? (raw.customer_bill as Record<string, unknown>).total_amount ?? 0) : (raw.order_value_amount ?? raw.total_amount ?? raw.sub_total ?? raw.amount ?? 0))
    const total = Number(raw.customer_bill && typeof raw.customer_bill === 'object' ? ((raw.customer_bill as Record<string, unknown>).total_amount ?? 0) : (raw.total_value_amount ?? raw.total ?? raw.order_total ?? subtotal))
    const discount = Number(raw.customer_bill && typeof raw.customer_bill === 'object' ? ((raw.customer_bill as Record<string, unknown>).total_discount ?? 0) : (raw.discount ?? raw.voucher_from_seller ?? 0))
    const platformFee = Number(raw.commission && typeof raw.commission === 'object' ? ((raw.commission as Record<string, unknown>).amount ?? 0) : (raw.platform_fee ?? raw.commission_fee ?? 0))
    const paymentMethod = String(raw.payment_method ?? raw.payment_type ?? raw.customer_pay_type ?? '')
    const deliveryAddress = String(rawDelivery.address ?? raw.delivery_address ?? rawCustomer.address ?? '')
    const customerName = String(rawDelivery.contact_name ?? rawCustomer.name ?? rawCustomer.user_name ?? rawCustomer.display_name ?? 'Khach hang')
    const customerPhone = String(rawDelivery.phone ?? rawCustomer.phone ?? rawCustomer.phone_number ?? rawCustomer.mobile ?? '')
    const driverName = String(rawDriver.name ?? rawDriver.driver_name ?? rawDelivery.shipper_name ?? '')
    const driverPhone = String(rawDriver.phone ?? rawDriver.driver_phone ?? rawDelivery.shipper_phone ?? '')
    const deliveredAt = raw.actual_deliver_time ?? raw.delivery_complete_time ?? raw.delivered_at ?? raw.completed_at ?? raw.complete_time

    return {
      source: 'shopee',
      externalOrderId: orderId,
      externalStoreId: String(raw.store_id ?? raw.shop_id ?? raw.restaurant_id ?? raw.food_delivery_id ?? storeInfo.storeId ?? ''),
      customerName,
      customerPhone,
      items,
      subtotal,
      discount,
      total,
      platformFee,
      paymentMethod,
      deliveryInfo: { address: deliveryAddress },
      driverInfo: { name: driverName, phone: driverPhone },
      orderStatus: status,
      placedAt: createTime > 0 ? new Date(createTime * 1000).toISOString() : new Date().toISOString(),
      deliveredAt: deliveredAt && Number(deliveredAt) > 0 ? new Date(Number(deliveredAt) * 1000).toISOString() : undefined,
      rawPayload: raw,
    }
  }

  private async fetchOrdersInBrowserContext(page: import('playwright').Page, storeInfo: {
    storeId?: string | null
    storeName?: string | null
    merchantId?: string
    restaurantId?: string
  }): Promise<NormalizedOrder[]> {
    if (!storeInfo.restaurantId) return []
    const now = Math.floor(Date.now() / 1000)
    const fromTime = now - 86400
    const rawBatches = await page.evaluate(async ({ restaurantId, merchantId, storeId, fromTime, toTime }) => {
      const endpoint = 'https://gmerchant.deliverynow.vn/api/v5/order/get_list_with_pagination'
      const filterTypes = [30, 31, 43, 44, 45, 46, 40, 41, 42]
      const outputs: unknown[] = []

      function extract(data: unknown) {
        if (!data || typeof data !== 'object') return null
        const envelope = data as Record<string, unknown>
        const candidates = [envelope.data, envelope.result, envelope.response, envelope.payload, envelope]
        for (const candidate of candidates) {
          if (!candidate || typeof candidate !== 'object') continue
          const current = candidate as Record<string, unknown>
          const list = current.order_list ?? current.orders ?? current.items ?? current.data ?? current.list ?? current.records ?? current.result
          if (Array.isArray(list)) return list
        }
        return Array.isArray(data) ? data : null
      }

      for (const orderFilterType of filterTypes) {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'content-type': 'application/json',
              accept: 'application/json, text/plain, */*',
              'x-store-id': String(storeId ?? ''),
              'x-merchant-id': String(merchantId ?? ''),
              'x-requested-with': 'XMLHttpRequest',
            },
            body: JSON.stringify({
              restaurantIds: [Number(restaurantId)],
              orderFilterType,
              page: 1,
              pageSize: 50,
              fromTime,
              toTime,
            }),
          })
          if (!response.ok) continue
          const payload = await response.json().catch(() => null)
          const rows = extract(payload)
          if (Array.isArray(rows) && rows.length > 0) outputs.push(...rows)
        } catch {
          // best effort
        }
      }
      return outputs
    }, {
      restaurantId: storeInfo.restaurantId,
      merchantId: storeInfo.merchantId ?? '',
      storeId: storeInfo.storeId ?? '',
      fromTime,
      toTime: now,
    }).catch(() => [] as Record<string, unknown>[])

    const seen = new Set<string>()
    return (rawBatches as Record<string, unknown>[])
      .map((raw) => this.normalizePortalOrder(raw, storeInfo))
      .filter((order) => {
        if (!order.externalOrderId || seen.has(order.externalOrderId)) return false
        seen.add(order.externalOrderId)
        return true
      })
  }

  private async extractVisibleOrders(page: import('playwright').Page, storeInfo: {
    storeId?: string | null
    storeName?: string | null
  }): Promise<NormalizedOrder[]> {
    const rows = await page.evaluate(() => {
      const tableRows = Array.from(document.querySelectorAll('tbody tr'))
      return tableRows.map((row) => {
        const cells = Array.from(row.querySelectorAll('td')).map((cell) => (cell.textContent || '').trim().replace(/\s+/g, ' '))
        return cells
      }).filter((cells) => cells.length >= 6)
    }).catch(() => [] as string[][])

    const orders: NormalizedOrder[] = []
    for (const cells of rows) {
        const orderCode = String(cells[0] ?? '').trim()
        const deliveryType = String(cells[1] ?? '').trim()
        const statusText = String(cells[2] ?? '').trim()
        const completedAt = String(cells[3] ?? '').trim()
        const cancelledAt = String(cells[4] ?? '').trim()
        const storeName = String(cells[5] ?? '').trim() || String(storeInfo.storeName ?? '')
        const totalText = String(cells[6] ?? '').trim()
        if (!orderCode) continue

        const orderStatus = this.mapVisibleOrderStatus(statusText)
        const total = this.parseCurrencyText(totalText)
        const placedAtFallback = new Date().toISOString()

        orders.push({
          source: 'shopee' as const,
          externalOrderId: orderCode,
          externalStoreId: String(storeInfo.storeId ?? ''),
          customerName: 'Khach hang',
          customerPhone: '',
          items: [],
          subtotal: total,
          discount: 0,
          total,
          platformFee: 0,
          paymentMethod: deliveryType || '',
          deliveryInfo: { address: '' },
          driverInfo: { name: '', phone: '' },
          orderStatus,
          placedAt: placedAtFallback,
          deliveredAt: orderStatus === 'completed' && completedAt ? completedAt : undefined,
          rawPayload: {
            _browserVisible: true,
            orderCode,
            deliveryType,
            statusText,
            completedAt,
            cancelledAt,
            storeName,
            totalText,
          },
        } satisfies NormalizedOrder)
    }
    return orders
  }

  async login(credentials: AutomationCredentials): Promise<AutomationResult> {
    let browser: import('playwright').Browser | null = null

    try {
      const { chromium } = await import('playwright')
      let userInfo: PartnerUserInfo | null = null
      let merchantCandidates: MerchantCandidate[] = []
      let capturedGmerchantHeaders: Record<string, string> | null = null
      let discoveredRestaurants: StoreRestaurantInfo[] = []

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
      page.on('request', async (request) => {
        if (!capturedGmerchantHeaders && request.url().includes('get_basic_infos_for_partner_web')) {
          const headers = await request.allHeaders().catch(() => ({} as Record<string, string>))
          capturedGmerchantHeaders = Object.fromEntries(
            Object.entries(headers).filter(([key]) => (
              key.startsWith('x-foody-')
              || key === 'x-sap-ri'
              || key === 'x-sap-sec'
              || key === 'spc-b-oft'
              || key === 'accept-language'
              || key === 'user-agent'
            ))
          )
        }
      })
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
          if (url.includes('get_basic_infos_for_partner_web')) {
            const payload = await response.json().catch(() => null) as StoreBasicsResponse | null
            discoveredRestaurants = payload?.data?.restaurants ?? discoveredRestaurants
          }
        } catch {
          // best-effort telemetry only
        }
      })

      await page.goto(PARTNER_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      await page.waitForSelector('input[placeholder*="Email"], input[autocomplete="username"]', { timeout: 20_000 }).catch(() => null)
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
      const continueButton = page.getByRole('button', { name: /tiếp tục/i })
      if (await continueButton.count()) {
        await continueButton.first().click().catch(() => null)
      } else {
        await this.clickFirstVisibleButton(page)
      }
      await page.waitForTimeout(4000)

      const resolvedUserInfo = userInfo as PartnerUserInfo | null

      if (page.url().includes('/account/onboarding')) {
        await page.waitForSelector('.listItem', { timeout: 20_000 }).catch(() => null)
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

      const discoveredRestaurant = discoveredRestaurants[0]
      const currentStoreId = localStorage.currentStoreId
        || localStorage.shopee_tob_entity_id
        || (resolvedUserInfo?.store_id ? String(resolvedUserInfo.store_id) : '')
        || (discoveredRestaurant?.store_id ? String(discoveredRestaurant.store_id) : '')
      const currentStoreName = resolvedUserInfo?.merchantName
        || discoveredRestaurant?.name
        || null
      const merchantId = resolvedUserInfo?.merchantId
        ? String(resolvedUserInfo.merchantId)
        : undefined
      const cookieMerchantId = cookies.find((cookie) => cookie.name === 'shopee_foody_mid')?.value
      const resolvedMerchantId = merchantId || cookieMerchantId || undefined

      const session: SessionData = {
        cookies,
        capturedAt: new Date().toISOString(),
        sessionTtlSeconds: SESSION_TTL,
        localStorage,
        storeInfo: {
          storeId: currentStoreId || null,
          storeName: currentStoreName,
          ordersApiUrl: 'https://gmerchant.deliverynow.vn/api/v5/order/get_list_with_pagination',
          orderDetailApiUrl: 'https://gmerchant.deliverynow.vn/api/v5/order/get_detail',
          reportApiUrl: 'https://gmerchant.deliverynow.vn/api/v5/seller/store/report/get_by_restaurant_v3',
          merchantId: resolvedMerchantId,
          restaurantId: discoveredRestaurant?.restaurant_id ? String(discoveredRestaurant.restaurant_id) : undefined,
          deliveryId: discoveredRestaurant?.delivery_id ? String(discoveredRestaurant.delivery_id) : undefined,
          merchantCandidates,
        },
        extraHeaders: {
          ...(capturedGmerchantHeaders ?? {}),
          ...(currentStoreId ? { 'x-store-id': String(currentStoreId) } : {}),
          ...(resolvedMerchantId ? { 'x-merchant-id': String(resolvedMerchantId) } : {}),
          ...(currentStoreName ? { 'x-store-name': String(currentStoreName) } : {}),
        },
      }

      let orders: NormalizedOrder[] | undefined
      if (credentials.includeOrders) {
        await page.goto(PARTNER_ORDER_MANAGEMENT_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => null)
        await page.waitForTimeout(6000)
        const applyButton = page.getByRole('button', { name: /áp dụng/i })
        if (await applyButton.count()) {
          await applyButton.first().click().catch(() => null)
          await page.waitForTimeout(5000)
        }
        orders = await this.fetchOrdersInBrowserContext(page, {
          storeId: currentStoreId || null,
          storeName: currentStoreName,
          merchantId: resolvedMerchantId,
          restaurantId: discoveredRestaurant?.restaurant_id ? String(discoveredRestaurant.restaurant_id) : undefined,
        })
        if (!orders.length) {
          orders = await this.extractVisibleOrders(page, {
            storeId: currentStoreId || null,
            storeName: currentStoreName,
          })
        }
      }

      await browser.close()
      return { success: true, session, ...(orders ? { orders } : {}) }
    } catch (error) {
      if (browser) await browser.close().catch(() => null)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}
