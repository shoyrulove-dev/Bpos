import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const BASE = '/api/hubs'

async function fetchJSON(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts)
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Lỗi server') }
  return res.json()
}

export function useHubs(params?: { q?: string; brandId?: string }) {
  const sp = new URLSearchParams()
  if (params?.q) sp.set('q', params.q)
  if (params?.brandId) sp.set('brandId', params.brandId)
  return useQuery({ queryKey: ['hubs', params], queryFn: () => fetchJSON(`${BASE}?${sp}`) })
}

export function useCreateHub() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchJSON(BASE, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hubs'] }),
  })
}

export function useUpdateHub() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => fetchJSON(`${BASE}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hubs'] }),
  })
}

export function useDeleteHub() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => fetchJSON(`${BASE}/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hubs'] }),
  })
}
