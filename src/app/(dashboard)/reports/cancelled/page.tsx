'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useCancelledReport } from '@/hooks/use-data'
import { cn, formatCurrency, formatDate, CHANNEL_SOURCE_LABEL, CHANNEL_SOURCE_COLOR } from '@/lib/utils'

const DAYS_OPTIONS = [7, 30, 90]

export default function CancelledReportPage() {
  const [days, setDays] = useState(30)
  const { data, isLoading } = useCancelledReport({ days })
  const rows = (data?.rows ?? []) as Record<string, unknown>[]
  const summary = data?.summary as { totalCancelled?: number; totalLostRevenue?: number; reasons?: { reason: string; count: number }[] } | undefined

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Báo cáo đơn hủy</h1>
          <p className="page-subtitle">{isLoading ? '...' : `${rows.length} đơn bị hủy`}</p>
        </div>
        <div className="flex gap-1">
          {DAYS_OPTIONS.map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={cn('px-3 py-1.5 rounded-lg text-sm font-medium border transition-all', days === d ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50')}>
              {d} ngày
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="text-sm text-gray-500">Tổng đơn hủy</div>
          <div className="text-2xl font-bold text-red-500 mt-1">{(summary?.totalCancelled ?? 0).toLocaleString('vi-VN')}</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-gray-500">Doanh thu bị mất</div>
          <div className="text-2xl font-bold text-red-500 mt-1">{formatCurrency(summary?.totalLostRevenue ?? 0)}</div>
        </div>
        {summary?.reasons && summary.reasons.length > 0 && (
          <div className="card p-5">
            <div className="text-sm text-gray-500 mb-2">Lý do hủy phổ biến</div>
            <div className="space-y-1">
              {summary.reasons.slice(0, 3).map(r => (
                <div key={r.reason} className="flex justify-between text-xs">
                  <span className="text-gray-600 truncate max-w-[120px]">{r.reason || 'Không rõ'}</span>
                  <span className="font-semibold text-red-500">{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-primary-400" /></div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Mã đơn</th><th>Khách hàng</th><th>Kênh</th><th className="text-right">Tổng tiền</th><th>Lý do hủy</th><th>Thời gian hủy</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400">Không có đơn hủy nào</td></tr>
                ) : rows.map((o, i) => (
                  <tr key={String(o._id ?? i)}>
                    <td><span className="font-mono text-sm text-red-500">{String(o.shortId ?? '')}</span></td>
                    <td className="font-medium text-sm">{String(o.customerName ?? '-')}</td>
                    <td><span className={cn('badge text-xs', CHANNEL_SOURCE_COLOR[String(o.source)] ?? 'badge-gray')}>{CHANNEL_SOURCE_LABEL[String(o.source)] ?? String(o.source)}</span></td>
                    <td className="text-right font-semibold">{formatCurrency(Number(o.total ?? 0))}</td>
                    <td className="text-sm text-red-500">{String(o.cancelReason ?? 'Không rõ')}</td>
                    <td className="text-xs text-gray-400">{o.cancelledAt ? formatDate(String(o.cancelledAt), 'dd/MM HH:mm') : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
