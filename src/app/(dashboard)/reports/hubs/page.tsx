'use client'

import { MapPin, Loader2 } from 'lucide-react'
import { useHubsReport } from '@/hooks/use-data'
import { formatCurrency } from '@/lib/utils'
import ReportToolbar from '@/components/reports/ReportToolbar'
import { useReportDateRange } from '@/hooks/use-report-date-range'
import { downloadWorkbook } from '@/lib/excel'

export default function HubsReportPage() {
  const { fromDate, toDate, setFromDate, setToDate, setQuickRange } = useReportDateRange(30)
  const { data, isLoading } = useHubsReport({ fromDate, toDate })
  const rows = (data?.rows ?? []) as Record<string, unknown>[]
  const summary = data?.summary as Record<string, number> | undefined

  const handleExport = () => {
    downloadWorkbook(`bao-cao-cua-hang-${fromDate}-${toDate}`, [{
      name: 'Cua hang',
      rows: rows.map((hub) => ({
        'Cửa hàng': String(hub.name ?? ''),
        'Mã': String(hub.code ?? ''),
        'Gói dịch vụ': String(hub.servicePackage ?? ''),
        'Số đơn': Number(hub.orderCount ?? 0),
        'Doanh thu': Number(hub.revenue ?? 0),
        'Giảm giá': Number(hub.discount ?? 0),
        'Phí nền tảng': Number(hub.platformFee ?? 0),
      })),
    }])
  }

  return (
    <div className="space-y-5">
      <ReportToolbar
        title="Theo cửa hàng"
        subtitle="Doanh thu phân theo cửa hàng"
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
            { label: 'Doanh thu thuần', value: formatCurrency(summary.totalNetRevenue ?? 0) },
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
                <tr><th>Cửa hàng</th><th>Gói dịch vụ</th><th>Thương hiệu</th><th className="text-right">Số đơn</th><th className="text-right">Doanh thu</th><th className="text-right">Giảm giá</th><th className="text-right">Phí nền tảng</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">Không có dữ liệu</td></tr>
                ) : rows.map((hub, i) => (
                  <tr key={String(hub._id ?? i)}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                          <MapPin className="w-3.5 h-3.5 text-blue-500" />
                        </div>
                        <span className="font-medium text-gray-900">{String(hub.name ?? hub._id)}</span>
                      </div>
                    </td>
                    <td><span className="badge badge-blue text-xs">{String(hub.servicePackage ?? '-')}</span></td>
                    <td className="text-sm text-gray-500">{String(hub.brandName ?? '-')}</td>
                    <td className="text-right font-semibold">{Number(hub.orderCount ?? 0).toLocaleString('vi-VN')}</td>
                    <td className="text-right font-semibold">{formatCurrency(Number(hub.revenue ?? 0))}</td>
                    <td className="text-right text-red-500">-{formatCurrency(Number(hub.discount ?? 0))}</td>
                    <td className="text-right text-orange-500">-{formatCurrency(Number(hub.platformFee ?? 0))}</td>
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
