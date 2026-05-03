'use client'

import { mockOrders } from '@/lib/mock-data'
import { cn, formatCurrency, CHANNEL_SOURCE_LABEL, CHANNEL_SOURCE_COLOR } from '@/lib/utils'
import type { ChannelSource } from '@/types'

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
