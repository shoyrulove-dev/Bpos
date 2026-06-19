'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Bell, X, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import {
  DEFAULT_ORDER_ALERT_SETTINGS,
  getRecentPrintedJobIds,
  loadOrderAlertSettings,
  ORDER_ALERT_POLL_INTERVAL_MS,
  persistOrderAlertSettings,
  playOrderAlert,
  primeOrderAlertAudio,
  rememberPrintedJobs,
} from '@/lib/order-alerts'
import { buildFallbackPrintUrl, isBridgePrintingEnabled, printItemLabels, printOrderWithHtmlTemplate } from '@/lib/local-printer'
import type { LocalPrinterType } from '@/lib/local-printer'
import type { Channel } from '@/types'

interface Notification {
  id: string
  message: string
  count: number
  timestamp: Date
  dismissed: boolean
  href: string
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

type AlertOrder = {
  _id: string
  shortId?: string
  externalOrderId?: string
  rawPayload?: { displayID?: string }
  customerName?: string
  placedAt?: string
  status?: string
  source?: string
  channelId?: string
}

type PrintJob = {
  orderId: string
  type: LocalPrinterType
}

type ChannelPrintState = Pick<Channel, '_id' | 'source' | 'status' | 'scraperPaused' | 'scraperLoggedIn' | 'scraperLastSeen' | 'printerEnabled' | 'printerReceiptEnabled' | 'printerLabelEnabled'>

const NEW_ORDER_STATUSES = ['waiting_confirm', 'waiting_pickup']

function getLatestOrder(orderList: AlertOrder[]) {
  return [...orderList].sort((left, right) => {
    return new Date(right.placedAt || 0).getTime() - new Date(left.placedAt || 0).getTime()
  })[0] ?? null
}

/** Ưu tiên displayID của nền tảng (GF-723), fallback về shortId BPOS, rồi 6 ký tự cuối _id */
function getDisplayId(order: AlertOrder | null) {
  if (!order) return ''
  return String(order.rawPayload?.displayID ?? '').trim() || ''
}

function getOrderLabel(order: AlertOrder | null) {
  if (!order) return 'đơn mới nhất'
  const displayId = getDisplayId(order)
  const shortId = order.shortId?.trim() || order._id.slice(-6)
  // Show both: "GF-723 (LWB4AX06)" so staff can look up by either ID
  return displayId ? `${displayId} (${shortId})` : shortId
}

function showSystemOrderNotification(order: AlertOrder | null, href: string) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return

  const displayId = getDisplayId(order)
  const shortId = order?.shortId?.trim() || order?._id?.slice(-6) || ''
  const idLine = displayId ? `${displayId} · ${shortId}` : shortId
  const exId = order?.externalOrderId ? `\nRef: ${order.externalOrderId}` : ''

  const notification = new Notification('BPOS có đơn hàng mới', {
    body: `Đơn: ${idLine}${order?.customerName ? ` • ${order.customerName}` : ''}${exId}`,
    tag: 'bpos-new-order',
  })

  notification.onclick = () => {
    window.focus()
    window.location.assign(href)
    notification.close()
  }
}

function revealLatestOrder(href: string) {
  if (typeof window === 'undefined') return
  window.focus()
  window.location.assign(href)
}

export default function NotificationProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [settings, setSettings] = useState(DEFAULT_ORDER_ALERT_SETTINGS)
  const [printQueue, setPrintQueue] = useState<PrintJob[]>([])
  const [embeddedPrintJob, setEmbeddedPrintJob] = useState<PrintJob | null>(null)
  const [channelPrintMap, setChannelPrintMap] = useState<Record<string, ChannelPrintState>>({})
  const seenIds = useRef<Set<string>>(new Set())
  const initialized = useRef(false)

  const addNotification = useCallback((newOrders: AlertOrder[]) => {
    const latestOrder = getLatestOrder(newOrders)
    const href = latestOrder ? `/orders/${latestOrder._id}` : '/orders'
    const notif: Notification = {
      id: Date.now().toString(),
      message: newOrders.length > 1
        ? `${newOrders.length} đơn mới, đơn mới nhất là ${getOrderLabel(latestOrder)}.`
        : `Có đơn mới ${getOrderLabel(latestOrder)} vừa đến.`,
      count: newOrders.length,
      timestamp: new Date(),
      dismissed: false,
      href,
    }
    setNotifications(prev => [notif, ...prev].slice(0, 10))
    if (settings.soundEnabled) {
      playOrderAlert(settings.soundRepeatCount ?? 3, settings.voiceMessage)
    }
    newOrders.forEach(order => seenIds.current.add(order._id))

    if (latestOrder) {
      showSystemOrderNotification(latestOrder, href)
      if (document.hidden) {
        revealLatestOrder(href)
      }
    }
  }, [settings.soundEnabled, settings.soundRepeatCount, settings.voiceMessage])

  useEffect(() => {
    let cancelled = false

    const loadChannels = async () => {
      try {
        const response = await fetch('/api/channels')
        if (!response.ok) return
        const payload = await response.json() as Channel[]
        if (cancelled || !Array.isArray(payload)) return
        const nextMap = payload.reduce((acc, channel) => {
          acc[channel._id] = {
            _id: channel._id,
            source: channel.source,
            status: channel.status,
            scraperPaused: channel.scraperPaused,
            scraperLoggedIn: channel.scraperLoggedIn,
            scraperLastSeen: channel.scraperLastSeen,
            printerEnabled: channel.printerEnabled,
            printerReceiptEnabled: channel.printerReceiptEnabled,
            printerLabelEnabled: channel.printerLabelEnabled,
          }
          return acc
        }, {} as Record<string, ChannelPrintState>)
        setChannelPrintMap(nextMap)
      } catch {
        if (!cancelled) setChannelPrintMap({})
      }
    }

    void loadChannels()
    const interval = window.setInterval(loadChannels, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    const nextSettings = loadOrderAlertSettings()
    setSettings(nextSettings)
    persistOrderAlertSettings(nextSettings)

    void fetch('/api/settings/order-alerts')
      .then(async (response) => {
        if (!response.ok) return null
        return response.json() as Promise<{ voiceMessage?: string; soundRepeatCount?: number }>
      })
      .then((payload) => {
        if (!payload?.voiceMessage) return
        setSettings((prev) => {
          const merged = {
            ...prev,
            voiceMessage: payload.voiceMessage || prev.voiceMessage,
            soundRepeatCount: typeof payload.soundRepeatCount === 'number' ? payload.soundRepeatCount : prev.soundRepeatCount,
          }
          persistOrderAlertSettings(merged)
          return merged
        })
      })
      .catch(() => null)
  }, [])

  const isChannelPrintable = useCallback((order: AlertOrder) => {
    const channelId = String(order.channelId ?? '').trim()
    if (!channelId) return false
    const channel = channelPrintMap[channelId]
    if (!channel) return false
    if (channel.status !== 'active') return false
    if (channel.source === 'grab' || channel.source === 'be') {
      const lastSeenAt = channel.scraperLastSeen ? new Date(channel.scraperLastSeen).getTime() : 0
      const isFresh = Number.isFinite(lastSeenAt) && (Date.now() - lastSeenAt) < 5 * 60_000
      if (!channel.scraperLoggedIn || channel.scraperPaused || !isFresh) return false
    }
    return true
  }, [channelPrintMap])

  const buildPrintJobs = useCallback((order: AlertOrder) => {
    if (!isChannelPrintable(order)) return [] as PrintJob[]
    const channel = channelPrintMap[String(order.channelId ?? '')]
    if (!channel) return [] as PrintJob[]

    const receiptEnabled = channel.printerReceiptEnabled ?? channel.printerEnabled ?? true
    const labelEnabled = channel.printerLabelEnabled ?? channel.printerEnabled ?? true
    const jobs: PrintJob[] = []
    if (settings.autoPrintReceiptEnabled && receiptEnabled) jobs.push({ orderId: order._id, type: 'receipt' })
    if (settings.autoPrintLabelEnabled && labelEnabled) jobs.push({ orderId: order._id, type: 'label' })
    return jobs
  }, [channelPrintMap, isChannelPrintable, settings.autoPrintLabelEnabled, settings.autoPrintReceiptEnabled])

  const pollOrders = useCallback(async () => {
    try {
      const searchParams = new URLSearchParams({
        status: NEW_ORDER_STATUSES.join(','),
        limit: '100',
      })
      const res = await fetch(`/api/orders?${searchParams.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      const orders: AlertOrder[] = data.orders ?? data ?? []
      const newOrders = orders.filter((order) => {
        if (!order?._id || seenIds.current.has(order._id)) return false
        if (!order.status || !NEW_ORDER_STATUSES.includes(order.status)) return false
        return true
      })
      if (newOrders.length > 0) {
        if (initialized.current) {
          // Mark as seen immediately so repeated polls don't re-notify/re-print
          newOrders.forEach(o => seenIds.current.add(o._id))
          addNotification(newOrders)
          void queryClient.invalidateQueries({ queryKey: ['orders'] })
          void queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })

          if (settings.autoPrintReceiptEnabled || settings.autoPrintLabelEnabled) {
            const alreadyPrinted = new Set(getRecentPrintedJobIds())
            const nextJobs = [...newOrders]
              .reverse()
              .flatMap((order) => buildPrintJobs(order))
              .filter((job) => !alreadyPrinted.has(`${job.type}:${job.orderId}`))

            if (nextJobs.length > 0) {
              rememberPrintedJobs(nextJobs.map((job) => `${job.type}:${job.orderId}`))
              setPrintQueue(prev => {
                const queuedIds = new Set(prev.map((job) => `${job.type}:${job.orderId}`))
                return [...prev, ...nextJobs.filter((job) => !queuedIds.has(`${job.type}:${job.orderId}`))]
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
  }, [addNotification, buildPrintJobs, queryClient, settings.autoPrintLabelEnabled, settings.autoPrintReceiptEnabled])

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

      setEmbeddedPrintJob(null)
      setPrintQueue(prev => prev.filter((job) => !(job.orderId === payload.orderId && job.type === 'receipt')))
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
    if (!printQueue.length) {
      setEmbeddedPrintJob(null)
      return
    }

    const activeJob = printQueue[0]
    if (embeddedPrintJob && embeddedPrintJob.orderId === activeJob.orderId && embeddedPrintJob.type === activeJob.type) return

    let cancelled = false

    if (!isBridgePrintingEnabled(activeJob.type)) {
      setEmbeddedPrintJob(activeJob)
      return
    }

    const jobPromise = activeJob.type === 'label'
      ? printItemLabels(activeJob.orderId)
      : printOrderWithHtmlTemplate(activeJob.orderId, 'receipt')

    void jobPromise
      .then((printed) => {
        if (cancelled) return
        if (printed) {
          setEmbeddedPrintJob(null)
          setPrintQueue(prev => prev[0]?.orderId === activeJob.orderId && prev[0]?.type === activeJob.type
            ? prev.slice(1)
            : prev.filter((job) => !(job.orderId === activeJob.orderId && job.type === activeJob.type)))
          return
        }
        setEmbeddedPrintJob(activeJob)
      })
      .catch(() => {
        if (!cancelled) {
          setEmbeddedPrintJob(activeJob)
        }
      })

    return () => {
      cancelled = true
    }
  }, [embeddedPrintJob, printQueue])

  useEffect(() => {
    if (!printQueue.length) return

    const activeJob = printQueue[0]
    const timeout = window.setTimeout(() => {
      setEmbeddedPrintJob(null)
      setPrintQueue(prev => prev[0]?.orderId === activeJob.orderId && prev[0]?.type === activeJob.type
        ? prev.slice(1)
        : prev.filter((job) => !(job.orderId === activeJob.orderId && job.type === activeJob.type)))
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

      {embeddedPrintJob?.type === 'receipt' && (
        <iframe
          title={`receipt-print-${embeddedPrintJob.orderId}`}
          src={buildFallbackPrintUrl(embeddedPrintJob.orderId, 'receipt', { autoprint: true }) + '&embedded=1'}
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
              <Link href={notif.href} onClick={() => dismiss(notif.id)} className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
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

