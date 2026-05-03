'use client'

import { useState } from 'react'
import { Plus, Search, Edit, Trash2, Shield, User, Loader2 } from 'lucide-react'
import { useStaffs, useCreateStaff, useUpdateStaff, useDeleteStaff } from '@/hooks/use-staffs'
import { useDebounce } from '@/hooks/use-debounce'
import { cn } from '@/lib/utils'
import type { Staff } from '@/types'

export default function StaffsPage() {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editStaff, setEditStaff] = useState<Staff | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'user', status: 'active' })

  const dq = useDebounce(search)
  const { data: rawStaffs = [], isLoading } = useStaffs({ q: dq, role: roleFilter })
  const staffs = rawStaffs as Staff[]
  const createMutation = useCreateStaff()
  const updateMutation = useUpdateStaff()
  const deleteMutation = useDeleteStaff()
  const saving = createMutation.isPending || updateMutation.isPending

  const openCreate = () => {
    setEditStaff(null)
    setForm({ name: '', email: '', phone: '', role: 'user', status: 'active' })
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
    if (confirm('Xóa nhân viên này?')) deleteMutation.mutate(id)
  }

  const filtered = staffs

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Nhân viên</h1>
          <p className="page-subtitle">{isLoading ? '...' : `${staffs.length} nhân viên`}</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> Thêm nhân viên
        </button>
      </div>

      <div className="card card-body">
        <div className="filter-bar">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input pl-9" placeholder="Tìm nhân viên..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input w-36" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="">Tất cả vai trò</option>
            <option value="admin">Admin</option>
            <option value="user">User</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Email</th>
                <th>Số điện thoại</th>
                <th>Thương hiệu</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">Không tìm thấy nhân viên</td></tr>
              ) : filtered.map(staff => (
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
                  <td className="text-sm text-gray-500">{staff.phone || '-'}</td>
                  <td className="text-sm text-gray-500">{staff.brandName || '-'}</td>
                  <td>
                    <span className={cn('badge', staff.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700')}>
                      {staff.role === 'admin' ? (
                        <><Shield className="w-3 h-3 mr-1 inline" />Admin</>
                      ) : (
                        <><User className="w-3 h-3 mr-1 inline" />User</>
                      )}
                    </span>
                  </td>
                  <td>
                    <span className={cn('badge', staff.status === 'active' ? 'badge-green' : 'badge-red')}>
                      {staff.status === 'active' ? 'Hoạt động' : 'Ngừng'}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{editStaff ? 'Cập nhật nhân viên' : 'Thêm nhân viên'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="form-group">
                <label className="label">Họ tên *</label>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nguyễn Văn A" />
              </div>
              <div className="form-group">
                <label className="label">Email *</label>
                <input type="email" className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
              </div>
              <div className="form-group">
                <label className="label">Số điện thoại</label>
                <input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="0901-234-567" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="form-group">
                  <label className="label">Vai trò</label>
                  <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="label">Trạng thái</label>
                  <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                    <option value="active">Hoạt động</option>
                    <option value="inactive">Ngừng</option>
                  </select>
                </div>
              </div>
              {!editStaff && (
                <div className="p-3 bg-yellow-50 rounded-lg text-xs text-yellow-700">
                  Mật khẩu mặc định: <strong>123456</strong>. Nhân viên cần đổi mật khẩu sau khi đăng nhập.
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="btn-outline">Hủy</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
