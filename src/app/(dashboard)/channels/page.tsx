'use client'

import { useMemo, useState } from 'react'
import { Plus, Search, ToggleLeft, ToggleRight, Edit, Trash2, Loader2, Link2 } from 'lucide-react'
import { useChannels, useCreateChannel, useUpdateChannel, useDeleteChannel } from '@/hooks/use-orders-channels'
import { useBrands } from '@/hooks/use-brands'
import { useHubs } from '@/hooks/use-hubs'
import { useIntegrations } from '@/hooks/use-data'
import { useDebounce } from '@/hooks/use-debounce'
import { cn } from '@/lib/utils'
import { PlatformIcon } from '@/components/ui/PlatformIcon'
import type { Channel } from '@/types'

const MARKETPLACE_TABS = [
  { value: 'grab',     label: 'GrabFood' },
  { value: 'be',       label: 'Be Food' },
  { value: 'shopee',   label: 'Shopee Food' },
  { value: 'xanh_sm',  label: 'Xanh SM' },
]

const SOURCES = [
  ...MARKETPLACE_TABS,
  { value: 'internal', label: 'Nội bộ' },
  { value: 'other',    label: 'Khác' },
]

const emptyForm = { name: '', source: 'grab', brandId: '', hubId: '' }

export default function ChannelsPage() {
  const [search, setSearch]   = useState('')
  const [activeSourceTab, setActiveSourceTab] = useState(MARKETPLACE_TABS[0].value)
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
  const { data: rawIntegrations = [] } = useIntegrations(undefined)
  const integrations = rawIntegrations as { _id: string; provider: string; externalStoreName?: string; externalStoreId?: string; brandId: string | { _id: string; name: string } }[]

  const createMutation = useCreateChannel()
  const updateMutation = useUpdateChannel()
  const deleteMutation = useDeleteChannel()
  const saving = createMutation.isPending || updateMutation.isPending

  const tabSourceSet = useMemo(() => new Set(MARKETPLACE_TABS.map((tab) => tab.value)), [])
  const marketplaceChannels = useMemo(
    () => channels.filter((channel) => tabSourceSet.has(channel.source)),
    [channels, tabSourceSet]
  )
  const activeChannels = useMemo(
    () => marketplaceChannels.filter((channel) => channel.source === activeSourceTab),
    [activeSourceTab, marketplaceChannels]
  )
  const otherChannels = useMemo(
    () => channels.filter((channel) => !tabSourceSet.has(channel.source)),
    [channels, tabSourceSet]
  )

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
          <p className="page-subtitle">{isLoading ? '...' : `${marketplaceChannels.length} kênh sàn đang hiển thị theo tab`}</p>
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

      <div className="flex flex-wrap gap-2">
        {MARKETPLACE_TABS.map((tab) => {
          const count = marketplaceChannels.filter((channel) => channel.source === tab.value).length
          const isActiveTab = activeSourceTab === tab.value

          return (
            <button
              key={tab.value}
              onClick={() => setActiveSourceTab(tab.value)}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-all',
                isActiveTab
                  ? 'border-primary-500 bg-primary-500 text-white shadow-sm'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              <span>{tab.label}</span>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', isActiveTab ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600')}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {activeChannels.map((channel: Channel) => (
          <div key={channel._id} className="card p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <PlatformIcon source={channel.source} size="sm" />
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm text-gray-900 truncate leading-tight">{channel.name}</h3>
                  <p className="text-[11px] text-gray-400 truncate">
                    {[channel.brandName, channel.hubName].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className={cn('badge badge-sm', channel.status === 'active' ? 'badge-green' : 'badge-red')}>
                  {channel.status === 'active' ? 'Hoạt động' : 'Ngừng'}
                </span>
                <button onClick={() => openEdit(channel)} className="btn-ghost p-1 rounded-lg"><Edit className="w-3.5 h-3.5" /></button>
                <button onClick={() => handleDelete(channel._id)} className="btn-ghost p-1 text-red-400 hover:text-red-600 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-gray-100 pt-2">
              {([
                { key: 'isPageActive',    label: 'Trang bán hàng' },
                { key: 'isStoreOpen',     label: 'Cửa hàng mở cửa' },
                { key: 'isManualConfirm', label: 'Xác nhận thủ công' },
                { key: 'autoInvoice',     label: 'Tự động HĐĐT' },
              ] as { key: keyof Channel; label: string }[]).map(({ key, label }) => (
                <button key={key} onClick={() => toggle(channel._id, key, channel[key] as boolean)}
                  className="flex items-center justify-between gap-1 text-left hover:bg-gray-50 rounded-lg px-1 py-0.5">
                  <span className="text-[11px] text-gray-500 truncate">{label}</span>
                  {channel[key] ? <ToggleRight className="w-4 h-4 text-primary-500 shrink-0" /> : <ToggleLeft className="w-4 h-4 text-gray-300 shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!isLoading && activeChannels.length === 0 && (
          <div className="col-span-2 text-center py-12 text-gray-400">
            <Link2 className="w-10 h-10 mx-auto mb-3 text-gray-200" />
            <p>Chưa có kênh bán nào cho {MARKETPLACE_TABS.find((tab) => tab.value === activeSourceTab)?.label}.</p>
          </div>
        )}
      </div>

      {otherChannels.length > 0 && (
        <div className="card card-body">
          <div className="mb-3">
            <h2 className="text-base font-semibold text-gray-900">Kênh khác</h2>
            <p className="text-sm text-gray-500">Giữ riêng các kênh nội bộ hoặc kênh ngoài 4 sàn chính để không lẫn vào tab marketplace.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {otherChannels.map((channel) => (
              <div key={channel._id} className="rounded-2xl border border-gray-200 p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <PlatformIcon source={channel.source} size="sm" />
                  <span className={cn('badge', channel.status === 'active' ? 'badge-green' : 'badge-red')}>
                    {channel.status === 'active' ? 'Hoạt động' : 'Ngừng'}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900">{channel.name}</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {channel.brandName}
                  {channel.hubName ? ` - ${channel.hubName}` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

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
              {(() => {
                const sourceIntegrations = integrations.filter(i => i.provider === form.source && (i.externalStoreName || i.externalStoreId))
                if (sourceIntegrations.length === 0) return null
                return (
                  <div>
                    <label className="label">Lấy từ tích hợp <span className="text-gray-400 font-normal text-xs">(tùy chọn)</span></label>
                    <select className="input w-full" defaultValue=""
                      onChange={e => {
                        const integ = sourceIntegrations.find(i => i._id === e.target.value)
                        if (!integ) return
                        const bId = typeof integ.brandId === 'object' && integ.brandId ? (integ.brandId as { _id: string })._id : String(integ.brandId ?? '')
                        setForm(p => ({
                          ...p,
                          name: integ.externalStoreName || integ.externalStoreId || p.name,
                          brandId: bId || p.brandId,
                          hubId: '',
                        }))
                      }}>
                      <option value="">— Chọn tài khoản để điền tự động —</option>
                      {sourceIntegrations.map(i => (
                        <option key={i._id} value={i._id}>
                          {i.externalStoreName || i.externalStoreId}
                        </option>
                      ))}
                    </select>
                  </div>
                )
              })()}
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
