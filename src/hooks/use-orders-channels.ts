import { useQuery, keepPreviousData, useMutation, useQueryClient } from '@tanstack/react-query'
import { ORDER_ALERT_POLL_INTERVAL_MS } from '@/lib/order-alerts'
import { repairVietnameseTextDeep } from '@/lib/text-normalizer'

async function fetchJSON(url: string, opts?: RequestInit, normalizeResponse = true) {
  const res = await fetch(url, opts)
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(repairVietnameseTextDeep(String((e as { error?: string }).error ?? 'Lỗi server')))
  }
  const payload = await res.json()
  return normalizeResponse ? repairVietnameseTextDeep(payload) : payload
}

export function useOrders(params?: { q?: string; status?: string; source?: string; brandId?: string; page?: number; limit?: number; fromDate?: string; toDate?: string; pollingEnabled?: boolean; pollIntervalMs?: number }) {
  const sp = new URLSearchParams()
  if (params?.q) sp.set('q', params.q)
  if (params?.status) sp.set('status', params.status)
  if (params?.source) sp.set('source', params.source)
  if (params?.brandId) sp.set('brandId', params.brandId)
  if (params?.page) sp.set('page', String(params.page))
  if (params?.limit) sp.set('limit', String(params.limit))
  if (params?.fromDate) sp.set('fromDate', params.fromDate)
  if (params?.toDate) sp.set('toDate', params.toDate)
  return useQuery({
    queryKey: ['orders', params],
    queryFn: () => fetchJSON(`/api/orders?${sp}`, undefined, false),
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchInterval: params?.pollingEnabled ? (params.pollIntervalMs ?? ORDER_ALERT_POLL_INTERVAL_MS) : false,
    refetchIntervalInBackground: params?.pollingEnabled ?? false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

export function useOrder(id: string) {
  return useQuery({ queryKey: ['order', id], queryFn: () => fetchJSON(`/api/orders/${encodeURIComponent(id)}`, undefined, false), enabled: !!id })
}

export function useOrderTodayStatusCounts(params?: { source?: string; brandId?: string; pollingEnabled?: boolean; pollIntervalMs?: number }) {
  const sp = new URLSearchParams()
  if (params?.source) sp.set('source', params.source)
  if (params?.brandId) sp.set('brandId', params.brandId)

  return useQuery({
    queryKey: ['orders-today-status', params],
    queryFn: () => fetchJSON(`/api/orders/today-status?${sp}`, undefined, false),
    staleTime: 0,
    refetchInterval: params?.pollingEnabled ? (params.pollIntervalMs ?? ORDER_ALERT_POLL_INTERVAL_MS) : false,
    refetchIntervalInBackground: params?.pollingEnabled ?? false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

export function useUpdateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) =>
      fetchJSON(`/api/orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['orders-today-status'] })
      qc.invalidateQueries({ queryKey: ['order'] })
      qc.invalidateQueries({ queryKey: ['kitchen-orders'] })
    },
  })
}

export function useCreateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetchJSON('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['orders-today-status'] })
      qc.invalidateQueries({ queryKey: ['order'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

export function useMarkGrabOrderReady() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => fetchJSON(`/api/orders/${id}/grab-ready`, { method: 'POST' }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['orders-today-status'] })
      qc.invalidateQueries({ queryKey: ['order', id] })
      qc.invalidateQueries({ queryKey: ['kitchen-orders'] })
    },
  })
}

export function useChannels(params?: { q?: string; brandId?: string }) {
  const sp = new URLSearchParams()
  if (params?.q) sp.set('q', params.q)
  if (params?.brandId) sp.set('brandId', params.brandId)
  return useQuery({ queryKey: ['channels', params], queryFn: () => fetchJSON(`/api/channels?${sp}`) })
}

export function useCreateChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchJSON('/api/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  })
}

export function useUpdateChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) =>
      fetchJSON(`/api/channels/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  })
}

export function useDeleteChannel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => fetchJSON(`/api/channels/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  })
}
