'use client'

import { Loader2 } from 'lucide-react'
import { useCancelledReport } from '@/hooks/use-data'
import { cn, formatCurrency, formatDate, CHANNEL_SOURCE_LABEL, CHANNEL_SOURCE_COLOR } from '@/lib/utils'
import ReportToolbar from '@/components/reports/ReportToolbar'
import { useReportDateRange } from '@/hooks/use-report-date-range'
import { downloadWorkbook } from '@/lib/excel'

export default function CancelledReportPage() {
  const { fromDate, toDate, setFromDate, setToDate, setQuickRange } = useReportDateRange(30)
  const { data, isLoading } = useCancelledReport({ fromDate, toDate })
  const rows = (data?.rows ?? []) as Record<string, unknown>[]
  const summary = data?.summary as { totalCancelled?: number; totalLostRevenue?: number; reasons?: { reason: string; count: number }[] } | undefined

  const handleExport = () => {
    downloadWorkbook(`bao-cao-don-huy-${fromDate}-${toDate}`, [{
      name: 'Don huy',
      rows: rows.map((order) => ({
        'Mã đơn': String(order.shortId ?? ''),
        'Khách hàng': String(order.customerName ?? ''),
        'Kênh': CHANNEL_SOURCE_LABEL[String(order.source)] ?? String(order.source ?? ''),
        'Tổng tiền': Number(order.total ?? 0),
        'Lý do hủy': String(order.cancelReason ?? ''),
        'Thời gian hủy': order.cancelledAt ? formatDate(String(order.cancelledAt), 'dd/MM/yyyy HH:mm') : '',
      })),
    }])
  }

  return (
    <div className="space-y-5">
      <ReportToolbar
        title="Báo cáo đơn hủy"
        subtitle={isLoading ? 'Đang tải đơn hủy' : `${rows.length} đơn bị hủy`}
        fromDate={fromDate}
        toDate={toDate}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onQuickRangeChange={setQuickRange}
        onExport={handleExport}
      />

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-sm text-gray-500">Tổng đơn hủy</div>
          <div className="text-2xl font-bold text-red-500 mt-1">{(summary?.totalCancelled ?? 0).toLocaleString('vi-VN')}</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-gray-500">Doanh thu bị mất</div>
          <div className="text-2xl font-bold text-red-500 mt-1">{formatCurrency(summary?.totalLostRevenue ?? 0)}</div>
        </div>
        {summary?.reasons && summary.reasons.length > 0 && (
          <div className="card p-5">
            <div className="text-sm text-gray-500 mb-2">Lý do hủy phổ biến</div>
            <div className="space-y-1">
              {summary.reasons.slice(0, 3).map(r => (
                <div key={r.reason} className="flex justify-between text-xs">
                  <span className="text-gray-600 truncate max-w-[120px]">{r.reason || 'Không rõ'}</span>
                  <span className="font-semibold text-red-500">{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-primary-400" /></div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Mã đơn</th><th>Khách hàng</th><th>Kênh</th><th className="text-right">Tổng tiền</th><th>Lý do hủy</th><th>Thời gian hủy</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400">Không có đơn hủy nào</td></tr>
                ) : rows.map((o, i) => (
                  <tr key={String(o._id ?? i)}>
                    <td><span className="font-mono text-sm text-red-500">{String(o.shortId ?? '')}</span></td>
                    <td className="font-medium text-sm">{String(o.customerName ?? '-')}</td>
                    <td><span className={cn('badge text-xs', CHANNEL_SOURCE_COLOR[String(o.source)] ?? 'badge-gray')}>{CHANNEL_SOURCE_LABEL[String(o.source)] ?? String(o.source)}</span></td>
                    <td className="text-right font-semibold">{formatCurrency(Number(o.total ?? 0))}</td>
                    <td className="text-sm text-red-500">{String(o.cancelReason ?? 'Không rõ')}</td>
                    <td className="text-xs text-gray-400">{o.cancelledAt ? formatDate(String(o.cancelledAt), 'dd/MM HH:mm') : '-'}</td>
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
