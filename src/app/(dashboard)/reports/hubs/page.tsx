'use client'

import { useState } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { useHubsReport } from '@/hooks/use-data'
import { cn, formatCurrency } from '@/lib/utils'

const DAYS_OPTIONS = [7, 30, 90]

export default function HubsReportPage() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useHubsReport({ days })
  const rows = (data?.rows ?? []) as Record<string, unknown>[]
  const summary = data?.summary as Record<string, number> | undefined

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Theo cửa hàng</h1>
          <p className="page-subtitle">Doanh thu phân theo cửa hàng</p>
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
