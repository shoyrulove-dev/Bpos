'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search, RefreshCw, Printer, Eye, X, Phone, MapPin, Package, Truck, BellRing, Volume2, ChevronDown, ChevronUp, SlidersHorizontal, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, Loader2 } from 'lucide-react'
import { useOrder, useOrders } from '@/hooks/use-orders-channels'
import { useDebounce } from '@/hooks/use-debounce'
import { cn, formatCurrency, formatDate, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR, CHANNEL_SOURCE_LABEL, CHANNEL_SOURCE_COLOR } from '@/lib/utils'
import {
  buildReceiptPrintUrl,
  DEFAULT_ORDER_ALERT_SETTINGS,
  loadOrderAlertSettings,
  ORDER_ALERT_POLL_INTERVAL_MS,
  ORDER_ALERT_VOICE_MESSAGE,
  persistOrderAlertSettings,
  playOrderAlert,
  PRINTER_MODEL_LABEL,
} from '@/lib/order-alerts'
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

const ALL_STATUSES: { value: string; label: string }[] = [
  { value: '', label: 'Tất cả' },
  { value: 'draft', label: 'Đơn nháp' },
  { value: 'pre_order', label: 'Đặt trước' },
  { value: 'waiting_confirm', label: 'Chờ xác nhận' },
  { value: 'waiting_pickup', label: 'Chờ lấy hàng' },
  { value: 'delivering', label: 'Đang giao' },
  { value: 'completed', label: 'Hoàn thành' },
  { value: 'cancelled', label: 'Đã hủy' },
]

const SOURCES = [
  { value: '', label: 'Tất cả nguồn' },
  { value: 'shopee', label: 'Shopee' },
  { value: 'grab', label: 'GrabFood' },
  { value: 'xanh_sm', label: 'Xanh SM' },
  { value: 'be', label: 'Be' },
]

export default function OrdersPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [showAlertPanel, setShowAlertPanel] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(DEFAULT_ORDER_ALERT_SETTINGS.soundEnabled)
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(DEFAULT_ORDER_ALERT_SETTINGS.autoPrintEnabled)
  const [printerName, setPrinterName] = useState(DEFAULT_ORDER_ALERT_SETTINGS.printerName)
  const [printerPaperSize, setPrinterPaperSize] = useState(DEFAULT_ORDER_ALERT_SETTINGS.printerPaperSize)

  const dq = useDebounce(search)
  const pollingEnabled = page === 1 && !dq && !statusFilter && !sourceFilter
  const { data, isLoading, refetch } = useOrders({
    q: dq,
    status: statusFilter,
    source: sourceFilter,
    page,
    limit: pageSize,
    pollingEnabled,
  })
  const ordersData = data as OrdersResponse | undefined
  const orders: Order[] = ordersData?.orders ?? []
  const filtered = orders
  const { data: selectedOrderData, isLoading: selectedOrderLoading } = useOrder(selectedOrderId ?? '')
  const selectedOrder = (selectedOrderData as Order | undefined) ?? null

  useEffect(() => {
    const settings = loadOrderAlertSettings()
    setSoundEnabled(settings.soundEnabled)
    setAutoPrintEnabled(settings.autoPrintEnabled)
    setPrinterName(settings.printerName)
    setPrinterPaperSize(settings.printerPaperSize)
  }, [])

  useEffect(() => {
    setPage(1)
  }, [dq, statusFilter, sourceFilter, pageSize])

  useEffect(() => {
    const nextTotalPages = Math.max(1, ordersData?.totalPages ?? 1)
    if (page > nextTotalPages) {
      setPage(nextTotalPages)
    }
  }, [ordersData?.totalPages, page])

  // Count per status for tabs
  const countByStatus = useMemo(() => {
    const counts: Record<string, number> = { ...(ordersData?.statusCounts ?? {}) }

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

  const updateAlertSettings = (nextSettings: {
    soundEnabled?: boolean
    autoPrintEnabled?: boolean
    printerName?: string
    printerPaperSize?: typeof DEFAULT_ORDER_ALERT_SETTINGS.printerPaperSize
  }) => {
    const merged = {
      soundEnabled: nextSettings.soundEnabled ?? soundEnabled,
      autoPrintEnabled: nextSettings.autoPrintEnabled ?? autoPrintEnabled,
      printerName: (nextSettings.printerName ?? printerName).trim() || DEFAULT_ORDER_ALERT_SETTINGS.printerName,
      printerPaperSize: nextSettings.printerPaperSize ?? printerPaperSize,
    }

    setSoundEnabled(merged.soundEnabled)
    setAutoPrintEnabled(merged.autoPrintEnabled)
    setPrinterName(merged.printerName)
    setPrinterPaperSize(merged.printerPaperSize)
    persistOrderAlertSettings(merged)
  }

  const handlePrintOrder = (orderId: string) => {
    const printUrl = buildReceiptPrintUrl(orderId, { autoprint: true, paperSize: printerPaperSize })
    window.open(printUrl, '_blank', 'noopener,noreferrer,width=430,height=900')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý đơn hàng</h1>
          <p className="page-subtitle">Tổng hợp đơn từ tất cả kênh bán</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowAlertPanel((prev) => !prev)}
            className={cn('btn-outline', showAlertPanel && 'border-orange-300 bg-orange-50 text-orange-700')}
          >
            <SlidersHorizontal className="w-4 h-4" />
            {showAlertPanel ? 'Ẩn in / âm thanh' : 'In / âm thanh'}
            {showAlertPanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button onClick={() => refetch()} disabled={isLoading} className="btn-outline">
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} /> Làm mới
          </button>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex overflow-x-auto gap-1 pb-1">
        {ALL_STATUSES.map(s => {
          const count = s.value ? (countByStatus[s.value] || 0) : totalOrders
          const active = statusFilter === s.value
          return (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                active
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
              )}
            >
              {s.label}
              <span className={cn(
                'text-xs rounded-full px-1.5 py-0.5 font-semibold',
                active ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="card card-body">
        <div className="filter-bar">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Tìm mã đơn, tên, SĐT..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="input w-40" value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
            {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="border-b border-gray-100 px-4 py-3">
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={ordersData?.total ?? 0}
            totalPages={totalPages}
            currentFrom={currentFrom}
            currentTo={currentTo}
            onPageChange={setPage}
            onPageSizeChange={(nextSize) => setPageSize(nextSize)}
          />
        </div>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Khách hàng</th>
                <th>Thương hiệu / Điểm bán</th>
                <th>Nguồn</th>
                <th>Sản phẩm</th>
                <th>Tổng tiền</th>
                <th>Thời gian đặt</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  Không tìm thấy đơn hàng
                </td></tr>
              ) : filtered.map(order => (
                <tr key={order._id} className="cursor-pointer" onClick={() => setSelectedOrderId(order._id)}>
                  <td>
                    <span className="font-mono text-sm font-semibold text-primary-600">{order.shortId}</span>
                    {order.externalOrderId && (
                      <p className="text-xs text-gray-400 font-mono">{order.externalOrderId}</p>
                    )}
                  </td>
                  <td>
                    <p className="font-medium text-gray-900">{order.customerName}</p>
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Phone className="w-3 h-3" />{order.customerPhone || '-'}
                    </div>
                  </td>
                  <td>
                    <p className="text-sm font-medium text-gray-900">{order.brandName}</p>
                    <p className="text-xs text-gray-400">{order.hubName}</p>
                  </td>
                  <td>
                    <span className={cn('badge', CHANNEL_SOURCE_COLOR[order.source])}>
                      {CHANNEL_SOURCE_LABEL[order.source]}
                    </span>
                  </td>
                  <td>
                    <p className="text-sm text-gray-700">{order.items.length} món</p>
                    <p className="text-xs text-gray-400 line-clamp-1">{order.items.map(i => i.name).join(', ')}</p>
                  </td>
                  <td>
                    <p className="font-semibold text-gray-900">{formatCurrency(order.total)}</p>
                    {order.discount > 0 && (
                      <p className="text-xs text-green-600">-{formatCurrency(order.discount)}</p>
                    )}
                  </td>
                  <td className="text-sm text-gray-500">{formatDate(order.placedAt)}</td>
                  <td>
                    <span className={cn('badge', ORDER_STATUS_COLOR[order.status])}>
                      {ORDER_STATUS_LABEL[order.status]}
                    </span>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setSelectedOrderId(order._id)}
                        className="btn-ghost btn-sm p-1.5" title="Xem chi tiết"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handlePrintOrder(order._id)} className="btn-ghost btn-sm p-1.5" title="In đơn">
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-100 px-4 py-3">
          <PaginationControls
            page={page}
            pageSize={pageSize}
            total={ordersData?.total ?? 0}
            totalPages={totalPages}
            currentFrom={currentFrom}
            currentTo={currentTo}
            onPageChange={setPage}
            onPageSizeChange={(nextSize) => setPageSize(nextSize)}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAlertPanel((prev) => !prev)}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        >
          <div>
            <h2 className="text-base font-semibold text-gray-900">Tự động in và âm thanh đơn mới</h2>
            <p className="text-sm text-gray-500">
              Kiểm tra đơn mới mỗi {ORDER_ALERT_POLL_INTERVAL_MS / 1000} giây. Phần này đang được thu gọn để ưu tiên danh sách đơn.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>{showAlertPanel ? 'Thu gọn' : 'Mở ra'}</span>
            {showAlertPanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showAlertPanel && (
          <div className="border-t border-gray-100 px-5 py-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_320px] xl:items-start">
              <div className="space-y-4">
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => updateAlertSettings({ soundEnabled: !soundEnabled })}
                      className={cn('btn-outline', soundEnabled && 'border-green-300 bg-green-50 text-green-700')}
                    >
                      <BellRing className="w-4 h-4" /> {soundEnabled ? 'Âm thanh bật' : 'Âm thanh tắt'}
                    </button>
                    <button
                      onClick={() => updateAlertSettings({ autoPrintEnabled: !autoPrintEnabled })}
                      className={cn('btn-outline', autoPrintEnabled && 'border-blue-300 bg-blue-50 text-blue-700')}
                    >
                      <Printer className="w-4 h-4" /> {autoPrintEnabled ? 'Tự in bật' : 'Tự in tắt'}
                    </button>
                    <button onClick={() => playOrderAlert(1)} className="btn-outline">
                      <Volume2 className="w-4 h-4" /> Test giọng nói
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_180px_auto]">
                    <label className="form-group">
                      <span className="label">Tên máy in</span>
                      <input
                        className="input"
                        value={printerName}
                        onChange={(event) => setPrinterName(event.target.value)}
                        onBlur={() => updateAlertSettings({ printerName })}
                        placeholder={PRINTER_MODEL_LABEL}
                      />
                    </label>
                    <label className="form-group">
                      <span className="label">Khổ giấy</span>
                      <select
                        className="input"
                        value={printerPaperSize}
                        onChange={(event) => updateAlertSettings({ printerPaperSize: event.target.value as typeof DEFAULT_ORDER_ALERT_SETTINGS.printerPaperSize })}
                      >
                        <option value="80mm">80mm</option>
                        <option value="58mm">58mm</option>
                        <option value="A4">A4</option>
                      </select>
                    </label>
                    <div className="flex items-end">
                      <button onClick={() => updateAlertSettings({ printerName, printerPaperSize })} className="btn-outline w-full md:w-auto">
                        <Printer className="w-4 h-4" /> Lưu máy in
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-orange-950">Lưu ý cần giữ lại</h3>
                  <span className="text-xs text-orange-700">Cuộn ẩn</span>
                </div>
                <div className="max-h-40 space-y-3 overflow-y-auto pr-2 text-sm text-orange-900">
                  <p>
                    BPOS đang ưu tiên phát file âm thanh tiếng Việt đã đóng gói sẵn với câu: “{ORDER_ALERT_VOICE_MESSAGE}”. Khi file này không phát được, hệ thống mới fallback sang voice của trình duyệt.
                  </p>
                  <p>
                    Muốn in thẳng không hiện hộp thoại, máy Windows cần đặt {printerName || PRINTER_MODEL_LABEL} làm default printer và mở Chrome bằng chế độ `--kiosk-printing`.
                  </p>
                  <p>
                    BPOS không tự quét danh sách máy in Windows. Khi đổi máy in, chỉ cần cập nhật tên máy hoặc đặt máy mới làm default printer rồi bấm lưu lại.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Order Detail Modal */}
      {selectedOrderId && (
        <OrderDetailModal order={selectedOrder} isLoading={selectedOrderLoading} onClose={() => setSelectedOrderId(null)} onPrint={handlePrintOrder} />
      )}
    </div>
  )
}

function PaginationControls({
  page,
  pageSize,
  total,
  totalPages,
  currentFrom,
  currentTo,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageSize: (typeof PAGE_SIZE_OPTIONS)[number]
  total: number
  totalPages: number
  currentFrom: number
  currentTo: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: (typeof PAGE_SIZE_OPTIONS)[number]) => void
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
        <span>
          {total > 0 ? `Hiển thị ${currentFrom}-${currentTo} / ${total} đơn` : 'Chưa có đơn hàng'}
        </span>
        <label className="flex items-center gap-2">
          <span>Mỗi trang</span>
          <select
            className="input h-9 w-24 py-1"
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onPageChange(1)} disabled={page <= 1} className="btn-outline btn-sm disabled:opacity-50">
          <ChevronsLeft className="w-4 h-4" /> Đầu
        </button>
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="btn-outline btn-sm disabled:opacity-50">
          <ChevronLeft className="w-4 h-4" /> Trước
        </button>
        <span className="px-2 text-sm font-medium text-gray-700">
          Trang {page} / {totalPages}
        </span>
        <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className="btn-outline btn-sm disabled:opacity-50">
          Sau <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => onPageChange(totalPages)} disabled={page >= totalPages} className="btn-outline btn-sm disabled:opacity-50">
          Cuối <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

function OrderDetailModal({ order, isLoading, onClose, onPrint }: { order: Order | null; isLoading: boolean; onClose: () => void; onPrint: (orderId: string) => void }) {
  if (!order && isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-8">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <h2 className="font-semibold text-gray-900">Chi tiết đơn hàng</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex items-center justify-center gap-3 py-16 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            Đang tải chi tiết đơn hàng...
          </div>
        </div>
      </div>
    )
  }

  if (!order) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Chi tiết đơn hàng</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-sm text-primary-600">{order.shortId}</span>
              <span className={cn('badge', ORDER_STATUS_COLOR[order.status])}>
                {ORDER_STATUS_LABEL[order.status]}
              </span>
              <span className={cn('badge', CHANNEL_SOURCE_COLOR[order.source])}>
                {CHANNEL_SOURCE_LABEL[order.source]}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Info grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Customer */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Khách hàng</p>
              <p className="font-semibold text-gray-900">{order.customerName}</p>
              {order.customerPhone && (
                <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
                  <Phone className="w-3.5 h-3.5" />{order.customerPhone}
                </div>
              )}
            </div>

            {/* Store */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Thương hiệu / Điểm bán</p>
              <p className="font-semibold text-gray-900">{order.brandName}</p>
              <p className="text-sm text-gray-500">{order.hubName}</p>
              <p className="text-sm text-gray-500">{order.channelName}</p>
            </div>
          </div>

          {/* Delivery */}
          {order.deliveryInfo && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Địa chỉ giao hàng</p>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-gray-700">{order.deliveryInfo.address || 'Chưa có địa chỉ'}</p>
              </div>
            </div>
          )}

          {/* Driver */}
          {order.driverInfo?.name && (
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-blue-400 uppercase mb-3">Thông tin tài xế</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{order.driverInfo.name}</p>
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
                    <Phone className="w-3.5 h-3.5" />{order.driverInfo.phone}
                  </div>
                </div>
                {order.driverInfo.vehiclePlate && (
                  <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-1.5">
                    <Truck className="w-4 h-4 text-gray-500" />
                    <span className="font-mono font-semibold text-gray-900">{order.driverInfo.vehiclePlate}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Items */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-3">Sản phẩm</p>
            <div className="space-y-2">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.name}</p>
                    {item.note && <p className="text-xs text-gray-400">{item.note}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{formatCurrency(item.total)}</p>
                    <p className="text-xs text-gray-400">x{item.quantity} × {formatCurrency(item.price)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Tạm tính</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Khuyến mãi</span>
                <span>-{formatCurrency(order.discount)}</span>
              </div>
            )}
            {order.platformFee && order.platformFee > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>Phí sàn</span>
                <span>-{formatCurrency(order.platformFee)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-2 border-t border-gray-200">
              <span>Tổng cộng</span>
              <span className="text-primary-600">{formatCurrency(order.total)}</span>
            </div>
          </div>

          {/* Payment */}
          <div className="flex gap-3">
            <div className="flex-1 bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Phương thức thanh toán</p>
              <p className="font-medium text-gray-900 capitalize">{order.paymentMethod === 'online' ? 'Thanh toán online' : 'Tiền mặt'}</p>
            </div>
            <div className="flex-1 bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-400 mb-1">Thời gian đặt</p>
              <p className="font-medium text-gray-900">{formatDate(order.placedAt)}</p>
            </div>
          </div>

          {order.cancelReason && (
            <div className="bg-red-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-red-400 uppercase mb-1">Lý do hủy</p>
              <p className="text-sm text-red-700">{order.cancelReason}</p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={() => onPrint(order._id)} className="btn-outline btn-sm"><Printer className="w-4 h-4" /> In đơn</button>
          <button className="btn-outline btn-sm"><Printer className="w-4 h-4" /> In tem</button>
          <button onClick={onClose} className="btn-primary btn-sm">Đóng</button>
        </div>
      </div>
    </div>
  )
}
