'use client'

import { mockBrands, mockOrders } from '@/lib/mock-data'
import { formatCurrency } from '@/lib/utils'
import { Building2 } from 'lucide-react'

export default function BrandsReportPage() {
  const data = mockBrands.map(brand => {
    const brandOrders = mockOrders.filter(o => o.brandId === brand._id)
    const revenue = brandOrders.reduce((sum, o) => sum + o.total, 0)
    return { ...brand, orderCount: brandOrders.length, revenue }
  })

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div><h1 className="page-title">Theo thương hiệu</h1><p className="page-subtitle">Doanh thu phân theo thương hiệu</p></div>
      </div>
      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Thương hiệu</th><th>Loại</th><th>Số đơn</th><th>Doanh thu</th><th>Trạng thái</th></tr>
            </thead>
            <tbody>
              {data.map(b => (
                <tr key={b._id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-orange-500" />
                      </div>
                      <span className="font-medium text-gray-900">{b.name}</span>
                    </div>
                  </td>
                  <td className="text-sm text-gray-500 capitalize">{b.type}</td>
                  <td className="font-semibold">{b.orderCount}</td>
                  <td className="font-semibold text-green-600">{formatCurrency(b.revenue)}</td>
                  <td><span className={b.status === 'active' ? 'badge badge-green' : 'badge badge-red'}>{b.status === 'active' ? 'Hoạt động' : 'Ngừng'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
