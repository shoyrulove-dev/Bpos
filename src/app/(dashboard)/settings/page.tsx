'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Printer, Volume2 } from 'lucide-react'
import { DEFAULT_ORDER_ALERT_SETTINGS, loadOrderAlertSettings, persistOrderAlertSettings, playOrderAlert, type OrderAlertSettings } from '@/lib/order-alerts'

export default function SettingsPage() {
  const { data: session } = useSession()
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === 'admin'
  const [orderSettings, setOrderSettings] = useState<OrderAlertSettings>(DEFAULT_ORDER_ALERT_SETTINGS)
  const [settingsSaved, setSettingsSaved] = useState(false)

  useEffect(() => {
    setOrderSettings(loadOrderAlertSettings())

    void fetch('/api/settings/order-alerts')
      .then(async (response) => {
        if (!response.ok) return null
        return response.json() as Promise<{ voiceMessage?: string; soundRepeatCount?: number }>
      })
      .then((payload) => {
        if (!payload?.voiceMessage) return
        setOrderSettings((prev) => ({
          ...prev,
          voiceMessage: payload.voiceMessage || prev.voiceMessage,
          soundRepeatCount: typeof payload.soundRepeatCount === 'number' ? payload.soundRepeatCount : prev.soundRepeatCount,
        }))
      })
      .catch(() => null)
  }, [])

  const handleSaveOrderSettings = async () => {
    persistOrderAlertSettings(orderSettings)

    if (isAdmin) {
      await fetch('/api/settings/order-alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceMessage: orderSettings.voiceMessage, soundRepeatCount: orderSettings.soundRepeatCount }),
      }).catch(() => null)
    }

    setSettingsSaved(true)
    window.setTimeout(() => setSettingsSaved(false), 2000)
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cài đặt</h1>
          <p className="page-subtitle">Quản lý âm thanh, tự động in và cấu hình in đơn mặc định.</p>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><Printer className="h-4 w-4" /> In đơn và âm thanh</h2>
          <p className="mt-1 text-sm text-gray-500">Mục này được tách riêng để dễ tìm và chỉnh khi vận hành.</p>
        </div>

        <label className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Âm thanh đơn mới</p>
            <p className="text-xs text-gray-500">Phát âm báo khi có đơn mới chưa hoàn thành.</p>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={orderSettings.soundEnabled}
            onChange={(event) => setOrderSettings((prev) => ({ ...prev, soundEnabled: event.target.checked }))}
          />
        </label>

        <label className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Tự động in đơn mới</p>
            <p className="text-xs text-gray-500">Tự mở phiếu in khi đơn mới vào hàng chờ xử lý.</p>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={orderSettings.autoPrintEnabled}
            onChange={(event) => setOrderSettings((prev) => ({ ...prev, autoPrintEnabled: event.target.checked }))}
          />
        </label>

        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div>
                <p className="text-sm font-medium text-gray-900">Câu thông báo đọc lên</p>
                <p className="text-xs text-gray-500">{isAdmin ? 'Admin có thể đổi câu này.' : 'Chỉ admin mới được đổi câu thông báo chung.'}</p>
              </div>
              <p className="text-sm font-medium text-gray-900 flex-shrink-0">Số lần phát</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <textarea
                  className="input w-full resize-none text-sm"
                  rows={2}
                  maxLength={200}
                  value={orderSettings.voiceMessage}
                  onChange={(event) => setOrderSettings((prev) => ({ ...prev, voiceMessage: event.target.value }))}
                  readOnly={!isAdmin}
                  placeholder="Anh ơi. Mình có đơn hàng mới. Anh kiểm tra giúp em nhé."
                />
                <p className="mt-0.5 text-right text-[11px] text-gray-400">{orderSettings.voiceMessage.length}/200</p>
              </div>
              <input
                type="number"
                min={1}
                className="input w-20 text-center text-sm flex-shrink-0"
                value={orderSettings.soundRepeatCount}
                onChange={(event) => {
                  const val = parseInt(event.target.value, 10)
                  setOrderSettings((prev) => ({ ...prev, soundRepeatCount: Number.isFinite(val) && val > 0 ? val : prev.soundRepeatCount }))
                }}
                disabled={!isAdmin}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-gray-100">
            <div className="px-4 py-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Tên máy in</p>
              <input
                className="input text-sm"
                value={orderSettings.printerName}
                onChange={(event) => setOrderSettings((prev) => ({ ...prev, printerName: event.target.value }))}
                placeholder="VD: Xprinter XP-T80L"
              />
            </div>
            <div className="px-4 py-3">
              <p className="text-xs font-medium text-gray-500 mb-1">Khổ giấy mặc định</p>
              <select
                className="input text-sm"
                value={orderSettings.printerPaperSize}
                onChange={(event) => setOrderSettings((prev) => ({
                  ...prev,
                  printerPaperSize: event.target.value as OrderAlertSettings['printerPaperSize'],
                }))}
              >
                <option value="80mm">80mm</option>
                <option value="58mm">58mm</option>
                <option value="A4">A4</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => playOrderAlert(1, orderSettings.voiceMessage)} className="btn-outline">
            <Volume2 className="h-4 w-4" /> Test âm thanh
          </button>
          <button type="button" onClick={handleSaveOrderSettings} className="btn-primary">
            {settingsSaved ? '✓ Đã lưu cài đặt' : 'Lưu cài đặt'}
          </button>
          <Link href="/orders" className="btn-outline">Về danh sách đơn</Link>
        </div>
      </div>
    </div>
  )
}