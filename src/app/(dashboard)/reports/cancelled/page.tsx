'use client'

import { mockOrders } from '@/lib/mock-data'
import { cn, formatCurrency, formatDate, CHANNEL_SOURCE_LABEL, CHANNEL_SOURCE_COLOR } from '@/lib/utils'

export default function CancelledReportPage() {
  const cancelled = mockOrders.filter(o => o.status === 'cancelled')

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div><h1 className="page-title">Báo cáo đơn hủy</h1><p className="page-subtitle">{cancelled.length} đơn bị hủy</p></div>
      </div>
      {cancelled.length === 0 ? (
        <div className="empty-state card"><p className="text-gray-400">Không có đơn hủy trong kỳ</p></div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Mã đơn</th><th>Khách hàng</th><th>Nguồn</th><th>Tổng tiền</th><th>Lý do hủy</th><th>Thời gian hủy</th></tr>
              </thead>
              <tbody>
                {cancelled.map(o => (
                  <tr key={o._id}>
                    <td><span className="font-mono text-sm text-red-500">{o.shortId}</span></td>
                    <td className="font-medium">{o.customerName}</td>
                    <td><span className={cn('badge', CHANNEL_SOURCE_COLOR[o.source])}>{CHANNEL_SOURCE_LABEL[o.source]}</span></td>
                    <td className="font-semibold">{formatCurrency(o.total)}</td>
                    <td className="text-sm text-red-500">{o.cancelReason || 'Không rõ'}</td>
                    <td className="text-sm text-gray-500">{o.cancelledAt ? formatDate(o.cancelledAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
