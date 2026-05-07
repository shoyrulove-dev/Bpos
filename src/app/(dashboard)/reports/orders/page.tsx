'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useOrdersReport } from '@/hooks/use-data'
import { cn, formatCurrency, formatDate, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR, CHANNEL_SOURCE_LABEL, CHANNEL_SOURCE_COLOR } from '@/lib/utils'

const DAYS_OPTIONS = [7, 30, 90]

export default function OrdersReportPage() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useOrdersReport({ days })
  const orders = (data?.rows ?? []) as Record<string, unknown>[]
  const summary = data?.summary as Record<string, number> | undefined

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Doanh thu theo đơn hàng</h1>
          <p className="page-subtitle">{isLoading ? '...' : `${orders.length} đơn trong kỳ`}</p>
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
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Tổng đơn', value: (summary.totalOrders ?? 0).toLocaleString('vi-VN') },
            { label: 'Tổng doanh thu', value: formatCurrency(summary.revenue ?? 0) },
            { label: 'Giảm giá', value: formatCurrency(summary.discount ?? 0) },
            { label: 'Phí nền tảng', value: formatCurrency(summary.platformFee ?? 0) },
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
                <tr><th>Mã đơn</th><th>Khách hàng</th><th>Kênh</th><th>Thương hiệu</th><th className="text-right">Tổng tiền</th><th className="text-right">Giảm giá</th><th className="text-right">Phí nền tảng</th><th>Ngày đặt</th><th>Trạng thái</th></tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-400">Không có dữ liệu</td></tr>
                ) : orders.map((o, i) => (
                  <tr key={String(o._id ?? i)}>
                    <td><span className="font-mono text-sm text-primary-600">{String(o.shortId ?? '')}</span></td>
                    <td className="font-medium text-sm">{String(o.customerName ?? '-')}</td>
                    <td><span className={cn('badge text-xs', CHANNEL_SOURCE_COLOR[String(o.source)] ?? 'badge-gray')}>{CHANNEL_SOURCE_LABEL[String(o.source)] ?? String(o.source)}</span></td>
                    <td className="text-sm text-gray-500">{String(o.brandName ?? '-')}</td>
                    <td className="text-right font-semibold">{formatCurrency(Number(o.total ?? 0))}</td>
                    <td className="text-right text-red-500">-{formatCurrency(Number(o.discount ?? 0))}</td>
                    <td className="text-right text-orange-500">-{formatCurrency(Number(o.platformFee ?? 0))}</td>
                    <td className="text-xs text-gray-500">{o.placedAt ? formatDate(String(o.placedAt), 'dd/MM HH:mm') : '-'}</td>
                    <td><span className={cn('badge text-xs', ORDER_STATUS_COLOR[String(o.status)] ?? 'badge-gray')}>{ORDER_STATUS_LABEL[String(o.status)] ?? String(o.status)}</span></td>
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
