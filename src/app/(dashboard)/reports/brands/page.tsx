'use client'

import { Building2, Loader2 } from 'lucide-react'
import { useBrandsReport } from '@/hooks/use-data'
import { cn, formatCurrency } from '@/lib/utils'
import ReportToolbar from '@/components/reports/ReportToolbar'
import { useReportDateRange } from '@/hooks/use-report-date-range'
import { downloadWorkbook } from '@/lib/excel'

export default function BrandsReportPage() {
  const { fromDate, toDate, setFromDate, setToDate, setQuickRange } = useReportDateRange(30)
  const { data, isLoading } = useBrandsReport({ fromDate, toDate })
  const rows = (data?.rows ?? []) as Record<string, unknown>[]
  const summary = data?.summary as Record<string, number> | undefined

  const handleExport = () => {
    downloadWorkbook(`bao-cao-thuong-hieu-${fromDate}-${toDate}`, [{
      name: 'Thuong hieu',
      rows: rows.map((brand) => ({
        'Thương hiệu': String(brand.name ?? ''),
        'Loại': String(brand.type ?? ''),
        'Trạng thái': String(brand.status ?? ''),
        'Số đơn': Number(brand.orderCount ?? 0),
        'Doanh thu': Number(brand.revenue ?? 0),
        'Giảm giá': Number(brand.discount ?? 0),
        'Phí nền tảng': Number(brand.platformFee ?? 0),
        'Doanh thu thuần': Number(brand.netRevenue ?? 0),
      })),
    }])
  }

  return (
    <div className="space-y-5">
      <ReportToolbar
        title="Theo thương hiệu"
        subtitle="Doanh thu phân theo thương hiệu"
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
            { label: 'Tổng doanh thu', value: formatCurrency(summary.totalRevenue ?? 0) },
            { label: 'Tổng giảm giá', value: formatCurrency(summary.totalDiscount ?? 0) },
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
                <tr><th>Thương hiệu</th><th>Loại</th><th>Trạng thái</th><th className="text-right">Số đơn</th><th className="text-right">Doanh thu</th><th className="text-right">Giảm giá</th><th className="text-right">Doanh thu thuần</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">Không có dữ liệu</td></tr>
                ) : rows.map((b, i) => (
                  <tr key={String(b._id ?? i)}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-orange-500" />
                        </div>
                        <span className="font-medium text-gray-900">{String(b.name)}</span>
                      </div>
                    </td>
                    <td className="text-sm text-gray-500">{String(b.type ?? '')}</td>
                    <td><span className={cn('badge', b.status === 'active' ? 'badge-green' : 'badge-gray')}>{b.status === 'active' ? 'Hoạt động' : 'Ngừng'}</span></td>
                    <td className="text-right font-semibold">{Number(b.orderCount ?? 0).toLocaleString('vi-VN')}</td>
                    <td className="text-right font-semibold">{formatCurrency(Number(b.revenue ?? 0))}</td>
                    <td className="text-right text-red-500">-{formatCurrency(Number(b.discount ?? 0))}</td>
                    <td className="text-right font-bold text-green-600">{formatCurrency(Number(b.netRevenue ?? 0))}</td>
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
