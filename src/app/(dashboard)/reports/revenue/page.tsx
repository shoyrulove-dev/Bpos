'use client'

import { mockRevenueData, mockDashboardStats } from '@/lib/mock-data'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, ShoppingCart, DollarSign, Receipt, Percent } from 'lucide-react'

const last30 = mockRevenueData.slice(-30)

const stats = [
  { label: 'Tổng đơn hàng', value: formatNumber(mockDashboardStats.totalOrders), icon: <ShoppingCart className="w-5 h-5" />, color: 'text-blue-500 bg-blue-50' },
  { label: 'Doanh thu gộp', value: formatCurrency(mockDashboardStats.totalRevenue), icon: <DollarSign className="w-5 h-5" />, color: 'text-green-500 bg-green-50' },
  { label: 'Phí nền tảng', value: formatCurrency(mockDashboardStats.totalRevenue * 0.15), icon: <Receipt className="w-5 h-5" />, color: 'text-red-500 bg-red-50' },
  { label: 'Doanh thu thực', value: formatCurrency(mockDashboardStats.totalRevenue * 0.85), icon: <TrendingUp className="w-5 h-5" />, color: 'text-primary-500 bg-orange-50' },
  { label: 'Tỉ lệ hủy đơn', value: '4.2%', icon: <Percent className="w-5 h-5" />, color: 'text-yellow-500 bg-yellow-50' },
]

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-sm">
        <p className="text-gray-500 mb-1">{label}</p>
        <p className="font-semibold text-gray-900">{formatCurrency(payload[0].value)}</p>
      </div>
    )
  }
  return null
}

export default function RevenueReportPage() {
  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Doanh thu tổng quan</h1>
          <p className="page-subtitle">Số liệu 30 ngày qua</p>
        </div>
        <div className="flex gap-2">
          {['7 ngày', '30 ngày', '90 ngày'].map(r => (
            <button key={r} className={r === '30 ngày' ? 'btn-primary btn-sm' : 'btn-outline btn-sm'}>{r}</button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map(s => (
          <div key={s.label} className="card p-4">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${s.color}`}>{s.icon}</div>
            <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
            <p className="font-semibold text-gray-900 text-sm">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Revenue area chart */}
      <div className="card card-body">
        <h3 className="font-semibold text-gray-900 mb-4">Biểu đồ doanh thu</h3>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={last30}>
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F97316" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000000).toFixed(0)}M`} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="revenue" stroke="#F97316" strokeWidth={2} fill="url(#rev)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Orders bar */}
      <div className="card card-body">
        <h3 className="font-semibold text-gray-900 mb-4">Số đơn hàng</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={last30}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="orders" fill="#F97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
