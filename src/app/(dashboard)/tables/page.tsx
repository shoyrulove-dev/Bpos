'use client'

import { useState } from 'react'
import { Plus, Grid3X3, List, Edit, Trash2, Loader2, Users } from 'lucide-react'
import { useTables, useCreateTable, useUpdateTable, useDeleteTable } from '@/hooks/use-data'
import { cn, TABLE_STATUS_LABEL, TABLE_STATUS_COLOR } from '@/lib/utils'
import type { Table, TableStatus } from '@/types'

const STATUS_OPTS: { value: TableStatus; label: string }[] = [
  { value: 'available', label: 'Trống' },
  { value: 'occupied', label: 'Đang dùng' },
  { value: 'reserved', label: 'Đặt trước' },
  { value: 'cleaning', label: 'Đang dọn' },
]

const TABLE_STATUS_BG: Record<string, string> = {
  available: 'bg-green-50 border-green-200 hover:bg-green-100',
  occupied: 'bg-red-50 border-red-200 hover:bg-red-100',
  reserved: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
  cleaning: 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100',
}

const emptyForm = { name: '', zone: 'Tầng 1', capacity: '4', hubId: '', brandId: '', note: '' }

export default function TablesPage() {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [zoneFilter, setZoneFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<TableStatus | ''>('')
  const [showForm, setShowForm] = useState(false)
  const [editTable, setEditTable] = useState<Table | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>(emptyForm)
  const [changeStatus, setChangeStatus] = useState<Table | null>(null)

  const { data: rawTables = [], isLoading } = useTables()
  const tables = rawTables as Table[]
  const createMutation = useCreateTable()
  const updateMutation = useUpdateTable()
  const deleteMutation = useDeleteTable()
  const saving = createMutation.isPending || updateMutation.isPending

  const zones = Array.from(new Set(tables.map(t => t.zone))).sort()
  const filtered = tables.filter(t =>
    (!zoneFilter || t.zone === zoneFilter) &&
    (!statusFilter || t.status === statusFilter)
  )

  const openCreate = () => { setEditTable(null); setForm(emptyForm); setShowForm(true) }
  const openEdit = (t: Table) => {
    setEditTable(t)
    setForm({ name: t.name, zone: t.zone, capacity: String(t.capacity), hubId: t.hubId, brandId: t.brandId, note: t.note || '' })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.hubId || !form.brandId) return
    const payload = { ...form, capacity: Number(form.capacity) || 4 }
    if (editTable) await updateMutation.mutateAsync({ id: editTable._id, ...payload })
    else await createMutation.mutateAsync(payload)
    setShowForm(false)
  }

  const handleStatusChange = async (status: TableStatus) => {
    if (!changeStatus) return
    await updateMutation.mutateAsync({ id: changeStatus._id, status })
    setChangeStatus(null)
  }

  const counts = { available: 0, occupied: 0, reserved: 0, cleaning: 0 }
  tables.forEach(t => { counts[t.status] = (counts[t.status] ?? 0) + 1 })

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý bàn</h1>
          <p className="page-subtitle">{tables.length} bàn — {counts.available} trống, {counts.occupied} đang dùng</p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => setViewMode('grid')} className={cn('px-3 py-1.5', viewMode === 'grid' ? 'bg-gray-100' : 'bg-white hover:bg-gray-50')}>
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('list')} className={cn('px-3 py-1.5 border-l border-gray-200', viewMode === 'list' ? 'bg-gray-100' : 'bg-white hover:bg-gray-50')}>
              <List className="w-4 h-4" />
            </button>
          </div>
          <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Thêm bàn</button>
        </div>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-4 gap-3">
        {STATUS_OPTS.map(opt => (
          <button key={opt.value} onClick={() => setStatusFilter(statusFilter === opt.value ? '' : opt.value)}
            className={cn('card p-4 text-left transition-all hover:shadow-md', statusFilter === opt.value ? 'ring-2 ring-primary-400' : '')}>
            <div className={cn('text-2xl font-bold', opt.value === 'available' ? 'text-green-600' : opt.value === 'occupied' ? 'text-red-500' : opt.value === 'reserved' ? 'text-blue-600' : 'text-yellow-600')}>{counts[opt.value]}</div>
            <div className="text-xs text-gray-500 mt-0.5">{opt.label}</div>
          </button>
        ))}
      </div>

      {/* Zones filter */}
      {zones.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setZoneFilter('')} className={cn('px-3 py-1.5 rounded-lg text-sm border transition-all', !zoneFilter ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-500 border-gray-200')}>
            Tất cả
          </button>
          {zones.map(z => (
            <button key={z} onClick={() => setZoneFilter(zoneFilter === z ? '' : z)}
              className={cn('px-3 py-1.5 rounded-lg text-sm border transition-all', zoneFilter === z ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-gray-500 border-gray-200')}>
              {z}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-primary-400" /></div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {filtered.map(t => (
            <button key={t._id} onClick={() => setChangeStatus(t)}
              className={cn('card p-4 text-center border-2 transition-all cursor-pointer', TABLE_STATUS_BG[t.status])}>
              <div className="text-2xl mb-1">🪑</div>
              <div className="font-bold text-gray-900 text-sm">{t.name}</div>
              <div className="text-xs text-gray-500 mb-2">{t.zone}</div>
              <div className="flex items-center justify-center gap-1 text-xs text-gray-400 mb-2">
                <Users className="w-3 h-3" /> {t.capacity}
              </div>
              <span className={cn('badge text-xs', TABLE_STATUS_COLOR[t.status])}>{TABLE_STATUS_LABEL[t.status]}</span>
              <div className="flex justify-center gap-1 mt-2">
                <button onClick={e => { e.stopPropagation(); openEdit(t) }} className="w-6 h-6 rounded hover:bg-white/60 flex items-center justify-center">
                  <Edit className="w-3 h-3 text-gray-500" />
                </button>
                <button onClick={e => { e.stopPropagation(); if (confirm('Xóa bàn này?')) deleteMutation.mutate(t._id) }} className="w-6 h-6 rounded hover:bg-white/60 flex items-center justify-center">
                  <Trash2 className="w-3 h-3 text-red-400" />
                </button>
              </div>
            </button>
          ))}
          {filtered.length === 0 && <div className="col-span-full text-center py-12 text-gray-400">Không có bàn nào</div>}
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Tên bàn</th><th>Khu vực</th><th>Cửa hàng</th><th className="text-center">Sức chứa</th><th>Trạng thái</th><th>QR Token</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t._id}>
                    <td className="font-medium">{t.name}</td>
                    <td><span className="badge badge-gray">{t.zone}</span></td>
                    <td className="text-sm text-gray-500">{t.hubName || t.hubId}</td>
                    <td className="text-center"><span className="flex items-center justify-center gap-1 text-sm"><Users className="w-3.5 h-3.5 text-gray-400" />{t.capacity}</span></td>
                    <td><span className={cn('badge', TABLE_STATUS_COLOR[t.status])}>{TABLE_STATUS_LABEL[t.status]}</span></td>
                    <td><span className="font-mono text-xs text-gray-400">{t.qrToken?.substring(0, 8)}...</span></td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => setChangeStatus(t)} className="btn-outline btn-sm text-xs px-2">Đổi trạng thái</button>
                        <button onClick={() => openEdit(t)} className="btn-ghost btn-sm p-1.5"><Edit className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { if (confirm('Xóa bàn này?')) deleteMutation.mutate(t._id) }} className="btn-ghost btn-sm p-1.5 text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="font-semibold text-gray-900">{editTable ? 'Cập nhật bàn' : 'Thêm bàn mới'}</h2>
              <button onClick={() => setShowForm(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">&times;</button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Tên bàn *</label>
                  <input className="input" value={String(form.name || '')} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Bàn 01" />
                </div>
                <div>
                  <label className="label">Khu vực</label>
                  <input className="input" value={String(form.zone || '')} onChange={e => setForm({ ...form, zone: e.target.value })} placeholder="Tầng 1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Sức chứa (người)</label>
                  <input type="number" className="input" value={String(form.capacity || '')} onChange={e => setForm({ ...form, capacity: e.target.value })} placeholder="4" />
                </div>
              </div>
              <div>
                <label className="label">ID Cửa hàng *</label>
                <input className="input font-mono" value={String(form.hubId || '')} onChange={e => setForm({ ...form, hubId: e.target.value })} />
              </div>
              <div>
                <label className="label">ID Thương hiệu *</label>
                <input className="input font-mono" value={String(form.brandId || '')} onChange={e => setForm({ ...form, brandId: e.target.value })} />
              </div>
              <div>
                <label className="label">Ghi chú</label>
                <input className="input" value={String(form.note || '')} onChange={e => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="btn-outline">Hủy</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary min-w-[60px]">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Status Modal */}
      {changeStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6">
            <h3 className="font-semibold mb-1">{changeStatus.name}</h3>
            <p className="text-sm text-gray-500 mb-4">{changeStatus.zone} · {changeStatus.capacity} người</p>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTS.map(opt => (
                <button key={opt.value} onClick={() => handleStatusChange(opt.value)}
                  className={cn('p-3 rounded-xl border-2 text-sm font-medium transition-all', changeStatus.status === opt.value ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 hover:border-gray-300', TABLE_STATUS_COLOR[opt.value])}>
                  {opt.label}
                </button>
              ))}
            </div>
            <button onClick={() => setChangeStatus(null)} className="w-full mt-3 btn-outline">Đóng</button>
          </div>
        </div>
      )}
    </div>
  )
}
