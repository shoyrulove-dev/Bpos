import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

async function fetchJSON(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts)
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Lỗi server') }
  return res.json()
}

// ---- Menus ----
export function useMenus(params?: { brandId?: string }) {
  const sp = new URLSearchParams()
  if (params?.brandId) sp.set('brandId', params.brandId)
  return useQuery({ queryKey: ['menus', params], queryFn: () => fetchJSON(`/api/menus?${sp}`) })
}

export function useCreateMenu() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchJSON('/api/menus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menus'] }),
  })
}

export function useUpdateMenu() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => fetchJSON(`/api/menus/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menus'] }),
  })
}

export function useDeleteMenu() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => fetchJSON(`/api/menus/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menus'] }),
  })
}

// ---- Promotions ----
export function usePromotions(params?: { brandId?: string; status?: string }) {
  const sp = new URLSearchParams()
  if (params?.brandId) sp.set('brandId', params.brandId)
  if (params?.status) sp.set('status', params.status)
  return useQuery({ queryKey: ['promotions', params], queryFn: () => fetchJSON(`/api/promotions?${sp}`) })
}

export function useCreatePromotion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchJSON('/api/promotions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }),
  })
}

export function useUpdatePromotion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => fetchJSON(`/api/promotions/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }),
  })
}

export function useDeletePromotion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => fetchJSON(`/api/promotions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promotions'] }),
  })
}

// ---- Bill Templates ----
export function useBillTemplates(params?: { brandId?: string }) {
  const sp = new URLSearchParams()
  if (params?.brandId) sp.set('brandId', params.brandId)
  return useQuery({ queryKey: ['bill-templates', params], queryFn: () => fetchJSON(`/api/bill-templates?${sp}`) })
}

export function useCreateBillTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchJSON('/api/bill-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bill-templates'] }),
  })
}

export function useUpdateBillTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => fetchJSON(`/api/bill-templates/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bill-templates'] }),
  })
}

// ---- Sync Logs ----
export function useSyncLogs(params?: { type?: string; status?: string; brandId?: string }) {
  const sp = new URLSearchParams()
  if (params?.type) sp.set('type', params.type)
  if (params?.status) sp.set('status', params.status)
  if (params?.brandId) sp.set('brandId', params.brandId)
  return useQuery({ queryKey: ['sync-logs', params], queryFn: () => fetchJSON(`/api/sync-logs?${sp}`) })
}

// ---- E-Invoices ----
export function useEInvoices(params?: { brandId?: string }) {
  const sp = new URLSearchParams()
  if (params?.brandId) sp.set('brandId', params.brandId)
  return useQuery({ queryKey: ['e-invoices', params], queryFn: () => fetchJSON(`/api/e-invoices?${sp}`) })
}

export function useCreateEInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchJSON('/api/e-invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['e-invoices'] }),
  })
}

// ---- Integrations (admin) ----
export function useIntegrations(params?: { brandId?: string }) {
  const sp = new URLSearchParams()
  if (params?.brandId) sp.set('brandId', params.brandId)
  return useQuery({ queryKey: ['integrations', params], queryFn: () => fetchJSON(`/api/integrations?${sp}`) })
}

export function useCreateIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchJSON('/api/integrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  })
}

export function useDeleteIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => fetchJSON(`/api/integrations/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  })
}

export function useUpdateIntegration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => fetchJSON(`/api/integrations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['integrations'] }),
  })
}

// ---- Stats ----
export function useStats() {
  return useQuery({ queryKey: ['stats'], queryFn: () => fetchJSON('/api/stats'), staleTime: 60_000 })
}

// ---- Revenue report ----
export function useRevenueReport(params?: { days?: number; brandId?: string }) {
  const sp = new URLSearchParams()
  if (params?.days) sp.set('days', String(params.days))
  if (params?.brandId) sp.set('brandId', params.brandId)
  return useQuery({ queryKey: ['report-revenue', params], queryFn: () => fetchJSON(`/api/reports/revenue?${sp}`) })
}

// ---- Orders report ----
export function useOrdersReport(params?: { days?: number; brandId?: string; hubId?: string }) {
  const sp = new URLSearchParams()
  if (params?.days) sp.set('days', String(params.days))
  if (params?.brandId) sp.set('brandId', params.brandId)
  if (params?.hubId) sp.set('hubId', params.hubId)
  return useQuery({ queryKey: ['report-orders', params], queryFn: () => fetchJSON(`/api/reports/orders?${sp}`) })
}

// ---- Brands report ----
export function useBrandsReport(params?: { days?: number }) {
  const sp = new URLSearchParams()
  if (params?.days) sp.set('days', String(params.days))
  return useQuery({ queryKey: ['report-brands', params], queryFn: () => fetchJSON(`/api/reports/brands?${sp}`) })
}

// ---- Channels report ----
export function useChannelsReport(params?: { days?: number; brandId?: string }) {
  const sp = new URLSearchParams()
  if (params?.days) sp.set('days', String(params.days))
  if (params?.brandId) sp.set('brandId', params.brandId)
  return useQuery({ queryKey: ['report-channels', params], queryFn: () => fetchJSON(`/api/reports/channels?${sp}`) })
}

// ---- Hubs report ----
export function useHubsReport(params?: { days?: number; brandId?: string }) {
  const sp = new URLSearchParams()
  if (params?.days) sp.set('days', String(params.days))
  if (params?.brandId) sp.set('brandId', params.brandId)
  return useQuery({ queryKey: ['report-hubs', params], queryFn: () => fetchJSON(`/api/reports/hubs?${sp}`) })
}

// ---- Products report ----
export function useProductsReport(params?: { days?: number; brandId?: string }) {
  const sp = new URLSearchParams()
  if (params?.days) sp.set('days', String(params.days))
  if (params?.brandId) sp.set('brandId', params.brandId)
  return useQuery({ queryKey: ['report-products', params], queryFn: () => fetchJSON(`/api/reports/products?${sp}`) })
}

// ---- Customers report ----
export function useCustomersReport(params?: { days?: number; brandId?: string }) {
  const sp = new URLSearchParams()
  if (params?.days) sp.set('days', String(params.days))
  if (params?.brandId) sp.set('brandId', params.brandId)
  return useQuery({ queryKey: ['report-customers', params], queryFn: () => fetchJSON(`/api/reports/customers?${sp}`) })
}

// ---- Cancelled report ----
export function useCancelledReport(params?: { days?: number; brandId?: string }) {
  const sp = new URLSearchParams()
  if (params?.days) sp.set('days', String(params.days))
  if (params?.brandId) sp.set('brandId', params.brandId)
  return useQuery({ queryKey: ['report-cancelled', params], queryFn: () => fetchJSON(`/api/reports/cancelled?${sp}`) })
}

// ---- Shifts (Ca bán hàng) ----
export function useShifts(params?: { brandId?: string; hubId?: string; status?: string; page?: number }) {
  const sp = new URLSearchParams()
  if (params?.brandId) sp.set('brandId', params.brandId)
  if (params?.hubId) sp.set('hubId', params.hubId)
  if (params?.status) sp.set('status', params.status)
  if (params?.page) sp.set('page', String(params.page))
  return useQuery({ queryKey: ['shifts', params], queryFn: () => fetchJSON(`/api/shifts?${sp}`) })
}

export function useOpenShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchJSON('/api/shifts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  })
}

export function useCloseShift() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => fetchJSON(`/api/shifts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'close', ...data }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  })
}
