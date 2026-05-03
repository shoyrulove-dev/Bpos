'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useChannelsReport } from '@/hooks/use-data'
import { cn, formatCurrency, CHANNEL_SOURCE_LABEL, CHANNEL_SOURCE_COLOR } from '@/lib/utils'

const DAYS_OPTIONS = [7, 30, 90]

export default function ChannelsReportPage() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useChannelsReport({ days })
  const rows = (data?.rows ?? []) as Record<string, unknown>[]
  const summary = data?.summary as Record<string, number> | undefined

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Theo kênh bán</h1>
          <p className="page-subtitle">Doanh thu phân theo kênh đặt hàng</p>
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
                      <span className={cn('badge', CHANNEL_SOURCE_COLOR[String(row._id)] ?? 'badge-gray')}>
                        {CHANNEL_SOURCE_LABEL[String(row._id)] ?? String(row._id)}
                      </span>
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


export default function ChannelsReportPage() {
  const sources: ChannelSource[] = ['shopee', 'grab', 'xanh_sm', 'be', 'internal', 'other']
  const data = sources.map(src => {
    const srcOrders = mockOrders.filter(o => o.source === src)
    const revenue = srcOrders.reduce((s, o) => s + o.total, 0)
    return { source: src, orderCount: srcOrders.length, revenue }
  }).filter(d => d.orderCount > 0)

  const total = data.reduce((s, d) => s + d.revenue, 0)

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div><h1 className="page-title">Theo kênh bán</h1><p className="page-subtitle">Phân tích đóng góp từng kênh</p></div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.map(d => (
          <div key={d.source} className="card p-5">
            <span className={cn('badge mb-3', CHANNEL_SOURCE_COLOR[d.source])}>{CHANNEL_SOURCE_LABEL[d.source]}</span>
            <p className="text-2xl font-bold text-gray-900">{d.orderCount}</p>
            <p className="text-xs text-gray-400 mb-2">đơn hàng</p>
            <p className="font-semibold text-green-600">{formatCurrency(d.revenue)}</p>
            <div className="h-1.5 bg-gray-100 rounded mt-2">
              <div className="h-full bg-primary-500 rounded" style={{ width: `${total ? (d.revenue / total) * 100 : 0}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">{total ? ((d.revenue / total) * 100).toFixed(1) : 0}% tổng doanh thu</p>
          </div>
        ))}
      </div>
    </div>
  )
}
