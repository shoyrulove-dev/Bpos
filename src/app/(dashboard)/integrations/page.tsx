'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { ShoppingBag, Plus, Trash2, Settings, PlayCircle, Loader2, Lock, CheckCircle, XCircle, Zap, Info, RefreshCw } from 'lucide-react'
import { useIntegrations, useCreateIntegration, useDeleteIntegration, useUpdateIntegration } from '@/hooks/use-data'
import { useBrands } from '@/hooks/use-brands'
import { useHubs } from '@/hooks/use-hubs'
import { cn } from '@/lib/utils'

const PROVIDERS = [
  { value: 'shopee',   label: 'Shopee Food', color: 'bg-orange-100 text-orange-700' },
  { value: 'grab',     label: 'GrabFood',    color: 'bg-green-100 text-green-700' },
  { value: 'xanh_sm', label: 'Xanh SM',     color: 'bg-teal-100 text-teal-700' },
  { value: 'be',       label: 'Be Food',     color: 'bg-yellow-100 text-yellow-800' },
]

type CredField = { key: string; label: string; type?: string; placeholder?: string }

const CRED_FIELDS: Record<string, CredField[]> = {
  shopee: [
    { key: 'partnerId',   label: 'Partner ID',   placeholder: 'VD: 1234567' },
    { key: 'partnerKey',  label: 'Partner Key',  type: 'password', placeholder: 'sk-xxxxxxxx' },
    { key: 'shopId',      label: 'Shop ID',      placeholder: 'Shopee Shop ID' },
    { key: 'accessToken', label: 'Access Token', type: 'password', placeholder: 'Token từ Shopee Open API' },
  ],
  grab: [
    { key: 'clientId',     label: 'Client ID',     placeholder: 'Grab Client ID' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Grab Client Secret' },
    { key: 'merchantId',   label: 'Merchant ID',   placeholder: 'Grab Merchant ID' },
  ],
  xanh_sm: [
    { key: 'apiKey',  label: 'API Key',  type: 'password', placeholder: 'Xanh SM API Key' },
    { key: 'storeId', label: 'Store ID', placeholder: 'Mã cửa hàng Xanh SM' },
  ],
  be: [
    { key: 'clientId',     label: 'Client ID',     placeholder: 'Số ID cấp bởi beFood (ví dụ: 4000)' },
    { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Secret cấp bởi beFood' },
    { key: 'restaurantId', label: 'Restaurant ID', placeholder: 'ID nhà hàng trên beFood (ví dụ: 129990)' },
  ],
}

type Integ = {
  _id: string; provider: string
  externalStoreId?: string; externalStoreName?: string
  syncStatus?: string; lastSyncAt?: string; isActive?: boolean
  brandId: { _id: string; name: string } | string
  hubId?: { _id: string; name: string } | string | null
}
type TestResult = { loading: boolean; ok?: boolean; message?: string; count?: number }

const emptyForm = { provider: 'shopee', brandId: '', hubId: '', externalStoreId: '', externalStoreName: '' }

const PLATFORM_GUIDES: Record<string, { steps: string[]; link: string; knownStores?: { id: string; name: string }[] }> = {
  be: {
    steps: [
      '1. Liên hệ Be để đăng ký merchant partner: hotro@be.com.vn / 1900232345',
      '2. Be cấp client_id + client_secret (khác với tài khoản merchant portal)',
      '3. Lấy restaurant_id từ URL merchant portal hoặc hỏi Be support',
    ],
    link: 'https://developers.be.com.vn/docs/food-api-10',
    knownStores: [
      { id: '129990', name: '3B Food & Drink' },
      { id: '99379',  name: 'Ò Ó O' },
    ],
  },
  grab: {
    steps: [
      '1. Đăng ký Partner API tại developer.grab.com',
      '2. Gửi yêu cầu GrabFood Partner (chờ duyệt ~1-2 tuần)',
      '3. Sau khi duyệt: nhận clientId + clientSecret',
    ],
    link: 'https://developer.grab.com/docs/grabfood/get-started/',
    knownStores: [
      { id: 'C73WNZCKANCXTN', name: '3B Food & Drink' },
      { id: 'C63FDBAKC7MVRX', name: 'Ò Ó O' },
    ],
  },
  shopee: {
    steps: [
      '1. Đăng ký tại open.shopeefood.vn',
      '2. Tạo ứng dụng → lấy partnerId + partnerKey',
      '3. Đăng nhập Shopee lấy accessToken + shopId',
    ],
    link: 'https://open.shopeefood.vn/',
  },
  xanh_sm: {
    steps: [
      '1. Liên hệ Xanh SM để xin API access',
      '2. Vào merchant.xanhsm.com → Cài đặt → Tích hợp',
      '3. Copy API Key + Store ID',
    ],
    link: 'https://merchant.xanhsm.com',
  },
}

type QuickTestResult = { loading: boolean; ok?: boolean; message?: string; count?: number; sample?: unknown[] }

export default function IntegrationsPage() {
  const { data: session } = useSession()
  const isAdmin = (session?.user as { role?: string })?.role === 'admin'

  const { data: rawInteg = [], isLoading } = useIntegrations()
  const integrations = rawInteg as Integ[]
  const { data: rawBrands = [] } = useBrands()
  const brands = rawBrands as Record<string, string>[]
  const { data: rawHubs = [] } = useHubs()
  const hubs = rawHubs as Record<string, string>[]

  const createMutation = useCreateIntegration()
  const deleteMutation = useDeleteIntegration()
  const updateMutation = useUpdateIntegration()

  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState(emptyForm)
  const saving = createMutation.isPending

  // Settings modal
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [creds, setCreds]           = useState<Record<string, string>>({})
  const settingsInteg = settingsId ? integrations.find(i => i._id === settingsId) ?? null : null

  // Test results per card
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})

  // Sync results per card
  type SyncResult = { loading: boolean; ok?: boolean; upserted?: number; updated?: number; message?: string }
  const [syncResults, setSyncResults] = useState<Record<string, SyncResult>>({})

  // Quick Test (no DB)
  const [showQt, setShowQt]         = useState(false)
  const [qtProvider, setQtProvider] = useState('be')
  const [qtCreds, setQtCreds]       = useState<Record<string, string>>({})
  const [qtResult, setQtResult]     = useState<QuickTestResult | null>(null)

  const handleQuickTest = async () => {
    setQtResult({ loading: true })
    try {
      const res  = await fetch('/api/integrations/quick-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: qtProvider, credentials: qtCreds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Lỗi kết nối')
      setQtResult({ loading: false, ok: true, message: data.message, count: data.count, sample: data.sample })
    } catch (e) {
      setQtResult({ loading: false, ok: false, message: e instanceof Error ? e.message : 'Lỗi không xác định' })
    }
  }

  const filteredHubs = form.brandId ? hubs.filter(h => h.brandId === form.brandId) : hubs
  const provInfo = (v: string) => PROVIDERS.find(p => p.value === v)

  const getBrandName = (integ: Integ) => {
    if (typeof integ.brandId === 'object' && integ.brandId) return integ.brandId.name
    return String(integ.brandId ?? '—')
  }
  const getHubName = (integ: Integ) => {
    if (!integ.hubId) return '—'
    if (typeof integ.hubId === 'object' && integ.hubId) return integ.hubId.name
    return String(integ.hubId)
  }

  const handleCreate = async () => {
    if (!form.brandId || !form.externalStoreId) return
    await createMutation.mutateAsync(form)
    setShowForm(false)
    setForm(emptyForm)
  }

  const openSettings = (integ: Integ) => {
    setSettingsId(integ._id)
    const init: Record<string, string> = { __externalStoreId: integ.externalStoreId ?? '' }
    ;(CRED_FIELDS[integ.provider] ?? []).forEach(f => { init[f.key] = '' })
    setCreds(init)
  }

  const handleSaveSettings = async () => {
    if (!settingsId || !settingsInteg) return
    const { __externalStoreId, ...credFields } = creds
    const credUpdate: Record<string, string> = {}
    Object.entries(credFields).forEach(([k, v]) => { if (v.trim()) credUpdate[k] = v.trim() })
    const body: Record<string, unknown> = { credentials: credUpdate }
    if (__externalStoreId?.trim()) body.externalStoreId = __externalStoreId.trim()
    await updateMutation.mutateAsync({ id: settingsId, ...body })
    setSettingsId(null)
  }

  const handleSync = async (id: string) => {
    setSyncResults(prev => ({ ...prev, [id]: { loading: true } }))
    try {
      const res  = await fetch(`/api/integrations/${id}/sync`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Lỗi đồng bộ')
      setSyncResults(prev => ({ ...prev, [id]: { loading: false, ok: true, upserted: data.upserted, updated: data.updated } }))
    } catch (e) {
      setSyncResults(prev => ({ ...prev, [id]: { loading: false, ok: false, message: e instanceof Error ? e.message : 'Lỗi không xác định' } }))
    }
  }

  const handleTest = async (id: string) => {
    setTestResults(prev => ({ ...prev, [id]: { loading: true } }))
    try {
      const res  = await fetch(`/api/integrations/${id}/test`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Lỗi kết nối')
      setTestResults(prev => ({ ...prev, [id]: { loading: false, ok: true, message: data.message, count: data.count } }))
    } catch (e) {
      setTestResults(prev => ({ ...prev, [id]: { loading: false, ok: false, message: e instanceof Error ? e.message : 'Lỗi không xác định' } }))
    }
  }

  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-500">
      <Lock className="w-12 h-12 text-gray-300" />
      <p className="text-lg font-medium">Chỉ dành cho Admin</p>
      <p className="text-sm">Bạn không có quyền truy cập trang này.</p>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tích hợp sàn</h1>
          <p className="page-subtitle">{isLoading ? '...' : `${integrations.length} kết nối`} — chỉ Admin quản lý</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowQt(true); setQtResult(null); setQtCreds({}) }} className="btn-outline flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-yellow-500" /> Quick Test
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Thêm tích hợp
          </button>
        </div>
      </div>

      {isLoading && <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-primary-400" /></div>}

      {/* ── Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map(integ => {
          const prov = provInfo(integ.provider)
          const tr   = testResults[integ._id]
          return (
            <div key={integ._id} className="card p-5 flex flex-col gap-3">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                    <ShoppingBag className="w-5 h-5 text-gray-500" />
                  </div>
                  <div>
                    <span className={cn('badge text-xs', prov?.color ?? 'badge-gray')}>{prov?.label ?? integ.provider}</span>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {integ.externalStoreName || integ.externalStoreId || 'Chưa cấu hình Store ID'}
                    </p>
                  </div>
                </div>
                <button onClick={() => { if (confirm('Xóa tích hợp này?')) deleteMutation.mutate(integ._id) }}
                  className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Info */}
              <div className="space-y-1 text-sm text-gray-600">
                <p><span className="font-medium">Thương hiệu:</span> {getBrandName(integ)}</p>
                <p><span className="font-medium">Điểm bán:</span> {getHubName(integ)}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('badge badge-sm',
                    integ.syncStatus === 'success' ? 'badge-green' :
                    integ.syncStatus === 'error'   ? 'badge-red'   : 'badge-gray')}>
                    {integ.syncStatus === 'success' ? 'Đồng bộ OK' :
                     integ.syncStatus === 'error'   ? 'Lỗi đồng bộ' : 'Chưa đồng bộ'}
                  </span>
                  {integ.lastSyncAt && (
                    <span className="text-xs text-gray-400">{new Date(integ.lastSyncAt).toLocaleString('vi-VN')}</span>
                  )}
                </div>
              </div>

              {/* Sync result */}
              {syncResults[integ._id] && !syncResults[integ._id].loading && (
                <div className={cn('flex items-start gap-1.5 text-xs rounded-lg px-3 py-2',
                  syncResults[integ._id].ok ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600')}>
                  {syncResults[integ._id].ok
                    ? <><RefreshCw className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>+{syncResults[integ._id].upserted} mới, {syncResults[integ._id].updated} cập nhật</span></>
                    : <><XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{syncResults[integ._id].message}</span></>}
                </div>
              )}

              {/* Test result */}
              {tr && !tr.loading && (
                <div className={cn('flex items-start gap-1.5 text-xs rounded-lg px-3 py-2',
                  tr.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>
                  {tr.ok ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                  <span>{tr.ok
                    ? `${tr.message ?? 'Kết nối thành công'}${tr.count !== undefined ? ` — ${tr.count} đơn` : ''}`
                    : tr.message}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1 border-t border-gray-100">
                <button onClick={() => openSettings(integ)}
                  className="btn-outline btn-sm flex items-center gap-1 justify-center px-2">
                  <Settings className="w-3.5 h-3.5" /> Cài đặt
                </button>
                <button onClick={() => handleTest(integ._id)} disabled={!!tr?.loading}
                  className="btn-outline btn-sm flex items-center gap-1 justify-center px-2 text-primary-600 border-primary-200 hover:bg-primary-50 disabled:opacity-50">
                  {tr?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                  Test
                </button>
                <button onClick={() => handleSync(integ._id)} disabled={!!syncResults[integ._id]?.loading}
                  className="btn-primary btn-sm flex-1 flex items-center gap-1 justify-center disabled:opacity-50">
                  {syncResults[integ._id]?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Sync
                </button>
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

      {/* ── Create Form Modal ── */}
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
                  {brands.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Điểm bán (tuỳ chọn)</label>
                <select className="input w-full" value={form.hubId} onChange={e => setForm(p => ({ ...p, hubId: e.target.value }))}>
                  <option value="">— Tất cả điểm bán —</option>
                  {filteredHubs.map(h => <option key={h._id} value={h._id}>{h.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Store ID (trên sàn)</label>
                <input className="input w-full" placeholder="ID cửa hàng trên sàn"
                  value={form.externalStoreId} onChange={e => setForm(p => ({ ...p, externalStoreId: e.target.value }))} />
              </div>
              <div>
                <label className="label">Tên cửa hàng (tuỳ chọn)</label>
                <input className="input w-full" placeholder="Tên hiển thị trên sàn"
                  value={form.externalStoreName} onChange={e => setForm(p => ({ ...p, externalStoreName: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className="btn-outline flex-1">Huỷ</button>
              <button onClick={handleCreate} disabled={saving || !form.brandId || !form.externalStoreId}
                className="btn-primary flex-1 disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Test Modal ── */}
      {showQt && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold flex items-center gap-2"><Zap className="w-4 h-4 text-yellow-500" /> Quick Test kết nối</h2>
                <p className="text-xs text-gray-400 mt-0.5">Nhập credentials để test trực tiếp, không lưu vào database</p>
              </div>
              <button onClick={() => setShowQt(false)} className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400">&times;</button>
            </div>
            <div className="p-6 space-y-5">
              {/* Provider selector */}
              <div>
                <label className="label">Chọn sàn</label>
                <div className="grid grid-cols-4 gap-2">
                  {PROVIDERS.map(p => (
                    <button key={p.value} onClick={() => { setQtProvider(p.value); setQtCreds({}); setQtResult(null) }}
                      className={cn('p-2 rounded-xl border-2 text-xs font-medium text-center transition-all', qtProvider === p.value ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Guide */}
              {PLATFORM_GUIDES[qtProvider] && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-1.5 font-medium text-blue-800 text-sm"><Info className="w-4 h-4" /> Cách lấy credentials</div>
                  <div className="space-y-1">
                    {PLATFORM_GUIDES[qtProvider].steps.map((s, i) => (
                      <p key={i} className="text-xs text-blue-700">{s}</p>
                    ))}
                  </div>
                  <a href={PLATFORM_GUIDES[qtProvider].link} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 underline mt-1">
                    → Mở {PLATFORM_GUIDES[qtProvider].link}
                  </a>
                  {PLATFORM_GUIDES[qtProvider].knownStores && (
                    <div className="mt-2 pt-2 border-t border-blue-100">
                      <p className="text-xs font-medium text-blue-800 mb-1">Store ID đã biết:</p>
                      <div className="flex gap-2 flex-wrap">
                        {PLATFORM_GUIDES[qtProvider].knownStores!.map(s => (
                          <button key={s.id} onClick={() => setQtCreds(p => ({ ...p, storeId: s.id }))}
                            className="text-xs bg-white border border-blue-200 rounded-lg px-2 py-1 hover:bg-blue-50 transition-colors">
                            {s.name}: <code className="font-mono">{s.id}</code>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Credential fields */}
              <div className="space-y-3">
                {(CRED_FIELDS[qtProvider] ?? []).map(f => (
                  <div key={f.key}>
                    <label className="label">{f.label}</label>
                    <input className="input w-full" type={f.type ?? 'text'} placeholder={f.placeholder ?? ''}
                      value={qtCreds[f.key] ?? ''} onChange={e => setQtCreds(p => ({ ...p, [f.key]: e.target.value }))}
                      autoComplete="off" />
                  </div>
                ))}
                {/* storeId shown for all */}
                <div>
                  <label className="label">Store ID <span className="text-gray-400 text-xs">(mã cửa hàng trên sàn)</span></label>
                  <input className="input w-full font-mono" placeholder="VD: 129990"
                    value={qtCreds.storeId ?? ''} onChange={e => setQtCreds(p => ({ ...p, storeId: e.target.value }))} />
                </div>
              </div>

              {/* Result */}
              {qtResult && !qtResult.loading && (
                <div className={cn('rounded-xl p-4 text-sm', qtResult.ok ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100')}>
                  <div className={cn('flex items-center gap-2 font-medium mb-1', qtResult.ok ? 'text-green-700' : 'text-red-600')}>
                    {qtResult.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    {qtResult.ok ? `✅ ${qtResult.message} — ${qtResult.count ?? 0} đơn hiện tại` : `❌ ${qtResult.message}`}
                  </div>
                  {qtResult.ok && qtResult.sample && (qtResult.sample as unknown[]).length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-green-600 font-medium">Đơn mẫu (tối đa 3):</p>
                      {(qtResult.sample as Record<string, unknown>[]).map((o, i) => (
                        <div key={i} className="text-xs bg-white rounded-lg p-2 border border-green-100 font-mono">
                          #{String(o.externalOrderId ?? o.shortId ?? i)} — {String(o.customerName ?? '?')} — {String(o.total ?? 0).toLocaleString()}đ
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowQt(false)} className="btn-outline flex-1">Đóng</button>
                <button onClick={handleQuickTest} disabled={!!(qtResult?.loading)}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-60">
                  {qtResult?.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {qtResult?.loading ? 'Đang kiểm tra...' : 'Test ngay'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Credentials Settings Modal ── */}
      {settingsId && settingsInteg && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div>
              <h2 className="text-lg font-semibold">Cài đặt tài khoản</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {provInfo(settingsInteg.provider)?.label}
                {settingsInteg.externalStoreName
                  ? ` — ${settingsInteg.externalStoreName}`
                  : settingsInteg.externalStoreId ? ` — ${settingsInteg.externalStoreId}` : ''}
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              🔐 Thông tin đăng nhập được mã hoá khi lưu. Để trống các trường không muốn cập nhật.
            </div>

            <div className="space-y-3">
              <div>
                <label className="label">Store ID (cập nhật nếu cần)</label>
                <input className="input w-full"
                  placeholder={settingsInteg.externalStoreId || 'Store ID trên sàn'}
                  value={creds.__externalStoreId ?? ''}
                  onChange={e => setCreds(p => ({ ...p, __externalStoreId: e.target.value }))} />
              </div>
              {(CRED_FIELDS[settingsInteg.provider] ?? []).map(f => (
                <div key={f.key}>
                  <label className="label">{f.label}</label>
                  <input className="input w-full"
                    type={f.type ?? 'text'}
                    placeholder={f.placeholder ?? ''}
                    value={creds[f.key] ?? ''}
                    onChange={e => setCreds(p => ({ ...p, [f.key]: e.target.value }))}
                    autoComplete="off" />
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setSettingsId(null)} className="btn-outline flex-1">Huỷ</button>
              <button onClick={handleSaveSettings} disabled={updateMutation.isPending}
                className="btn-primary flex-1 disabled:opacity-50">
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Lưu cài đặt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
