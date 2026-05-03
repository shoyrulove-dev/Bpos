'use client'

import { mockProducts } from '@/lib/mock-data'
import { formatCurrency } from '@/lib/utils'

export default function ProductsReportPage() {
  // Simulate sold data based on product
  const data = mockProducts.map((p, i) => ({ ...p, soldQty: (i + 1) * 37, revenue: (i + 1) * 37 * (p.price ?? 0) }))
    .sort((a, b) => b.revenue - a.revenue)

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
