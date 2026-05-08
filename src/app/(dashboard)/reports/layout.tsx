'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, ShoppingCart, XCircle, Building2, MapPin, Radio, Package, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const reportNav = [
  { href: '/reports/revenue',   label: 'Doanh thu tổng quan', icon: <BarChart3 className="w-4 h-4" /> },
  { href: '/reports/orders',    label: 'Doanh thu theo đơn',  icon: <ShoppingCart className="w-4 h-4" /> },
  { href: '/reports/cancelled', label: 'Báo cáo đơn hủy',     icon: <XCircle className="w-4 h-4" /> },
  { href: '/reports/brands',    label: 'Theo thương hiệu',    icon: <Building2 className="w-4 h-4" /> },
  { href: '/reports/hubs',      label: 'Theo điểm bán',       icon: <MapPin className="w-4 h-4" /> },
  { href: '/reports/channels',  label: 'Theo kênh bán',       icon: <Radio className="w-4 h-4" /> },
  { href: '/reports/products',  label: 'Hàng bán',            icon: <Package className="w-4 h-4" /> },
  { href: '/reports/customers', label: 'Khách hàng',          icon: <Users className="w-4 h-4" /> },
]

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="space-y-5">
      <div className="card p-3">
        <p className="mb-3 px-2 text-xs font-semibold uppercase text-gray-400">Báo cáo</p>
        <nav className="flex gap-2 overflow-x-auto pb-1">
          {reportNav.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-w-fit items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all',
                pathname === item.href
                  ? 'bg-primary-50 text-primary-600'
                  : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              {item.icon}
              <span className="whitespace-nowrap text-xs">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>

      <div className="min-w-0">{children}</div>
    </div>
  )
}
