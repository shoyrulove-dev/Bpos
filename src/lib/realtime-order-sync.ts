import type { PlatformAdapter, AdapterConfig, SessionData } from '@/integrations/types'
import type { NormalizedOrder } from '@/types'

export const RECENT_HISTORY_LOOKBACK_MS = 6 * 60 * 60 * 1000
const RECENT_HISTORY_DAYS = 1

export function buildSessionStoreId(externalStoreId: string | undefined, session: SessionData) {
  return externalStoreId ?? session.extraHeaders?.['x-grab-store-id'] ?? session.extraHeaders?.['x-restaurant-id'] ?? ''
}

export function filterRecentHistoricalOrders(
  orders: NormalizedOrder[],
  options?: { now?: number; lookbackMs?: number }
) {
  const now = options?.now ?? Date.now()
  const lookbackMs = options?.lookbackMs ?? RECENT_HISTORY_LOOKBACK_MS
  const cutoff = now - lookbackMs

  return orders.filter((order) => {
    const placedAt = new Date(order.placedAt).getTime()
    return Number.isFinite(placedAt) && placedAt >= cutoff
  })
}

export function mergeOrdersByExternalOrderId(...groups: NormalizedOrder[][]) {
  const merged = new Map<string, NormalizedOrder>()

  for (const orders of groups) {
    for (const order of orders) {
      if (!order.externalOrderId) continue
      merged.set(order.externalOrderId, order)
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
    const historicalOrders = await adapter.fetchHistoricalOrdersWithSession(session, storeId, { days: RECENT_HISTORY_DAYS })
    if (historicalOrders === null) return activeOrders

    const recentHistory = filterRecentHistoricalOrders(historicalOrders, options)
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
    const historicalOrders = await adapter.fetchHistoricalOrders(config, { days: RECENT_HISTORY_DAYS })
    const recentHistory = filterRecentHistoricalOrders(historicalOrders, options)
    if (!recentHistory.length) return activeOrders

    return mergeOrdersByExternalOrderId(activeOrders, recentHistory)
  } catch {
    return activeOrders
  }
}