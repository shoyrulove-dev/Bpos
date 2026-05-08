'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Loader2, MapPin, Phone, Plus, Printer, RefreshCw, Search, Settings2, Truck } from 'lucide-react'
import OrderCreateModal from '@/components/orders/OrderCreateModal'
import { useOrders } from '@/hooks/use-orders-channels'
import { useDebounce } from '@/hooks/use-debounce'
import { buildReceiptPrintUrl } from '@/lib/order-alerts'
import { formatDateInput } from '@/lib/date-range'
import { CHANNEL_SOURCE_COLOR, CHANNEL_SOURCE_LABEL, cn, formatCurrency, formatDate, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL } from '@/lib/utils'
import type { Order } from '@/types'

const PAGE_SIZE_OPTIONS = [10, 30, 50, 100, 200, 500] as const

type OrdersResponse = {
  orders: Order[]
  total: number
  page: number
  limit: number
  totalPages: number
  statusCounts?: Record<string, number>
}

const STATUS_ITEMS = [
  { value: '', label: 'Tất cả', dot: 'bg-teal-500' },
  { value: 'draft', label: 'Đơn nháp', dot: 'bg-gray-300' },
  { value: 'pre_order', label: 'Đơn đặt trước', dot: 'bg-blue-500' },
  { value: 'waiting_confirm', label: 'Chờ xác nhận', dot: 'bg-yellow-400' },
  { value: 'waiting_pickup', label: 'Chờ lấy hàng', dot: 'bg-orange-400' },
  { value: 'delivering', label: 'Đang giao', dot: 'bg-indigo-400' },
  { value: 'completed', label: 'Hoàn thành', dot: 'bg-emerald-500' },
  { value: 'cancelled', label: 'Đã hủy', dot: 'bg-rose-400' },
] as const

const SOURCES = [
  { value: '', label: 'Tất cả nguồn' },
  { value: 'shopee', label: 'Shopee' },
  { value: 'grab', label: 'GrabFood' },
  { value: 'xanh_sm', label: 'Xanh SM' },
  { value: 'be', label: 'Be' },
  { value: 'internal', label: 'Nội bộ' },
]

function openWindow(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer,width=430,height=900')
}

function getActualReceived(order: Order) {
  const raw = order.rawPayload ?? {}
  const candidateValues = [
    raw.escrow_amount,
    raw.received_amount,
    raw.actual_received_amount,
    raw.net_order_amount,
    raw.amount_receive,
    raw.merchant_receivable,
  ]

  for (const value of candidateValues) {
    const amount = Number(value)
    if (Number.isFinite(amount) && amount > 0) return amount
  }

  return Math.max(0, order.total - (order.platformFee ?? 0))
}

function getTotalItems(order: Order) {
  return order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
}

function isOrderNew(order: Order) {
  if (order.status === 'completed' || order.status === 'cancelled') return false
  const placedAt = new Date(order.placedAt).getTime()
  if (!Number.isFinite(placedAt)) return false
  return Date.now() - placedAt <= 30 * 60 * 1000
}

function SourceIcon({ source }: { source: Order['source'] }) {
  const labelMap: Record<Order['source'], string> = {
    shopee: 'S',
    grab: 'G',
    xanh_sm: 'X',
    be: 'be',
    internal: 'POS',
    other: '?',
  }

  return <span className="text-[10px] font-black uppercase tracking-[0.08em]">{labelMap[source]}</span>
}

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

  const dq = useDebounce(search)
  const pollingEnabled = page === 1 && !dq && !statusFilter && !sourceFilter
  const { data, isLoading, refetch, isRefetching } = useOrders({
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
  const orders: Order[] = ordersData?.orders ?? []

  useEffect(() => {
    setPage(1)
  }, [dq, statusFilter, sourceFilter, fromDate, toDate, pageSize])

  useEffect(() => {
    const nextTotalPages = Math.max(1, ordersData?.totalPages ?? 1)
    if (page > nextTotalPages) setPage(nextTotalPages)
  }, [ordersData?.totalPages, page])

  const countByStatus = useMemo(() => {
    const counts = { ...(ordersData?.statusCounts ?? {}) }
    if (statusFilter && typeof counts[statusFilter] !== 'number') {
      counts[statusFilter] = ordersData?.total ?? 0
    }
    return counts
  }, [ordersData?.statusCounts, ordersData?.total, statusFilter])

  const totalOrders = useMemo(() => {
    const sum = Object.values(countByStatus).reduce((acc, value) => acc + Number(value || 0), 0)
    return sum || ordersData?.total || 0
  }, [countByStatus, ordersData?.total])

  const totalPages = Math.max(1, ordersData?.totalPages ?? 1)
  const currentFrom = ordersData?.total ? (page - 1) * pageSize + 1 : 0
  const currentTo = ordersData?.total ? Math.min(page * pageSize, ordersData.total) : 0

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
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Đơn hàng đa kênh</h1>
          <p className="page-subtitle">Clone cách trình bày Nexpos cho luồng xử lý đơn, nhưng dữ liệu vẫn lấy từ các sàn đang đồng bộ trong BPOS.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/settings" className="btn-outline">
            <Settings2 className="h-4 w-4" /> Cài đặt in / âm thanh
          </Link>
          <button type="button" onClick={() => refetch()} className="btn-outline" disabled={isRefetching}>
            <RefreshCw className={cn('h-4 w-4', isRefetching && 'animate-spin')} /> Làm mới
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="card p-4 xl:sticky xl:top-24 xl:self-start">
          <button type="button" onClick={() => setShowCreateModal(true)} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#20232A] px-4 py-3 text-sm font-semibold text-white transition hover:bg-black">
            <Plus className="h-4 w-4" /> Tạo đơn hàng
          </button>
          <div className="mt-5 space-y-2">
            <h2 className="text-[28px] font-semibold leading-none text-gray-900">Trạng thái đơn hàng</h2>
            {STATUS_ITEMS.map((status) => {
              const count = status.value ? Number(countByStatus[status.value] || 0) : totalOrders
              const active = statusFilter === status.value
              return (
                <button
                  key={status.value}
                  type="button"
                  onClick={() => setStatusFilter(status.value)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-2xl px-4 py-4 text-left text-sm font-medium transition-all',
                    active ? 'bg-amber-50 text-gray-950 ring-1 ring-amber-200' : 'text-gray-700 hover:bg-gray-50',
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span className={cn('h-3 w-3 rounded-full', status.dot)} />
                    {status.label}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700">{count}</span>
                </button>
              )
            })}
          </div>
        </aside>

        <div className="space-y-4 min-w-0">
          <div className="card p-4">
            <div className="grid gap-2 xl:grid-cols-[minmax(0,1.8fr)_170px_170px_170px_auto]">
              <div className="relative min-w-0">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input className="input h-11 pl-9" placeholder="Tìm mã đơn, tên khách, số điện thoại..." value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <select className="input h-11 w-full" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                {SOURCES.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
              </select>
              <input type="date" className="input h-11 w-full" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              <input type="date" className="input h-11 w-full" value={toDate} onChange={(event) => setToDate(event.target.value)} max={today} />
              <button type="button" onClick={handleExportOrders} className="btn-outline h-11 justify-center whitespace-nowrap"><Download className="h-4 w-4" /> Export</button>
            </div>
          </div>

          <div className="space-y-4">
            {isLoading ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-[28px] border border-gray-200 bg-white"><div className="flex items-center gap-3 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> Đang tải đơn hàng...</div></div>
            ) : orders.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-gray-300 bg-white px-6 py-20 text-center"><p className="text-lg font-medium text-gray-900">Không tìm thấy đơn hàng</p><p className="mt-2 text-sm text-gray-500">Thử đổi bộ lọc hoặc tạo một đơn nội bộ mới.</p></div>
            ) : orders.map((order) => {
              const totalItems = getTotalItems(order)
              const actualReceived = getActualReceived(order)
              const locationLabel = [order.brandName, order.hubName].filter(Boolean).join(' - ')
              const showNewBadge = isOrderNew(order)

              return (
                <article key={order._id} className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
                  {/* Header row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3 mb-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full', CHANNEL_SOURCE_COLOR[order.source])} aria-label={CHANNEL_SOURCE_LABEL[order.source]}>
                        <SourceIcon source={order.source} />
                      </span>
                      {showNewBadge && <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-rose-600">New</span>}
                      {locationLabel && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">{locationLabel}</span>}
                      <span className="font-mono text-base font-semibold text-sky-600">#{order.externalOrderId || order.shortId}</span>
                    </div>
                    <span className={cn('badge shrink-0', ORDER_STATUS_COLOR[order.status])}>{ORDER_STATUS_LABEL[order.status]}</span>
                  </div>

                  {/* Info columns */}
                  <div className="grid gap-x-6 gap-y-3 lg:grid-cols-4">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">Thông tin khách hàng</p>
                      <p className="text-sm font-medium text-gray-900">{order.customerName || '–'}</p>
                      <div className="flex items-center gap-1 text-sm text-gray-600"><Phone className="h-3.5 w-3.5" /> {order.customerPhone || '–'}</div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">Thông tin thanh toán</p>
                      <p className="text-sm text-gray-600">Số lượng: {totalItems} sản phẩm</p>
                      <p className="text-sm text-gray-600">Tổng cộng: <span className="font-semibold text-gray-900">{formatCurrency(order.total)}</span></p>
                      <p className="text-sm text-emerald-600">Thực nhận: <span className="font-semibold">{formatCurrency(actualReceived)}</span></p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">Thông tin giao nhận</p>
                      <p className="text-sm text-gray-600">Đặt lúc: {formatDate(order.placedAt)}</p>
                      <p className="text-sm text-gray-600">Nhận hàng: {order.deliveredAt ? formatDate(order.deliveredAt) : '–'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">Thông tin vận chuyển</p>
                      <div className="flex items-start gap-1.5 text-sm text-gray-600"><Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" /><div><p>Tài xế: {order.driverInfo?.name || '–'}</p><p>SĐT: {order.driverInfo?.phone || '–'}</p></div></div>
                      {order.deliveryInfo?.address && <div className="flex items-start gap-1.5 text-xs text-gray-500 mt-1"><MapPin className="mt-0.5 h-3 w-3 shrink-0" /><p className="line-clamp-1">{order.deliveryInfo.address}</p></div>}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 mt-3">
                    <Link href={`/orders/${order._id}`} className="inline-flex items-center gap-2 rounded-full bg-[#20232A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-black">Chi tiết</Link>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => openWindow(buildReceiptPrintUrl(order._id, { autoprint: true, paperSize: '80mm' }))} className="btn-outline rounded-full text-sm"><Printer className="h-3.5 w-3.5" /> In Đơn</button>
                      <button type="button" onClick={() => openWindow(buildReceiptPrintUrl(order._id, { autoprint: true, paperSize: '58mm' }))} className="btn-outline rounded-full text-sm"><Printer className="h-3.5 w-3.5" /> In phiếu tem</button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          <div className="card p-4">
            <PaginationControls page={page} pageSize={pageSize} total={ordersData?.total ?? 0} totalPages={totalPages} currentFrom={currentFrom} currentTo={currentTo} onPageChange={setPage} onPageSizeChange={(nextSize) => setPageSize(nextSize)} />
          </div>
        </div>
      </div>

      <OrderCreateModal open={showCreateModal} onClose={() => setShowCreateModal(false)} />
    </div>
  )
}

function PaginationControls({ page, pageSize, total, totalPages, currentFrom, currentTo, onPageChange, onPageSizeChange }: { page: number; pageSize: (typeof PAGE_SIZE_OPTIONS)[number]; total: number; totalPages: number; currentFrom: number; currentTo: number; onPageChange: (page: number) => void; onPageSizeChange: (size: (typeof PAGE_SIZE_OPTIONS)[number]) => void }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
        <span>{total > 0 ? `Hiển thị ${currentFrom}-${currentTo} / ${total} đơn` : 'Chưa có đơn hàng'}</span>
        <label className="flex items-center gap-2"><span>Mỗi trang</span><select className="input h-9 w-24 py-1" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])}>{PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onPageChange(1)} disabled={page <= 1} className="btn-outline btn-sm disabled:opacity-50"><ChevronsLeft className="h-4 w-4" /> Đầu</button>
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="btn-outline btn-sm disabled:opacity-50"><ChevronLeft className="h-4 w-4" /> Trước</button>
        <span className="px-2 text-sm font-medium text-gray-700">Trang {page} / {totalPages}</span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className="btn-outline btn-sm disabled:opacity-50">Sau <ChevronRight className="h-4 w-4" /></button>
        <button onClick={() => onPageChange(totalPages)} disabled={page >= totalPages} className="btn-outline btn-sm disabled:opacity-50">Cuối <ChevronsRight className="h-4 w-4" /></button>
      </div>
    </div>
  )
}
