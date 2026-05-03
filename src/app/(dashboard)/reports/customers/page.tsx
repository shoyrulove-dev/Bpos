'use client'

import { useState } from 'react'
import { Users, Loader2 } from 'lucide-react'
import { useCustomersReport } from '@/hooks/use-data'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

const DAYS_OPTIONS = [7, 30, 90]

export default function CustomersReportPage() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useCustomersReport({ days })
  const customers = (data?.rows ?? []) as Record<string, unknown>[]
  const summary = data?.summary as Record<string, number> | undefined

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Khách hàng</h1>
          <p className="page-subtitle">{isLoading ? '...' : `${customers.length} khách hàng`}</p>
        </div>
        <div className="flex gap-1">
          {DAYS_OPTIONS.map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={cn('px-3 py-1.5 rounded-lg text-sm font-medium border transition-all', days === d ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50')}>
              {d} ngày
            </button>
          ))}
        </div>
      </div>

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
                        <span className="font-medium text-sm">{String(c.name ?? '—')}</span>
                      </div>
                    </td>
                    <td className="font-mono text-sm text-gray-500">{String(c.phone ?? '—')}</td>
                    <td className="text-sm text-gray-500">{String(c.source ?? '—')}</td>
                    <td className="text-right font-semibold">{Number(c.orderCount ?? 0)}</td>
                    <td className="text-right font-bold text-green-600">{formatCurrency(Number(c.revenue ?? 0))}</td>
                    <td className="text-xs text-gray-400">{c.lastOrderAt ? formatDate(String(c.lastOrderAt), 'dd/MM/yyyy') : '—'}</td>
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

  for (const o of mockOrders) {
    const key = o.customerPhone ?? o.customerName
    if (!map.has(key)) {
      map.set(key, { name: o.customerName, phone: o.customerPhone ?? '', orderCount: 0, totalSpend: 0 })
    }
    const entry = map.get(key)!
    entry.orderCount += 1
    entry.totalSpend += o.total
  }
  const customers = Array.from(map.values()).sort((a, b) => b.totalSpend - a.totalSpend)

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Khách hàng</h1>
          <p className="page-subtitle">{customers.length} khách hàng</p>
        </div>
      </div>
      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Khách hàng</th><th>Số điện thoại</th><th>Số đơn</th><th>Tổng chi tiêu</th></tr>
            </thead>
            <tbody>
              {customers.map((c, i) => (
                <tr key={c.phone}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${i < 3 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}`}>
                        {c.name[0]}
                      </div>
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </td>
                  <td className="font-mono text-sm text-gray-500">{c.phone}</td>
                  <td className="font-semibold">{c.orderCount}</td>
                  <td className="font-semibold text-green-600">{formatCurrency(c.totalSpend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
