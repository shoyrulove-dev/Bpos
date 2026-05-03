import { SessionProvider } from 'next-auth/react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import QueryProvider from '@/components/providers/QueryProvider'
import NotificationProvider from '@/components/providers/NotificationProvider'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <QueryProvider>
        <NotificationProvider>
          <DashboardLayout>{children}</DashboardLayout>
        </NotificationProvider>
      </QueryProvider>
    </SessionProvider>
  )
}
