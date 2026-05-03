'use client'

import { mockOrders } from '@/lib/mock-data'
import { formatCurrency } from '@/lib/utils'
import { Users } from 'lucide-react'

export default function CustomersReportPage() {
  // Aggregate by customer phone
  const map = new Map<string, { name: string; phone: string; orderCount: number; totalSpend: number }>()
  for (const o of mockOrders) {
    const key = o.customerPhone ?? o.customerName
    if (!map.has(key)) {
      map.set(key, { name: o.customerName, phone: o.customerPhone ?? '', orderCount: 0, totalSpend: 0 })
    }
    const entry = map.get(key)!
    entry.orderCount += 1
    entry.totalSpend += o.total
  }
  const customers = Array.from(map.values()).sort((a, b) => b.totalSpend - a.totalSpend)

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Khách hàng</h1>
          <p className="page-subtitle">{customers.length} khách hàng</p>
        </div>
      </div>
      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr><th>Khách hàng</th><th>Số điện thoại</th><th>Số đơn</th><th>Tổng chi tiêu</th></tr>
            </thead>
            <tbody>
              {customers.map((c, i) => (
                <tr key={c.phone}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${i < 3 ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}`}>
                        {c.name[0]}
                      </div>
                      <span className="font-medium">{c.name}</span>
                    </div>
                  </td>
                  <td className="font-mono text-sm text-gray-500">{c.phone}</td>
                  <td className="font-semibold">{c.orderCount}</td>
                  <td className="font-semibold text-green-600">{formatCurrency(c.totalSpend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
