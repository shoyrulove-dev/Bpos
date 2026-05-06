'use client'

import { useState } from 'react'
import { Plus, Search, Edit, Trash2, Shield, Loader2 } from 'lucide-react'
import { useStaffs, useCreateStaff, useUpdateStaff, useDeleteStaff } from '@/hooks/use-staffs'
import { useDebounce } from '@/hooks/use-debounce'
import { cn, STAFF_ROLE_LABEL, STAFF_ROLE_COLOR } from '@/lib/utils'
import type { Staff, Role } from '@/types'

export default function StaffsPage() {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editStaff, setEditStaff] = useState<Staff | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'cashier' as Role, status: 'active' })

  const dq = useDebounce(search)
  const { data: rawStaffs = [], isLoading } = useStaffs({ q: dq, role: roleFilter })
  const staffs = rawStaffs as Staff[]
  const createMutation = useCreateStaff()
  const updateMutation = useUpdateStaff()
  const deleteMutation = useDeleteStaff()
  const saving = createMutation.isPending || updateMutation.isPending

  const openCreate = () => {
    setEditStaff(null)
    setForm({ name: '', email: '', phone: '', role: 'cashier', status: 'active' })
    setShowForm(true)
  }

  const openEdit = (s: Staff) => {
    setEditStaff(s)
    setForm({ name: s.name, email: s.email, phone: s.phone || '', role: s.role, status: s.status })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.email) return
    if (editStaff) {
      await updateMutation.mutateAsync({ id: editStaff._id, ...form })
    } else {
      await createMutation.mutateAsync(form)
    }
    setShowForm(false)
  }

  const handleDelete = async (id: string) => {
    if (confirm('XÃ³a nhÃ¢n viÃªn nÃ y?')) deleteMutation.mutate(id)
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">NhÃ¢n viÃªn</h1>
          <p className="page-subtitle">{isLoading ? '...' : `${staffs.length} nhÃ¢n viÃªn`}</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> ThÃªm nhÃ¢n viÃªn
        </button>
      </div>

      {/* Role summary */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(STAFF_ROLE_LABEL).map(([role, label]) => (
          <button key={role} onClick={() => setRoleFilter(roleFilter === role ? '' : role)}
            className={cn('card p-4 text-left transition-all hover:shadow-md', roleFilter === role ? 'ring-2 ring-primary-400 bg-primary-50' : '')}>
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-2', STAFF_ROLE_COLOR[role])}>
              <Shield className="w-4 h-4" />
            </div>
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-xl font-bold text-gray-900">{staffs.filter(s => s.role === role).length}</div>
          </button>
        ))}
      </div>

      <div className="card card-body">
        <div className="filter-bar">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input pl-9" placeholder="TÃ¬m nhÃ¢n viÃªn..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input w-48" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="">Táº¥t cáº£ vai trÃ²</option>
            {Object.entries(STAFF_ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>NhÃ¢n viÃªn</th>
                <th>Email</th>
                <th>Sá»‘ Ä‘iá»‡n thoáº¡i</th>
                <th>Vai trÃ²</th>
                <th>PhÃ¢n quyá»n</th>
                <th>Tráº¡ng thÃ¡i</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary-400 mx-auto" /></td></tr>
              ) : staffs.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">KhÃ´ng tÃ¬m tháº¥y nhÃ¢n viÃªn</td></tr>
              ) : staffs.map(staff => (
                <tr key={staff._id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                        {staff.name.charAt(0)}
                      </div>
                      <span className="font-medium text-gray-900">{staff.name}</span>
                    </div>
                  </td>
                  <td className="text-sm text-gray-500">{staff.email}</td>
                  <td className="text-sm text-gray-500">{staff.phone || 'â€”'}</td>
                  <td>
                    <span className={cn('badge text-xs', STAFF_ROLE_COLOR[staff.role])}>
                      {STAFF_ROLE_LABEL[staff.role]}
                    </span>
                  </td>
                  <td>
                    {staff.permissions?.length > 0
                      ? <span className="text-xs text-gray-500">{staff.permissions.length} phÃ¢n quyá»n</span>
                      : <span className="text-xs text-gray-400">â€”</span>}
                  </td>
                  <td>
                    <span className={cn('badge', staff.status === 'active' ? 'badge-green' : 'badge-red')}>
                      {staff.status === 'active' ? 'Hoáº¡t Ä‘á»™ng' : 'Ngá»«ng'}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(staff)} className="btn-ghost btn-sm p-1.5"><Edit className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(staff._id)} className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{editStaff ? 'Cáº­p nháº­t nhÃ¢n viÃªn' : 'ThÃªm nhÃ¢n viÃªn'}</h2>
              <button onClick={() => setShowForm(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Há» tÃªn *</label>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nguyá»…n VÄƒn A" />
              </div>
              <div>
                <label className="label">Email *</label>
                <input type="email" className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="nva@example.com" disabled={!!editStaff} />
              </div>
              <div>
                <label className="label">Sá»‘ Ä‘iá»‡n thoáº¡i</label>
                <input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="0901 234 567" />
              </div>
              <div>
                <label className="label mb-2">Vai trÃ²</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(STAFF_ROLE_LABEL).filter(([r]) => r !== 'admin').map(([role, label]) => (
                    <button key={role} type="button" onClick={() => setForm({ ...form, role: role as Role })}
                      className={cn('p-3 rounded-xl border-2 text-left transition-all', form.role === role ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-gray-300')}>
                      <div className={cn('w-6 h-6 rounded flex items-center justify-center mb-1.5', STAFF_ROLE_COLOR[role])}>
                        <Shield className="w-3 h-3" />
                      </div>
                      <div className="text-xs font-medium text-gray-700">{label}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Tráº¡ng thÃ¡i</label>
                <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Hoáº¡t Ä‘á»™ng</option>
                  <option value="inactive">Ngá»«ng hoáº¡t Ä‘á»™ng</option>
                </select>
              </div>
              {!editStaff && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
                  Máº­t kháº©u máº·c Ä‘á»‹nh: <strong>123456</strong> â€” nhÃ¢n viÃªn cáº§n Ä‘á»•i sau láº§n Ä‘Äƒng nháº­p Ä‘áº§u tiÃªn.
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="btn-outline">Há»§y</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary min-w-[80px]">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'LÆ°u'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
