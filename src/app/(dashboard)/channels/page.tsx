'use client'

import { useState } from 'react'
import { Plus, Search, Settings, ToggleLeft, ToggleRight, Edit, Unlink } from 'lucide-react'
import { mockChannels } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import { CHANNEL_SOURCE_LABEL, CHANNEL_SOURCE_COLOR } from '@/lib/utils'
import type { Channel } from '@/types'

export default function ChannelsPage() {
  const [search, setSearch] = useState('')
  const [channels, setChannels] = useState<Channel[]>(mockChannels)
  const [showForm, setShowForm] = useState(false)

  const filtered = channels.filter(c => {
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.brandName?.toLowerCase().includes(q) || ''
  })

  const toggle = (id: string, field: keyof Channel) => {
    setChannels(prev => prev.map(c => c._id === id ? { ...c, [field]: !c[field as keyof Channel] } : c))
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Kênh bán</h1>
          <p className="page-subtitle">Kết nối và quản lý kênh bán từ các sàn</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Thêm kênh bán
        </button>
      </div>

      <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-700 flex items-center gap-2">
        <Settings className="w-4 h-4 flex-shrink-0" />
        <span>Chức năng thêm kênh bán chỉ dành cho <strong>Admin</strong>. Nhân viên (User) có thể xem và điều chỉnh cấu hình vận hành của kênh đã kết nối.</span>
      </div>

      <div className="card card-body">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9 w-full max-w-sm" placeholder="Tìm kênh bán..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map(channel => (
          <div key={channel._id} className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn('badge', CHANNEL_SOURCE_COLOR[channel.source])}>
                    {CHANNEL_SOURCE_LABEL[channel.source]}
                  </span>
                  <span className={cn('badge', channel.status === 'active' ? 'badge-green' : 'badge-red')}>
                    {channel.status === 'active' ? 'Đã kết nối' : 'Ngắt kết nối'}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900">{channel.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{channel.brandName} · {channel.hubName}</p>
                {channel.externalStoreId && (
                  <p className="text-xs font-mono text-gray-400">Store ID: {channel.externalStoreId}</p>
                )}
              </div>
              <div className="flex gap-1">
                <button className="btn-ghost btn-sm p-1.5"><Edit className="w-3.5 h-3.5" /></button>
                <button className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50"><Unlink className="w-3.5 h-3.5" /></button>
              </div>
            </div>

            {/* Config toggles */}
            <div className="space-y-2 pt-3 border-t border-gray-100">
              {[
                { key: 'isPageActive', label: 'Trang bán hàng' },
                { key: 'isStoreOpen', label: 'Cửa hàng mở cửa' },
                { key: 'isManualConfirm', label: 'Xác nhận thủ công' },
                { key: 'autoInvoice', label: 'Tự động phát sinh HĐĐT' },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{label}</span>
                  <button
                    onClick={() => toggle(channel._id, key as keyof Channel)}
                    className={cn(
                      'transition-colors',
                      (channel[key as keyof Channel] as boolean) ? 'text-green-500' : 'text-gray-300'
                    )}
                  >
                    {(channel[key as keyof Channel] as boolean)
                      ? <ToggleRight className="w-6 h-6" />
                      : <ToggleLeft className="w-6 h-6" />
                    }
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Thêm kênh bán</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="form-group">
                <label className="label">Tên kênh bán</label>
                <input className="input" placeholder="Shopee Food - Phúc Long Q1" />
              </div>
              <div className="form-group">
                <label className="label">Nguồn</label>
                <select className="input">
                  <option value="shopee">Shopee Food</option>
                  <option value="grab">GrabFood</option>
                  <option value="xanh_sm">Xanh SM</option>
                  <option value="be">Be</option>
                  <option value="internal">Nội bộ</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Store ID (từ sàn)</label>
                <input className="input font-mono" placeholder="SPE-12345" />
              </div>
              <div className="form-group">
                <label className="label">Access Token</label>
                <input type="password" className="input font-mono" placeholder="Token từ sàn..." />
              </div>
              <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
                Để lấy Store ID và Access Token, vui lòng truy cập trang developer của từng sàn hoặc liên hệ hỗ trợ BPOS.
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="btn-outline">Hủy</button>
              <button onClick={() => setShowForm(false)} className="btn-primary">Kết nối</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
