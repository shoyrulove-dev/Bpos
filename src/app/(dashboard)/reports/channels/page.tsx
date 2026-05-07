'use client'

import { Loader2 } from 'lucide-react'
import { useChannelsReport } from '@/hooks/use-data'
import { cn, formatCurrency, CHANNEL_SOURCE_LABEL, CHANNEL_SOURCE_COLOR } from '@/lib/utils'
import ReportToolbar from '@/components/reports/ReportToolbar'
import { useReportDateRange } from '@/hooks/use-report-date-range'
import { downloadWorkbook } from '@/lib/excel'

export default function ChannelsReportPage() {
  const { fromDate, toDate, setFromDate, setToDate, setQuickRange } = useReportDateRange(30)
  const { data, isLoading } = useChannelsReport({ fromDate, toDate })
  const rows = (data?.rows ?? []) as Record<string, unknown>[]
  const summary = data?.summary as Record<string, number> | undefined

  const handleExport = () => {
    downloadWorkbook(`bao-cao-kenh-ban-${fromDate}-${toDate}`, [{
      name: 'Kenh ban',
      rows: rows.map((row) => ({
        'Kênh bán': String(row.name ?? ''),
        'Nguồn': CHANNEL_SOURCE_LABEL[String(row.source)] ?? String(row.source ?? ''),
        'Số đơn': Number(row.orderCount ?? 0),
        'Doanh thu': Number(row.revenue ?? 0),
        'Giảm giá': Number(row.discount ?? 0),
        'Phí nền tảng': Number(row.platformFee ?? 0),
        'Doanh thu thuần': Number(row.netRevenue ?? 0),
      })),
    }])
  }

  return (
    <div className="space-y-5">
      <ReportToolbar
        title="Theo kênh bán"
        subtitle="Doanh thu phân theo kênh đặt hàng"
        fromDate={fromDate}
        toDate={toDate}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onQuickRangeChange={setQuickRange}
        onExport={handleExport}
      />

      {summary && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Tổng đơn hàng', value: (summary.totalOrders ?? 0).toLocaleString('vi-VN') },
            { label: 'Tổng doanh thu', value: formatCurrency(summary.totalRevenue ?? 0) },
            { label: 'Phí nền tảng', value: formatCurrency(summary.totalPlatformFee ?? 0) },
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
                <tr><th>Kênh bán</th><th className="text-right">Số đơn</th><th className="text-right">Tổng tiền</th><th className="text-right">Giảm giá</th><th className="text-right">Phí nền tảng</th><th className="text-right">Doanh thu thuần</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400">Không có dữ liệu</td></tr>
                ) : rows.map((row, i) => (
                  <tr key={String(row._id ?? i)}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{String(row.name ?? '-')}</span>
                        <span className={cn('badge', CHANNEL_SOURCE_COLOR[String(row.source)] ?? 'badge-gray')}>
                          {CHANNEL_SOURCE_LABEL[String(row.source)] ?? String(row.source ?? '')}
                        </span>
                      </div>
                    </td>
                    <td className="text-right font-semibold">{Number(row.orderCount ?? 0).toLocaleString('vi-VN')}</td>
                    <td className="text-right">{formatCurrency(Number(row.revenue ?? 0))}</td>
                    <td className="text-right text-red-500">-{formatCurrency(Number(row.discount ?? 0))}</td>
                    <td className="text-right text-orange-500">-{formatCurrency(Number(row.platformFee ?? 0))}</td>
                    <td className="text-right font-bold text-green-600">{formatCurrency(Number(row.netRevenue ?? 0))}</td>
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
