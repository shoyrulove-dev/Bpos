import type { NormalizedOrder } from '@/types'

export interface PlatformAdapter {
  source: string
  fetchOrders(config: AdapterConfig): Promise<NormalizedOrder[]>
  fetchOrderDetail(externalOrderId: string, config: AdapterConfig): Promise<NormalizedOrder | null>
  normalizeOrder(raw: Record<string, unknown>): NormalizedOrder
}

export interface AdapterConfig {
  accessToken?: string
  refreshToken?: string
  storeId?: string
  shopId?: string
  [key: string]: unknown
}
