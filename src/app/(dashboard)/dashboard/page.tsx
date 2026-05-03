'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts'
import { ShoppingCart, DollarSign, Building2, MapPin, Clock, TrendingUp, AlertCircle } from 'lucide-react'
import { mockDashboardStats, mockRevenueData, mockOrders } from '@/lib/mock-data'
import { formatCurrency, formatNumber, ORDER_STATUS_LABEL, ORDER_STATUS_COLOR, CHANNEL_SOURCE_LABEL, CHANNEL_SOURCE_COLOR } from '@/lib/utils'
import { cn } from '@/lib/utils'

const stats = [
  {
    label: 'Đơn hôm nay',
    value: formatNumber(mockDashboardStats.ordersToday),
    sub: `Tổng: ${formatNumber(mockDashboardStats.totalOrders)}`,
    icon: <ShoppingCart className="w-5 h-5" />,
    color: 'bg-orange-50 text-orange-600',
    trend: '+12%',
  },
  {
    label: 'Doanh thu hôm nay',
    value: formatCurrency(mockDashboardStats.revenueToday),
    sub: `Tổng: ${formatCurrency(mockDashboardStats.totalRevenue)}`,
    icon: <DollarSign className="w-5 h-5" />,
    color: 'bg-green-50 text-green-600',
    trend: '+8%',
  },
  {
    label: 'Thương hiệu',
    value: String(mockDashboardStats.totalBrands),
    sub: 'Đang hoạt động',
    icon: <Building2 className="w-5 h-5" />,
    color: 'bg-blue-50 text-blue-600',
    trend: '',
  },
  {
    label: 'Điểm bán',
    value: String(mockDashboardStats.totalHubs),
    sub: 'Đang hoạt động',
    icon: <MapPin className="w-5 h-5" />,
    color: 'bg-purple-50 text-purple-600',
    trend: '',
  },
  {
    label: 'Chờ xử lý',
    value: String(mockDashboardStats.pendingOrders),
    sub: 'Đơn cần xác nhận',
    icon: <AlertCircle className="w-5 h-5" />,
    color: 'bg-yellow-50 text-yellow-600',
    trend: '',
  },
]

// Chart data - last 14 days
const chartData = mockRevenueData.slice(-14).map(d => ({
  date: d.date.slice(5), // MM-DD
  'Doanh thu': Math.round(d.revenueAfterDiscount / 1000),
  'Phí sàn': Math.round(d.platformFee / 1000),
}))

export default function DashboardPage() {
  const recentOrders = mockOrders.slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Tổng quan</h1>
          <p className="page-subtitle">Xem nhanh hoạt động bán hàng của bạn</p>
        </div>
        <div className="text-sm text-gray-400">
          <Clock className="w-4 h-4 inline mr-1" />
          Cập nhật lúc {new Date().toLocaleTimeString('vi-VN')}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((s, i) => (
          <div key={i} className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <div className={cn('p-2 rounded-lg', s.color)}>
                {s.icon}
              </div>
              {s.trend && (
                <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                  {s.trend}
                </span>
              )}
            </div>
            <p className="text-xl font-bold text-gray-900">{s.value}</p>
            <p className="text-sm font-medium text-gray-600 mt-0.5">{s.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue area chart */}
        <div className="lg:col-span-2 card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Xu hướng doanh thu</h3>
                <p className="text-xs text-gray-400 mt-0.5">14 ngày gần nhất (nghìn VND)</p>
              </div>
              <TrendingUp className="w-4 h-4 text-primary-500" />
            </div>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F97316" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  formatter={(v: number) => [`${formatNumber(v)}k`, '']}
                />
                <Area
                  type="monotone"
                  dataKey="Doanh thu"
                  stroke="#F97316"
                  strokeWidth={2}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Order source breakdown */}
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold text-gray-900">Đơn theo nguồn</h3>
            <p className="text-xs text-gray-400 mt-0.5">Hôm nay</p>
          </div>
          <div className="p-4">
            {[
              { source: 'shopee', count: 52, pct: 41 },
              { source: 'grab',   count: 38, pct: 30 },
              { source: 'xanh_sm', count: 22, pct: 17 },
              { source: 'be',     count: 15, pct: 12 },
            ].map((item) => (
              <div key={item.source} className="mb-3">
                <div className="flex justify-between items-center mb-1">
                  <span className={cn('badge', CHANNEL_SOURCE_COLOR[item.source])}>
                    {CHANNEL_SOURCE_LABEL[item.source]}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{item.count}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full">
                  <div
                    className="h-full bg-primary-500 rounded-full"
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Đơn hàng gần đây</h3>
          <a href="/orders" className="text-sm text-primary-500 hover:text-primary-600 font-medium">
            Xem tất cả →
          </a>
        </div>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Khách hàng</th>
                <th>Kênh bán</th>
                <th>Tổng tiền</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
                <tr key={order._id}>
                  <td>
                    <a href={`/orders/${order._id}`} className="font-mono text-sm text-primary-600 hover:underline">
                      {order.shortId}
                    </a>
                  </td>
                  <td>
                    <p className="font-medium text-gray-900">{order.customerName}</p>
                    <p className="text-xs text-gray-400">{order.customerPhone}</p>
                  </td>
                  <td>
                    <span className={cn('badge', CHANNEL_SOURCE_COLOR[order.source])}>
                      {CHANNEL_SOURCE_LABEL[order.source]}
                    </span>
                  </td>
                  <td className="font-semibold">{formatCurrency(order.total)}</td>
                  <td>
                    <span className={cn('badge', ORDER_STATUS_COLOR[order.status])}>
                      {ORDER_STATUS_LABEL[order.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
