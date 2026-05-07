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
  return useQuery({
    queryKey: ['integrations', params],
    queryFn: () => fetchJSON(`/api/integrations?${sp}`),
    refetchInterval: 30_000,  // near-realtime: refresh every 30s to pick up sync status
  })
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
export function useRevenueReport(params?: { days?: number; brandId?: string; fromDate?: string; toDate?: string }) {
  const sp = new URLSearchParams()
  if (params?.days) sp.set('days', String(params.days))
  if (params?.brandId) sp.set('brandId', params.brandId)
  if (params?.fromDate) sp.set('fromDate', params.fromDate)
  if (params?.toDate) sp.set('toDate', params.toDate)
  return useQuery({ queryKey: ['report-revenue', params], queryFn: () => fetchJSON(`/api/reports/revenue?${sp}`) })
}

// ---- Orders report ----
export function useOrdersReport(params?: { days?: number; brandId?: string; hubId?: string; fromDate?: string; toDate?: string }) {
  const sp = new URLSearchParams()
  if (params?.days) sp.set('days', String(params.days))
  if (params?.brandId) sp.set('brandId', params.brandId)
  if (params?.hubId) sp.set('hubId', params.hubId)
  if (params?.fromDate) sp.set('fromDate', params.fromDate)
  if (params?.toDate) sp.set('toDate', params.toDate)
  return useQuery({ queryKey: ['report-orders', params], queryFn: () => fetchJSON(`/api/reports/orders?${sp}`) })
}

// ---- Brands report ----
export function useBrandsReport(params?: { days?: number; fromDate?: string; toDate?: string }) {
  const sp = new URLSearchParams()
  if (params?.days) sp.set('days', String(params.days))
  if (params?.fromDate) sp.set('fromDate', params.fromDate)
  if (params?.toDate) sp.set('toDate', params.toDate)
  return useQuery({ queryKey: ['report-brands', params], queryFn: () => fetchJSON(`/api/reports/brands?${sp}`) })
}

// ---- Channels report ----
export function useChannelsReport(params?: { days?: number; brandId?: string; fromDate?: string; toDate?: string }) {
  const sp = new URLSearchParams()
  if (params?.days) sp.set('days', String(params.days))
  if (params?.brandId) sp.set('brandId', params.brandId)
  if (params?.fromDate) sp.set('fromDate', params.fromDate)
  if (params?.toDate) sp.set('toDate', params.toDate)
  return useQuery({ queryKey: ['report-channels', params], queryFn: () => fetchJSON(`/api/reports/channels?${sp}`) })
}

// ---- Hubs report ----
export function useHubsReport(params?: { days?: number; brandId?: string; fromDate?: string; toDate?: string }) {
  const sp = new URLSearchParams()
  if (params?.days) sp.set('days', String(params.days))
  if (params?.brandId) sp.set('brandId', params.brandId)
  if (params?.fromDate) sp.set('fromDate', params.fromDate)
  if (params?.toDate) sp.set('toDate', params.toDate)
  return useQuery({ queryKey: ['report-hubs', params], queryFn: () => fetchJSON(`/api/reports/hubs?${sp}`) })
}

// ---- Products report ----
export function useProductsReport(params?: { days?: number; brandId?: string; fromDate?: string; toDate?: string }) {
  const sp = new URLSearchParams()
  if (params?.days) sp.set('days', String(params.days))
  if (params?.brandId) sp.set('brandId', params.brandId)
  if (params?.fromDate) sp.set('fromDate', params.fromDate)
  if (params?.toDate) sp.set('toDate', params.toDate)
  return useQuery({ queryKey: ['report-products', params], queryFn: () => fetchJSON(`/api/reports/products?${sp}`) })
}

// ---- Customers report ----
export function useCustomersReport(params?: { days?: number; brandId?: string; fromDate?: string; toDate?: string }) {
  const sp = new URLSearchParams()
  if (params?.days) sp.set('days', String(params.days))
  if (params?.brandId) sp.set('brandId', params.brandId)
  if (params?.fromDate) sp.set('fromDate', params.fromDate)
  if (params?.toDate) sp.set('toDate', params.toDate)
  return useQuery({ queryKey: ['report-customers', params], queryFn: () => fetchJSON(`/api/reports/customers?${sp}`) })
}

// ---- Cancelled report ----
export function useCancelledReport(params?: { days?: number; brandId?: string; fromDate?: string; toDate?: string }) {
  const sp = new URLSearchParams()
  if (params?.days) sp.set('days', String(params.days))
  if (params?.brandId) sp.set('brandId', params.brandId)
  if (params?.fromDate) sp.set('fromDate', params.fromDate)
  if (params?.toDate) sp.set('toDate', params.toDate)
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

// ---- Customers (Loyalty) ----
export function useCustomers(params?: { q?: string; tier?: string; brandId?: string }) {
  const sp = new URLSearchParams()
  if (params?.q) sp.set('q', params.q)
  if (params?.tier) sp.set('tier', params.tier)
  if (params?.brandId) sp.set('brandId', params.brandId)
  return useQuery({ queryKey: ['customers', params], queryFn: () => fetchJSON(`/api/customers?${sp}`) })
}

export function useCreateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchJSON('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useUpdateCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => fetchJSON(`/api/customers/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

export function useDeleteCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => fetchJSON(`/api/customers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  })
}

// ---- Tables (Bàn) ----
export function useTables(params?: { hubId?: string; brandId?: string; zone?: string; status?: string }) {
  const sp = new URLSearchParams()
  if (params?.hubId) sp.set('hubId', params.hubId)
  if (params?.brandId) sp.set('brandId', params.brandId)
  if (params?.zone) sp.set('zone', params.zone)
  if (params?.status) sp.set('status', params.status)
  return useQuery({ queryKey: ['tables', params], queryFn: () => fetchJSON(`/api/tables?${sp}`), refetchInterval: 30_000 })
}

export function useCreateTable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchJSON('/api/tables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tables'] }),
  })
}

export function useUpdateTable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => fetchJSON(`/api/tables/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tables'] }),
  })
}

export function useDeleteTable() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => fetchJSON(`/api/tables/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tables'] }),
  })
}

// ---- Inventory (Tồn kho) ----
export function useInventory(params?: { hubId?: string; brandId?: string; lowStock?: boolean }) {
  const sp = new URLSearchParams()
  if (params?.hubId) sp.set('hubId', params.hubId)
  if (params?.brandId) sp.set('brandId', params.brandId)
  if (params?.lowStock) sp.set('lowStock', '1')
  return useQuery({ queryKey: ['inventory', params], queryFn: () => fetchJSON(`/api/inventory?${sp}`) })
}

export function useCreateInventory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => fetchJSON('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  })
}

export function useInventoryMovement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Record<string, unknown>) => fetchJSON(`/api/inventory/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['stock-movements'] }) },
  })
}

// ---- Stock Movements ----
export function useStockMovements(params?: { productId?: string; hubId?: string; brandId?: string; type?: string }) {
  const sp = new URLSearchParams()
  if (params?.productId) sp.set('productId', params.productId)
  if (params?.hubId) sp.set('hubId', params.hubId)
  if (params?.brandId) sp.set('brandId', params.brandId)
  if (params?.type) sp.set('type', params.type)
  return useQuery({ queryKey: ['stock-movements', params], queryFn: () => fetchJSON(`/api/stock-movements?${sp}`) })
}

// ---- KDS (Kitchen orders — realtime polling) ----
export function useKitchenOrders(params?: { brandId?: string; hubId?: string }) {
  const sp = new URLSearchParams()
  sp.set('status', 'waiting_confirm,waiting_pickup')
  if (params?.brandId) sp.set('brandId', params.brandId)
  if (params?.hubId) sp.set('hubId', params.hubId)
  return useQuery({
    queryKey: ['kitchen-orders', params],
    queryFn: () => fetchJSON(`/api/orders?${sp}`).then((r: { orders: unknown[] }) => r.orders ?? []),
    refetchInterval: 10_000,
  })
}

