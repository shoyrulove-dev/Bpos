'use client'

import { Loader2 } from 'lucide-react'
import { useProductsReport } from '@/hooks/use-data'
import { cn, formatCurrency } from '@/lib/utils'
import ReportToolbar from '@/components/reports/ReportToolbar'
import { useReportDateRange } from '@/hooks/use-report-date-range'
import { downloadWorkbook } from '@/lib/excel'

export default function ProductsReportPage() {
  const { fromDate, toDate, setFromDate, setToDate, setQuickRange } = useReportDateRange(30)
  const { data, isLoading } = useProductsReport({ fromDate, toDate })
  const rows = (data?.rows ?? []) as Record<string, unknown>[]
  const summary = data?.summary as Record<string, number> | undefined

  const handleExport = () => {
    downloadWorkbook(`bao-cao-hang-ban-${fromDate}-${toDate}`, [{
      name: 'Hang ban',
      rows: rows.map((product, index) => ({
        'Hạng': index + 1,
        'Sản phẩm': String(product.name ?? ''),
        'Mã': String(product.code ?? ''),
        'Số lượng bán': Number(product.soldQty ?? 0),
        'Doanh thu': Number(product.revenue ?? 0),
      })),
    }])
  }

  return (
    <div className="space-y-5">
      <ReportToolbar
        title="Hàng bán"
        subtitle="Doanh thu theo sản phẩm"
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
            { label: 'Sản phẩm đã bán', value: (summary.totalProducts ?? 0).toLocaleString('vi-VN') },
            { label: 'Tổng số lượng', value: (summary.totalQty ?? 0).toLocaleString('vi-VN') },
            { label: 'Tổng doanh thu', value: formatCurrency(summary.totalRevenue ?? 0) },
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
                <tr><th>Hạng</th><th>Sản phẩm</th><th className="text-right">Số lượng bán</th><th className="text-right">Doanh thu</th><th className="text-right">% Tổng DT</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-gray-400">Không có dữ liệu</td></tr>
                ) : rows.map((p, i) => {
                  const totalRev = summary?.totalRevenue ?? 1
                  const pct = ((Number(p.revenue ?? 0) / totalRev) * 100).toFixed(1)
                  return (
                    <tr key={String(p._id ?? i)}>
                      <td>
                        <span className={cn('font-bold text-sm', i < 3 ? 'text-primary-500' : 'text-gray-400')}>#{i + 1}</span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center text-xs font-bold text-orange-600">
                            {String(p.name ?? '?')[0]}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 text-sm">{String(p.name ?? '-')}</div>
                            <div className="text-xs font-mono text-gray-400">{String(p.code ?? '')}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-right font-semibold">{Number(p.soldQty ?? 0).toLocaleString('vi-VN')}</td>
                      <td className="text-right font-bold text-green-600">{formatCurrency(Number(p.revenue ?? 0))}</td>
                      <td className="text-right text-gray-500 text-sm">{pct}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
