'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { Bell, X, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface Notification {
  id: string
  message: string
  count: number
  timestamp: Date
  dismissed: boolean
}

interface NotificationContextValue {
  notifications: Notification[]
  dismiss: (id: string) => void
  dismissAll: () => void
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  dismiss: () => {},
  dismissAll: () => {},
})

export const useNotifications = () => useContext(NotificationContext)

function playBell(times = 3) {
  let i = 0
  const ring = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3)
      gain.gain.setValueAtTime(0.4, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.6)
    } catch { /* ignore AudioContext restriction */ }
    i++
    if (i < times) setTimeout(ring, 500)
  }
  ring()
}

export default function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const seenIds = useRef<Set<string>>(new Set())
  const initialized = useRef(false)

  const addNotification = useCallback((count: number, newIds: string[]) => {
    const notif: Notification = {
      id: Date.now().toString(),
      message: `${count} đơn hàng mới vừa đến!`,
      count,
      timestamp: new Date(),
      dismissed: false,
    }
    setNotifications(prev => [notif, ...prev].slice(0, 5))
    playBell(3)
    newIds.forEach(id => seenIds.current.add(id))
  }, [])

  const pollOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders?status=waiting_confirm&limit=20')
      if (!res.ok) return
      const data = await res.json()
      const orders: Array<{ _id: string }> = data.orders ?? data ?? []
      const newOrders = orders.filter(o => !seenIds.current.has(o._id))
      if (newOrders.length > 0) {
        if (initialized.current) {
          addNotification(newOrders.length, newOrders.map(o => o._id))
        } else {
          // First poll — seed seen IDs without notification
          orders.forEach(o => seenIds.current.add(o._id))
          initialized.current = true
        }
      } else if (!initialized.current) {
        orders.forEach(o => seenIds.current.add(o._id))
        initialized.current = true
      }
    } catch { /* network error — ignore */ }
  }, [addNotification])

  useEffect(() => {
    pollOrders()
    const interval = setInterval(pollOrders, 30_000)
    return () => clearInterval(interval)
  }, [pollOrders])

  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, dismissed: true } : n))
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), 300)
  }, [])

  const dismissAll = useCallback(() => {
    setNotifications([])
  }, [])

  const visible = notifications.filter(n => !n.dismissed)

  return (
    <NotificationContext.Provider value={{ notifications, dismiss, dismissAll }}>
      {children}

      {/* Toast panel */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
        {visible.map(notif => (
          <div key={notif.id}
            className="pointer-events-auto bg-white border border-gray-200 rounded-2xl shadow-2xl flex items-center gap-3 px-4 py-3 min-w-[280px] animate-slide-in">
            <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <Bell className="w-4 h-4 text-orange-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900">{notif.message}</div>
              <div className="text-xs text-gray-400">{notif.timestamp.toLocaleTimeString('vi-VN')}</div>
            </div>
            <div className="flex items-center gap-1">
              <Link href="/orders" onClick={() => dismiss(notif.id)} className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                Xem <ExternalLink className="w-3 h-3" />
              </Link>
              <button onClick={() => dismiss(notif.id)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100 ml-1">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  )
}
