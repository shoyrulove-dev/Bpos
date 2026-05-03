import { SessionProvider } from 'next-auth/react'
import DashboardLayout from '@/components/layout/DashboardLayout'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <DashboardLayout>{children}</DashboardLayout>
    </SessionProvider>
  )
}
