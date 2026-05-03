'use client'

import { useState } from 'react'
import { useRevenueReport } from '@/hooks/use-data'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, ShoppingCart, DollarSign, Receipt, Loader2 } from 'lucide-react'

const RANGES = [{ label: '7 ngày', days: 7 }, { label: '30 ngày', days: 30 }, { label: '90 ngày', days: 90 }]

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-sm">
        <p className="text-gray-500 mb-1">{label}</p>
        <p className="font-semibold text-gray-900">{formatCurrency(payload[0].value * 1000)}</p>
      </div>
    )
  }
  return null
}

export default function RevenueReportPage() {
  const [days, setDays] = useState(30)
  const { data: report, isLoading } = useRevenueReport({ days })

  const summary = (report?.summary ?? {}) as Record<string, number>
  const rows = (report?.data ?? []) as Record<string, number>[]

  const stats = [
    { label: 'Tổng đơn hàng', value: formatNumber(summary.totalOrders ?? 0), icon: <ShoppingCart className="w-5 h-5" />, color: 'text-blue-500 bg-blue-50' },
    { label: 'Doanh thu gộp', value: formatCurrency(summary.revenue ?? 0), icon: <DollarSign className="w-5 h-5" />, color: 'text-green-500 bg-green-50' },
    { label: 'Phí nền tảng', value: formatCurrency(summary.platformFee ?? 0), icon: <Receipt className="w-5 h-5" />, color: 'text-red-500 bg-red-50' },
    { label: 'Doanh thu thực', value: formatCurrency((summary.revenue ?? 0) - (summary.platformFee ?? 0) - (summary.discount ?? 0)), icon: <TrendingUp className="w-5 h-5" />, color: 'text-primary-500 bg-orange-50' },
  ]

  const chartData = rows.map(d => ({
    date: String(d.date ?? '').slice(5),
    doanhThu: Math.round((d.revenue ?? 0) / 1000),
    phiSan: Math.round((d.platformFee ?? 0) / 1000),
  }))

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Doanh thu tổng quan</h1>
          <p className="page-subtitle">Số liệu {days} ngày qua</p>
        </div>
        <div className="flex gap-2">
          {RANGES.map(r => (
            <button key={r.days} onClick={() => setDays(r.days)} className={days === r.days ? 'btn-primary btn-sm' : 'btn-outline btn-sm'}>{r.label}</button>
          ))}
        </div>
      </div>

      {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary-400" /></div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="card p-4">
            <div className={"w-9 h-9 rounded-xl flex items-center justify-center mb-3 " + s.color}>{s.icon}</div>
            <p className="text-xs text-gray-500 mb-0.5">{s.label}</p>
            <p className="text-lg font-bold text-gray-900">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="card card-body">
        <h3 className="font-semibold text-gray-900 mb-4">Biểu đồ doanh thu (nghìn đồng)</h3>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F97316" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="doanhThu" stroke="#F97316" strokeWidth={2} fill="url(#rev)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="card card-body">
        <h3 className="font-semibold text-gray-900 mb-4">Số đơn hàng theo ngày</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => String(v).slice(5)} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="orders" fill="#F97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
