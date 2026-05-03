'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import {
  LayoutDashboard,
  Building2,
  MapPin,
  Users,
  Package,
  UtensilsCrossed,
  RefreshCw,
  Tag,
  FileText,
  Radio,
  ShoppingCart,
  Truck,
  BarChart3,
  User,
  Receipt,
  ChevronDown,
  ChevronRight,
  ShoppingBag,
  Link as LinkIcon,
} from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface NavItem {
  href?: string
  label: string
  icon: React.ReactNode
  adminOnly?: boolean
  children?: NavItem[]
}

const navItems: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Tổng quan',
    icon: <LayoutDashboard className="w-4 h-4" />,
  },
  {
    label: 'Quản lý cửa hàng',
    icon: <Building2 className="w-4 h-4" />,
    children: [
      { href: '/brands',  label: 'Thương hiệu', icon: <Building2 className="w-4 h-4" /> },
      { href: '/hubs',    label: 'Điểm bán',    icon: <MapPin className="w-4 h-4" /> },
      { href: '/staffs',  label: 'Nhân viên',   icon: <Users className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Hàng hóa & Menu',
    icon: <Package className="w-4 h-4" />,
    children: [
      { href: '/products',     label: 'Sản phẩm',      icon: <Package className="w-4 h-4" /> },
      { href: '/menus',        label: 'Thực đơn',       icon: <UtensilsCrossed className="w-4 h-4" /> },
      { href: '/sync-history', label: 'Lịch sử đồng bộ', icon: <RefreshCw className="w-4 h-4" /> },
    ],
  },
  {
    href: '/promotions',
    label: 'Khuyến mãi',
    icon: <Tag className="w-4 h-4" />,
  },
  {
    href: '/bill-templates',
    label: 'Hóa đơn mẫu',
    icon: <FileText className="w-4 h-4" />,
  },
  {
    href: '/channels',
    label: 'Kênh bán',
    icon: <Radio className="w-4 h-4" />,
    adminOnly: true,
  },
  {
    label: 'Đơn hàng',
    icon: <ShoppingCart className="w-4 h-4" />,
    children: [
      { href: '/orders',    label: 'Quản lý đơn hàng', icon: <ShoppingCart className="w-4 h-4" /> },
      { href: '/shipments', label: 'Vận đơn',           icon: <Truck className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Báo cáo',
    icon: <BarChart3 className="w-4 h-4" />,
    children: [
      { href: '/reports/revenue',   label: 'Doanh thu tổng quan',  icon: <BarChart3 className="w-4 h-4" /> },
      { href: '/reports/orders',    label: 'Doanh thu theo đơn',   icon: <ShoppingCart className="w-4 h-4" /> },
      { href: '/reports/cancelled', label: 'Đơn hủy',              icon: <Receipt className="w-4 h-4" /> },
      { href: '/reports/brands',    label: 'Theo thương hiệu',     icon: <Building2 className="w-4 h-4" /> },
      { href: '/reports/hubs',      label: 'Theo điểm bán',        icon: <MapPin className="w-4 h-4" /> },
      { href: '/reports/channels',  label: 'Theo kênh bán',        icon: <Radio className="w-4 h-4" /> },
      { href: '/reports/products',  label: 'Hàng bán',             icon: <Package className="w-4 h-4" /> },
      { href: '/reports/customers', label: 'Khách hàng',           icon: <Users className="w-4 h-4" /> },
    ],
  },
  {
    href: '/e-invoices',
    label: 'Hóa đơn điện tử',
    icon: <Receipt className="w-4 h-4" />,
  },
  {
    href: '/integrations',
    label: 'Tích hợp sàn',
    icon: <LinkIcon className="w-4 h-4" />,
    adminOnly: true,
  },
]

interface SidebarGroupProps {
  item: NavItem
  isAdmin: boolean
}

function SidebarGroup({ item, isAdmin }: SidebarGroupProps) {
  const pathname = usePathname()
  const isChildActive = item.children?.some((c) => c.href && pathname.startsWith(c.href))
  const [open, setOpen] = useState(isChildActive ?? false)

  if (item.adminOnly && !isAdmin) return null

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'sidebar-item-default w-full',
          isChildActive && 'text-white bg-white/10'
        )}
      >
        {item.icon}
        <span className="flex-1 text-left">{item.label}</span>
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>

      {open && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
          {item.children?.map((child) => {
            if (!child.href) return null
            const active = pathname === child.href || pathname.startsWith(child.href + '/')
            return (
              <Link
                key={child.href}
                href={child.href}
                className={cn(
                  'flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all',
                  active
                    ? 'bg-primary-500 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                )}
              >
                {child.icon}
                {child.label}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-64 bg-[#1C1C1E] flex flex-col z-30 transition-transform duration-300',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div className="w-9 h-9 bg-primary-500 rounded-xl flex items-center justify-center shadow-lg">
            <ShoppingBag className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-white font-bold text-lg leading-none">BPOS</span>
            <span className="text-gray-400 text-xs block">Portal</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item, idx) => {
            if (item.adminOnly && !isAdmin) return null

            if (item.children) {
              return <SidebarGroup key={idx} item={item} isAdmin={isAdmin} />
            }

            if (!item.href) return null
            const active = pathname === item.href || pathname.startsWith(item.href + '/')

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'sidebar-item',
                  active ? 'sidebar-item-active' : 'sidebar-item-default'
                )}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Bottom */}
        <div className="px-3 pb-4 pt-2 border-t border-white/10">
          <Link
            href="/profile"
            className={cn(
              'sidebar-item',
              pathname === '/profile' ? 'sidebar-item-active' : 'sidebar-item-default'
            )}
          >
            <User className="w-4 h-4" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session?.user?.name ?? 'Tài khoản'}</p>
              <p className="text-xs text-gray-400 truncate">{session?.user?.email}</p>
            </div>
          </Link>
        </div>
      </aside>
    </>
  )
}
