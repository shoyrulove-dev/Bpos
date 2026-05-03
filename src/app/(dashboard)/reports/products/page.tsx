'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useProductsReport } from '@/hooks/use-data'
import { cn, formatCurrency } from '@/lib/utils'

const DAYS_OPTIONS = [7, 30, 90]

export default function ProductsReportPage() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useProductsReport({ days })
  const rows = (data?.rows ?? []) as Record<string, unknown>[]
  const summary = data?.summary as Record<string, number> | undefined

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Hàng bán</h1>
          <p className="page-subtitle">Doanh thu theo sản phẩm</p>
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
                            <div className="font-medium text-gray-900 text-sm">{String(p.name ?? '—')}</div>
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


  return (
    <div className="space-y-5">
      <div className="page-header">
        <div><h1 className="page-title">Hàng bán</h1><p className="page-subtitle">Doanh thu theo sản phẩm</p></div>
      </div>
      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Hạng</th><th>Sản phẩm</th><th>Danh mục</th><th>Đơn giá</th><th>Số lượng bán</th><th>Doanh thu</th></tr>
            </thead>
            <tbody>
              {data.map((p, i) => (
                <tr key={p._id}>
                  <td>
                    <span className={`font-bold text-sm ${i < 3 ? 'text-primary-500' : 'text-gray-400'}`}>#{i + 1}</span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center text-xs font-bold text-orange-600">
                        {p.name[0]}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{p.name}</p>
                        <p className="text-xs font-mono text-gray-400">{p.code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-sm text-gray-500">{p.category}</td>
                  <td>{formatCurrency(p.price ?? 0)}</td>
                  <td className="font-semibold">{p.soldQty.toLocaleString()}</td>
                  <td className="font-semibold text-green-600">{formatCurrency(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
