'use client'

import { useState } from 'react'
import { Building2, Loader2 } from 'lucide-react'
import { useBrandsReport } from '@/hooks/use-data'
import { cn, formatCurrency } from '@/lib/utils'

const DAYS_OPTIONS = [7, 30, 90]

export default function BrandsReportPage() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useBrandsReport({ days })
  const rows = (data?.rows ?? []) as Record<string, unknown>[]
  const summary = data?.summary as Record<string, number> | undefined

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Theo thÆ°Æ¡ng hiá»‡u</h1>
          <p className="page-subtitle">Doanh thu phÃ¢n theo thÆ°Æ¡ng hiá»‡u</p>
        </div>
        <div className="flex gap-1">
          {DAYS_OPTIONS.map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={cn('px-3 py-1.5 rounded-lg text-sm font-medium border transition-all', days === d ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50')}>
              {d} ngÃ y
            </button>
          ))}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Tá»•ng doanh thu', value: formatCurrency(summary.totalRevenue ?? 0) },
            { label: 'Tá»•ng giáº£m giÃ¡', value: formatCurrency(summary.totalDiscount ?? 0) },
            { label: 'Doanh thu thuáº§n', value: formatCurrency(summary.totalNetRevenue ?? 0) },
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
                <tr><th>ThÆ°Æ¡ng hiá»‡u</th><th>Loáº¡i</th><th>Tráº¡ng thÃ¡i</th><th className="text-right">Sá»‘ Ä‘Æ¡n</th><th className="text-right">Doanh thu</th><th className="text-right">Giáº£m giÃ¡</th><th className="text-right">Doanh thu thuáº§n</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-gray-400">KhÃ´ng cÃ³ dá»¯ liá»‡u</td></tr>
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
                    <td><span className={cn('badge', b.status === 'active' ? 'badge-green' : 'badge-gray')}>{b.status === 'active' ? 'Hoáº¡t Ä‘á»™ng' : 'Ngá»«ng'}</span></td>
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
