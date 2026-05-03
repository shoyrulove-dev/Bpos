'use client'

import { useState } from 'react'
import { Plus, Search, MapPin, Edit, Trash2 } from 'lucide-react'
import { mockHubs } from '@/lib/mock-data'
import { cn } from '@/lib/utils'
import type { Hub } from '@/types'

export default function HubsPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [hubs, setHubs] = useState<Hub[]>(mockHubs)
  const [showForm, setShowForm] = useState(false)
  const [editHub, setEditHub] = useState<Hub | null>(null)
  const [form, setForm] = useState({ code: '', name: '', address: '', brandId: '', servicePackage: 'basic', status: 'active' })

  const filtered = hubs.filter(h => {
    const q = search.toLowerCase()
    const matchSearch = h.name.toLowerCase().includes(q) || h.code.toLowerCase().includes(q) || h.address.toLowerCase().includes(q)
    const matchStatus = !statusFilter || h.status === statusFilter
    return matchSearch && matchStatus
  })

  const openCreate = () => {
    setEditHub(null)
    setForm({ code: '', name: '', address: '', brandId: '', servicePackage: 'basic', status: 'active' })
    setShowForm(true)
  }

  const openEdit = (h: Hub) => {
    setEditHub(h)
    setForm({ code: h.code, name: h.name, address: h.address, brandId: h.brandId, servicePackage: h.servicePackage, status: h.status })
    setShowForm(true)
  }

  const handleSave = () => {
    if (!form.code || !form.name || !form.address) return
    if (editHub) {
      setHubs(prev => prev.map(h => h._id === editHub._id ? { ...h, ...form, servicePackage: form.servicePackage as Hub['servicePackage'], status: form.status as Hub['status'], updatedAt: new Date().toISOString() } : h))
    } else {
      const newHub: Hub = {
        _id: `hub-${Date.now()}`,
        ...form,
        servicePackage: form.servicePackage as Hub['servicePackage'],
        status: form.status as Hub['status'],
        linkedChannels: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setHubs(prev => [newHub, ...prev])
    }
    setShowForm(false)
  }

  const handleDelete = (id: string) => {
    if (confirm('Xóa điểm bán này?')) setHubs(prev => prev.filter(h => h._id !== id))
  }

  const packageLabel: Record<string, string> = { basic: 'Cơ bản', standard: 'Tiêu chuẩn', premium: 'Cao cấp' }
  const packageColor: Record<string, string> = { basic: 'badge-gray', standard: 'badge-blue', premium: 'badge-orange' }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Điểm bán</h1>
          <p className="page-subtitle">{hubs.length} điểm bán trong hệ thống</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> Thêm điểm bán
        </button>
      </div>

      <div className="card card-body">
        <div className="filter-bar">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input pl-9" placeholder="Tìm điểm bán..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input w-40" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            <option value="active">Hoạt động</option>
            <option value="inactive">Ngừng hoạt động</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Mã điểm bán</th>
                <th>Tên điểm bán</th>
                <th>Thương hiệu</th>
                <th>Địa chỉ</th>
                <th>Gói dịch vụ</th>
                <th>Kênh liên kết</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400">Không tìm thấy điểm bán</td></tr>
              ) : filtered.map(hub => (
                <tr key={hub._id}>
                  <td><span className="font-mono text-sm font-medium text-primary-600">{hub.code}</span></td>
                  <td><p className="font-medium text-gray-900">{hub.name}</p></td>
                  <td><span className="text-sm text-gray-500">{hub.brandName}</span></td>
                  <td>
                    <div className="flex items-start gap-1.5 max-w-[200px]">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-500 line-clamp-2">{hub.address}</span>
                    </div>
                  </td>
                  <td><span className={cn('badge', packageColor[hub.servicePackage])}>{packageLabel[hub.servicePackage]}</span></td>
                  <td><span className="text-sm text-gray-500">{hub.linkedChannels.length} kênh</span></td>
                  <td>
                    <span className={cn('badge', hub.status === 'active' ? 'badge-green' : 'badge-red')}>
                      {hub.status === 'active' ? 'Hoạt động' : 'Ngừng'}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(hub)} className="btn-ghost btn-sm p-1.5"><Edit className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(hub._id)} className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{editHub ? 'Cập nhật điểm bán' : 'Thêm điểm bán'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="label">Mã điểm bán *</label>
                  <input className="input uppercase" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="PL-Q1-001" />
                </div>
                <div className="form-group">
                  <label className="label">Gói dịch vụ</label>
                  <select className="input" value={form.servicePackage} onChange={e => setForm({ ...form, servicePackage: e.target.value })}>
                    <option value="basic">Cơ bản</option>
                    <option value="standard">Tiêu chuẩn</option>
                    <option value="premium">Cao cấp</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="label">Tên điểm bán *</label>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Phúc Long Nguyễn Huệ" />
              </div>
              <div className="form-group">
                <label className="label">Địa chỉ *</label>
                <input className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="123 Nguyễn Huệ, Q.1..." />
              </div>
              <div className="form-group">
                <label className="label">Trạng thái</label>
                <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Hoạt động</option>
                  <option value="inactive">Ngừng hoạt động</option>
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="btn-outline">Hủy</button>
              <button onClick={handleSave} className="btn-primary">Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
