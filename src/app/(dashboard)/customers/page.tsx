'use client'

import { useState } from 'react'
import { Plus, Search, Star, TrendingUp, Gift, Edit, Trash2, Loader2, Download } from 'lucide-react'
import { useCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer } from '@/hooks/use-data'
import { useDebounce } from '@/hooks/use-debounce'
import { cn, formatCurrency, formatDate, LOYALTY_TIER_LABEL, LOYALTY_TIER_COLOR } from '@/lib/utils'
import type { Customer, LoyaltyTier } from '@/types'

const TIER_ICONS: Record<LoyaltyTier, string> = {
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
  platinum: '💎',
}

const TIER_THRESHOLDS: { tier: LoyaltyTier; label: string; min: number }[] = [
  { tier: 'bronze', label: 'Đồng', min: 0 },
  { tier: 'silver', label: 'Bạc', min: 1_000_000 },
  { tier: 'gold', label: 'Vàng', min: 5_000_000 },
  { tier: 'platinum', label: 'Bạch Kim', min: 10_000_000 },
]

const emptyForm = { phone: '', name: '', email: '', brandId: '', note: '', points: '' }

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null)
  const [form, setForm] = useState<Record<string, unknown>>(emptyForm)
  const [showAddPoints, setShowAddPoints] = useState<Customer | null>(null)
  const [addPointsValue, setAddPointsValue] = useState('')

  const dq = useDebounce(search)
  const { data: rawCustomers = [], isLoading } = useCustomers({ q: dq, tier: tierFilter })
  const customers = rawCustomers as Customer[]
  const createMutation = useCreateCustomer()
  const updateMutation = useUpdateCustomer()
  const deleteMutation = useDeleteCustomer()
  const saving = createMutation.isPending || updateMutation.isPending

  const tierCounts = customers.reduce((acc, c) => {
    acc[c.tier] = (acc[c.tier] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const openCreate = () => { setEditCustomer(null); setForm(emptyForm); setShowForm(true) }
  const openEdit = (c: Customer) => {
    setEditCustomer(c)
    setForm({ phone: c.phone, name: c.name, email: c.email || '', brandId: c.brandId, note: c.note || '', points: String(c.points) })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.phone || !form.name || !form.brandId) return
    const payload = { ...form, points: form.points ? Number(form.points) : 0 }
    if (editCustomer) await updateMutation.mutateAsync({ id: editCustomer._id, ...payload })
    else await createMutation.mutateAsync(payload)
    setShowForm(false)
  }

  const handleAddPoints = async () => {
    if (!showAddPoints || !addPointsValue) return
    const newPoints = showAddPoints.points + Number(addPointsValue)
    await updateMutation.mutateAsync({ id: showAddPoints._id, points: newPoints })
    setShowAddPoints(null)
    setAddPointsValue('')
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Khách hàng & Loyalty</h1>
          <p className="page-subtitle">{isLoading ? '...' : `${customers.length} khách hàng`}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const p = new URLSearchParams()
              if (dq) p.set('q', dq)
              if (tierFilter) p.set('tier', tierFilter)
              p.set('export', 'csv')
              window.location.href = `/api/customers?${p.toString()}`
            }}
            className="btn-outline h-9 text-sm"
          >
            <Download className="w-4 h-4" /> Xuất Excel
          </button>
          <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Thêm khách</button>
        </div>
      </div>

      {/* Tier summary */}
      <div className="grid grid-cols-4 gap-3">
        {TIER_THRESHOLDS.map(({ tier, label, min }) => (
          <button key={tier} onClick={() => setTierFilter(tierFilter === tier ? '' : tier)}
            className={cn('card p-4 text-left transition-all hover:shadow-md', tierFilter === tier ? 'ring-2 ring-primary-400 bg-primary-50' : '')}>
            <div className="text-2xl mb-1">{TIER_ICONS[tier]}</div>
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-xl font-bold text-gray-900">{tierCounts[tier] ?? 0}</div>
            <div className="text-xs text-gray-400 mt-0.5">≥ {formatCurrency(min)}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9" placeholder="Tìm tên, số điện thoại..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-36" value={tierFilter} onChange={e => setTierFilter(e.target.value)}>
          <option value="">Tất cả hạng</option>
          {TIER_THRESHOLDS.map(t => <option key={t.tier} value={t.tier}>{t.label}</option>)}
        </select>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-primary-400" /></div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Khách hàng</th>
                  <th>Số điện thoại</th>
                  <th>Hạng</th>
                  <th className="text-right">Điểm tích lũy</th>
                  <th className="text-right">Tổng chi tiêu</th>
                  <th className="text-right">Số đơn</th>
                  <th>Đơn cuối</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {customers.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-400">Chưa có khách hàng</td></tr>
                ) : customers.map(c => (
                  <tr key={c._id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0', LOYALTY_TIER_COLOR[c.tier])}>
                          {c.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 text-sm">{c.name}</div>
                          {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="font-mono text-sm text-gray-600">{c.phone}</td>
                    <td>
                      <span className={cn('badge', LOYALTY_TIER_COLOR[c.tier])}>
                        {TIER_ICONS[c.tier]} {LOYALTY_TIER_LABEL[c.tier]}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Star className="w-3.5 h-3.5 text-yellow-500" />
                        <span className="font-semibold text-sm">{c.points.toLocaleString('vi-VN')}</span>
                      </div>
                    </td>
                    <td className="text-right font-semibold text-sm">{formatCurrency(c.totalSpend)}</td>
                    <td className="text-right text-sm font-medium">{c.orderCount}</td>
                    <td className="text-xs text-gray-400">{c.lastOrderAt ? formatDate(c.lastOrderAt, 'dd/MM/yyyy') : '—'}</td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => { setShowAddPoints(c); setAddPointsValue('') }} className="btn-ghost btn-sm p-1.5 text-yellow-600 hover:bg-yellow-50" title="Cộng điểm">
                          <Gift className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openEdit(c)} className="btn-ghost btn-sm p-1.5"><Edit className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { if (confirm('Xóa khách hàng này?')) deleteMutation.mutate(c._id) }} className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">{editCustomer ? 'Cập nhật khách hàng' : 'Thêm khách hàng'}</h2>
              <button onClick={() => setShowForm(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Số điện thoại *</label>
                  <input className="input" value={String(form.phone || '')} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="0901234567" />
                </div>
                <div>
                  <label className="label">Họ tên *</label>
                  <input className="input" value={String(form.name || '')} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nguyễn Văn A" />
                </div>
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" value={String(form.email || '')} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">ID Thương hiệu *</label>
                  <input className="input font-mono text-xs" value={String(form.brandId || '')} onChange={e => setForm({ ...form, brandId: e.target.value })} />
                </div>
                <div>
                  <label className="label">Điểm khởi đầu</label>
                  <input type="number" className="input" value={String(form.points || '')} onChange={e => setForm({ ...form, points: e.target.value })} placeholder="0" />
                </div>
              </div>
              <div>
                <label className="label">Ghi chú</label>
                <input className="input" value={String(form.note || '')} onChange={e => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="btn-outline">Hủy</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary min-w-[60px]">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Points Modal */}
      {showAddPoints && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center text-lg">
                {TIER_ICONS[showAddPoints.tier]}
              </div>
              <div>
                <div className="font-semibold">{showAddPoints.name}</div>
                <div className="text-sm text-gray-500 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-yellow-500" /> {showAddPoints.points.toLocaleString('vi-VN')} điểm
                </div>
              </div>
            </div>
            <label className="label">Số điểm cộng thêm</label>
            <input type="number" className="input mb-4" value={addPointsValue} onChange={e => setAddPointsValue(e.target.value)} placeholder="100" />
            <div className="flex gap-2">
              <button onClick={() => setShowAddPoints(null)} className="flex-1 btn-outline">Hủy</button>
              <button onClick={handleAddPoints} disabled={updateMutation.isPending} className="flex-1 btn-primary">
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cộng điểm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
