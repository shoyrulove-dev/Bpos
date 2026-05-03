'use client'

import { mockOrders } from '@/lib/mock-data'
import { cn, formatCurrency, formatDate, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR, CHANNEL_SOURCE_LABEL, CHANNEL_SOURCE_COLOR } from '@/lib/utils'

export default function OrdersReportPage() {
  const orders = mockOrders

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div><h1 className="page-title">Doanh thu theo đơn hàng</h1><p className="page-subtitle">{orders.length} đơn trong kỳ</p></div>
      </div>
      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Mã đơn</th><th>Khách hàng</th><th>Nguồn</th><th>Tổng tiền</th><th>Giảm giá</th><th>Phí NTT</th><th>Thực nhận</th><th>Ngày đặt</th><th>Trạng thái</th></tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o._id}>
                  <td><span className="font-mono text-sm text-primary-600">{o.shortId}</span></td>
                  <td className="font-medium">{o.customerName}</td>
                  <td><span className={cn('badge', CHANNEL_SOURCE_COLOR[o.source])}>{CHANNEL_SOURCE_LABEL[o.source]}</span></td>
                  <td className="font-semibold">{formatCurrency(o.total)}</td>
                  <td className="text-red-500">-{formatCurrency(o.discount ?? 0)}</td>
                  <td className="text-red-500">-{formatCurrency(o.platformFee ?? 0)}</td>
                  <td className="font-semibold text-green-600">{formatCurrency(o.total - (o.discount ?? 0) - (o.platformFee ?? 0))}</td>
                  <td className="text-sm text-gray-500">{formatDate(o.placedAt, 'dd/MM HH:mm')}</td>
                  <td><span className={cn('badge', ORDER_STATUS_COLOR[o.status])}>{ORDER_STATUS_LABEL[o.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
