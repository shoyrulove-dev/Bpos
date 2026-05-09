'use client'

import { signOut, useSession } from 'next-auth/react'
import { Menu, Bell, ChevronDown, ChevronLeft, ChevronRight, LogOut, User } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface TopbarProps {
  onMenuClick: () => void
  desktopSidebarVisible: boolean
}

export default function Topbar({ onMenuClick, desktopSidebarVisible }: TopbarProps) {
  const { data: session } = useSession()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isAdmin = session?.user?.role === 'admin'

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-10">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
          aria-label={desktopSidebarVisible ? 'Ẩn menu' : 'Hiện menu'}
          title={desktopSidebarVisible ? 'Ẩn menu' : 'Hiện menu'}
        >
          <Menu className="w-5 h-5 lg:hidden" />
          {desktopSidebarVisible ? <ChevronLeft className="hidden w-5 h-5 lg:block" /> : <ChevronRight className="hidden w-5 h-5 lg:block" />}
        </button>
        <div className="hidden sm:block">
          <p className="text-sm text-gray-500">
            Chào mừng, <span className="font-semibold text-gray-900">{session?.user?.name}</span>
          </p>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Notification bell */}
        <button className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* Role badge */}
        <span className={cn(
          'hidden sm:inline-flex badge text-xs',
          isAdmin ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
        )}>
          {isAdmin ? 'Admin' : 'User'}
        </span>

        {/* User dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-sm font-semibold">
              {session?.user?.name?.charAt(0).toUpperCase()}
            </div>
            <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[120px] truncate">
              {session?.user?.name}
            </span>
            <ChevronDown className={cn('w-4 h-4 text-gray-400 transition-transform', dropdownOpen && 'rotate-180')} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900 truncate">{session?.user?.name}</p>
                <p className="text-xs text-gray-400 truncate">{session?.user?.email}</p>
              </div>

              <Link
                href="/profile"
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                <User className="w-4 h-4" />
                Hồ sơ tài khoản
              </Link>

              <button
                onClick={() => { setDropdownOpen(false); signOut({ callbackUrl: '/login' }) }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="w-4 h-4" />
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
