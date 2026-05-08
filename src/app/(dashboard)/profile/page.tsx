'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { User, Phone, Mail, Shield, Camera, Key, LogOut, Printer, Volume2 } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { DEFAULT_ORDER_ALERT_SETTINGS, loadOrderAlertSettings, persistOrderAlertSettings, playOrderAlert, type OrderAlertSettings } from '@/lib/order-alerts'

export default function ProfilePage() {
  const { data: session } = useSession()
  const [showChangePw, setShowChangePw] = useState(false)
  const [form, setForm] = useState({ name: session?.user?.name ?? '', phone: '' })
  const [saved, setSaved] = useState(false)
  const [orderSettings, setOrderSettings] = useState<OrderAlertSettings>(DEFAULT_ORDER_ALERT_SETTINGS)
  const [settingsSaved, setSettingsSaved] = useState(false)

  useEffect(() => {
    setOrderSettings(loadOrderAlertSettings())
  }, [])

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleSaveOrderSettings = () => {
    persistOrderAlertSettings(orderSettings)
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="page-header">
        <div><h1 className="page-title">Hồ sơ cá nhân</h1><p className="page-subtitle">Quản lý thông tin tài khoản</p></div>
      </div>

      {/* Avatar */}
      <div className="card p-6">
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-primary-500 flex items-center justify-center text-white text-2xl font-bold">
              {session?.user?.name?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <button className="absolute -bottom-1 -right-1 w-7 h-7 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:bg-gray-50 shadow-sm">
              <Camera className="w-3.5 h-3.5 text-gray-500" />
            </button>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{session?.user?.name}</h2>
            <p className="text-sm text-gray-400">{session?.user?.email}</p>
            <span className={`badge mt-1 ${(session?.user as { role?: string })?.role === 'admin' ? 'badge-purple' : 'badge-blue'}`}>
              {(session?.user as { role?: string })?.role === 'admin' ? 'Admin' : 'User'}
            </span>
          </div>
        </div>
      </div>

      {/* Profile form */}
      <div className="card p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">Thông tin cá nhân</h3>
        <div className="form-group">
          <label className="label"><User className="w-3.5 h-3.5 inline mr-1" />Họ và tên</label>
          <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="label"><Mail className="w-3.5 h-3.5 inline mr-1" />Email</label>
          <input className="input bg-gray-50" value={session?.user?.email ?? ''} disabled />
        </div>
        <div className="form-group">
          <label className="label"><Phone className="w-3.5 h-3.5 inline mr-1" />Số điện thoại</label>
          <input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="0901234567" />
        </div>
        <div className="form-group">
          <label className="label"><Shield className="w-3.5 h-3.5 inline mr-1" />Vai trò</label>
          <input className="input bg-gray-50 capitalize" value={(session?.user as { role?: string })?.role ?? ''} disabled />
        </div>
        <button onClick={handleSave} className="btn-primary">
          {saved ? '✓ Đã lưu' : 'Lưu thay đổi'}
        </button>
      </div>

      <div id="order-alert-settings" className="card p-6 space-y-4 scroll-mt-24">
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Printer className="w-4 h-4" /> Cài đặt in đơn và âm thanh</h3>
          <p className="text-sm text-gray-500 mt-1">Bật tắt âm báo, tự động in và chọn khổ giấy mặc định cho đơn hàng.</p>
        </div>

        <label className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Âm thanh đơn mới</p>
            <p className="text-xs text-gray-500">Phát âm báo khi có đơn mới</p>
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
            <p className="text-xs text-gray-500">Tự mở phiếu in khi có đơn mới vào hàng chờ</p>
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
            <Volume2 className="w-4 h-4" /> Test âm thanh
          </button>
          <button type="button" onClick={handleSaveOrderSettings} className="btn-primary">
            {settingsSaved ? '✓ Đã lưu cài đặt' : 'Lưu cài đặt in / âm thanh'}
          </button>
        </div>
      </div>

      {/* Change password */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900"><Key className="w-4 h-4 inline mr-1.5" />Đổi mật khẩu</h3>
          <button onClick={() => setShowChangePw(!showChangePw)} className="btn-outline btn-sm">
            {showChangePw ? 'Hủy' : 'Đổi mật khẩu'}
          </button>
        </div>
        {showChangePw && (
          <div className="space-y-4">
            <div className="form-group">
              <label className="label">Mật khẩu hiện tại</label>
              <input type="password" className="input" placeholder="••••••" />
            </div>
            <div className="form-group">
              <label className="label">Mật khẩu mới</label>
              <input type="password" className="input" placeholder="••••••" />
            </div>
            <div className="form-group">
              <label className="label">Xác nhận mật khẩu mới</label>
              <input type="password" className="input" placeholder="••••••" />
            </div>
            <button className="btn-primary">Cập nhật mật khẩu</button>
          </div>
        )}
      </div>

      {/* Logout */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900">Đăng xuất</p>
            <p className="text-sm text-gray-400">Kết thúc phiên làm việc hiện tại</p>
          </div>
          <button onClick={() => signOut({ callbackUrl: '/login' })} className="btn-danger flex items-center gap-2">
            <LogOut className="w-4 h-4" /> Đăng xuất
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-gray-300">BPOS Portal v1.0.0 · 2024</p>
    </div>
  )
}
