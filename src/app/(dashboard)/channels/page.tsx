'use client'

import { useState } from 'react'
import { Plus, Search, ToggleLeft, ToggleRight, Edit, Trash2, Loader2, Link2 } from 'lucide-react'
import { useChannels, useCreateChannel, useUpdateChannel, useDeleteChannel } from '@/hooks/use-orders-channels'
import { useBrands } from '@/hooks/use-brands'
import { useHubs } from '@/hooks/use-hubs'
import { useDebounce } from '@/hooks/use-debounce'
import { cn } from '@/lib/utils'
import { CHANNEL_SOURCE_LABEL, CHANNEL_SOURCE_COLOR } from '@/lib/utils'
import type { Channel } from '@/types'

const SOURCES = [
  { value: 'grab',     label: 'GrabFood' },
  { value: 'be',       label: 'Be Food' },
  { value: 'shopee',   label: 'Shopee Food' },
  { value: 'xanh_sm',  label: 'Xanh SM' },
  { value: 'internal', label: 'Nội bộ' },
  { value: 'other',    label: 'Khác' },
]

const emptyForm = { name: '', source: 'grab', brandId: '', hubId: '' }

export default function ChannelsPage() {
  const [search, setSearch]   = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId]   = useState<string | null>(null)
  const [form, setForm]       = useState(emptyForm)
  const [saveError, setSaveError] = useState('')

  const dq = useDebounce(search)
  const { data: rawChannels = [], isLoading } = useChannels({ q: dq })
  const channels = rawChannels as Channel[]
  const { data: rawBrands = [] } = useBrands()
  const brands = rawBrands as { _id: string; name: string }[]
  const { data: rawHubs = [] } = useHubs()
  const hubs = rawHubs as { _id: string; name: string; brandId: string }[]

  const createMutation = useCreateChannel()
  const updateMutation = useUpdateChannel()
  const deleteMutation = useDeleteChannel()
  const saving = createMutation.isPending || updateMutation.isPending

  const filteredHubs = form.brandId ? hubs.filter(h => h.brandId === form.brandId) : hubs

  const openCreate = () => {
    setEditId(null)
    setForm(emptyForm)
    setSaveError('')
    setShowForm(true)
  }

  const openEdit = (c: Channel) => {
    setEditId(c._id)
    const bid = typeof c.brandId === 'object' && c.brandId ? (c.brandId as { _id: string })._id : String(c.brandId ?? '')
    const hid = typeof c.hubId === 'object' && c.hubId ? (c.hubId as { _id: string })._id : String(c.hubId ?? '')
    setForm({ name: c.name, source: c.source, brandId: bid, hubId: hid })
    setSaveError('')
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.source || !form.brandId) {
      setSaveError('Vui lòng điền Tên kênh, Sàn và Thương hiệu')
      return
    }
    setSaveError('')
    try {
      const payload = {
        name: form.name.trim(),
        source: form.source,
        brandId: form.brandId,
        hubId: form.hubId || undefined,
      }
      if (editId) {
        await updateMutation.mutateAsync({ id: editId, ...payload })
      } else {
        await createMutation.mutateAsync(payload)
      }
      setShowForm(false)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Lỗi lưu kênh bán')
    }
  }

  const toggle = async (id: string, field: string, current: boolean) => {
    await updateMutation.mutateAsync({ id, [field]: !current })
  }

  const handleDelete = (id: string) => {
    if (confirm('Xóa kênh bán này?')) deleteMutation.mutate(id)
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Kênh bán</h1>
          <p className="page-subtitle">{isLoading ? '...' : `${channels.length} kênh`}</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> Thêm kênh bán
        </button>
      </div>

      <div className="card card-body">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pl-9 w-full" placeholder="Tìm kênh bán..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary-400" /></div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {channels.map((channel: Channel) => (
          <div key={channel._id} className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={cn('badge', CHANNEL_SOURCE_COLOR[channel.source])}>
                    {CHANNEL_SOURCE_LABEL[channel.source]}
                  </span>
                  <span className={cn('badge', channel.status === 'active' ? 'badge-green' : 'badge-red')}>
                    {channel.status === 'active' ? 'Hoạt động' : 'Ngừng'}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900 truncate">{channel.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {channel.brandName}
                  {channel.hubName ? ` - ${channel.hubName}` : ''}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => openEdit(channel)} className="btn-ghost btn-sm p-1.5"><Edit className="w-3.5 h-3.5" /></button>
                <button onClick={() => handleDelete(channel._id)} className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div className="space-y-2 pt-3 border-t border-gray-100">
              {([
                { key: 'isPageActive',    label: 'Trang bán hàng' },
                { key: 'isStoreOpen',     label: 'Cửa hàng mở cửa' },
                { key: 'isManualConfirm', label: 'Xác nhận thủ công' },
                { key: 'autoInvoice',     label: 'Tự động HĐĐT' },
              ] as { key: keyof Channel; label: string }[]).map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{label}</span>
                  <button onClick={() => toggle(channel._id, key, channel[key] as boolean)} className="text-gray-400 hover:text-primary-500">
                    {channel[key] ? <ToggleRight className="w-5 h-5 text-primary-500" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!isLoading && channels.length === 0 && (
          <div className="col-span-2 text-center py-12 text-gray-400">
            <Link2 className="w-10 h-10 mx-auto mb-3 text-gray-200" />
            <p>Chưa có kênh bán nào.</p>
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{editId ? 'Cập nhật kênh bán' : 'Thêm kênh bán'}</h2>
                <p className="text-xs text-gray-400 mt-0.5">Không cần Store ID hay API key</p>
              </div>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label">Sàn bán hàng *</label>
                <div className="grid grid-cols-3 gap-2">
                  {SOURCES.map(s => (
                    <button key={s.value}
                      onClick={() => setForm(p => ({ ...p, source: s.value }))}
                      className={cn('py-2 px-2 rounded-xl border-2 text-xs font-medium text-center transition-all',
                        form.source === s.value ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Tên kênh bán *</label>
                <input className="input w-full" placeholder="VD: GrabFood - 3B Cau Giay"
                  value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Thương hiệu *</label>
                <select className="input w-full" value={form.brandId}
                  onChange={e => setForm(p => ({ ...p, brandId: e.target.value, hubId: '' }))}>
                  <option value="">- Chọn thương hiệu -</option>
                  {brands.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Điểm bán (tùy chọn)</label>
                <select className="input w-full" value={form.hubId}
                  onChange={e => setForm(p => ({ ...p, hubId: e.target.value }))}>
                  <option value="">- Tất cả điểm bán -</option>
                  {filteredHubs.map(h => <option key={h._id} value={h._id}>{h.name}</option>)}
                </select>
              </div>
              {saveError && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{saveError}</div>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="btn-outline">Hủy</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.brandId}
                className="btn-primary disabled:opacity-50 flex items-center gap-1.5">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editId ? 'Cập nhật' : 'Tạo kênh'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
