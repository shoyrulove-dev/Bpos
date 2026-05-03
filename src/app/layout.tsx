import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BPOS Portal',
  description: 'Hệ thống quản lý bán hàng đa kênh BPOS',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
