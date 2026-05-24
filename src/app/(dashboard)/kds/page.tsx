'use client'

import { useState, useEffect, useRef } from 'react'
import { ChefHat, Bell, BellOff, CheckCircle, Clock, RefreshCw } from 'lucide-react'
import { useKitchenOrders } from '@/hooks/use-data'
import { useUpdateOrder } from '@/hooks/use-orders-channels'
import { cn, CHANNEL_SOURCE_LABEL, CHANNEL_SOURCE_COLOR } from '@/lib/utils'
import type { Order } from '@/types'

function playBell() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3)
    gain.gain.setValueAtTime(0.5, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.8)
  } catch {
    // ignore audio failures
  }
}

function elapsed(dateStr: string) {
  const ms = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'Vừa xong'
  if (mins < 60) return `${mins} phút`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function OrderCard({
  order,
  accentClass,
  qtyClass,
  action,
  children,
}: {
  order: Order
  accentClass: string
  qtyClass: string
  action?: () => void
  children: React.ReactNode
}) {
  return (
    <div className={cn('card p-4 border-l-4', accentClass)}>
      <div className="mb-2 flex items-start justify-between">
        <div>
          <span className="font-mono text-sm font-bold text-primary-600">#{order.shortId}</span>
          <span className={cn('badge ml-2 text-xs', CHANNEL_SOURCE_COLOR[order.source])}>{CHANNEL_SOURCE_LABEL[order.source]}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Clock className="h-3 w-3" />
          {elapsed(order.placedAt)}
        </div>
      </div>

      <div className="mb-1 text-sm font-medium text-gray-700">{order.customerName}</div>
      <div className="mb-3 space-y-1">
        {(order.items ?? []).map((item, index) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <span className={cn('w-6 text-center font-bold', qtyClass)}>{item.quantity}x</span>
            <span className="text-gray-700">{item.name}</span>
            {item.note ? <span className="text-xs italic text-orange-500">({item.note})</span> : null}
          </div>
        ))}
      </div>

      {order.note ? <div className="mb-2 rounded bg-red-50 p-1.5 text-xs text-red-500">📝 {order.note}</div> : null}

      {action ? (
        <button onClick={action} className="w-full rounded-xl py-2 text-sm font-medium transition-colors">
          {children}
        </button>
      ) : null}
    </div>
  )
}

export default function KDSPage() {
  const [soundEnabled, setSoundEnabled] = useState(true)
  const prevCountRef = useRef(0)

  const { data: rawOrders = [], isLoading, dataUpdatedAt } = useKitchenOrders()
  const orders = rawOrders as Order[]
  const updateMutation = useUpdateOrder()

  const waitingConfirm = orders.filter((order) => order.status === 'waiting_confirm')
  const waitingPickup = orders.filter((order) => order.status === 'waiting_pickup')

  useEffect(() => {
    if (orders.length > prevCountRef.current && prevCountRef.current !== 0 && soundEnabled) {
      playBell()
    }
    prevCountRef.current = orders.length
  }, [orders.length, soundEnabled])

  const handleConfirm = async (order: Order) => {
    await updateMutation.mutateAsync({ id: order._id, status: 'waiting_pickup' })
  }

  const handleDone = async (order: Order) => {
    await updateMutation.mutateAsync({ id: order._id, status: 'delivering' })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-100">
            <ChefHat className="h-5 w-5 text-orange-600" />
          </div>
          <div>
            <h1 className="page-title mb-0">Kitchen Display</h1>
            <p className="text-xs text-gray-400">Cập nhật mỗi 10 giây · {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('vi-VN') : '--:--:--'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-all',
              soundEnabled ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-500'
            )}
          >
            {soundEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            {soundEnabled ? 'Âm thanh bật' : 'Âm thanh tắt'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-primary-400" />
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-yellow-400" />
            <h2 className="font-semibold text-gray-800">Chờ xác nhận</h2>
            <span className="ml-auto rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-bold text-yellow-700">{waitingConfirm.length}</span>
          </div>
          <div className="space-y-3">
            {waitingConfirm.length === 0 ? (
              <div className="card p-8 text-center text-sm text-gray-400">Không có đơn chờ xác nhận</div>
            ) : waitingConfirm.map((order) => (
              <OrderCard
                key={order._id}
                order={order}
                accentClass="border-yellow-400"
                qtyClass="text-primary-600"
                action={() => void handleConfirm(order)}
              >
                <span className="text-white">✓ Xác nhận & Vào bếp</span>
              </OrderCard>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-blue-400" />
            <h2 className="font-semibold text-gray-800">Đang chuẩn bị</h2>
            <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">{waitingPickup.length}</span>
          </div>
          <div className="space-y-3">
            {waitingPickup.length === 0 ? (
              <div className="card p-8 text-center text-sm text-gray-400">Không có đơn đang chuẩn bị</div>
            ) : waitingPickup.map((order) => (
              <OrderCard
                key={order._id}
                order={order}
                accentClass="border-blue-400"
                qtyClass="text-blue-600"
                action={() => void handleDone(order)}
              >
                <span className="inline-flex items-center justify-center gap-2 text-white">
                  <CheckCircle className="h-4 w-4" />
                  Xong · Sẵn lấy hàng
                </span>
              </OrderCard>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
