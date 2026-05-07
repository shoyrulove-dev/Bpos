'use client'

import { Loader2 } from 'lucide-react'
import { useOrdersReport } from '@/hooks/use-data'
import { cn, formatCurrency, formatDate, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR, CHANNEL_SOURCE_LABEL, CHANNEL_SOURCE_COLOR } from '@/lib/utils'
import ReportToolbar from '@/components/reports/ReportToolbar'
import { useReportDateRange } from '@/hooks/use-report-date-range'
import { downloadWorkbook } from '@/lib/excel'

export default function OrdersReportPage() {
  const { fromDate, toDate, setFromDate, setToDate, setQuickRange } = useReportDateRange(30)
  const { data, isLoading } = useOrdersReport({ fromDate, toDate })
  const orders = (data?.rows ?? []) as Record<string, unknown>[]
  const summary = data?.summary as Record<string, number> | undefined

  const handleExport = () => {
    downloadWorkbook(`bao-cao-don-hang-${fromDate}-${toDate}`, [{
      name: 'Don hang',
      rows: orders.map((order) => ({
        'Mã đơn': String(order.shortId ?? ''),
        'Khách hàng': String(order.customerName ?? ''),
        'Kênh': CHANNEL_SOURCE_LABEL[String(order.source)] ?? String(order.source ?? ''),
        'Thương hiệu': String(order.brandName ?? ''),
        'Tổng tiền': Number(order.total ?? 0),
        'Giảm giá': Number(order.discount ?? 0),
        'Phí nền tảng': Number(order.platformFee ?? 0),
        'Ngày đặt': order.placedAt ? formatDate(String(order.placedAt), 'dd/MM/yyyy HH:mm') : '',
        'Trạng thái': ORDER_STATUS_LABEL[String(order.status)] ?? String(order.status ?? ''),
      })),
    }])
  }

  return (
    <div className="space-y-5">
      <ReportToolbar
        title="Doanh thu theo đơn hàng"
        subtitle={isLoading ? 'Đang tải dữ liệu đơn hàng' : `${orders.length} đơn trong kỳ`}
        fromDate={fromDate}
        toDate={toDate}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onQuickRangeChange={setQuickRange}
        onExport={handleExport}
      />

      {summary && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Tổng đơn', value: (summary.totalOrders ?? 0).toLocaleString('vi-VN') },
            { label: 'Tổng doanh thu', value: formatCurrency(summary.revenue ?? 0) },
            { label: 'Giảm giá', value: formatCurrency(summary.discount ?? 0) },
            { label: 'Phí nền tảng', value: formatCurrency(summary.platformFee ?? 0) },
          ].map(item => (
            <div key={item.label} className="card p-5">
              <div className="text-sm text-gray-500">{item.label}</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{item.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-primary-400" /></div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Mã đơn</th><th>Khách hàng</th><th>Kênh</th><th>Thương hiệu</th><th className="text-right">Tổng tiền</th><th className="text-right">Giảm giá</th><th className="text-right">Phí nền tảng</th><th>Ngày đặt</th><th>Trạng thái</th></tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-400">Không có dữ liệu</td></tr>
                ) : orders.map((o, i) => (
                  <tr key={String(o._id ?? i)}>
                    <td><span className="font-mono text-sm text-primary-600">{String(o.shortId ?? '')}</span></td>
                    <td className="font-medium text-sm">{String(o.customerName ?? '-')}</td>
                    <td><span className={cn('badge text-xs', CHANNEL_SOURCE_COLOR[String(o.source)] ?? 'badge-gray')}>{CHANNEL_SOURCE_LABEL[String(o.source)] ?? String(o.source)}</span></td>
                    <td className="text-sm text-gray-500">{String(o.brandName ?? '-')}</td>
                    <td className="text-right font-semibold">{formatCurrency(Number(o.total ?? 0))}</td>
                    <td className="text-right text-red-500">-{formatCurrency(Number(o.discount ?? 0))}</td>
                    <td className="text-right text-orange-500">-{formatCurrency(Number(o.platformFee ?? 0))}</td>
                    <td className="text-xs text-gray-500">{o.placedAt ? formatDate(String(o.placedAt), 'dd/MM HH:mm') : '-'}</td>
                    <td><span className={cn('badge text-xs', ORDER_STATUS_COLOR[String(o.status)] ?? 'badge-gray')}>{ORDER_STATUS_LABEL[String(o.status)] ?? String(o.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
