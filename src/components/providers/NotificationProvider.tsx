'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Bell, X, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  buildReceiptPrintUrl,
  DEFAULT_ORDER_ALERT_SETTINGS,
  getRecentPrintedOrderIds,
  loadOrderAlertSettings,
  ORDER_ALERT_POLL_INTERVAL_MS,
  persistOrderAlertSettings,
  playOrderAlert,
  primeOrderAlertAudio,
  rememberPrintedOrders,
} from '@/lib/order-alerts'

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

export default function NotificationProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [settings, setSettings] = useState(DEFAULT_ORDER_ALERT_SETTINGS)
  const [printQueue, setPrintQueue] = useState<string[]>([])
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
    if (settings.soundEnabled) {
      playOrderAlert(3)
    }
    newIds.forEach(id => seenIds.current.add(id))
  }, [settings.soundEnabled])

  useEffect(() => {
    const nextSettings = loadOrderAlertSettings()
    setSettings(nextSettings)
    persistOrderAlertSettings(nextSettings)
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
          const newOrderIds = newOrders.map(o => o._id)
          addNotification(newOrders.length, newOrderIds)
          void queryClient.invalidateQueries({ queryKey: ['orders'] })
          void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })

          if (settings.autoPrintEnabled) {
            const alreadyPrinted = new Set(getRecentPrintedOrderIds())
            const printableIds = [...newOrderIds].reverse().filter(orderId => !alreadyPrinted.has(orderId))

            if (printableIds.length > 0) {
              rememberPrintedOrders(printableIds)
              setPrintQueue(prev => {
                const queuedIds = new Set(prev)
                return [...prev, ...printableIds.filter(orderId => !queuedIds.has(orderId))]
              })
            }
          }
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
  }, [addNotification, queryClient, settings.autoPrintEnabled])

  useEffect(() => {
    pollOrders()
    const interval = setInterval(pollOrders, ORDER_ALERT_POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [pollOrders])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key || !event.key.startsWith('bpos.order-alert.')) return
      setSettings(loadOrderAlertSettings())
    }

    const onReceiptPrinted = (event: MessageEvent) => {
      const payload = event.data as { type?: string; orderId?: string } | null
      if (!payload || typeof payload !== 'object') return
      if (payload.type !== 'bpos-receipt-printed' && payload.type !== 'bpos-receipt-print-failed') return
      if (!payload.orderId) return

      setPrintQueue(prev => prev.filter(orderId => orderId !== payload.orderId))
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener('message', onReceiptPrinted)

    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('message', onReceiptPrinted)
    }
  }, [])

  useEffect(() => {
    let primed = false

    const primeAudio = () => {
      if (primed) return
      primed = true
      primeOrderAlertAudio()
      window.removeEventListener('pointerdown', primeAudio)
      window.removeEventListener('keydown', primeAudio)
    }

    window.addEventListener('pointerdown', primeAudio)
    window.addEventListener('keydown', primeAudio)

    return () => {
      window.removeEventListener('pointerdown', primeAudio)
      window.removeEventListener('keydown', primeAudio)
    }
  }, [])

  useEffect(() => {
    if (!printQueue.length) return

    const activeOrderId = printQueue[0]
    const timeout = window.setTimeout(() => {
      setPrintQueue(prev => prev[0] === activeOrderId ? prev.slice(1) : prev.filter(orderId => orderId !== activeOrderId))
    }, 20_000)

    return () => window.clearTimeout(timeout)
  }, [printQueue])

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

      {printQueue[0] && (
        <iframe
          title={`receipt-print-${printQueue[0]}`}
          src={buildReceiptPrintUrl(printQueue[0], { autoprint: true, embedded: true })}
          style={{ position: 'fixed', width: 0, height: 0, border: 0, opacity: 0, pointerEvents: 'none' }}
        />
      )}

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

