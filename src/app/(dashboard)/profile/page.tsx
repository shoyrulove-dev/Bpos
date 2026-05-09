'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { User, Phone, Mail, Shield, Camera, Key, LogOut } from 'lucide-react'
import { signOut } from 'next-auth/react'

export default function ProfilePage() {
  const { data: session } = useSession()
  const [showChangePw, setShowChangePw] = useState(false)
  const [form, setForm] = useState({ name: session?.user?.name ?? '', phone: '' })
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
