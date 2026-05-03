'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { ShoppingBag, Plus, Trash2, RefreshCw, Loader2, Lock } from 'lucide-react'
import { useIntegrations, useCreateIntegration, useDeleteIntegration } from '@/hooks/use-data'
import { useBrands } from '@/hooks/use-brands'
import { useHubs } from '@/hooks/use-hubs'
import { cn } from '@/lib/utils'

const PROVIDERS = [
  { value: 'shopee',  label: 'Shopee Food',    color: 'bg-orange-100 text-orange-700' },
  { value: 'grab',    label: 'GrabFood',        color: 'bg-green-100 text-green-700' },
  { value: 'xanh_sm', label: 'Xanh SM',        color: 'bg-teal-100 text-teal-700' },
  { value: 'be',      label: 'Be',              color: 'bg-yellow-100 text-yellow-800' },
]

const emptyForm = { provider: 'shopee', brandId: '', hubId: '', externalStoreId: '' }

export default function IntegrationsPage() {
  const { data: session } = useSession()
  const isAdmin = (session?.user as { role?: string })?.role === 'admin'

  const { data: integrations = [], isLoading } = useIntegrations()
  const { data: brands = [] } = useBrands()
  const { data: hubs = [] } = useHubs()
  const createMutation = useCreateIntegration()
  const deleteMutation = useDeleteIntegration()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const saving = createMutation.isPending

  const filteredHubs = form.brandId ? hubs.filter((h: { brandId: string }) => h.brandId === form.brandId) : hubs

  const handleCreate = async () => {
    if (!form.brandId || !form.externalStoreId) return
    await createMutation.mutateAsync(form)
    setShowForm(false)
    setForm(emptyForm)
  }

  const providerInfo = (v: string) => PROVIDERS.find(p => p.value === v)

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-500">
        <Lock className="w-12 h-12 text-gray-300" />
        <p className="text-lg font-medium">Chỉ dành cho Admin</p>
        <p className="text-sm">Bạn không có quyền truy cập trang này.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tích hợp sàn</h1>
          <p className="page-subtitle">{isLoading ? '...' : `${integrations.length} kết nối`} — chỉ Admin quản lý</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> Thêm tích hợp
        </button>
      </div>

      {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary-400" /></div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(integrations as Record<string, string>[]).map((integ) => {
          const prov = providerInfo(integ.provider)
          return (
            <div key={integ._id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                    <ShoppingBag className="w-5 h-5 text-gray-500" />
                  </div>
                  <div>
                    <span className={cn('badge text-xs', prov?.color ?? 'badge-gray')}>{prov?.label ?? integ.provider}</span>
                    <p className="text-xs text-gray-400 mt-0.5">Store ID: {integ.externalStoreId}</p>
                  </div>
                </div>
                <button onClick={() => { if (confirm('Xóa tích hợp này?')) deleteMutation.mutate(integ._id) }} className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1 text-sm text-gray-600">
                <p><span className="font-medium">Thương hiệu:</span> {integ.brandName ?? integ.brandId}</p>
                <p><span className="font-medium">Điểm bán:</span> {integ.hubName ?? integ.hubId ?? '—'}</p>
                <p>
                  <span className={cn('badge badge-sm', integ.syncStatus === 'success' ? 'badge-green' : integ.syncStatus === 'error' ? 'badge-red' : 'badge-gray')}>
                    {integ.syncStatus === 'success' ? 'Đồng bộ OK' : integ.syncStatus === 'error' ? 'Lỗi' : 'Chưa đồng bộ'}
                  </span>
                </p>
              </div>
            </div>
          )
        })}
        {!isLoading && integrations.length === 0 && (
          <div className="col-span-3 text-center py-12 text-gray-400">
            <ShoppingBag className="w-10 h-10 mx-auto mb-3 text-gray-200" />
            <p>Chưa có tích hợp sàn nào. Nhấn &quot;Thêm tích hợp&quot; để bắt đầu.</p>
          </div>
        )}
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h2 className="text-lg font-semibold">Thêm tích hợp sàn</h2>

            <div className="space-y-3">
              <div>
                <label className="label">Sàn bán hàng</label>
                <select className="input w-full" value={form.provider} onChange={e => setForm(p => ({ ...p, provider: e.target.value }))}>
                  {PROVIDERS.map(pr => <option key={pr.value} value={pr.value}>{pr.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Thương hiệu</label>
                <select className="input w-full" value={form.brandId} onChange={e => setForm(p => ({ ...p, brandId: e.target.value, hubId: '' }))}>
                  <option value="">— Chọn thương hiệu —</option>
                  {(brands as Record<string, string>[]).map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Điểm bán (tuỳ chọn)</label>
                <select className="input w-full" value={form.hubId} onChange={e => setForm(p => ({ ...p, hubId: e.target.value }))}>
                  <option value="">— Tất cả điểm bán —</option>
                  {(filteredHubs as Record<string, string>[]).map(h => <option key={h._id} value={h._id}>{h.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">External Store ID</label>
                <input className="input w-full" placeholder="ID cửa hàng trên sàn" value={form.externalStoreId} onChange={e => setForm(p => ({ ...p, externalStoreId: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className="btn-outline flex-1">Hủy</button>
              <button onClick={handleCreate} disabled={saving || !form.brandId || !form.externalStoreId} className="btn-primary flex-1 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
