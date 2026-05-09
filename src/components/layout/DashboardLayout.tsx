'use client'

import { useState } from 'react'
import { SessionProvider } from 'next-auth/react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [desktopSidebarVisible, setDesktopSidebarVisible] = useState(true)

  const handleSidebarToggle = () => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setDesktopSidebarVisible((visible) => !visible)
      return
    }

    setMobileSidebarOpen((open) => !open)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        isDesktopVisible={desktopSidebarVisible}
        onDesktopToggle={() => setDesktopSidebarVisible(false)}
      />

      {/* Main area */}
      <div className={`${desktopSidebarVisible ? 'lg:pl-64' : 'lg:pl-0'} flex flex-col min-h-screen transition-[padding] duration-300`}>
        <Topbar onMenuClick={handleSidebarToggle} desktopSidebarVisible={desktopSidebarVisible} />

        <main className="flex-1 p-4 lg:p-6">
          {children}
        </main>

        <footer className="text-center text-xs text-gray-400 py-3 border-t border-gray-200 bg-white">
          BPOS Portal v1.0.0 · © 2024
        </footer>
      </div>
    </div>
  )
}
