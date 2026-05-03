import { SessionProvider } from 'next-auth/react'
import DashboardLayout from '@/components/layout/DashboardLayout'
import QueryProvider from '@/components/providers/QueryProvider'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <QueryProvider>
        <DashboardLayout>{children}</DashboardLayout>
      </QueryProvider>
    </SessionProvider>
  )
}
