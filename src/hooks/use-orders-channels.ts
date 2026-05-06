import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

async function fetchJSON(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts)
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Lỗi server') }
  return res.json()
}

// ---- Orders ----
export function useOrders(params?: { q?: string; status?: string; source?: string; brandId?: string; page?: number }) {
  const sp = new URLSearchParams()
  if (params?.q) sp.set('q', params.q)
  if (params?.status) sp.set('status', params.status)
  if (params?.source) sp.set('source', params.source)
  if (params?.brandId) sp.set('brandId', params.brandId)
  if (params?.page) sp.set('page', String(params.page))
  return useQuery({
    queryKey: ['orders', params],
    queryFn:  () => fetchJSON(`/api/orders?${sp}`),
    refetchInterval: 30_000,  // near-realtime: poll every 30s for new orders
  })
}

export function useOrder(id: string) {
  return useQuery({ queryKey: ['order', id], queryFn: () => fetchJSON(`/api/orders/${id}`), enabled: !!id })
}

export function useUpdateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) =>
      fetchJSON(`/api/orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['kitchen-orders'] })
    },
  })
}

// ---- Channels ----
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
