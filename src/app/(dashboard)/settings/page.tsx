'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Printer, Volume2 } from 'lucide-react'
import { DEFAULT_ORDER_ALERT_SETTINGS, loadOrderAlertSettings, persistOrderAlertSettings, playOrderAlert, type OrderAlertSettings } from '@/lib/order-alerts'

export default function SettingsPage() {
  const [orderSettings, setOrderSettings] = useState<OrderAlertSettings>(DEFAULT_ORDER_ALERT_SETTINGS)
  const [settingsSaved, setSettingsSaved] = useState(false)

  useEffect(() => {
    setOrderSettings(loadOrderAlertSettings())
  }, [])

  const handleSaveOrderSettings = () => {
    persistOrderAlertSettings(orderSettings)
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

        <div className="grid gap-4 md:grid-cols-2">
          <div className="form-group">
            <label className="label">Tên máy in</label>
            <input
              className="input"
              value={orderSettings.printerName}
              onChange={(event) => setOrderSettings((prev) => ({ ...prev, printerName: event.target.value }))}
              placeholder="VD: Xprinter XP-T80L"
            />
          </div>
          <div className="form-group">
            <label className="label">Khổ giấy mặc định</label>
            <select
              className="input"
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

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => playOrderAlert(1)} className="btn-outline">
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