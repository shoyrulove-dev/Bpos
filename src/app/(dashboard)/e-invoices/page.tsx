'use client'

import { useState } from 'react'
import { Plus, Link, Unlink, Building2 } from 'lucide-react'
import { mockEInvoiceConnections } from '@/lib/mock-data'
import { cn, formatDate } from '@/lib/utils'
import type { EInvoiceConnection } from '@/types'

const PROVIDERS = [
  { value: 'viettel', label: 'Viettel-S', color: 'bg-red-100 text-red-700' },
  { value: 'vnpt', label: 'VNPT', color: 'bg-blue-100 text-blue-700' },
  { value: 'misa', label: 'MISA', color: 'bg-orange-100 text-orange-700' },
  { value: 'bkav', label: 'BKAV', color: 'bg-green-100 text-green-700' },
  { value: 'other', label: 'Khác', color: 'bg-gray-100 text-gray-700' },
]

export default function EInvoicesPage() {
  const [connections, setConnections] = useState<EInvoiceConnection[]>(mockEInvoiceConnections)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ provider: 'viettel', taxCode: '', username: '', password: '' })

  const handleConnect = () => {
    setConnections(prev => [{
      _id: `einv-${Date.now()}`,
      provider: form.provider as EInvoiceConnection['provider'],
      brandId: 'brand-1',
      brandName: 'Trà Sữa Phúc Long',
      taxCode: form.taxCode,
      username: form.username,
      isConnected: true,
      connectedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, ...prev])
    setShowForm(false)
    setForm({ provider: 'viettel', taxCode: '', username: '', password: '' })
  }

  const providerInfo = (value: string) => PROVIDERS.find(p => p.value === value)

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div><h1 className="page-title">Hóa đơn điện tử</h1><p className="page-subtitle">Kết nối nhà cung cấp HĐĐT</p></div>
        <button onClick={() => setShowForm(true)} className="btn-primary"><Plus className="w-4 h-4" /> Thêm kết nối</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {connections.map(conn => {
          const prov = providerInfo(conn.provider)
          return (
            <div key={conn._id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <span className={cn('text-sm font-bold px-3 py-1.5 rounded-lg', prov?.color)}>
                  {prov?.label}
                </span>
                <div className="flex gap-1">
                  <button className={cn('btn-ghost btn-sm p-1.5', conn.isConnected ? 'text-green-500' : 'text-gray-400')}>
                    {conn.isConnected ? <Link className="w-4 h-4" /> : <Unlink className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-gray-700 mt-2">
                <Building2 className="w-3.5 h-3.5 text-gray-400" />
                <span>{conn.brandName}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">MST: <span className="font-mono font-medium">{conn.taxCode}</span></p>
              <p className="text-xs text-gray-400">Tài khoản: <span className="font-medium">{conn.username}</span></p>
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                <span className={cn('badge', conn.isConnected ? 'badge-green' : 'badge-red')}>
                  {conn.isConnected ? 'Đã kết nối' : 'Ngắt kết nối'}
                </span>
                <span className="text-xs text-gray-400">{conn.connectedAt ? formatDate(conn.connectedAt, 'dd/MM/yyyy') : '—'}</span>
              </div>
            </div>
          )
        })}

        {/* Add card */}
        <button onClick={() => setShowForm(true)} className="border-2 border-dashed border-gray-200 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-primary-300 hover:text-primary-500 transition-colors min-h-[180px]">
          <Plus className="w-8 h-8" />
          <span className="text-sm font-medium">Thêm kết nối mới</span>
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Thêm kết nối HĐĐT</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="form-group">
                <label className="label">Nhà cung cấp</label>
                <select className="input" value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}>
                  {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Mã số thuế</label>
                <input className="input font-mono" value={form.taxCode} onChange={e => setForm({ ...form, taxCode: e.target.value })} placeholder="0123456789" />
              </div>
              <div className="form-group">
                <label className="label">Tên đăng nhập</label>
                <input className="input" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="username" />
              </div>
              <div className="form-group">
                <label className="label">Mật khẩu</label>
                <input type="password" className="input" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="btn-outline">Hủy</button>
              <button onClick={handleConnect} className="btn-primary">Kết nối</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
