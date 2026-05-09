import type { PlatformAdapter, AdapterConfig, SessionData } from '@/integrations/types'
import { mergeNormalizedOrderPreservingDetail } from '@/lib/order-upsert'
import type { NormalizedOrder } from '@/types'

export const RECENT_HISTORY_LOOKBACK_MS = 6 * 60 * 60 * 1000
const RECENT_HISTORY_DAYS = 1
const BE_HISTORY_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000
const BE_HISTORY_DAYS = 30

function getOrderTransitionTimestamp(order: NormalizedOrder) {
  const raw = order.rawPayload ?? {}

  const candidates = order.orderStatus === 'completed'
    ? [
        order.deliveredAt,
        raw.deliveredAt,
        raw.completedAt,
        raw.updatedAt,
      ]
    : order.orderStatus === 'cancelled'
    ? [
        raw.cancelledAt,
        raw.canceledAt,
        raw.cancelled_at,
        raw.cancel_time,
        raw.cancel_date,
        raw.updatedAt,
      ]
    : [
        order.placedAt,
        raw.updatedAt,
      ]

  for (const value of candidates) {
    if (!value) continue
    const timestamp = new Date(String(value)).getTime()
    if (Number.isFinite(timestamp)) return timestamp
  }

  return Number.NaN
}

export function buildSessionStoreId(externalStoreId: string | undefined, session: SessionData) {
  return session.extraHeaders?.['x-grab-store-id']
    ?? session.extraHeaders?.['x-restaurant-id']
    ?? externalStoreId
    ?? ''
}

export function filterRecentHistoricalOrders(
  orders: NormalizedOrder[],
  options?: { now?: number; lookbackMs?: number }
) {
  const now = options?.now ?? Date.now()
  const lookbackMs = options?.lookbackMs ?? RECENT_HISTORY_LOOKBACK_MS
  const cutoff = now - lookbackMs

  return orders.filter((order) => {
    const transitionAt = getOrderTransitionTimestamp(order)
    return Number.isFinite(transitionAt) && transitionAt >= cutoff
  })
}

export function mergeOrdersByExternalOrderId(...groups: NormalizedOrder[][]) {
  const merged = new Map<string, NormalizedOrder>()

  for (const orders of groups) {
    for (const order of orders) {
      if (!order.externalOrderId) continue

      const existing = merged.get(order.externalOrderId)
      merged.set(order.externalOrderId, existing ? mergeNormalizedOrderPreservingDetail(existing, order) : order)
    }
  }

  return Array.from(merged.values()).sort((left, right) => {
    return new Date(right.placedAt).getTime() - new Date(left.placedAt).getTime()
  })
}

export async function mergeSessionOrdersWithRecentHistory(
  adapter: PlatformAdapter,
  session: SessionData,
  storeId: string,
  activeOrders: NormalizedOrder[],
  options?: { now?: number; lookbackMs?: number }
) {
  if (!adapter.fetchHistoricalOrdersWithSession) return activeOrders

  try {
    const historyDays = adapter.source === 'be' ? BE_HISTORY_DAYS : RECENT_HISTORY_DAYS
    const historicalOrders = await adapter.fetchHistoricalOrdersWithSession(session, storeId, { days: historyDays })
    if (historicalOrders === null) return activeOrders

    const recentHistory = filterRecentHistoricalOrders(historicalOrders, {
      ...options,
      lookbackMs: adapter.source === 'be' ? BE_HISTORY_LOOKBACK_MS : options?.lookbackMs,
    })
    if (!recentHistory.length) return activeOrders

    return mergeOrdersByExternalOrderId(activeOrders, recentHistory)
  } catch {
    return activeOrders
  }
}

export async function mergeApiOrdersWithRecentHistory(
  adapter: PlatformAdapter,
  config: AdapterConfig,
  activeOrders: NormalizedOrder[],
  options?: { now?: number; lookbackMs?: number }
) {
  if (!adapter.fetchHistoricalOrders) return activeOrders

  try {
    const historyDays = adapter.source === 'be' ? BE_HISTORY_DAYS : RECENT_HISTORY_DAYS
    const historicalOrders = await adapter.fetchHistoricalOrders(config, { days: historyDays })
    const recentHistory = filterRecentHistoricalOrders(historicalOrders, {
      ...options,
      lookbackMs: adapter.source === 'be' ? BE_HISTORY_LOOKBACK_MS : options?.lookbackMs,
    })
    if (!recentHistory.length) return activeOrders

    return mergeOrdersByExternalOrderId(activeOrders, recentHistory)
  } catch {
    return activeOrders
  }
}