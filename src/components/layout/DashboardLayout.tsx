'use client'

import { useState } from 'react'
import { SessionProvider } from 'next-auth/react'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main area */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />

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
