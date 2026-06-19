'use client'

import Link from 'next/link'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftRight, Download, Loader2, Plus, Printer, RefreshCw, Search } from 'lucide-react'
import OrderCreateModal from '@/components/orders/OrderCreateModal'
import { PlatformIcon } from '@/components/ui/PlatformIcon'
import { useOrders, useOrderTodayStatusCounts } from '@/hooks/use-orders-channels'
import { useDebounce } from '@/hooks/use-debounce'
import { getActualReceived, getDisplayCustomerName, getDisplayCustomerPhone, getDisplayDriverPhone } from '@/lib/order-financials'
import { resolveOrderDeliveredAtValue, resolveOrderPlacedAtValue } from '@/lib/order-recovery'
import { printItemLabels, printOrderWithFallback } from '@/lib/local-printer'
import { formatDateInput } from '@/lib/date-range'
import { CHANNEL_SOURCE_LABEL, cn, formatCurrency, formatDate, getOrderDisplayCode, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL } from '@/lib/utils'
import type { Order } from '@/types'

const PAGE_SIZE_OPTIONS = [10, 30, 50, 100, 200, 500] as const
type OrdersResponse = {
  orders: Order[]
  total: number
  page: number
  limit: number
  totalPages: number
}

type OrderListItem = Order & {
  displayCode?: string
}

const STATUS_ITEMS = [
  { value: '', label: 'Tất cả', dot: 'bg-teal-500' },
  { value: 'draft', label: ORDER_STATUS_LABEL.draft, dot: 'bg-gray-300' },
  { value: 'pre_order', label: ORDER_STATUS_LABEL.pre_order, dot: 'bg-blue-500' },
  { value: 'waiting_confirm', label: ORDER_STATUS_LABEL.waiting_confirm, dot: 'bg-yellow-400' },
  { value: 'waiting_pickup', label: ORDER_STATUS_LABEL.waiting_pickup, dot: 'bg-orange-400' },
  { value: 'delivering', label: ORDER_STATUS_LABEL.delivering, dot: 'bg-indigo-400' },
  { value: 'completed', label: ORDER_STATUS_LABEL.completed, dot: 'bg-emerald-500' },
  { value: 'cancelled', label: ORDER_STATUS_LABEL.cancelled, dot: 'bg-rose-400' },
] as const

const SOURCES = [
  { value: '', label: 'Nguồn' },
  { value: 'shopee', label: 'Shopee' },
  { value: 'grab', label: 'GrabFood' },
  { value: 'xanh_sm', label: 'Xanh SM' },
  { value: 'be', label: 'Be' },
  { value: 'internal', label: 'Nội bộ' },
]

function getTotalItems(order: Order) {
  return order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
}

function openWindow(url: string) {
  if (typeof window === 'undefined') return
  window.open(url, '_blank', 'noopener,noreferrer')
}

function formatMaybeDate(value: unknown): string {
  if (value === undefined || value === null || value === '') return '-'
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const nested = value as Record<string, unknown>
    for (const key of ['createdAt', 'created_at', 'placedAt', 'placed_at', 'deliveredAt', 'delivered_at', 'completedAt', 'completed_at', 'deliveryCompletedAt', 'updatedAt', 'updated_at', 'orderTime']) {
      const candidate = nested[key]
      if (candidate !== undefined && candidate !== null && candidate !== '') {
        const formatted = formatMaybeDate(candidate)
        if (formatted !== '-') return formatted
      }
    }
    return '-'
  }

  try {
    return formatDate(value)
  } catch {
    return '-'
  }
}

function InfoRow({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="grid grid-cols-[78px_minmax(0,1fr)] items-start gap-2 text-sm leading-5">
      <span className="pt-0.5 font-medium text-gray-600">{label}</span>
      <span className={cn('min-w-0 whitespace-normal break-words text-[15px] font-semibold text-gray-900', valueClassName)}>{value}</span>
    </div>
  )
}

function InfoGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0 flex-1 rounded-2xl border border-rose-200 bg-[linear-gradient(180deg,#fffafa_0%,#fff4f1_100%)] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-rose-500">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function isOrderNew(order: Order) {
  if (order.status === 'completed' || order.status === 'cancelled') return false
  const placedAt = new Date(order.placedAt).getTime()
  if (!Number.isFinite(placedAt)) return false
  return Date.now() - placedAt <= 30 * 60 * 1000
}

function SourceIcon({ source }: { source: Order['source'] }) {
  return <PlatformIcon source={source} size="lg" />
}

type StatusChangeTarget = { orderId: string; currentStatus: string }

export default function OrdersPage() {
  const today = formatDateInput(new Date())
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState(today)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [statusTarget, setStatusTarget] = useState<StatusChangeTarget | null>(null)
  const [statusSaving, setStatusSaving] = useState(false)
  const ordersTopRef = useRef<HTMLDivElement>(null)
  const dq = useDebounce(search)
  const pollingEnabled = true

  const { data, isLoading, isFetching, refetch, isRefetching } = useOrders({
    q: dq,
    status: statusFilter,
    source: sourceFilter,
    page,
    limit: pageSize,
    fromDate,
    toDate,
    pollingEnabled,
  })

  const ordersData = data as OrdersResponse | undefined
  const orders: OrderListItem[] = (ordersData?.orders as OrderListItem[] | undefined) ?? []
  const { data: todayCountsData } = useOrderTodayStatusCounts({
    source: sourceFilter,
    pollingEnabled,
  })

  useEffect(() => {
    setPage(1)
  }, [dq, statusFilter, sourceFilter, fromDate, toDate, pageSize])

  useEffect(() => {
    if (ordersData === undefined) return
    const nextTotalPages = Math.max(1, ordersData.totalPages ?? 1)
    if (page > nextTotalPages) setPage(nextTotalPages)
  }, [ordersData, page])

  const handleChangeStatus = async (orderId: string, newStatus: string) => {
    setStatusSaving(true)
    try {
      await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      setStatusTarget(null)
      await refetch()
    } finally {
      setStatusSaving(false)
    }
  }

  const todayCountByStatus = useMemo(() => {
    const payload = (todayCountsData as { todayStatusCounts?: Record<string, number>; totalCount?: number } | undefined)
    const counts = { ...(payload?.todayStatusCounts ?? {}) }
    if (statusFilter && statusFilter !== '' && typeof counts[statusFilter] !== 'number') {
      counts[statusFilter] = 0
    }
    counts.__all__ = Number(payload?.totalCount ?? Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0))
    return counts
  }, [todayCountsData, statusFilter])

  const totalPages = Math.max(1, ordersData?.totalPages ?? 1)
  const currentFrom = ordersData?.total ? (page - 1) * pageSize + 1 : 0
  const currentTo = ordersData?.total ? Math.min(page * pageSize, ordersData.total) : 0

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage)
    setTimeout(() => ordersTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const handleExportOrders = () => {
    const sp = new URLSearchParams()
    if (dq) sp.set('q', dq)
    if (statusFilter) sp.set('status', statusFilter)
    if (sourceFilter) sp.set('source', sourceFilter)
    if (fromDate) sp.set('fromDate', fromDate)
    if (toDate) sp.set('toDate', toDate)
    openWindow(`/api/orders/export?${sp.toString()}`)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="card p-3 lg:sticky lg:top-24 lg:self-start">
          <button type="button" onClick={() => setShowCreateModal(true)} className="mb-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-full bg-[#20232A] px-3 text-sm font-semibold text-white transition hover:bg-black">
            <Plus className="h-4 w-4" /> Tạo đơn mới
          </button>
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">Trạng thái hôm nay</div>
          <div className="space-y-2">
            {STATUS_ITEMS.map((status) => {
              const count = status.value
                ? Number(todayCountByStatus[status.value] || 0)
                : Number(todayCountByStatus.__all__ || 0)
              const active = statusFilter === status.value
              return (
                <button
                  key={status.value}
                  type="button"
                  onClick={() => setStatusFilter(status.value)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 text-left text-xs font-medium transition-all',
                    active
                      ? 'border-amber-200 bg-amber-50 text-gray-950'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full shrink-0', status.dot)} />
                    <span className="truncate">{status.label}</span>
                  </span>
                  {count !== null && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-700">{count}</span>}
                </button>
              )
            })}
          </div>
        </aside>

        <div className="space-y-4 min-w-0">
          <div className="card p-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input className="input h-9 w-full pl-8 pr-2 text-sm" placeholder="Tìm mã đơn, tên khách, SĐT..." value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <select className="input h-9 w-[104px] shrink-0 text-sm" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                {SOURCES.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
              </select>
              <input type="date" className="input h-9 w-[132px] shrink-0 px-2 text-sm" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              <input type="date" className="input h-9 w-[132px] shrink-0 px-2 text-sm" value={toDate} onChange={(event) => setToDate(event.target.value)} max={today} />
              <button type="button" onClick={() => refetch()} className="btn-outline h-9 w-9 shrink-0 justify-center px-0" aria-label="Làm mới" title="Làm mới" disabled={isRefetching}>
                <RefreshCw className={cn('h-4 w-4', isRefetching && 'animate-spin')} />
              </button>
              <button type="button" onClick={handleExportOrders} className="btn-outline h-9 w-9 shrink-0 justify-center px-0" aria-label="Export Excel" title="Export Excel"><Download className="h-4 w-4" /></button>
            </div>
            {(ordersData?.total ?? 0) > 0 && (
              <div className="mt-2 border-t border-gray-100 pt-2">
                <PaginationControls page={page} pageSize={pageSize} total={ordersData?.total ?? 0} totalPages={totalPages} currentFrom={currentFrom} currentTo={currentTo} onPageChange={handlePageChange} onPageSizeChange={(nextSize) => setPageSize(nextSize)} />
              </div>
            )}
          </div>

          <div ref={ordersTopRef} className={`space-y-4 transition-opacity duration-150 ${isFetching && !isLoading ? 'pointer-events-none opacity-60' : ''}`}>
            {isLoading ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-[28px] border border-gray-200 bg-white">
                <div className="flex items-center gap-3 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> Đang tải đơn hàng...</div>
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-gray-300 bg-white px-6 py-20 text-center">
                <p className="text-lg font-medium text-gray-900">Không tìm thấy đơn hàng</p>
                <p className="mt-2 text-sm text-gray-500">Thử đổi bộ lọc hoặc tạo một đơn nội bộ mới.</p>
              </div>
            ) : orders.map((order) => {
              const totalItems = getTotalItems(order)
              const actualReceived = getActualReceived(order)
              const locationLabel = [order.brandName, order.hubName].filter(Boolean).join(' - ')
              const showNewBadge = isOrderNew(order)
              const displayCode = order.displayCode || getOrderDisplayCode(order)
              return (
                <article key={order._id} className="rounded-2xl border border-gray-200 bg-white px-4 py-3.5 shadow-sm">
                  <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      {showNewBadge && <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-rose-600">New</span>}
                      <span className="shrink-0" aria-label={CHANNEL_SOURCE_LABEL[order.source]}>
                        <SourceIcon source={order.source} />
                      </span>
                      <span className="font-mono text-base font-semibold text-sky-600">#{displayCode}</span>
                      {locationLabel && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">{locationLabel}</span>}
                    </div>
                    <span className={cn('badge shrink-0', ORDER_STATUS_COLOR[order.status])}>{ORDER_STATUS_LABEL[order.status]}</span>
                  </div>

                  <div className="rounded-2xl bg-gray-50 px-2.5 py-2.5">
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      <InfoGroup title="Khách hàng">
                        <InfoRow label="Tên" value={order.customerName || getDisplayCustomerName(order) || '-'} />
                        <InfoRow label="SĐT" value={order.customerPhone || getDisplayCustomerPhone(order) || '-'} />
                      </InfoGroup>
                      <InfoGroup title="Thanh toán">
                        <InfoRow label="Số lượng" value={`${totalItems} sản phẩm`} />
                        <InfoRow label="Thực nhận" value={formatCurrency(actualReceived)} valueClassName="text-emerald-600" />
                      </InfoGroup>
                      <InfoGroup title="Giao nhận">
                        <InfoRow label="Đặt lúc" value={formatMaybeDate(resolveOrderPlacedAtValue(order) ?? order.placedAt)} />
                        <InfoRow label="Nhận hàng" value={formatMaybeDate(resolveOrderDeliveredAtValue(order) ?? order.deliveredAt ?? order.deliveryInfo?.estimatedTime)} />
                      </InfoGroup>
                      <InfoGroup title="Vận chuyển">
                        <InfoRow label="Tài xế" value={order.driverInfo?.name || '-'} />
                        <InfoRow label="SĐT" value={order.driverInfo?.phone || getDisplayDriverPhone(order) || '-'} />
                        {order.deliveryInfo?.address && <InfoRow label="Địa chỉ" value={order.deliveryInfo.address} valueClassName="text-xs" />}
                      </InfoGroup>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2.5">
                    <div className="flex items-center gap-2">
                      <button type="button" title="Đổi trạng thái" onClick={() => setStatusTarget({ orderId: order._id, currentStatus: order.status })} className="btn-outline h-9 w-9 justify-center rounded-full px-0"><ArrowLeftRight className="h-3.5 w-3.5" /></button>
                      <Link href={`/orders/${order._id}`} className="inline-flex items-center gap-2 rounded-full bg-[#20232A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-black">Chi tiết</Link>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => void printOrderWithFallback(order._id, 'receipt', { autoprint: true })} className="btn-outline rounded-full text-sm"><Printer className="h-3.5 w-3.5" /> In đơn</button>
                      <button type="button" onClick={() => void printItemLabels(order._id)} className="btn-outline rounded-full text-sm"><Printer className="h-3.5 w-3.5" /> In phiếu tem</button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          <div className="card p-4">
            <PaginationControls page={page} pageSize={pageSize} total={ordersData?.total ?? 0} totalPages={totalPages} currentFrom={currentFrom} currentTo={currentTo} onPageChange={handlePageChange} onPageSizeChange={(nextSize) => setPageSize(nextSize)} />
          </div>
        </div>
      </div>

      <OrderCreateModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />
      {statusTarget && (
        <StatusChangeModal
          orderId={statusTarget.orderId}
          currentStatus={statusTarget.currentStatus}
          saving={statusSaving}
          onClose={() => setStatusTarget(null)}
          onSave={handleChangeStatus}
        />
      )}
    </div>
  )
}

function PaginationControls({ page, pageSize, total, totalPages, currentFrom, currentTo, onPageChange, onPageSizeChange }: { page: number; pageSize: (typeof PAGE_SIZE_OPTIONS)[number]; total: number; totalPages: number; currentFrom: number; currentTo: number; onPageChange: (page: number) => void; onPageSizeChange: (size: (typeof PAGE_SIZE_OPTIONS)[number]) => void }) {
  const pages: (number | '...')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    const near = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages))
    let prev = 0
    for (const p of Array.from(near).sort((a, b) => a - b)) {
      if (prev && p - prev > 1) pages.push('...')
      pages.push(p)
      prev = p
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
        <span>{total > 0 ? `${currentFrom}-${currentTo} / ${total} đơn` : 'Chưa có đơn hàng'}</span>
        <select className="input h-8 w-20 py-0 text-xs" value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])}>
          {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option} / trang</option>)}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="h-8 w-8 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40" title="Trang trước">‹</button>
        {pages.map((item, index) =>
          item === '...'
            ? <span key={`ellipsis-${index}`} className="flex h-8 w-6 select-none items-center justify-center text-xs text-gray-400">…</span>
            : (
              <button
                key={item}
                onClick={() => onPageChange(item)}
                className={cn(
                  'flex h-8 min-w-[2rem] items-center justify-center rounded-lg border px-2 text-sm font-medium transition-colors',
                  item === page
                    ? 'border-gray-900 bg-gray-900 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                )}
              >
                {item}
              </button>
            )
        )}
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className="h-8 w-8 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40" title="Trang sau">›</button>
      </div>
    </div>
  )
}

const CHANGEABLE_STATUSES = [
  { value: 'waiting_confirm', label: 'Chờ xác nhận', color: 'bg-yellow-400' },
  { value: 'waiting_pickup', label: 'Chờ lấy hàng', color: 'bg-orange-400' },
  { value: 'delivering', label: 'Đang giao', color: 'bg-indigo-400' },
  { value: 'completed', label: 'Hoàn thành', color: 'bg-emerald-500' },
  { value: 'cancelled', label: 'Đã hủy', color: 'bg-rose-400' },
] as const

function StatusChangeModal({ orderId, currentStatus, saving, onClose, onSave }: {
  orderId: string
  currentStatus: string
  saving: boolean
  onClose: () => void
  onSave: (orderId: string, status: string) => void
}) {
  const [selected, setSelected] = useState(currentStatus)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-base font-bold text-gray-900">Đổi trạng thái đơn hàng</h2>
        <div className="space-y-2">
          {CHANGEABLE_STATUSES.map((status) => (
            <button
              key={status.value}
              type="button"
              onClick={() => setSelected(status.value)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all',
                selected === status.value
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
              )}
            >
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', selected === status.value ? 'bg-white' : status.color)} />
              {status.label}
              {status.value === currentStatus && <span className="ml-auto text-xs opacity-60">hiện tại</span>}
            </button>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="btn-outline flex-1 rounded-full text-sm">Hủy</button>
          <button type="button" disabled={saving || selected === currentStatus} onClick={() => onSave(orderId, selected)} className="flex-1 rounded-full bg-[#20232A] py-2 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-40">
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}
