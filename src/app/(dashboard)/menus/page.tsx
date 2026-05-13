'use client'

import { useState } from 'react'
import { Plus, Edit, Trash2, Loader2 } from 'lucide-react'
import { useMenus, useCreateMenu, useUpdateMenu, useDeleteMenu } from '@/hooks/use-data'
import { cn, formatDate } from '@/lib/utils'
import type { Menu } from '@/types'

export default function MenusPage() {
  const { data: rawMenus = [], isLoading } = useMenus()
  const menus = rawMenus as Menu[]
  const createMutation = useCreateMenu()
  const updateMutation = useUpdateMenu()
  const deleteMutation = useDeleteMenu()
  const [showForm, setShowForm] = useState(false)
  const [editMenu, setEditMenu] = useState<Menu | null>(null)
  const [form, setForm] = useState({ name: '', description: '', status: 'active', brandId: '' })
  const saving = createMutation.isPending || updateMutation.isPending

  const openEdit = (m: Menu) => {
    setEditMenu(m)
    setForm({ name: m.name, description: m.description ?? '', status: m.status, brandId: m.brandId })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name) return
    if (editMenu) {
      await updateMutation.mutateAsync({ id: editMenu._id, ...form })
    } else {
      await createMutation.mutateAsync(form)
    }
    setShowForm(false)
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Thực đơn</h1>
          <p className="page-subtitle">{menus.length} thực đơn</p>
        </div>
        <button onClick={() => { setEditMenu(null); setForm({ name: '', description: '', status: 'active', brandId: '' }); setShowForm(true) }} className="btn-primary">
          <Plus className="w-4 h-4" /> Tạo thực đơn
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {menus.map(menu => (
          <div key={menu._id} className="card p-5 hover:shadow-md transition-shadow group">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-2xl">🍽️</div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(menu)} className="btn-ghost btn-sm p-1.5"><Edit className="w-3.5 h-3.5" /></button>
                <button onClick={() => deleteMutation.mutate(menu._id)} className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <h3 className="font-semibold text-gray-900">{menu.name}</h3>
            {menu.description && <p className="text-sm text-gray-500 mt-1">{menu.description}</p>}
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
              <span>{menu.productIds.length} sản phẩm</span>
              <span>Cập nhật: {formatDate(menu.updatedAt, 'dd/MM/yyyy')}</span>
            </div>
            <div className="mt-2">
              <span className={cn('badge', menu.status === 'active' ? 'badge-green' : 'badge-red')}>
                {menu.status === 'active' ? 'Hoạt động' : 'Ngừng'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="font-semibold text-gray-900">{editMenu ? 'Cập nhật thực đơn' : 'Tạo thực đơn'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="form-group">
                <label className="label">Tên thực đơn *</label>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Menu chính tháng 6" />
              </div>
              <div className="form-group">
                <label className="label">Mô tả</label>
                <textarea className="input" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Mô tả thực đơn..." />
              </div>
              <div className="form-group">
                <label className="label">Trạng thái</label>
                <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Hoạt động</option>
                  <option value="inactive">Ngừng</option>
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
              <button onClick={() => setShowForm(false)} className="btn-outline">Hủy</button>
              <button onClick={handleSave} className="btn-primary">Lưu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
