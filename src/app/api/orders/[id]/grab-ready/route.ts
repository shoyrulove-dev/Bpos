import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import { ok, err, requireAuth } from '@/lib/api-helpers'
import { decryptJSON } from '@/lib/crypto'
import { enrichGrabSessionExtraHeaders } from '@/lib/grab-session'
import { buildSessionStoreId } from '@/lib/realtime-order-sync'
import OrderModel from '@/models/Order'
import IntegrationModel from '@/models/Integration'
import type { SessionData } from '@/integrations/types'

const GRAB_MARK_READY_URL = 'https://api.grab.com/food/merchant/orders/mark'
const GRAB_ACTIVE_PAGE_TYPES = ['PreparingV2', 'Ready', 'Upcoming'] as const
const GRAB_DETAIL_PAGE_STAGES = ['preparing', 'ready', 'upcoming', 'history', 'completed', 'cancelled'] as const

type LeanGrabOrder = {
  _id: string
  brandId: unknown
  hubId?: unknown
  source: string
  externalOrderId?: string
  rawPayload?: Record<string, unknown>
}

type LeanGrabIntegration = {
  _id: string
  brandId: unknown
  hubId?: unknown
  externalStoreId?: string
  sessionData?: string
  isActive: boolean
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getGrabPortalOrderId(raw: Record<string, unknown>) {
  return String(raw.orderID ?? raw.orderId ?? raw.ID ?? raw.id ?? '').trim()
}

function getGrabPortalShortOrderId(raw: Record<string, unknown>) {
  return String(raw.displayID ?? raw.shortOrderID ?? raw.shortOrderId ?? '').trim()
}

function getGrabPortalOrderStage(raw: Record<string, unknown>) {
  const rawStatus = String(raw.deliveryStatus ?? raw.orderState ?? raw.status ?? raw.orderStatus ?? raw.state ?? '').toLowerCase()

  if (rawStatus.includes('ready')) return 'ready'
  if (rawStatus.includes('upcoming') || rawStatus.includes('schedule')) return 'upcoming'
  if (rawStatus.includes('cancel')) return 'cancelled'
  if (rawStatus.includes('complete') || rawStatus.includes('deliver') || rawStatus.includes('history') || rawStatus.includes('past')) return 'history'

  return 'preparing'
}

function buildGrabPortalDetailPageUrls(raw: Record<string, unknown>, storeId: string) {
  const orderId = getGrabPortalOrderId(raw)
  if (!orderId || !storeId) return []

  const shortOrderId = getGrabPortalShortOrderId(raw)
  const preferredStage = getGrabPortalOrderStage(raw)
  const stages = [preferredStage, ...GRAB_DETAIL_PAGE_STAGES.filter((stage) => stage !== preferredStage)]

  return stages.map((stage) => {
    const url = new URL(`https://merchant.grab.com/order/${encodeURIComponent(storeId)}/${stage}/${encodeURIComponent(orderId)}`)
    if (shortOrderId) url.searchParams.set('shortOrderID', shortOrderId)
    return url.toString()
  })
}

function getGrabMerchantId(raw: Record<string, unknown> | undefined, fallbackStoreId?: string) {
  const merchant = raw?.merchant && typeof raw.merchant === 'object' && !Array.isArray(raw.merchant)
    ? raw.merchant as Record<string, unknown>
    : undefined

  return String(merchant?.ID ?? raw?.merchantID ?? raw?.merchantId ?? fallbackStoreId ?? '').trim()
}

function buildGrabSessionContext(session: SessionData, storeId: string) {
  const cookieHeader = session.cookies
    .filter((cookie) => {
      if (cookie.expires === -1) return true
      if (cookie.expires > Date.now() / 1000) return true
      return false
    })
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ')

  if (!cookieHeader) return null

  const { extraHeaders, discoveredStoreId } = enrichGrabSessionExtraHeaders(session, storeId)
  const token = extraHeaders['x-grab-token'] ?? extraHeaders['Authorization'] ?? ''

  const forwardedHeaders = Object.fromEntries(
    Object.entries(extraHeaders).filter(([key, value]) => {
      if (!value) return false
      const normalizedKey = key.toLowerCase()
      return normalizedKey !== 'x-grab-orders-api' && normalizedKey !== 'x-grab-stores'
    })
  )

  const baseHeaders: Record<string, string> = {
    ...forwardedHeaders,
    Cookie: cookieHeader,
    'x-grab-tenant': 'GF_VN',
    'x-grab-country': 'VN',
    'x-grab-language': 'vi',
    Accept: 'application/json',
    'Accept-Language': 'vi',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Origin: 'https://merchant.grab.com',
    Referer: 'https://merchant.grab.com/food/orders',
    'Sec-Fetch-Site': 'same-site',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    requestsource: 'troyPortal',
    merchantid: discoveredStoreId,
  }

  if (token && !token.startsWith('x-grab')) {
    baseHeaders.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`
  }

  return { baseHeaders, discoveredStoreId }
}

function findStringInValue(value: unknown, predicate: (candidate: string) => boolean, depth = 0): string | null {
  if (depth > 10 || value == null) return null

  if (typeof value === 'string') {
    const text = value.trim()
    return text && predicate(text) ? text : null
  }

  if (typeof value === 'number') {
    const text = String(value)
    return predicate(text) ? text : null
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringInValue(item, predicate, depth + 1)
      if (found) return found
    }
    return null
  }

  if (typeof value !== 'object') return null

  for (const nested of Object.values(value as Record<string, unknown>)) {
    const found = findStringInValue(nested, predicate, depth + 1)
    if (found) return found
  }

  return null
}

function findGrabOrderInValue(value: unknown, orderId: string, depth = 0): Record<string, unknown> | null {
  if (depth > 10 || value == null) return null

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findGrabOrderInValue(item, orderId, depth + 1)
      if (found) return found
    }
    return null
  }

  if (typeof value !== 'object') return null

  const record = value as Record<string, unknown>
  if (getGrabPortalOrderId(record) === orderId) return record

  for (const nested of Object.values(record)) {
    const found = findGrabOrderInValue(nested, orderId, depth + 1)
    if (found) return found
  }

  return null
}

function findPreparationTaskId(value: unknown, orderId: string) {
  const exactPattern = new RegExp(`${escapeRegExp(orderId)}-PREP-[A-Z0-9-]+`, 'i')
  const exactMatch = findStringInValue(value, (candidate) => exactPattern.test(candidate))
  if (exactMatch) return exactMatch

  return findStringInValue(value, (candidate) => candidate.includes('-PREP-'))
}

async function fetchLiveGrabOrder(
  baseHeaders: Record<string, string>,
  storeId: string,
  orderId: string
) {
  for (const pageType of GRAB_ACTIVE_PAGE_TYPES) {
    const url = new URL('https://api.grab.com/delvplatformapi/merchant/v4/orders-pagination')
    url.searchParams.set('AutoAcceptGroup', '1')
    url.searchParams.set('merchantID', storeId)
    url.searchParams.set('PageType', pageType)
    url.searchParams.set('searchToken', '')
    url.searchParams.set('size', '50')

    try {
      const response = await fetch(url, { headers: baseHeaders, signal: AbortSignal.timeout(8000) })
      if (!response.ok) continue
      const payload = await response.json() as unknown
      const found = findGrabOrderInValue(payload, orderId)
      if (found) return found
    } catch {
      continue
    }
  }

  return null
}

async function resolvePreparationTaskId(
  rawOrder: Record<string, unknown>,
  baseHeaders: Record<string, string>,
  storeId: string,
  orderId: string
) {
  const existing = findPreparationTaskId(rawOrder, orderId)
  if (existing) return existing

  const liveOrder = await fetchLiveGrabOrder(baseHeaders, storeId, orderId)
  const livePreparationTaskId = liveOrder ? findPreparationTaskId(liveOrder, orderId) : null
  if (livePreparationTaskId) return livePreparationTaskId

  const prepPattern = new RegExp(`${escapeRegExp(orderId)}-PREP-[A-Z0-9-]+`, 'i')

  for (const url of buildGrabPortalDetailPageUrls(rawOrder, storeId)) {
    try {
      const response = await fetch(url, {
        headers: {
          ...baseHeaders,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Referer: `https://merchant.grab.com/order/${encodeURIComponent(storeId)}`,
        },
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) continue

      const html = await response.text()
      const match = html.match(prepPattern)
      if (match?.[0]) return match[0]
    } catch {
      continue
    }
  }

  return null
}

async function findIntegrationForGrabOrder(order: LeanGrabOrder, merchantId: string) {
  const baseFilter = {
    provider: 'grab',
    isActive: true,
    brandId: order.brandId,
  }

  const withHubAndMerchant = order.hubId
    ? await IntegrationModel.findOne({ ...baseFilter, hubId: order.hubId, externalStoreId: merchantId }).select('+sessionData').lean()
    : null
  if (withHubAndMerchant) return withHubAndMerchant as unknown as LeanGrabIntegration

  const withMerchant = merchantId
    ? await IntegrationModel.findOne({ ...baseFilter, externalStoreId: merchantId }).select('+sessionData').lean()
    : null
  if (withMerchant) return withMerchant as unknown as LeanGrabIntegration

  const fallback = await IntegrationModel.findOne(baseFilter).select('+sessionData').lean()
  return fallback as unknown as LeanGrabIntegration | null
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res

  await connectDB()

  const rawOrder = await OrderModel.findById(params.id).lean()
  if (!rawOrder || Array.isArray(rawOrder)) return err('Không tìm thấy đơn hàng', 404)

  const order = rawOrder as unknown as LeanGrabOrder
  if (order.source !== 'grab') return err('Chỉ hỗ trợ đánh dấu sẵn sàng cho đơn Grab', 400)

  const orderId = String(order.externalOrderId ?? '').trim()
  if (!orderId) return err('Đơn Grab chưa có externalOrderId', 400)

  const rawPayload = order.rawPayload && typeof order.rawPayload === 'object' && !Array.isArray(order.rawPayload)
    ? order.rawPayload
    : {}
  const merchantId = getGrabMerchantId(rawPayload)

  const integration = await findIntegrationForGrabOrder(order, merchantId)
  if (!integration) return err('Không tìm thấy tích hợp Grab phù hợp cho đơn hàng này', 404)
  if (!integration.sessionData) return err('Tích hợp Grab chưa có session hoạt động', 400)

  const session = decryptJSON<SessionData>(integration.sessionData)
  const storeId = buildSessionStoreId(integration.externalStoreId, session) || merchantId
  const sessionContext = buildGrabSessionContext(session, storeId)
  if (!sessionContext) return err('Session Grab không hợp lệ hoặc đã hết hạn', 401)

  const { baseHeaders, discoveredStoreId } = sessionContext
  const preparationTaskId = await resolvePreparationTaskId(rawPayload, baseHeaders, discoveredStoreId, orderId)
  if (!preparationTaskId) {
    return err('Không tìm thấy preparationTaskID để báo sẵn sàng trên Grab', 400)
  }

  const response = await fetch(GRAB_MARK_READY_URL, {
    method: 'POST',
    headers: {
      ...baseHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      orderIDs: [orderId],
      markStatus: 1,
      preparationTaskIDs: [preparationTaskId],
    }),
    signal: AbortSignal.timeout(10000),
  })

  const responseText = await response.text()
  let responseBody: unknown = null
  try {
    responseBody = responseText ? JSON.parse(responseText) as unknown : null
  } catch {
    responseBody = responseText || null
  }

  if (response.status === 401 || response.status === 403) {
    return err('Session Grab đã hết hạn, cần đăng nhập lại để bấm sẵn sàng', 401)
  }

  if (!response.ok) {
    const providerMessage = typeof responseBody === 'object' && responseBody && 'message' in responseBody
      ? String((responseBody as { message?: unknown }).message ?? '')
      : ''
    return err(providerMessage || `Grab từ chối thao tác sẵn sàng (${response.status})`, 502)
  }

  await OrderModel.findByIdAndUpdate(params.id, {
    $set: {
      'rawPayload.preparationTaskID': preparationTaskId,
      'rawPayload.lastMarkedReadyAt': new Date().toISOString(),
    },
  })

  return ok({
    success: true,
    orderId,
    preparationTaskId,
    providerResponse: responseBody,
  })
}