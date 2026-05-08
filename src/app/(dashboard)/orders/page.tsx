'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Loader2, MapPin, Phone, Plus, Printer, RefreshCw, Search, SlidersHorizontal, Truck, Volume2 } from 'lucide-react'
import OrderCreateModal from '@/components/orders/OrderCreateModal'
import { useOrders } from '@/hooks/use-orders-channels'
import { useDebounce } from '@/hooks/use-debounce'
import { buildReceiptPrintUrl, DEFAULT_ORDER_ALERT_SETTINGS, loadOrderAlertSettings, persistOrderAlertSettings, playOrderAlert } from '@/lib/order-alerts'
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
  return Math.max(0, order.total - (order.platformFee ?? 0))
}

function getTotalItems(order: Order) {
  return order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
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
  const [showAutoActions, setShowAutoActions] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(DEFAULT_ORDER_ALERT_SETTINGS.soundEnabled)
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(DEFAULT_ORDER_ALERT_SETTINGS.autoPrintEnabled)

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
    const settings = loadOrderAlertSettings()
    setSoundEnabled(settings.soundEnabled)
    setAutoPrintEnabled(settings.autoPrintEnabled)
  }, [])

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

  const toggleSound = () => {
    const nextValue = !soundEnabled
    setSoundEnabled(nextValue)
    persistOrderAlertSettings({ ...loadOrderAlertSettings(), soundEnabled: nextValue, autoPrintEnabled })
  }

  const toggleAutoPrint = () => {
    const nextValue = !autoPrintEnabled
    setAutoPrintEnabled(nextValue)
    persistOrderAlertSettings({ ...loadOrderAlertSettings(), soundEnabled, autoPrintEnabled: nextValue })
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Đơn hàng đa kênh</h1>
          <p className="page-subtitle">Clone cách trình bày Nexpos cho luồng xử lý đơn, nhưng dữ liệu vẫn lấy từ các sàn đang đồng bộ trong BPOS.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowAutoActions((value) => !value)} className="btn-outline">
            <SlidersHorizontal className="h-4 w-4" /> In / âm thanh <ChevronDown className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => refetch()} className="btn-outline" disabled={isRefetching}>
            <RefreshCw className={cn('h-4 w-4', isRefetching && 'animate-spin')} /> Làm mới
          </button>
          <button type="button" onClick={() => setShowCreateModal(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> Tạo đơn hàng
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="card overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-950">Trạng thái đơn hàng</h2>
            </div>
            <div className="space-y-1 p-3">
              {STATUS_ITEMS.map((status) => {
                const count = status.value ? Number(countByStatus[status.value] || 0) : totalOrders
                const active = statusFilter === status.value

                return (
                  <button
                    key={status.value}
                    type="button"
                    onClick={() => setStatusFilter(status.value)}
                    className={cn('flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition', active ? 'bg-amber-50 text-gray-950' : 'text-gray-600 hover:bg-gray-50')}
                  >
                    <span className={cn('h-3 w-3 rounded-full', status.dot)} />
                    <span className="flex-1 font-medium">{status.label}</span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-sm font-semibold text-gray-700">{count}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {showAutoActions && (
            <div className="card space-y-3 p-4">
              <div>
                <h3 className="font-semibold text-gray-950">Tự động in và âm thanh</h3>
                <p className="mt-1 text-sm text-gray-500">Giữ lại phần vận hành nhưng thu gọn để ưu tiên phần đơn hàng.</p>
              </div>
              <button type="button" onClick={toggleSound} className={cn('btn-outline w-full justify-center', soundEnabled && 'border-emerald-300 bg-emerald-50 text-emerald-700')}>
                <Volume2 className="h-4 w-4" /> {soundEnabled ? 'Âm thanh đang bật' : 'Âm thanh đang tắt'}
              </button>
              <button type="button" onClick={toggleAutoPrint} className={cn('btn-outline w-full justify-center', autoPrintEnabled && 'border-sky-300 bg-sky-50 text-sky-700')}>
                <Printer className="h-4 w-4" /> {autoPrintEnabled ? 'Tự in đang bật' : 'Tự in đang tắt'}
              </button>
              <button type="button" onClick={() => playOrderAlert(1)} className="btn-outline w-full justify-center">
                <Volume2 className="h-4 w-4" /> Test âm báo
              </button>
            </div>
          )}
        </aside>

        <section className="space-y-4">
          <div className="card card-body">
            <div className="filter-bar flex-wrap">
              <div className="relative min-w-[260px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input className="input pl-9" placeholder="Tìm mã đơn, tên khách, số điện thoại..." value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
              <select className="input w-44" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                {SOURCES.map((source) => <option key={source.value} value={source.value}>{source.label}</option>)}
              </select>
              <label className="flex min-w-[160px] flex-col gap-1 text-xs font-medium text-gray-500"><span>Từ ngày</span><input type="date" className="input" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
              <label className="flex min-w-[160px] flex-col gap-1 text-xs font-medium text-gray-500"><span>Đến ngày</span><input type="date" className="input" value={toDate} onChange={(event) => setToDate(event.target.value)} max={today} /></label>
              <button type="button" onClick={handleExportOrders} className="btn-outline"><Download className="h-4 w-4" /> Export Excel</button>
            </div>
          </div>

          <div className="card p-4">
            <PaginationControls page={page} pageSize={pageSize} total={ordersData?.total ?? 0} totalPages={totalPages} currentFrom={currentFrom} currentTo={currentTo} onPageChange={setPage} onPageSizeChange={(nextSize) => setPageSize(nextSize)} />
          </div>

          <div className="space-y-4">
            {isLoading ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-[28px] border border-gray-200 bg-white"><div className="flex items-center gap-3 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> Đang tải đơn hàng...</div></div>
            ) : orders.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-gray-300 bg-white px-6 py-20 text-center"><p className="text-lg font-medium text-gray-900">Không tìm thấy đơn hàng</p><p className="mt-2 text-sm text-gray-500">Thử đổi bộ lọc hoặc tạo một đơn nội bộ mới.</p></div>
            ) : orders.map((order) => {
              const totalItems = getTotalItems(order)
              const actualReceived = getActualReceived(order)
              const previewItems = order.items.slice(0, 2).map((item) => item.name).join(' · ')

              return (
                <article key={order._id} className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('badge', CHANNEL_SOURCE_COLOR[order.source])}>{CHANNEL_SOURCE_LABEL[order.source]}</span>
                        <span className="font-mono text-[28px] font-semibold leading-none text-sky-600">#{order.externalOrderId || order.shortId}</span>
                      </div>
                      <p className="mt-2 truncate text-xl text-gray-800">{previewItems || 'Chưa có tên món'} {order.brandName ? `- ${order.brandName}` : ''} {order.hubName ? `- ${order.hubName}` : ''}</p>
                    </div>
                    <span className={cn('badge text-base', ORDER_STATUS_COLOR[order.status])}>{ORDER_STATUS_LABEL[order.status]}</span>
                  </div>

                  <div className="grid gap-5 border-b border-gray-100 py-5 md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Thông tin khách hàng</p>
                      <p className="mt-2 text-2xl font-medium text-gray-900">{order.customerName}</p>
                      <div className="mt-2 flex items-center gap-2 text-lg text-gray-600"><Phone className="h-4 w-4" /> {order.customerPhone || '-'}</div>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Thông tin thanh toán</p>
                      <p className="mt-2 text-lg text-gray-600">Số lượng: {totalItems} sản phẩm</p>
                      <p className="text-lg text-gray-600">Tổng cộng: <span className="font-semibold text-gray-900">{formatCurrency(order.total)}</span></p>
                      <p className="text-lg text-emerald-600">Thực nhận: <span className="font-semibold">{formatCurrency(actualReceived)}</span></p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Thông tin giao nhận</p>
                      <p className="mt-2 text-lg text-gray-600">Đặt lúc: {formatDate(order.placedAt)}</p>
                      <p className="text-lg text-gray-600">Nhận hàng: {order.deliveredAt ? formatDate(order.deliveredAt) : '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Thông tin vận chuyển</p>
                      <div className="mt-2 flex items-start gap-2 text-lg text-gray-600"><Truck className="mt-1 h-4 w-4 flex-shrink-0" /><div><p>Tài xế: {order.driverInfo?.name || '-'}</p><p>SĐT: {order.driverInfo?.phone || '-'}</p></div></div>
                      {order.deliveryInfo?.address && <div className="mt-2 flex items-start gap-2 text-sm text-gray-500"><MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" /><p className="line-clamp-2">{order.deliveryInfo.address}</p></div>}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
                    <Link href={`/orders/${order._id}`} className="inline-flex items-center gap-2 rounded-full bg-[#20232A] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black">Chi tiết</Link>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => openWindow(buildReceiptPrintUrl(order._id, { autoprint: true, paperSize: '80mm' }))} className="btn-outline rounded-full"><Printer className="h-4 w-4" /> In đơn</button>
                      <button type="button" onClick={() => openWindow(buildReceiptPrintUrl(order._id, { autoprint: true, paperSize: '58mm' }))} className="btn-outline rounded-full"><Printer className="h-4 w-4" /> In phiếu tem</button>
                      <button type="button" onClick={() => openWindow(buildReceiptPrintUrl(order._id, { autoprint: false, paperSize: '80mm' }))} className="btn-outline rounded-full"><Printer className="h-4 w-4" /> In đơn qua dialog</button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>

          <div className="card p-4">
            <PaginationControls page={page} pageSize={pageSize} total={ordersData?.total ?? 0} totalPages={totalPages} currentFrom={currentFrom} currentTo={currentTo} onPageChange={setPage} onPageSizeChange={(nextSize) => setPageSize(nextSize)} />
          </div>
        </section>
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
