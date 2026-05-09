'use client'

import { Loader2 } from 'lucide-react'
import { useCustomersReport } from '@/hooks/use-data'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import ReportToolbar from '@/components/reports/ReportToolbar'
import { useReportDateRange } from '@/hooks/use-report-date-range'
import { downloadWorkbook } from '@/lib/excel'

export default function CustomersReportPage() {
  const { fromDate, toDate, setFromDate, setToDate, setQuickRange } = useReportDateRange(30)
  const { data, isLoading } = useCustomersReport({ fromDate, toDate })
  const customers = (data?.rows ?? []) as Record<string, unknown>[]
  const summary = data?.summary as Record<string, number> | undefined

  const handleExport = () => {
    downloadWorkbook(`bao-cao-khach-hang-${fromDate}-${toDate}`, [{
      name: 'Khách hàng',
      rows: customers.map((customer, index) => ({
        'Hạng': index + 1,
        'Khách hàng': String(customer.name ?? ''),
        'Số điện thoại': String(customer.phone ?? ''),
        'Nguồn': String(customer.source ?? ''),
        'Số đơn': Number(customer.orderCount ?? 0),
        'Tổng chi tiêu': Number(customer.revenue ?? 0),
        'Đơn cuối': customer.lastOrderAt ? formatDate(String(customer.lastOrderAt), 'dd/MM/yyyy') : '',
      })),
    }])
  }

  return (
    <div className="space-y-5">
      <ReportToolbar
        title="Khách hàng"
        subtitle={isLoading ? 'Đang tải dữ liệu khách hàng' : `${customers.length} khách hàng`}
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
            { label: 'Tổng khách hàng', value: (summary.totalCustomers ?? 0).toLocaleString('vi-VN') },
            { label: 'Giá trị TB / đơn', value: formatCurrency(summary.avgOrderValue ?? 0) },
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
                <tr><th>Hạng</th><th>Khách hàng</th><th>Số điện thoại</th><th>Nguồn</th><th className="text-right">Số đơn</th><th className="text-right">Tổng chi tiêu</th><th>Đơn cuối</th></tr>
              </thead>
              <tbody>
                {customers.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">Không có dữ liệu</td></tr>
                ) : customers.map((c, i) => (
                  <tr key={String(c.phone ?? i)}>
                    <td>
                      <span className={cn('font-bold text-sm', i < 3 ? 'text-primary-500' : 'text-gray-400')}>#{i + 1}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold', i < 3 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500')}>
                          {String(c.name ?? '?')[0]}
                        </div>
                        <span className="font-medium text-sm">{String(c.name ?? '-')}</span>
                      </div>
                    </td>
                    <td className="font-mono text-sm text-gray-500">{String(c.phone ?? '-')}</td>
                    <td className="text-sm text-gray-500">{String(c.source ?? '-')}</td>
                    <td className="text-right font-semibold">{Number(c.orderCount ?? 0)}</td>
                    <td className="text-right font-bold text-green-600">{formatCurrency(Number(c.revenue ?? 0))}</td>
                    <td className="text-xs text-gray-400">{c.lastOrderAt ? formatDate(String(c.lastOrderAt), 'dd/MM/yyyy') : '-'}</td>
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
