'use client'

import { useState, useEffect, useRef } from 'react'
import { ChefHat, Bell, BellOff, CheckCircle, Clock, RefreshCw } from 'lucide-react'
import { useKitchenOrders } from '@/hooks/use-data'
import { useUpdateOrder } from '@/hooks/use-orders-channels'
import { cn, formatDate, CHANNEL_SOURCE_LABEL, CHANNEL_SOURCE_COLOR } from '@/lib/utils'
import type { Order } from '@/types'

const KDS_STATUS_COLOR: Record<string, string> = {
  waiting_confirm: 'bg-yellow-400',
  waiting_pickup: 'bg-blue-400',
}

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
  } catch { /* ignore */ }
}

export default function KDSPage() {
  const [soundEnabled, setSoundEnabled] = useState(true)
  const prevCountRef = useRef(0)

  const { data: rawOrders = [], isLoading, dataUpdatedAt } = useKitchenOrders()
  const orders = rawOrders as Order[]
  const updateMutation = useUpdateOrder()

  const waitingConfirm = orders.filter(o => o.status === 'waiting_confirm')
  const waitingPickup = orders.filter(o => o.status === 'waiting_pickup')

  // Sound on new orders
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

  const elapsed = (dateStr: string) => {
    const ms = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(ms / 60000)
    if (mins < 1) return 'Vừa xong'
    if (mins < 60) return `${mins} phút`
    return `${Math.floor(mins / 60)}h ${mins % 60}m`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
            <ChefHat className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="page-title mb-0">Kitchen Display</h1>
            <p className="text-xs text-gray-400">Cập nhật mỗi 10 giây · {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('vi-VN') : '--:--:--'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSoundEnabled(!soundEnabled)} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-all', soundEnabled ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-500')}>
            {soundEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            {soundEnabled ? 'Âm thanh bật' : 'Âm thanh tắt'}
          </button>
        </div>
      </div>

      {isLoading && <div className="flex justify-center py-8"><RefreshCw className="w-6 h-6 animate-spin text-primary-400" /></div>}

      <div className="grid grid-cols-2 gap-4">
        {/* Chờ xác nhận */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />
            <h2 className="font-semibold text-gray-800">Chờ xác nhận</h2>
            <span className="ml-auto bg-yellow-100 text-yellow-700 text-xs font-bold px-2 py-0.5 rounded-full">{waitingConfirm.length}</span>
          </div>
          <div className="space-y-3">
            {waitingConfirm.length === 0 && (
              <div className="card p-8 text-center text-gray-400 text-sm">Không có đơn chờ xác nhận</div>
            )}
            {waitingConfirm.map(order => (
              <div key={order._id} className="card border-l-4 border-yellow-400 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="font-mono text-sm font-bold text-primary-600">#{order.shortId}</span>
                    <span className={cn('badge text-xs ml-2', CHANNEL_SOURCE_COLOR[order.source])}>{CHANNEL_SOURCE_LABEL[order.source]}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    {elapsed(order.placedAt)}
                  </div>
                </div>
                <div className="text-sm font-medium text-gray-700 mb-1">{order.customerName}</div>
                <div className="space-y-1 mb-3">
                  {(order.items ?? []).map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-bold text-primary-600 w-6 text-center">{item.quantity}x</span>
                      <span className="text-gray-700">{item.name}</span>
                      {item.note && <span className="text-xs text-orange-500 italic">({item.note})</span>}
                    </div>
                  ))}
                </div>
                {order.note && <div className="text-xs text-red-500 bg-red-50 rounded p-1.5 mb-2">📝 {order.note}</div>}
                <button onClick={() => handleConfirm(order)} disabled={updateMutation.isPending} className="w-full btn-primary py-2 text-sm">
                  ✓ Xác nhận & Vào bếp
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Đang chuẩn bị */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
            <h2 className="font-semibold text-gray-800">Đang chuẩn bị</h2>
            <span className="ml-auto bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">{waitingPickup.length}</span>
          </div>
          <div className="space-y-3">
            {waitingPickup.length === 0 && (
              <div className="card p-8 text-center text-gray-400 text-sm">Không có đơn đang chuẩn bị</div>
            )}
            {waitingPickup.map(order => (
              <div key={order._id} className="card border-l-4 border-blue-400 p-4">
                <div className="flex items-start justify-between mb-2">
                  <span className="font-mono text-sm font-bold text-primary-600">#{order.shortId}</span>
                  <div className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    {elapsed(order.placedAt)}
                  </div>
                </div>
                <div className="text-sm font-medium text-gray-700 mb-1">{order.customerName}</div>
                <div className="space-y-1 mb-3">
                  {(order.items ?? []).map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="font-bold text-blue-600 w-6 text-center">{item.quantity}x</span>
                      <span className="text-gray-700">{item.name}</span>
                    </div>
                  ))}
                </div>
                <button onClick={() => handleDone(order)} disabled={updateMutation.isPending} className="w-full bg-green-500 hover:bg-green-600 text-white rounded-xl py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  <CheckCircle className="w-4 h-4" /> Xong — Sẵn lấy hàng
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
