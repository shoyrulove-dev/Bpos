'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ShoppingBag, Plus, Trash2, Settings, PlayCircle, Loader2, Lock,
  CheckCircle, XCircle, Zap, Info, RefreshCw, KeyRound, Wifi, WifiOff, Clock,
} from 'lucide-react'
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
  _id: string
  provider: string
  externalStoreId?: string
  externalStoreName?: string
  syncStatus?: string
  syncError?: string
  lastSyncAt?: string
  isActive?: boolean
  loginMode?: 'api' | 'auto'
  loginUsername?: string
  sessionStatus?: 'none' | 'active' | 'expired' | 'error'
  sessionCapturedAt?: string
  sessionExpiresAt?: string
  sessionError?: string
  automationRunning?: boolean
  brandId: { _id: string; name: string } | string
  hubId?: { _id: string; name: string } | string | null
}

type TestResult   = { loading: boolean; ok?: boolean; message?: string; count?: number }
type SyncResult   = { loading: boolean; ok?: boolean; upserted?: number; updated?: number; message?: string }
type QtResult     = { loading: boolean; ok?: boolean; message?: string; count?: number; sample?: unknown[] }
type AutoLoginForm = { username: string; password: string; otp: string }

const AUTO_PROVIDERS = ['grab', 'be']
const emptyForm = {
  provider: 'grab', brandId: '', hubId: '', externalStoreId: '', externalStoreName: '',
  loginMode: 'auto' as 'api' | 'auto',
  loginUsername: '', loginPassword: '',
}

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

export default function IntegrationsPage() {
  const { data: session } = useSession()
  const isAdmin = (session?.user as { role?: string })?.role === 'admin'
  const qc = useQueryClient()

  const { data: rawInteg = [], isLoading } = useIntegrations(undefined)
  const integrations = rawInteg as Integ[]
  const { data: rawBrands = [] } = useBrands()
  const brands = rawBrands as Record<string, string>[]
  const { data: rawHubs = [] } = useHubs()
  const hubs = rawHubs as Record<string, string>[]

  const createMutation = useCreateIntegration()
  const deleteMutation = useDeleteIntegration()
  const updateMutation = useUpdateIntegration()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(emptyForm)
  const saving = createMutation.isPending

  // Settings modal
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [creds, setCreds]           = useState<Record<string, string>>({})
  const settingsInteg = settingsId ? integrations.find(i => i._id === settingsId) ?? null : null

  // Per-card test / sync results
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})
  const [syncResults, setSyncResults] = useState<Record<string, SyncResult>>({})
  const [syncingAll, setSyncingAll]   = useState(false)

  // Auto Login modal
  const [autoLoginId, setAutoLoginId]     = useState<string | null>(null)
  const [autoLoginForm, setAutoLoginForm] = useState<AutoLoginForm>({ username: '', password: '', otp: '' })
  const [autoLoginWaiting, setAutoLoginWaiting] = useState<{ requiresOtp: boolean; otpTarget?: string; sessionKey?: string } | null>(null)
  const [autoLoginResult, setAutoLoginResult]   = useState<{ ok: boolean; message: string } | null>(null)
  const [autoLoginLoading, setAutoLoginLoading] = useState(false)

  // Quick Test modal
  const [showQt, setShowQt]         = useState(false)
  const [qtProvider, setQtProvider] = useState('be')
  const [qtCreds, setQtCreds]       = useState<Record<string, string>>({})
  const [qtResult, setQtResult]     = useState<QtResult | null>(null)

  // Live "time ago" ticker — re-renders every 30s so lastSyncAt label refreshes
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const provInfo  = (v: string) => PROVIDERS.find(p => p.value === v)
  const filteredHubs = form.brandId ? hubs.filter(h => h.brandId === form.brandId) : hubs

  const getBrandName = (integ: Integ) =>
    typeof integ.brandId === 'object' && integ.brandId ? integ.brandId.name : String(integ.brandId ?? '—')

  const getHubName = (integ: Integ) => {
    if (!integ.hubId) return '—'
    if (typeof integ.hubId === 'object' && integ.hubId) return integ.hubId.name
    return String(integ.hubId)
  }

  const timeAgo = (isoStr?: string) => {
    if (!isoStr) return null
    const secs = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
    if (secs < 60)    return `${secs}s trước`
    if (secs < 3600)  return `${Math.floor(secs / 60)}p trước`
    if (secs < 86400) return `${Math.floor(secs / 3600)}h trước`
    return new Date(isoStr).toLocaleDateString('vi-VN')
  }

  // ─── Handlers ────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const isAuto = AUTO_PROVIDERS.includes(form.provider)
    if (!form.brandId) return
    if (isAuto && (!form.loginUsername || !form.loginPassword)) return
    if (!isAuto && !form.externalStoreId) return
    const body: Record<string, unknown> = {
      provider: form.provider, brandId: form.brandId,
      hubId: form.hubId || undefined,
      externalStoreName: form.externalStoreName || undefined,
      loginMode: isAuto ? 'auto' : 'api',
    }
    if (isAuto) {
      body.loginUsername = form.loginUsername
      body.loginPassword = form.loginPassword
    } else {
      body.externalStoreId = form.externalStoreId
    }
    await createMutation.mutateAsync(body)
    setShowForm(false)
    setForm(emptyForm)
  }

  const openSettings = (integ: Integ) => {
    setSettingsId(integ._id)
    const init: Record<string, string> = {
      __externalStoreId: integ.externalStoreId ?? '',
      __loginMode: integ.loginMode ?? 'api',
      __loginUsername: integ.loginUsername ?? '',
      __loginPassword: '',
    }
    ;(CRED_FIELDS[integ.provider] ?? []).forEach(f => { init[f.key] = '' })
    setCreds(init)
  }

  const handleSaveSettings = async () => {
    if (!settingsId || !settingsInteg) return
    const { __externalStoreId, __loginMode, __loginUsername, __loginPassword, ...credFields } = creds
    const body: Record<string, unknown> = {}
    if (__loginMode) body.loginMode = __loginMode
    if (__externalStoreId?.trim()) body.externalStoreId = __externalStoreId.trim()
    if (__loginMode !== 'auto') {
      const credUpdate: Record<string, string> = {}
      Object.entries(credFields).forEach(([k, v]) => { if (v.trim()) credUpdate[k] = v.trim() })
      if (Object.keys(credUpdate).length) body.credentials = credUpdate
    }
    if (__loginUsername?.trim()) body.loginUsername = __loginUsername.trim()
    if (__loginPassword?.trim()) body.loginPassword = __loginPassword.trim()
    await updateMutation.mutateAsync({ id: settingsId, ...body })
    setSettingsId(null)
  }

  const handleSync = useCallback(async (id: string) => {
    setSyncResults(prev => ({ ...prev, [id]: { loading: true } }))
    try {
      const res  = await fetch(`/api/integrations/${id}/sync`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Lỗi đồng bộ')
      setSyncResults(prev => ({ ...prev, [id]: { loading: false, ok: true, upserted: data.upserted, updated: data.updated } }))
      qc.invalidateQueries({ queryKey: ['integrations'] })
    } catch (e) {
      setSyncResults(prev => ({ ...prev, [id]: { loading: false, ok: false, message: e instanceof Error ? e.message : 'Lỗi không xác định' } }))
    }
  }, [qc])

  const handleSyncAll = async () => {
    setSyncingAll(true)
    await Promise.all(integrations.filter(i => i.isActive !== false).map(i => handleSync(i._id)))
    setSyncingAll(false)
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

  const openAutoLogin = (integ: Integ) => {
    setAutoLoginId(integ._id)
    setAutoLoginForm({ username: integ.loginUsername ?? '', password: '', otp: '' })
    setAutoLoginWaiting(null)
    setAutoLoginResult(null)
  }

  const handleAutoLogin = async (withOtp = false) => {
    if (!autoLoginId) return
    setAutoLoginLoading(true)
    setAutoLoginResult(null)
    try {
      const body: Record<string, string | undefined> = {
        username:   autoLoginForm.username,
        password:   autoLoginForm.password || undefined,
        otp:        (withOtp && autoLoginForm.otp) ? autoLoginForm.otp : undefined,
        sessionKey: autoLoginWaiting?.sessionKey,
      }
      const res  = await fetch(`/api/integrations/${autoLoginId}/auto-login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.data?.requiresOtp) {
        setAutoLoginWaiting({ requiresOtp: true, otpTarget: data.data.otpTarget, sessionKey: data.data.sessionKey })
      } else if (data.data?.success) {
        setAutoLoginResult({ ok: true, message: 'Đăng nhập thành công! Session đã được lưu.' })
        setAutoLoginWaiting(null)
        qc.invalidateQueries({ queryKey: ['integrations'] })
      } else {
        setAutoLoginResult({ ok: false, message: data.error ?? 'Đăng nhập thất bại' })
      }
    } catch (e) {
      setAutoLoginResult({ ok: false, message: e instanceof Error ? e.message : 'Lỗi mạng' })
    } finally {
      setAutoLoginLoading(false)
    }
  }

  const handleQuickTest = async () => {
    setQtResult({ loading: true })
    try {
      const res  = await fetch('/api/integrations/quick-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: qtProvider, credentials: qtCreds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Lỗi kết nối')
      setQtResult({ loading: false, ok: true, message: data.message, count: data.count, sample: data.sample })
    } catch (e) {
      setQtResult({ loading: false, ok: false, message: e instanceof Error ? e.message : 'Lỗi không xác định' })
    }
  }

  // ─── Guard ───────────────────────────────────────────────────────────────
  if (!isAdmin) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-500">
      <Lock className="w-12 h-12 text-gray-300" />
      <p className="text-lg font-medium">Chỉ dành cho Admin</p>
      <p className="text-sm">Bạn không có quyền truy cập trang này.</p>
    </div>
  )

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Tích hợp sàn</h1>
          <p className="page-subtitle">
            {isLoading ? '…' : `${integrations.length} kết nối`} · tự động làm mới mỗi 30s
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setShowQt(true); setQtResult(null); setQtCreds({}) }}
            className="btn-outline flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-yellow-500" /> Quick Test
          </button>
          {integrations.length > 0 && (
            <button onClick={handleSyncAll} disabled={syncingAll}
              className="btn-outline flex items-center gap-1.5 disabled:opacity-50">
              {syncingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sync tất cả
            </button>
          )}
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Thêm tích hợp
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
        </div>
      )}

      {/* ── Integration Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map(integ => {
          const prov = provInfo(integ.provider)
          const tr   = testResults[integ._id]
          const sr   = syncResults[integ._id]
          return (
            <div key={integ._id} className={cn('card p-5 flex flex-col gap-3', integ.isActive === false && 'opacity-60')}>

              {/* Card header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-5 h-5 text-gray-500" />
                  </div>
                  <div className="min-w-0">
                    <span className={cn('badge text-xs', prov?.color ?? 'badge-gray')}>
                      {prov?.label ?? integ.provider}
                    </span>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {integ.loginMode === 'auto' && integ.loginUsername
                        ? <span className="font-mono">{integ.loginUsername}</span>
                        : integ.externalStoreName || integ.externalStoreId || 'Chưa cấu hình'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { if (confirm('Xóa tích hợp này?')) deleteMutation.mutate(integ._id) }}
                  className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Meta info */}
              <div className="space-y-1 text-sm text-gray-600">
                <p><span className="font-medium">Thương hiệu:</span> {getBrandName(integ)}</p>
                <p><span className="font-medium">Điểm bán:</span> {getHubName(integ)}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('badge badge-sm',
                    integ.syncStatus === 'success' ? 'badge-green' :
                    integ.syncStatus === 'error'   ? 'badge-red'   :
                    integ.syncStatus === 'syncing' ? 'badge-blue'  : 'badge-gray')}>
                    {integ.syncStatus === 'success' ? 'Đồng bộ OK' :
                     integ.syncStatus === 'error'   ? 'Lỗi đồng bộ' :
                     integ.syncStatus === 'syncing' ? 'Đang sync…'  : 'Chưa đồng bộ'}
                  </span>
                  {integ.lastSyncAt && (
                    <span className="text-xs text-gray-400"
                      title={new Date(integ.lastSyncAt).toLocaleString('vi-VN')}>
                      {timeAgo(integ.lastSyncAt)}
                    </span>
                  )}
                </div>
              </div>

              {/* Session status badge (auto-login mode) */}
              {integ.loginMode === 'auto' && (
                <div className={cn('flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 border',
                  integ.automationRunning
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : integ.sessionStatus === 'active'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : integ.sessionStatus === 'error'
                    ? 'bg-red-50 border-red-200 text-red-600'
                    : integ.sessionStatus === 'expired'
                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500')}>
                  {integ.automationRunning
                    ? <><Loader2 className="w-3 h-3 animate-spin shrink-0" /><span>Đang login…</span></>
                    : integ.sessionStatus === 'active'
                    ? <><Wifi className="w-3 h-3 shrink-0" /><span>Session active{integ.sessionExpiresAt ? ` · hết hạn ${new Date(integ.sessionExpiresAt).toLocaleDateString('vi-VN')}` : ''}</span></>
                    : integ.sessionStatus === 'expired'
                    ? <><Clock className="w-3 h-3 shrink-0" /><span>Session hết hạn – cần login lại</span></>
                    : integ.sessionStatus === 'error'
                    ? <><WifiOff className="w-3 h-3 shrink-0" /><span className="truncate">{integ.sessionError ?? 'Lỗi login'}</span></>
                    : <><Clock className="w-3 h-3 shrink-0" /><span>Chưa có session</span></>
                  }
                </div>
              )}

              {/* Sync result feedback */}
              {sr && !sr.loading && (
                <div className={cn('flex items-start gap-1.5 text-xs rounded-lg px-3 py-2',
                  sr.ok ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600')}>
                  {sr.ok
                    ? <><RefreshCw className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>+{sr.upserted} mới, {sr.updated} cập nhật</span></>
                    : <><XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{sr.message}</span></>}
                </div>
              )}

              {/* Test result feedback (API mode) */}
              {tr && !tr.loading && (
                <div className={cn('flex items-start gap-1.5 text-xs rounded-lg px-3 py-2',
                  tr.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>
                  {tr.ok
                    ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    : <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                  <span>
                    {tr.ok
                      ? `${tr.message ?? 'Kết nối thành công'}${tr.count !== undefined ? ` — ${tr.count} đơn` : ''}`
                      : tr.message}
                  </span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1 border-t border-gray-100">
                <button onClick={() => openSettings(integ)}
                  className="btn-outline btn-sm flex items-center gap-1 px-2">
                  <Settings className="w-3.5 h-3.5" /> Cài đặt
                </button>
                {integ.loginMode === 'auto' ? (
                  <button onClick={() => openAutoLogin(integ)}
                    className="btn-outline btn-sm flex items-center gap-1 px-2 text-violet-600 border-violet-200 hover:bg-violet-50">
                    <KeyRound className="w-3.5 h-3.5" /> Login
                  </button>
                ) : (
                  <button onClick={() => handleTest(integ._id)} disabled={!!tr?.loading}
                    className="btn-outline btn-sm flex items-center gap-1 px-2 text-primary-600 border-primary-200 hover:bg-primary-50 disabled:opacity-50">
                    {tr?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                    Test
                  </button>
                )}
                <button onClick={() => handleSync(integ._id)} disabled={!!sr?.loading}
                  className="btn-primary btn-sm flex-1 flex items-center gap-1 justify-center disabled:opacity-50">
                  {sr?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
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

      {/* ═══ MODAL: Create ══════════════════════════════════════════════════ */}
      {showForm && (() => {
        const isAuto = AUTO_PROVIDERS.includes(form.provider)
        const canSave = form.brandId && (isAuto
          ? (form.loginUsername && form.loginPassword)
          : form.externalStoreId)
        return (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
              <div>
                <h2 className="text-lg font-semibold">Thêm tích hợp sàn</h2>
                <p className="text-sm text-gray-400 mt-0.5">Kết nối tài khoản sàn bán hàng</p>
              </div>

              {/* Platform picker */}
              <div>
                <label className="label">Sàn bán hàng</label>
                <div className="grid grid-cols-2 gap-2">
                  {PROVIDERS.map(pr => (
                    <button key={pr.value}
                      onClick={() => setForm(p => ({
                        ...p, provider: pr.value,
                        loginMode: AUTO_PROVIDERS.includes(pr.value) ? 'auto' : 'api',
                        loginUsername: '', loginPassword: '', externalStoreId: '',
                      }))}
                      className={cn('py-2.5 px-3 rounded-xl border-2 text-sm font-medium text-left transition-all',
                        form.provider === pr.value
                          ? 'border-primary-400 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                      <span className={cn('badge badge-sm mr-2', pr.color)}>{pr.label}</span>
                      <span className="text-xs text-gray-400">
                        {AUTO_PROVIDERS.includes(pr.value) ? '🤖 Auto Login' : '🔑 API Key'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Brand + Hub */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Thương hiệu <span className="text-red-400">*</span></label>
                  <select className="input w-full" value={form.brandId}
                    onChange={e => setForm(p => ({ ...p, brandId: e.target.value, hubId: '' }))}>
                    <option value="">— Chọn —</option>
                    {brands.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Điểm bán</label>
                  <select className="input w-full" value={form.hubId}
                    onChange={e => setForm(p => ({ ...p, hubId: e.target.value }))}>
                    <option value="">— Tất cả —</option>
                    {filteredHubs.map(h => <option key={h._id} value={h._id}>{h.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Auto-login providers (Grab, BE): email + password */}
              {isAuto && (
                <div className="space-y-3">
                  <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-xs text-violet-700">
                    🔐 Hệ thống tự động đăng nhập merchant portal để lấy đơn hàng.
                    Mật khẩu được mã hoá AES-256 trước khi lưu.
                  </div>
                  <div>
                    <label className="label">
                      {form.provider === 'be'
                        ? 'Email đăng nhập Be (merchant.be.com.vn)'
                        : 'Email hoặc tên đăng nhập Grab portal'}
                      <span className="text-red-400 ml-1">*</span>
                    </label>
                    <input className="input w-full" type="text"
                      placeholder={form.provider === 'be'
                        ? 'VD: luonghung.sg@gmail.com'
                        : 'VD: ooo.cashier.ds3 hoặc ketoan@example.com'}
                      value={form.loginUsername}
                      onChange={e => setForm(p => ({ ...p, loginUsername: e.target.value }))} />
                    {form.provider === 'grab' && form.loginUsername && !form.loginUsername.includes('@') && (
                      <p className="text-xs text-violet-600 mt-1">✓ Đăng nhập bằng tên tài khoản (username)</p>
                    )}
                    {form.provider === 'grab' && form.loginUsername && form.loginUsername.includes('@') && (
                      <p className="text-xs text-violet-600 mt-1">✓ Đăng nhập bằng email</p>
                    )}
                  </div>
                  <div>
                    <label className="label">Mật khẩu <span className="text-red-400">*</span></label>
                    <input className="input w-full" type="password" autoComplete="new-password"
                      placeholder="••••••••"
                      value={form.loginPassword}
                      onChange={e => setForm(p => ({ ...p, loginPassword: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Tên cửa hàng <span className="text-gray-400 text-xs font-normal">(tuỳ chọn)</span></label>
                    <input className="input w-full" placeholder="VD: 3B Food & Drink — Cầu Giấy"
                      value={form.externalStoreName}
                      onChange={e => setForm(p => ({ ...p, externalStoreName: e.target.value }))} />
                  </div>
                </div>
              )}

              {/* API providers (Shopee, Xanh SM): store ID */}
              {!isAuto && (
                <div className="space-y-3">
                  <div>
                    <label className="label">Store ID <span className="text-red-400">*</span></label>
                    <input className="input w-full" placeholder="ID cửa hàng trên sàn"
                      value={form.externalStoreId}
                      onChange={e => setForm(p => ({ ...p, externalStoreId: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Tên cửa hàng <span className="text-gray-400 text-xs font-normal">(tuỳ chọn)</span></label>
                    <input className="input w-full" placeholder="Tên hiển thị"
                      value={form.externalStoreName}
                      onChange={e => setForm(p => ({ ...p, externalStoreName: e.target.value }))} />
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700">
                    ℹ️ Sau khi tạo, vào <strong>Cài đặt</strong> trên card để nhập API credentials.
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowForm(false); setForm(emptyForm) }}
                  className="btn-outline flex-1">Huỷ</button>
                <button onClick={handleCreate} disabled={saving || !canSave}
                  className="btn-primary flex-1 disabled:opacity-50">
                  {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  {isAuto ? 'Lưu & Đăng nhập sau' : 'Tạo tích hợp'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══ MODAL: Quick Test ══════════════════════════════════════════════ */}
      {showQt && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500" /> Quick Test kết nối
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Nhập credentials để test trực tiếp, không lưu vào database</p>
              </div>
              <button onClick={() => setShowQt(false)}
                className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 text-lg leading-none">
                &times;
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="label">Chọn sàn</label>
                <div className="grid grid-cols-4 gap-2">
                  {PROVIDERS.map(p => (
                    <button key={p.value}
                      onClick={() => { setQtProvider(p.value); setQtCreds({}); setQtResult(null) }}
                      className={cn('p-2 rounded-xl border-2 text-xs font-medium text-center transition-all',
                        qtProvider === p.value
                          ? 'border-primary-400 bg-primary-50 text-primary-700'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300')}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {PLATFORM_GUIDES[qtProvider] && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-1.5 font-medium text-blue-800 text-sm">
                    <Info className="w-4 h-4" /> Cách lấy credentials
                  </div>
                  {PLATFORM_GUIDES[qtProvider].steps.map((s, i) => (
                    <p key={i} className="text-xs text-blue-700">{s}</p>
                  ))}
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

              <div className="space-y-3">
                {(CRED_FIELDS[qtProvider] ?? []).map(f => (
                  <div key={f.key}>
                    <label className="label">{f.label}</label>
                    <input className="input w-full" type={f.type ?? 'text'} placeholder={f.placeholder ?? ''}
                      value={qtCreds[f.key] ?? ''}
                      onChange={e => setQtCreds(p => ({ ...p, [f.key]: e.target.value }))}
                      autoComplete="off" />
                  </div>
                ))}
                <div>
                  <label className="label">Store ID <span className="text-gray-400 text-xs">(mã cửa hàng trên sàn)</span></label>
                  <input className="input w-full font-mono" placeholder="VD: 129990"
                    value={qtCreds.storeId ?? ''}
                    onChange={e => setQtCreds(p => ({ ...p, storeId: e.target.value }))} />
                </div>
              </div>

              {qtResult && !qtResult.loading && (
                <div className={cn('rounded-xl p-4 text-sm',
                  qtResult.ok ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100')}>
                  <div className={cn('flex items-center gap-2 font-medium mb-1',
                    qtResult.ok ? 'text-green-700' : 'text-red-600')}>
                    {qtResult.ok ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    {qtResult.ok
                      ? `✅ ${qtResult.message} — ${qtResult.count ?? 0} đơn hiện tại`
                      : `❌ ${qtResult.message}`}
                  </div>
                  {qtResult.ok && qtResult.sample && (qtResult.sample as unknown[]).length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-green-600 font-medium">Đơn mẫu:</p>
                      {(qtResult.sample as Record<string, unknown>[]).map((o, i) => (
                        <div key={i} className="text-xs bg-white rounded-lg p-2 border border-green-100 font-mono">
                          #{String(o.externalOrderId ?? i)} — {String(o.customerName ?? '?')} — {String(o.total ?? 0).toLocaleString()}đ
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowQt(false)} className="btn-outline flex-1">Đóng</button>
                <button onClick={handleQuickTest} disabled={!!qtResult?.loading}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-60">
                  {qtResult?.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  {qtResult?.loading ? 'Đang kiểm tra...' : 'Test ngay'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Settings ════════════════════════════════════════════════ */}
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

            <div>
              <label className="label">Chế độ kết nối</label>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setCreds(p => ({ ...p, __loginMode: 'api' }))}
                  className={cn('p-3 rounded-xl border-2 text-sm font-medium transition-all text-left',
                    (creds.__loginMode ?? 'api') === 'api'
                      ? 'border-primary-400 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                  <div className="font-semibold">🔑 Official API</div>
                  <div className="text-xs mt-0.5 opacity-75">Partner key / OAuth2</div>
                </button>
                <button onClick={() => setCreds(p => ({ ...p, __loginMode: 'auto' }))}
                  className={cn('p-3 rounded-xl border-2 text-sm font-medium transition-all text-left',
                    creds.__loginMode === 'auto'
                      ? 'border-violet-400 bg-violet-50 text-violet-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                  <div className="font-semibold">🤖 Auto Login</div>
                  <div className="text-xs mt-0.5 opacity-75">Tự động đăng nhập portal</div>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="label">Store ID (cập nhật nếu cần)</label>
                <input className="input w-full"
                  placeholder={settingsInteg.externalStoreId || 'Store ID trên sàn'}
                  value={creds.__externalStoreId ?? ''}
                  onChange={e => setCreds(p => ({ ...p, __externalStoreId: e.target.value }))} />
              </div>

              {(creds.__loginMode ?? 'api') === 'api' && (CRED_FIELDS[settingsInteg.provider] ?? []).map(f => (
                <div key={f.key}>
                  <label className="label">{f.label}</label>
                  <input className="input w-full" type={f.type ?? 'text'} placeholder={f.placeholder ?? ''}
                    value={creds[f.key] ?? ''}
                    onChange={e => setCreds(p => ({ ...p, [f.key]: e.target.value }))}
                    autoComplete="off" />
                </div>
              ))}

              {creds.__loginMode === 'auto' && (
                <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 space-y-3">
                  <p className="text-xs text-violet-700 font-medium">Lưu thông tin đăng nhập để auto-refresh session</p>
                  <div>
                    <label className="label">Tài khoản (tên đăng nhập / Email)</label>
                    <input className="input w-full" type="text" placeholder="ooo.cashier.ds3"
                      value={creds.__loginUsername ?? ''}
                      onChange={e => setCreds(p => ({ ...p, __loginUsername: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Mật khẩu</label>
                    <input className="input w-full" type="password" autoComplete="new-password"
                      placeholder="••••••••"
                      value={creds.__loginPassword ?? ''}
                      onChange={e => setCreds(p => ({ ...p, __loginPassword: e.target.value }))} />
                  </div>
                  <p className="text-xs text-violet-500">
                    Sau khi lưu → nhấn nút <strong>Login</strong> trên card để chạy automation.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setSettingsId(null)} className="btn-outline flex-1">Huỷ</button>
              <button onClick={handleSaveSettings} disabled={updateMutation.isPending}
                className="btn-primary flex-1 disabled:opacity-50">
                {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                Lưu cài đặt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Auto Login ══════════════════════════════════════════════ */}
      {autoLoginId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-violet-500" /> Auto Login
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Playwright sẽ tự động đăng nhập vào merchant portal và lưu session.
              </p>
            </div>

            {!autoLoginWaiting && !autoLoginResult && (
              <div className="space-y-3">
                <div>
                  <label className="label">Tài khoản (tên đăng nhập / Email)</label>
                  <input className="input w-full" type="text" placeholder="ooo.cashier.ds3"
                    value={autoLoginForm.username}
                    onChange={e => setAutoLoginForm(p => ({ ...p, username: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Mật khẩu</label>
                  <input className="input w-full" type="password" autoComplete="current-password"
                    placeholder="••••••••"
                    value={autoLoginForm.password}
                    onChange={e => setAutoLoginForm(p => ({ ...p, password: e.target.value }))} />
                </div>
              </div>
            )}

            {autoLoginWaiting?.requiresOtp && !autoLoginResult && (
              <div className="space-y-3">
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-800">
                  📱 OTP đã được gửi đến <strong>{autoLoginWaiting.otpTarget}</strong>
                </div>
                <div>
                  <label className="label">Mã OTP</label>
                  <input className="input w-full text-center text-xl font-mono tracking-widest"
                    type="text" maxLength={6} placeholder="000000"
                    value={autoLoginForm.otp}
                    onChange={e => setAutoLoginForm(p => ({ ...p, otp: e.target.value }))} />
                </div>
              </div>
            )}

            {autoLoginLoading && (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl p-4 text-blue-700">
                <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                <div>
                  <p className="font-medium text-sm">Đang chạy automation…</p>
                  <p className="text-xs mt-0.5">Playwright đang mở trình duyệt và đăng nhập. Vui lòng chờ (15–90s)</p>
                </div>
              </div>
            )}

            {autoLoginResult && (
              <div className={cn('flex items-start gap-2 rounded-xl p-4 text-sm',
                autoLoginResult.ok
                  ? 'bg-green-50 border border-green-100 text-green-700'
                  : 'bg-red-50 border border-red-100 text-red-600')}>
                {autoLoginResult.ok
                  ? <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  : <XCircle className="w-5 h-5 shrink-0 mt-0.5" />}
                <span>{autoLoginResult.message}</span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button onClick={() => { setAutoLoginId(null); setAutoLoginWaiting(null); setAutoLoginResult(null) }}
                className="btn-outline flex-1">Đóng</button>
              {!autoLoginResult && (
                <button
                  onClick={() => autoLoginWaiting?.requiresOtp ? handleAutoLogin(true) : handleAutoLogin(false)}
                  disabled={
                    autoLoginLoading ||
                    (!autoLoginWaiting && (!autoLoginForm.username || !autoLoginForm.password)) ||
                    (!!autoLoginWaiting && !autoLoginForm.otp)
                  }
                  className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
                  {autoLoginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  {autoLoginWaiting?.requiresOtp ? 'Xác nhận OTP' : 'Bắt đầu Login'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
