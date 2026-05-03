'use client'

import { mockHubs, mockOrders } from '@/lib/mock-data'
import { formatCurrency } from '@/lib/utils'
import { MapPin } from 'lucide-react'

export default function HubsReportPage() {
  const data = mockHubs.map(hub => {
    const hubOrders = mockOrders.filter(o => o.hubId === hub._id)
    const revenue = hubOrders.reduce((sum, o) => sum + o.total, 0)
    return { ...hub, orderCount: hubOrders.length, revenue }
  })

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div><h1 className="page-title">Theo điểm bán</h1><p className="page-subtitle">Doanh thu phân theo hub/chi nhánh</p></div>
      </div>
      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Điểm bán</th><th>Mã Hub</th><th>Thương hiệu</th><th>Số đơn</th><th>Doanh thu</th></tr>
            </thead>
            <tbody>
              {data.map(h => (
                <tr key={h._id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="font-medium">{h.name}</span>
                    </div>
                  </td>
                  <td><span className="font-mono text-sm text-primary-600">{h.code}</span></td>
                  <td className="text-sm text-gray-500">{h.brandName}</td>
                  <td className="font-semibold">{h.orderCount}</td>
                  <td className="font-semibold text-green-600">{formatCurrency(h.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
