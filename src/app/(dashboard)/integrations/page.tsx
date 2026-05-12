'use client'

import Link from 'next/link'
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
import { getDefaultSessionRefreshMode } from '@/lib/session-refresh-mode'
import { cn } from '@/lib/utils'
import { PlatformIcon } from '@/components/ui/PlatformIcon'

const PROVIDERS = [
  { value: 'grab',     label: 'GrabFood',    color: 'bg-green-100 text-green-700' },
  { value: 'be',       label: 'Be Food',     color: 'bg-yellow-100 text-yellow-800' },
  { value: 'shopee',   label: 'Shopee Food', color: 'bg-orange-100 text-orange-700' },
  { value: 'xanh_sm',  label: 'Xanh SM',     color: 'bg-teal-100 text-teal-700' },
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
  appSyncStatus?: string
  syncError?: string
  lastSyncAt?: string
  appLastSyncAt?: string
  scraperSyncStatus?: 'success' | 'error' | 'pending' | 'starting' | 'logging-in'
  scraperLastSyncAt?: string
  scraperSyncSource?: string
  scraperSyncMessage?: string
  isActive?: boolean
  loginMode?: 'api' | 'auto'
  sessionRefreshMode?: 'auto' | 'browser'
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
type ActionStatus = { tone: 'success' | 'error' | 'info'; message: string } | null
type JsonReadResult<T> = { data: T | null; parseError?: string }
type AutoLoginApiPayload = {
  data?: {
    success?: boolean
    requiresOtp?: boolean
    otpTarget?: string
    sessionKey?: string
  }
  error?: string
  message?: string
  count?: number
  sample?: unknown[]
}

const AUTO_PROVIDERS = ['grab', 'be']
const SESSION_LOGIN_PROVIDERS = ['shopee', 'grab', 'xanh_sm', 'be']
const SHOPEE_SMS_LOGIN_URL = 'https://gsso.shopeefood.vn/sms_login?app_id=nowotpapp_MCQzBi2SyApYgKGCYWsmVD4t0954cr&app_type=1001&api_version=1&client_type=1&client_version=3.0.0&client_id=1.0&client_language=vi'
const SHOPEE_MERCHANT_LOGIN_URL = 'https://merchant.shopeefood.vn/account/login'
const SHOPEE_PARTNER_OTP_URL = 'https://partner.business.accounts.shopee.vn/authenticate/login/otp?client_id=5&next=https%3A%2F%2Fpartner.shopee.vn%2Faccount%2Flogin%2Fauth&state=https%3A%2F%2Fpartner.shopee.vn%2F%3Fbusiness_next%3Dhttps%253A%252F%252Fpartner.shopee.vn%252Flogin%252Fauth%26business_state%3Dhttps%253A%252F%252Fpartner.shopee.vn%26business_client_id%3D1'
const LOGIN_PORTAL_LINKS: Record<string, string> = {
  shopee: SHOPEE_MERCHANT_LOGIN_URL,
  grab: 'https://portal.grab.com',
  xanh_sm: 'https://merchant.xanhsm.com/login',
  be: 'https://merchant.be.com.vn',
}
const TARGET_PROVIDER_COUNTS: Partial<Record<string, number>> = {
  grab: 5,
  be: 5,
}

const PROVIDER_NOTES: Partial<Record<string, string>> = {
  grab: 'Grab có thể relog từng account trong cột này. Chỉ bật Browser relog cho các account cần xử lý tay hoặc gặp captcha.',
  be: 'Be ưu tiên relog qua browser. Có thể login lại từng account ngay trong cột này.',
  shopee: 'Shopee dùng flow số điện thoại + SMS OTP. Không lưu mật khẩu cho nhánh session này nữa.',
  xanh_sm: 'Giữ riêng một cột cho Xanh SM để sau này thêm account không bị trộn với Grab hoặc Be.',
}

function providerUsesSmsOtp(provider?: string | null) {
  return provider === 'shopee' || provider === 'xanh_sm'
}

function usesBrowserRelog(integ?: Pick<Integ, 'sessionRefreshMode'> | null) {
  return integ?.sessionRefreshMode === 'browser'
}

async function readJsonSafely<T>(res: Response): Promise<JsonReadResult<T>> {
  const raw = await res.text()
  const trimmed = raw.trim()

  if (!trimmed) {
    return {
      data: null,
      parseError: `Response rỗng (${res.status})`,
    }
  }

  try {
    return {
      data: JSON.parse(trimmed) as T,
    }
  } catch {
    return {
      data: null,
      parseError: `Response không phải JSON (${res.status})`,
    }
  }
}

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

// ─── Platform account credentials (login reference) ──────────────────────────
// Dùng để nhớ tài khoản đăng nhập tay khi cần. Mật khẩu hiện ***  theo mặc định.
const PLATFORM_ACCOUNTS: {
  brand: string
  hub: string
  provider: string
  username: string
  password: string
  note?: string
}[] = [
  // BDT - 3B
  { brand: 'BDT', hub: '3B',   provider: 'grab',    username: 'ketoan@takogroup.com.vn',            password: 'Bdt2026@#' },
  { brand: 'BDT', hub: '3B',   provider: 'be',      username: 'luonghung.sg@gmail.com',             password: 'Hung1712@' },
  { brand: 'BDT', hub: '3B',   provider: 'shopee',  username: '0869693909',                         password: 'Hungchoidanh1712' },
  { brand: 'BDT', hub: '3B',   provider: 'xanh_sm', username: '0393655295',                         password: 'OTP', note: 'Đăng nhập OTP' },
  // BDT - Ò Ó O
  { brand: 'BDT', hub: 'Ò Ó O', provider: 'grab',   username: 'ooo.cashier.ds3',                    password: 'Nexdor@123' },
  { brand: 'BDT', hub: 'Ò Ó O', provider: 'be',     username: 'deliveryapp+ooohub30day@nexdor.tech', password: 'Be@99372' },
  { brand: 'BDT', hub: 'Ò Ó O', provider: 'shopee', username: '0393655295',                         password: 'Trung2002(OTP)' },
  // BDT - ĐMX
  { brand: 'BDT', hub: 'ĐMX',  provider: 'grab',    username: 'dmx.nexdor.bdt',                     password: 'Nexdor@123' },
  { brand: 'BDT', hub: 'ĐMX',  provider: 'be',      username: 'deliveryapp+dmmbdt@nexdor.tech',      password: 'Be@99347' },
  // 30B - 3B
  { brand: '30B', hub: '3B',   provider: 'grab',    username: '1ketoan@takogroup.com.vn',            password: 'Bdt2026@' },
  { brand: '30B', hub: '3B',   provider: 'be',      username: 'ketoan@takogroup.com.vn',             password: 'Bdt2026@' },
  { brand: '30B', hub: '3B',   provider: 'shopee',  username: '0393655295',                         password: 'Trung2002' },
  // 30B - Ò Ó O
  { brand: '30B', hub: 'Ò Ó O', provider: 'grab',   username: 'ooo.tech.ds33',                      password: 'Nexdor@123' },
  { brand: '30B', hub: 'Ò Ó O', provider: 'be',     username: 'deliveryapp+ooods3@nexdor.tech',      password: 'Be@99379' },
]

function PlatformAccountsSection() {
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [showSection, setShowSection] = useState(false)
  const [filterBrand, setFilterBrand] = useState('')
  const [filterProvider, setFilterProvider] = useState('')

  const toggle = (idx: number) =>
    setRevealed(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })

  const filtered = PLATFORM_ACCOUNTS.filter(a =>
    (!filterBrand || a.brand === filterBrand) &&
    (!filterProvider || a.provider === filterProvider)
  )

  const brands = Array.from(new Set(PLATFORM_ACCOUNTS.map(a => a.brand)))
  const providers = Array.from(new Set(PLATFORM_ACCOUNTS.map(a => a.provider)))

  return (
    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setShowSection(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <KeyRound className="w-5 h-5 text-gray-400" />
          <div className="text-left">
            <p className="font-semibold text-gray-900 text-sm">Tài khoản đăng nhập sàn</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {PLATFORM_ACCOUNTS.length} tài khoản · Grab, Be, Shopee, Xanh SM · Click để xem
            </p>
          </div>
        </div>
        <span className="text-xs text-gray-400">{showSection ? '▲ Thu gọn' : '▼ Mở rộng'}</span>
      </button>

      {showSection && (
        <div className="px-5 pb-5 space-y-3 border-t border-gray-100">
          {/* Filter bar */}
          <div className="flex gap-2 pt-3 flex-wrap">
            <select className="input text-sm w-28 h-8" value={filterBrand} onChange={e => setFilterBrand(e.target.value)}>
              <option value="">Tất cả brand</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <select className="input text-sm w-36 h-8" value={filterProvider} onChange={e => setFilterProvider(e.target.value)}>
              <option value="">Tất cả sàn</option>
              {providers.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {revealed.size > 0 && (
              <button onClick={() => setRevealed(new Set())} className="btn-ghost text-xs h-8 px-3 text-red-500">
                Ẩn tất cả
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {filtered.map((acc, rawIdx) => {
              const idx = PLATFORM_ACCOUNTS.indexOf(acc)
              const show = revealed.has(idx)
              return (
                <div key={idx} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                  <PlatformIcon source={acc.provider} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-bold text-gray-700">{acc.brand}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500">{acc.hub}</span>
                      {acc.note && <span className="text-[10px] text-amber-600 bg-amber-50 rounded px-1">{acc.note}</span>}
                    </div>
                    <p className="text-xs font-mono text-gray-700 truncate">{acc.username}</p>
                    <p className="text-xs font-mono text-gray-500 tracking-widest">
                      {show ? acc.password : '••••••••'}
                    </p>
                  </div>
                  <button
                    onClick={() => toggle(idx)}
                    className="shrink-0 text-xs text-gray-400 hover:text-gray-700 px-1.5 py-1 rounded hover:bg-gray-200 transition-colors"
                    title={show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {show ? '🙈' : '👁'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PrinterSection: kiểm tra + in thử máy in nhiệt LAN ────────────────────
const SCRAPER_CONTROL = 'http://127.0.0.1:3846'

function PrinterSection() {
  const [refreshingConfig, setRefreshingConfig] = useState(false)
  const [checking, setChecking]     = useState(false)
  const [printing,  setPrinting]    = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [printerIp, setPrinterIp]   = useState('192.168.1.100')
  const [printerPort, setPrinterPort] = useState('9100')
  const [printerStatus, setPrinterStatus] = useState<'ok' | 'offline' | 'unknown'>('unknown')
  const [autoDiscover, setAutoDiscover] = useState(true)
  const [discoveredPrinters, setDiscoveredPrinters] = useState<Array<{ ip: string; port: number }>>([])
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  const loadPrinterConfig = useCallback(async (options?: { showResult?: boolean }) => {
    const showResult = options?.showResult === true
    setRefreshingConfig(true)
    if (showResult) setResult(null)

    try {
      const response = await fetch(`${SCRAPER_CONTROL}/printer-config`, { signal: AbortSignal.timeout(8000) })
      const data = await response.json()
      if (data?.ip) setPrinterIp(String(data.ip))
      if (data?.port) setPrinterPort(String(data.port))
      if (data?.status) setPrinterStatus(data.status)
      setAutoDiscover(data?.autoDiscover !== false)
      setDiscoveredPrinters(Array.isArray(data?.discovered) ? data.discovered : [])
      setLastSyncedAt(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      if (showResult) {
        setResult({
          ok: true,
          message: `Đã đồng bộ cấu hình từ scraper: ${String(data?.ip ?? printerIp)}:${String(data?.port ?? printerPort)}`,
        })
      }
    } catch (e) {
      setPrinterStatus('unknown')
      if (showResult) {
        setResult({ ok: false, message: `Không đọc được cấu hình máy in từ scraper: ${(e as Error).message}` })
      }
    } finally {
      setRefreshingConfig(false)
    }
  }, [printerIp, printerPort])

  useEffect(() => {
    let cancelled = false

    void loadPrinterConfig()
    const intervalId = window.setInterval(() => {
      if (!cancelled) void loadPrinterConfig()
    }, 15000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [loadPrinterConfig])

  const check = async () => {
    setChecking(true); setResult(null)
    try {
      const r = await fetch(`${SCRAPER_CONTROL}/printer-check`, { signal: AbortSignal.timeout(8000) })
      const d = await r.json()
      if (d?.ip) setPrinterIp(String(d.ip))
      if (d?.port) setPrinterPort(String(d.port))
      setAutoDiscover(d?.autoDiscover !== false)
      setDiscoveredPrinters(Array.isArray(d?.discovered) ? d.discovered : [])
      setPrinterStatus(d?.status === 'ok' || d?.status === 'offline' ? d.status : (d?.online ? 'ok' : 'offline'))
      setResult({ ok: !!d.online || !!d.ok, message: d.message ?? (d.online ? `Online — ${d.ip}:${d.port}` : `Offline — ${d.ip}:${d.port}`) })
    } catch (e) {
      setPrinterStatus('unknown')
      setResult({ ok: false, message: `Không kết nối được scraper (127.0.0.1:3846): ${(e as Error).message}` })
    } finally { setChecking(false) }
  }

  const testPrint = async () => {
    setPrinting(true); setResult(null)
    try {
      const r = await fetch(`${SCRAPER_CONTROL}/printer-test`, { method: 'POST', signal: AbortSignal.timeout(12000) })
      const d = await r.json()
      if (d?.ip) setPrinterIp(String(d.ip))
      if (d?.port) setPrinterPort(String(d.port))
      if (d?.status) setPrinterStatus(d.status)
      setDiscoveredPrinters(Array.isArray(d?.discovered) ? d.discovered : discoveredPrinters)
      setResult({ ok: !!d.ok, message: d.message ?? (d.ok ? 'In thử thành công!' : 'In thất bại') })
    } catch (e) {
      setPrinterStatus('unknown')
      setResult({ ok: false, message: `Không kết nối được scraper: ${(e as Error).message}` })
    } finally { setPrinting(false) }
  }

  const updatePrinterEnv = async () => {
    setSavingConfig(true); setResult(null)
    try {
      const r = await fetch(`${SCRAPER_CONTROL}/set-printer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: printerIp, port: Number(printerPort) }),
        signal: AbortSignal.timeout(5000),
      })
      const d = await r.json()
      if (d?.ip) setPrinterIp(String(d.ip))
      if (d?.port) setPrinterPort(String(d.port))
      if (d?.status) setPrinterStatus(d.status)
      setDiscoveredPrinters(Array.isArray(d?.discovered) ? d.discovered : discoveredPrinters)
      setResult({ ok: !!d.ok, message: d.message ?? (d.ok ? 'Đã cập nhật cấu hình máy in' : 'Lỗi cập nhật') })
    } catch (e) {
      setPrinterStatus('unknown')
      setResult({ ok: false, message: `Không kết nối được scraper để cập nhật cấu hình: ${(e as Error).message}` })
    } finally {
      setSavingConfig(false)
    }
  }

  const discoverPrinters = async () => {
    setDiscovering(true); setResult(null)
    try {
      const r = await fetch(`${SCRAPER_CONTROL}/printer-discover`, { method: 'POST', signal: AbortSignal.timeout(20000) })
      const d = await r.json()
      if (d?.ip) setPrinterIp(String(d.ip))
      if (d?.port) setPrinterPort(String(d.port))
      if (d?.status) setPrinterStatus(d.status)
      setDiscoveredPrinters(Array.isArray(d?.discovered) ? d.discovered : [])
      setResult({ ok: !!d.ok, message: d.message ?? 'Đã quét máy in trên LAN.' })
    } catch (e) {
      setResult({ ok: false, message: `Không quét được máy in: ${(e as Error).message}` })
    } finally {
      setDiscovering(false)
    }
  }

  const statusTone =
    printerStatus === 'ok'
      ? 'bg-green-50 text-green-700 border border-green-200'
      : printerStatus === 'offline'
        ? 'bg-red-50 text-red-600 border border-red-200'
        : 'bg-gray-50 text-gray-500 border border-gray-200'

  const statusLabel =
    printerStatus === 'ok'
      ? 'Online'
      : printerStatus === 'offline'
        ? 'Offline'
        : 'Chưa rõ'

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-xl">🖨️</div>
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">Máy in nhiệt (LAN)</h2>
          <p className="text-xs text-gray-400">Kết nối qua scraper · ESC/POS TCP · 80mm</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold', statusTone)}>
          Trạng thái: {statusLabel}
        </span>
        <span className="text-xs text-gray-500">
          Scraper đang dùng: {printerIp}:{printerPort}
        </span>
        <span className="text-xs text-gray-500">
          Auto-find: {autoDiscover ? 'Bật' : 'Tắt'}
        </span>
        {lastSyncedAt && (
          <span className="text-xs text-gray-500">
            Đồng bộ lúc: {lastSyncedAt}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">IP máy in</label>
          <input className="input" value={printerIp} onChange={e => setPrinterIp(e.target.value)} placeholder="192.168.1.100" />
        </div>
        <div>
          <label className="label">Port</label>
          <input className="input" value={printerPort} onChange={e => setPrinterPort(e.target.value)} placeholder="9100" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={() => void loadPrinterConfig({ showResult: true })} disabled={refreshingConfig || checking || printing || savingConfig || discovering} className="btn-outline flex items-center gap-1.5 disabled:opacity-50">
          {refreshingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Đồng bộ từ scraper
        </button>
        <button onClick={discoverPrinters} disabled={checking || printing || savingConfig || discovering} className="btn-outline flex items-center gap-1.5 disabled:opacity-50">
          {discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
          Tự tìm máy in
        </button>
        <button onClick={check} disabled={checking || printing || savingConfig || discovering} className="btn-outline flex items-center gap-1.5 disabled:opacity-50">
          {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
          Kiểm tra kết nối
        </button>
        <button onClick={testPrint} disabled={checking || printing || savingConfig || discovering} className="btn-outline flex items-center gap-1.5 disabled:opacity-50">
          {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className="text-base leading-none">🖨️</span>}
          In thử hóa đơn
        </button>
        <button onClick={updatePrinterEnv} disabled={checking || printing || savingConfig || discovering} className="btn-ghost flex items-center gap-1.5 text-sm disabled:opacity-50">
          {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />} {savingConfig ? 'Đang lưu...' : 'Cập nhật IP/Port'}
        </button>
      </div>

      {discoveredPrinters.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Máy in tìm thấy</p>
          <div className="flex flex-wrap gap-2">
            {discoveredPrinters.map((printer) => {
              const key = `${printer.ip}:${printer.port}`
              const active = printer.ip === printerIp && String(printer.port) === printerPort
              return (
                <button
                  key={key}
                  onClick={() => { setPrinterIp(printer.ip); setPrinterPort(String(printer.port)) }}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'border-green-300 bg-green-50 text-green-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-100'
                  )}
                >
                  {key}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {result && (
        <div className={cn('rounded-xl px-4 py-3 text-sm flex items-start gap-2',
          result.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-600')}>
          {result.ok ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{result.message}</span>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Chức năng này gọi printer bridge tại <code className="font-mono">127.0.0.1:3846</code> — scraper phải đang chạy trên cùng máy tính.
      </p>
    </div>
  )
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
  const [autoLoginMode, setAutoLoginMode] = useState<'auto' | 'manual' | 'otp'>('auto')
  const [autoLoginForm, setAutoLoginForm] = useState<AutoLoginForm>({ username: '', password: '', otp: '' })
  const [manualJwt, setManualJwt]         = useState('')
  const [manualCookieString, setManualCookieString] = useState('')
  const [manualStoreId, setManualStoreId] = useState('')
  const [autoLoginWaiting, setAutoLoginWaiting] = useState<{ requiresOtp: boolean; otpTarget?: string; sessionKey?: string } | null>(null)
  const [autoLoginResult, setAutoLoginResult]   = useState<{ ok: boolean; message: string; debug?: unknown[] } | null>(null)
  const [autoLoginLoading, setAutoLoginLoading] = useState(false)

  // Quick Test modal
  const [showQt, setShowQt]         = useState(false)
  const [qtProvider, setQtProvider] = useState('be')
  const [qtCreds, setQtCreds]       = useState<Record<string, string>>({})
  const [qtResult, setQtResult]     = useState<QtResult | null>(null)
  const [actionStatus, setActionStatus] = useState<ActionStatus>(null)
  const [activeProviderTab, setActiveProviderTab] = useState(PROVIDERS[0].value)
  const autoLoginInteg = autoLoginId ? integrations.find(i => i._id === autoLoginId) ?? null : null
  const autoLoginUsesSmsOtp = providerUsesSmsOtp(autoLoginInteg?.provider)

  // Live "time ago" ticker — re-renders every 30s so lastSyncAt label refreshes
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  // ─── Helpers ─────────────────────────────────────────────────────────────
  const provInfo  = (v: string) => PROVIDERS.find(p => p.value === v)
  const filteredHubs = form.brandId ? hubs.filter(h => h.brandId === form.brandId) : hubs
  const providerCounts = PROVIDERS.reduce((acc, provider) => {
    acc[provider.value] = integrations.filter((integration) => integration.provider === provider.value).length
    return acc
  }, {} as Record<string, number>)
  const providerSections = PROVIDERS.map((provider) => ({
    ...provider,
    integrations: integrations.filter((integration) => integration.provider === provider.value),
    target: TARGET_PROVIDER_COUNTS[provider.value],
    note: PROVIDER_NOTES[provider.value],
  }))
  const activeProviderSection = providerSections.find((section) => section.value === activeProviderTab) ?? providerSections[0]

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

  function openCreateModal(provider = 'grab') {
    setActionStatus(null)
    setForm({
      ...emptyForm,
      provider,
      loginMode: AUTO_PROVIDERS.includes(provider) ? 'auto' : 'api',
    })
    setShowForm(true)
  }

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Xóa tích hợp này?')) return

    try {
      setActionStatus({ tone: 'info', message: 'Đang xóa tích hợp…' })
      await deleteMutation.mutateAsync(id)
      setActionStatus({ tone: 'success', message: 'Đã xóa tích hợp.' })
    } catch (error) {
      setActionStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Xóa tích hợp thất bại.' })
    }
  }, [deleteMutation])

  function renderIntegrationCard(integ: Integ) {
    const prov = provInfo(integ.provider)
    const tr = testResults[integ._id]
    const sr = syncResults[integ._id]
    const isPendingSetup = integ.isActive === false
    const supportsSessionLogin = SESSION_LOGIN_PROVIDERS.includes(integ.provider)
    const isExternalScraperManaged = integ.loginMode === 'auto' && (integ.provider === 'grab' || integ.provider === 'be')
    const displayedSyncStatus = isExternalScraperManaged ? (integ.scraperSyncStatus ?? 'pending') : integ.syncStatus
    const displayedSyncAt = isExternalScraperManaged ? integ.scraperLastSyncAt : integ.lastSyncAt

    return (
      <div key={integ._id} className={cn('rounded-2xl border border-gray-200 bg-white p-4 flex flex-col gap-3 shadow-sm', integ.isActive === false && 'opacity-60')}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
              <PlatformIcon source={integ.provider} size="lg" />
            </div>
            <div className="min-w-0">
              <p className="mt-0 text-sm font-medium text-gray-900 truncate">
                {integ.externalStoreName || integ.externalStoreId || 'Chưa cấu hình cửa hàng'}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {integ.loginUsername
                  ? integ.loginUsername
                  : integ.externalStoreId || 'Chưa có mã cửa hàng'}
              </p>
            </div>
          </div>
          <button
            onClick={() => void handleDelete(integ._id)}
            className="btn-ghost btn-sm p-1.5 text-red-500 hover:bg-red-50 shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid gap-1 text-sm text-gray-600">
          <p><span className="font-medium">Thương hiệu:</span> {getBrandName(integ)}</p>
          <p><span className="font-medium">Điểm bán:</span> {getHubName(integ)}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('badge badge-sm',
              isPendingSetup ? 'badge-gray' :
              displayedSyncStatus === 'success' ? 'badge-green' :
              displayedSyncStatus === 'error' ? 'badge-red' :
              displayedSyncStatus === 'syncing' || displayedSyncStatus === 'starting' || displayedSyncStatus === 'logging-in' ? 'badge-blue' : 'badge-gray')}>
              {isPendingSetup ? 'Chờ cấu hình' :
               isExternalScraperManaged
                 ? displayedSyncStatus === 'success' ? 'Scraper OK'
                 : displayedSyncStatus === 'error' ? 'Scraper stale'
                 : displayedSyncStatus === 'starting' ? 'Scraper khởi động'
                 : displayedSyncStatus === 'logging-in' ? 'Scraper đăng nhập'
                 : 'Chờ scraper'
                 : displayedSyncStatus === 'success' ? 'Đồng bộ OK'
                 : displayedSyncStatus === 'error' ? 'Lỗi đồng bộ'
                 : displayedSyncStatus === 'syncing' ? 'Đang sync…' : 'Chưa đồng bộ'}
            </span>
            {displayedSyncAt && (
              <span className="text-xs text-gray-400" title={new Date(displayedSyncAt).toLocaleString('vi-VN')}>
                {timeAgo(displayedSyncAt)}
              </span>
            )}
          </div>
          {isExternalScraperManaged && integ.scraperSyncMessage && (
            <p className="text-xs text-sky-700">
              {integ.scraperSyncMessage}
            </p>
          )}
          {isExternalScraperManaged && integ.provider === 'be' && integ.appLastSyncAt && (
            <p className="text-xs text-gray-400" title={new Date(integ.appLastSyncAt).toLocaleString('vi-VN')}>
              API nền: {integ.appSyncStatus === 'success' ? 'OK' : integ.appSyncStatus === 'error' ? 'lỗi' : integ.appSyncStatus ?? 'n/a'} · {timeAgo(integ.appLastSyncAt)}
            </p>
          )}
        </div>

        {isPendingSetup && (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            Account này đang được tạo chờ sẵn để nhập OTP hoặc cấu hình chính thức sau. Hiện chưa bật sync tự động.
          </div>
        )}

        {integ.loginMode === 'auto' && integ.provider === 'be' && (
          /* BE dùng API inject trực tiếp — không cần browser */
          <div className={cn('flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 border',
            integ.sessionStatus === 'active'
              ? 'bg-teal-50 border-teal-200 text-teal-700'
              : integ.sessionStatus === 'error'
              ? 'bg-red-50 border-red-200 text-red-600'
              : 'bg-gray-50 border-gray-200 text-gray-500')}>
            <Zap className="w-3 h-3 shrink-0" />
            {integ.sessionStatus === 'active'
              ? <span>API trực tiếp · token còn hạn{integ.sessionExpiresAt ? ` đến ${new Date(integ.sessionExpiresAt).toLocaleDateString('vi-VN')}` : ''}</span>
              : integ.sessionStatus === 'error'
              ? <span className="truncate">{integ.sessionError ?? 'Lỗi token'}</span>
              : <span>API trực tiếp · chưa inject token</span>}
          </div>
        )}

        {integ.loginMode === 'auto' && integ.provider !== 'be' && (
          /* Grab / các sàn khác: dùng browser automation */
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
              ? <><Loader2 className="w-3 h-3 animate-spin shrink-0" /><span>Đang login browser…</span></>
              : integ.sessionStatus === 'active'
              ? <><Wifi className="w-3 h-3 shrink-0" /><span>Browser session active{integ.sessionExpiresAt ? ` · hết hạn ${new Date(integ.sessionExpiresAt).toLocaleDateString('vi-VN')}` : ''}</span></>
              : integ.sessionStatus === 'expired'
              ? <><Clock className="w-3 h-3 shrink-0" /><span>Session hết hạn – scraper sẽ tự relog</span></>
              : integ.sessionStatus === 'error'
              ? <><WifiOff className="w-3 h-3 shrink-0" /><span className="truncate">{integ.sessionError ?? 'Lỗi login'}</span></>
              : <><Clock className="w-3 h-3 shrink-0" /><span>Chờ scraper login…</span></>}
          </div>
        )}

        {sr && !sr.loading && (
          <div className={cn('flex items-start gap-1.5 text-xs rounded-lg px-3 py-2', sr.ok ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600')}>
            {sr.ok
              ? <><RefreshCw className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>+{sr.upserted} mới, {sr.updated} cập nhật</span></>
              : <><XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{sr.message}</span></>}
          </div>
        )}

        {tr && !tr.loading && (
          <div className={cn('flex items-start gap-1.5 text-xs rounded-lg px-3 py-2', tr.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>
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

        <div className="flex gap-2 pt-1 border-t border-gray-100">
          <button onClick={() => openSettings(integ)} className="btn-outline btn-sm flex items-center gap-1 px-2">
            <Settings className="w-3.5 h-3.5" /> Cài đặt
          </button>
          {supportsSessionLogin ? (
            <button
              onClick={() => openAutoLogin(integ)}
              className="btn-outline btn-sm flex items-center gap-1 px-2 text-violet-600 border-violet-200 hover:bg-violet-50"
            >
              <KeyRound className="w-3.5 h-3.5" /> {usesBrowserRelog(integ) ? 'Login browser' : 'Login'}
            </button>
          ) : (
            <button
              onClick={() => handleTest(integ._id)}
              disabled={isPendingSetup || !!tr?.loading}
              className="btn-outline btn-sm flex items-center gap-1 px-2 text-primary-600 border-primary-200 hover:bg-primary-50 disabled:opacity-50"
            >
              {tr?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
              {isPendingSetup ? 'Chờ cấu hình' : 'Test'}
            </button>
          )}
          <button
            onClick={() => handleSync(integ._id)}
            disabled={isPendingSetup || !!sr?.loading}
            className="btn-primary btn-sm flex-1 flex items-center gap-1 justify-center disabled:opacity-50"
          >
            {sr?.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {isPendingSetup ? 'Chờ bật' : 'Sync'}
          </button>
        </div>
      </div>
    )
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
    try {
      setActionStatus({ tone: 'info', message: 'Đang tạo tích hợp…' })
      await createMutation.mutateAsync(body)
      setShowForm(false)
      setForm(emptyForm)
      setActionStatus({ tone: 'success', message: 'Đã tạo tích hợp thành công.' })
    } catch (error) {
      setActionStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Tạo tích hợp thất bại.' })
    }
  }

  const openSettings = (integ: Integ) => {
    setActionStatus(null)
    setSettingsId(integ._id)
    const init: Record<string, string> = {
      __externalStoreId: integ.externalStoreId ?? '',
      __loginMode: integ.loginMode ?? 'api',
      __sessionRefreshMode: integ.sessionRefreshMode ?? getDefaultSessionRefreshMode(integ.provider),
      __loginUsername: integ.loginUsername ?? '',
      __loginPassword: '',
    }
    ;(CRED_FIELDS[integ.provider] ?? []).forEach(f => { init[f.key] = '' })
    setCreds(init)
  }

  const handleSaveSettings = async () => {
    if (!settingsId || !settingsInteg) return
    const { __externalStoreId, __loginMode, __sessionRefreshMode, __loginUsername, __loginPassword, ...credFields } = creds
    const usesSmsOtp = providerUsesSmsOtp(settingsInteg.provider)
    const body: Record<string, unknown> = {}
    if (__loginMode) body.loginMode = __loginMode
    if (__sessionRefreshMode) body.sessionRefreshMode = __sessionRefreshMode
    if (__externalStoreId?.trim()) body.externalStoreId = __externalStoreId.trim()
    if (__loginMode !== 'auto') {
      const credUpdate: Record<string, string> = {}
      Object.entries(credFields).forEach(([k, v]) => { if (v.trim()) credUpdate[k] = v.trim() })
      if (Object.keys(credUpdate).length) body.credentials = credUpdate
    }
    if (__loginUsername?.trim()) body.loginUsername = __loginUsername.trim()
    if (!usesSmsOtp && __loginPassword?.trim()) body.loginPassword = __loginPassword.trim()
    try {
      setActionStatus({ tone: 'info', message: 'Đang lưu cài đặt…' })
      await updateMutation.mutateAsync({ id: settingsId, ...body })
      setSettingsId(null)
      setActionStatus({ tone: 'success', message: 'Đã lưu cài đặt.' })
    } catch (error) {
      setActionStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Lưu cài đặt thất bại.' })
    }
  }

  const handleSync = useCallback(async (id: string) => {
    setSyncResults(prev => ({ ...prev, [id]: { loading: true } }))
    try {
      const res  = await fetch(`/api/integrations/${id}/sync`, { method: 'POST' })
      const { data, parseError } = await readJsonSafely<{ error?: string; upserted?: number; updated?: number }>(res)
      if (!res.ok || !data) throw new Error(data?.error ?? parseError ?? 'Lỗi đồng bộ')
      setSyncResults(prev => ({ ...prev, [id]: { loading: false, ok: true, upserted: data.upserted, updated: data.updated } }))
      qc.invalidateQueries({ queryKey: ['integrations'] })
    } catch (e) {
      setSyncResults(prev => ({ ...prev, [id]: { loading: false, ok: false, message: e instanceof Error ? e.message : 'Lỗi không xác định' } }))
    }
  }, [qc])

  const handleSyncAll = async () => {
    setSyncingAll(true)
    setActionStatus({ tone: 'info', message: 'Đang sync tất cả tích hợp…' })
    try {
      await Promise.all(integrations.filter(i => i.isActive !== false).map(i => handleSync(i._id)))
      setActionStatus({ tone: 'success', message: 'Đã chạy sync tất cả. Xem trạng thái trên từng card nếu có lỗi.' })
    } catch (error) {
      setActionStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Sync tất cả thất bại.' })
    } finally {
      setSyncingAll(false)
    }
  }

  const handleTest = async (id: string) => {
    setTestResults(prev => ({ ...prev, [id]: { loading: true } }))
    try {
      const res  = await fetch(`/api/integrations/${id}/test`, { method: 'POST' })
      const { data, parseError } = await readJsonSafely<{ error?: string; message?: string; count?: number }>(res)
      if (!res.ok || !data) throw new Error(data?.error ?? parseError ?? 'Lỗi kết nối')
      setTestResults(prev => ({ ...prev, [id]: { loading: false, ok: true, message: data.message, count: data.count } }))
    } catch (e) {
      setTestResults(prev => ({ ...prev, [id]: { loading: false, ok: false, message: e instanceof Error ? e.message : 'Lỗi không xác định' } }))
    }
  }

  const openAutoLogin = (integ: Integ) => {
    setAutoLoginId(integ._id)
    setAutoLoginMode(providerUsesSmsOtp(integ.provider) ? 'otp' : 'auto')
    setAutoLoginForm({ username: integ.loginUsername ?? '', password: '', otp: '' })
    setManualJwt('')
    setManualCookieString('')
    setManualStoreId(providerUsesSmsOtp(integ.provider) ? '' : integ.externalStoreId ?? '')
    setAutoLoginWaiting(null)
    setAutoLoginResult(null)
  }

  const handleAutoLogin = async (withOtp = false) => {
    if (!autoLoginId) return
    setAutoLoginLoading(true)
    setAutoLoginResult(null)
    try {
      const isShopeeOtpLogin = autoLoginInteg?.provider === 'shopee'
      const shopeeBody: Record<string, string | undefined> = {
        step: withOtp ? 'otp' : 'login',
        phone: autoLoginForm.username,
        otp: (withOtp && autoLoginForm.otp) ? autoLoginForm.otp : undefined,
        sessionKey: autoLoginWaiting?.sessionKey,
      }
      const autoLoginBody: Record<string, string | undefined> = {
        username: autoLoginForm.username,
        password: autoLoginForm.password || undefined,
        otp: (withOtp && autoLoginForm.otp) ? autoLoginForm.otp : undefined,
        sessionKey: autoLoginWaiting?.sessionKey,
      }
      const body: Record<string, string | undefined> = isShopeeOtpLogin
        ? {
            ...shopeeBody,
          }
        : {
            ...autoLoginBody,
          }
      const endpoint = isShopeeOtpLogin
        ? `/api/integrations/${autoLoginId}/shopee-otp-login`
        : `/api/integrations/${autoLoginId}/auto-login`

      const attempts: Array<{ endpoint: string; status: number; ok: boolean; parseError?: string; payload: AutoLoginApiPayload | null }> = []

      const requestLogin = async (targetEndpoint: string, targetBody: Record<string, string | undefined>) => {
        const res = await fetch(targetEndpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(targetBody),
        })
        const parsed = await readJsonSafely<AutoLoginApiPayload>(res)
        attempts.push({
          endpoint: targetEndpoint,
          status: res.status,
          ok: res.ok,
          parseError: parsed.parseError,
          payload: parsed.data,
        })

        return {
          res,
          data: parsed.data,
          parseError: parsed.parseError,
        }
      }

      let { res, data, parseError } = await requestLogin(endpoint, body)

      if (isShopeeOtpLogin && !data?.data?.requiresOtp && !data?.data?.success) {
        ;({ res, data, parseError } = await requestLogin(`/api/integrations/${autoLoginId}/auto-login`, autoLoginBody))
      }

      if (data?.data?.requiresOtp) {
        setAutoLoginWaiting({ requiresOtp: true, otpTarget: data.data.otpTarget, sessionKey: data.data.sessionKey })
      } else if (data?.data?.success) {
        setAutoLoginResult({ ok: true, message: 'Đăng nhập thành công! Session đã được lưu.' })
        setAutoLoginWaiting(null)
        qc.invalidateQueries({ queryKey: ['integrations'] })
      } else {
        setAutoLoginResult({
          ok: false,
          message: data?.error ?? parseError ?? `Đăng nhập thất bại (${res.status})`,
          debug: attempts,
        })
      }
    } catch (e) {
      setAutoLoginResult({ ok: false, message: e instanceof Error ? e.message : 'Lỗi mạng' })
    } finally {
      setAutoLoginLoading(false)
    }
  }

  const handleManualSession = async () => {
    if (!autoLoginId) return
    setAutoLoginLoading(true)
    setAutoLoginResult(null)
    try {
      const provider = autoLoginInteg?.provider ?? ''

      if (provider === 'shopee' || provider === 'xanh_sm') {
        const extraHeaders: Record<string, string> = {}
        const trimmedToken = manualJwt.trim()

        if (!manualCookieString.trim() && !trimmedToken) {
          throw new Error('Cần paste cookie hoặc token để lưu session thủ công')
        }

        if (provider === 'shopee' && trimmedToken) {
          extraHeaders['x-csrftoken'] = trimmedToken
        }
        if (provider === 'xanh_sm' && trimmedToken) {
          extraHeaders.Authorization = trimmedToken.startsWith('Bearer ') ? trimmedToken : `Bearer ${trimmedToken}`
        }

        const res = await fetch(`/api/integrations/${autoLoginId}/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cookieString: manualCookieString.trim() || undefined,
            extraHeaders: Object.keys(extraHeaders).length ? extraHeaders : undefined,
          }),
        })
        const { data, parseError } = await readJsonSafely<AutoLoginApiPayload>(res)
        if (!res.ok) throw new Error(data?.error ?? parseError ?? 'Lỗi lưu session')

        await updateMutation.mutateAsync({
          id: autoLoginId,
          loginMode: 'auto',
          loginUsername: autoLoginForm.username || undefined,
          externalStoreId: manualStoreId.trim() || undefined,
        })

        setAutoLoginResult({ ok: true, message: 'Session đã được lưu vào DB. Có thể dùng session này để kiểm thử automation ở bước tiếp theo.' })
        qc.invalidateQueries({ queryKey: ['integrations'] })
      } else {
        if (!manualJwt.trim()) throw new Error('Cần JWT token để lưu session thủ công')

        const res  = await fetch(`/api/integrations/${autoLoginId}/auto-login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manualJwt:  manualJwt.trim(),
            storeId:    manualStoreId.trim() || undefined,
            username:   autoLoginForm.username || undefined,
          }),
        })
        const { data, parseError } = await readJsonSafely<AutoLoginApiPayload>(res)
        if (data?.data?.success) {
          setAutoLoginResult({ ok: true, message: 'Session đã được lưu! Cron sẽ tự pull đơn mỗi phút.' })
          qc.invalidateQueries({ queryKey: ['integrations'] })
        } else {
          setAutoLoginResult({ ok: false, message: data?.error ?? parseError ?? `Lỗi lưu session (${res.status})` })
        }
      }
    } catch (e) {
      setAutoLoginResult({ ok: false, message: e instanceof Error ? e.message : 'Lỗi mạng' })
    } finally {
      setAutoLoginLoading(false)
    }
  }

  const handleShopeeOtpLogin = async () => {
    await handleAutoLogin(Boolean(autoLoginWaiting?.requiresOtp))
  }

  const handleQuickTest = async () => {
    setQtResult({ loading: true })
    try {
      const res  = await fetch('/api/integrations/quick-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: qtProvider, credentials: qtCreds }),
      })
      const { data, parseError } = await readJsonSafely<AutoLoginApiPayload>(res)
      if (!res.ok || !data) throw new Error(data?.error ?? parseError ?? 'Lỗi kết nối')
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
            {isLoading
              ? '…'
              : `${integrations.length} kết nối · Grab ${providerCounts.grab ?? 0} · Be ${providerCounts.be ?? 0} · Shopee ${providerCounts.shopee ?? 0} · Xanh SM ${providerCounts.xanh_sm ?? 0}`}
            {' '}· tự động làm mới mỗi 30s
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
          <button onClick={() => openCreateModal()} className="btn-primary">
            <Plus className="w-4 h-4" /> Thêm tích hợp
          </button>
        </div>
      </div>

      {actionStatus && (
        <div className={cn(
          'rounded-2xl border px-4 py-3 text-sm',
          actionStatus.tone === 'success' && 'border-green-200 bg-green-50 text-green-700',
          actionStatus.tone === 'error' && 'border-red-200 bg-red-50 text-red-600',
          actionStatus.tone === 'info' && 'border-blue-200 bg-blue-50 text-blue-700'
        )}>
          {actionStatus.message}
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
        </div>
      )}

      <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap gap-2 border-b border-gray-100 pb-4">
          {providerSections.map((section) => {
            const active = section.value === activeProviderSection.value
            return (
              <button
                key={section.value}
                onClick={() => setActiveProviderTab(section.value)}
                className={cn(
                  'flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition-all',
                  active
                    ? 'border-gray-900 bg-gray-900 text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                )}
              >
                <PlatformIcon source={section.value} size="sm" />
                <span className="font-semibold">{section.label}</span>
                <span className={cn('text-xs', active ? 'text-white/70' : 'text-gray-400')}>
                  {section.integrations.length}{section.target ? `/${section.target}` : ''}
                </span>
              </button>
            )
          })}
        </div>

        <section key={activeProviderSection.value} className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <PlatformIcon source={activeProviderSection.value} size="xl" />
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-gray-900">
                  {activeProviderSection.label} &middot; {activeProviderSection.integrations.length} kết nối{activeProviderSection.target ? ` / ${activeProviderSection.target}` : ''}
                </h2>
                <p className="mt-1 text-sm text-gray-500">{activeProviderSection.note}</p>
              </div>
            </div>
            <button onClick={() => openCreateModal(activeProviderSection.value)} className="btn-outline btn-sm shrink-0">
              <Plus className="w-4 h-4" /> Thêm
            </button>
          </div>

          {(activeProviderSection.value === 'shopee' || activeProviderSection.value === 'xanh_sm') && (
            <div className={cn(
              'rounded-2xl border px-4 py-3 text-sm',
              activeProviderSection.value === 'shopee'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-teal-200 bg-teal-50 text-teal-900'
            )}>
              <p>
                {activeProviderSection.value === 'shopee'
                  ? 'Shopee đăng nhập bằng số điện thoại và OTP SMS. Dùng nút Login trên card để chạy flow OTP, hoặc vào manual nếu cần tự dán cookie/session.'
                  : 'Xanh SM cũng dùng flow OTP SMS, không cần mật khẩu ở màn hình login session.'}
              </p>
              <a
                href={activeProviderSection.value === 'shopee' ? LOGIN_PORTAL_LINKS.shopee : LOGIN_PORTAL_LINKS.xanh_sm}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex text-sm font-medium underline underline-offset-2"
              >
                {activeProviderSection.value === 'shopee' ? 'Mở trang Shopee Merchant' : 'Mở trang đăng nhập Xanh SM'}
              </a>
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {activeProviderSection.integrations.length > 0 ? (
              activeProviderSection.integrations.map((integration) => renderIntegrationCard(integration))
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500 lg:col-span-2 2xl:col-span-3">
                <ShoppingBag className="w-8 h-8 mx-auto mb-3 text-gray-300" />
                {activeProviderSection.value === 'shopee'
                  ? 'Chưa tạo bản ghi Shopee nào. Khi có OTP, có thể thêm hoặc cập nhật account ngay trong tab này.'
                  : activeProviderSection.value === 'xanh_sm'
                  ? 'Chưa tạo bản ghi Xanh SM nào. Có thể lưu account chờ OTP ngay trong tab này.'
                  : 'Chưa có tích hợp nào trong tab này.'}
              </div>
            )}
          </div>
        </section>
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
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Thêm tích hợp sàn</h2>
                  <p className="text-sm text-gray-400 mt-0.5">Kết nối tài khoản sàn bán hàng</p>
                </div>
                <button
                  onClick={() => { setShowForm(false); setForm(emptyForm); setActionStatus(null) }}
                  className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 text-xl leading-none shrink-0"
                >
                  &times;
                </button>
              </div>

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
                      <span className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                        <span className={cn('badge badge-sm shrink-0', pr.color)}>{pr.label}</span>
                        <span className="truncate text-xs text-gray-400">
                          {pr.value === 'be' ? 'API trực tiếp' : AUTO_PROVIDERS.includes(pr.value) ? 'Browser auto' : 'API'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

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

              {isAuto && (
                <div className="space-y-3">
                  <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-xs text-violet-700">
                    {form.provider === 'be'
                      ? '⚡ Be dùng API trực tiếp — không cần mở browser. Scraper tự login API và inject token mỗi 22h. Mật khẩu mã hoá AES-256.'
                      : '🔐 Hệ thống tự động đăng nhập merchant portal qua browser để lấy đơn hàng. Mật khẩu được mã hoá AES-256 trước khi lưu.'}
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
                <button onClick={() => { setShowForm(false); setForm(emptyForm); setActionStatus(null) }}
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

      {/* ═══ SECTION: Tài khoản đăng nhập sàn ═════════════════════════════ */}
      <PlatformAccountsSection />

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
                  <div className="text-xs mt-0.5 opacity-75">{providerUsesSmsOtp(settingsInteg.provider) ? 'SĐT + SMS OTP' : 'Tự động đăng nhập portal'}</div>
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
                  <p className="text-xs text-violet-700 font-medium">{providerUsesSmsOtp(settingsInteg.provider) ? 'Lưu số điện thoại để chạy flow SMS OTP' : 'Lưu thông tin đăng nhập để relog session khi cần'}</p>
                  <div>
                    <label className="label">{providerUsesSmsOtp(settingsInteg.provider) ? 'Số điện thoại đăng nhập' : 'Tài khoản (tên đăng nhập / Email)'}</label>
                    <input className="input w-full" type="text" placeholder={providerUsesSmsOtp(settingsInteg.provider) ? 'VD: 0901234567' : 'ooo.cashier.ds3'}
                      value={creds.__loginUsername ?? ''}
                      onChange={e => setCreds(p => ({ ...p, __loginUsername: e.target.value }))} />
                  </div>
                  {!providerUsesSmsOtp(settingsInteg.provider) && (
                    <div>
                      <label className="label">Mật khẩu</label>
                      <input className="input w-full" type="password" autoComplete="new-password"
                        placeholder="••••••••"
                        value={creds.__loginPassword ?? ''}
                        onChange={e => setCreds(p => ({ ...p, __loginPassword: e.target.value }))} />
                    </div>
                  )}
                  {!providerUsesSmsOtp(settingsInteg.provider) && (
                    <div>
                      <label className="label">Cách relog session</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setCreds(p => ({ ...p, __sessionRefreshMode: 'auto' }))}
                          className={cn('p-3 rounded-xl border-2 text-sm font-medium transition-all text-left',
                            (creds.__sessionRefreshMode ?? getDefaultSessionRefreshMode(settingsInteg.provider)) === 'auto'
                              ? 'border-violet-400 bg-violet-100 text-violet-800'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                          <div className="font-semibold">Headless auto</div>
                          <div className="text-xs mt-0.5 opacity-75">Server tự relog nền</div>
                        </button>
                        <button onClick={() => setCreds(p => ({ ...p, __sessionRefreshMode: 'browser' }))}
                          className={cn('p-3 rounded-xl border-2 text-sm font-medium transition-all text-left',
                            (creds.__sessionRefreshMode ?? getDefaultSessionRefreshMode(settingsInteg.provider)) === 'browser'
                              ? 'border-amber-400 bg-amber-50 text-amber-800'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                          <div className="font-semibold">Browser relog</div>
                          <div className="text-xs mt-0.5 opacity-75">Ưu tiên cho Be hoặc account cần relog tay</div>
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-violet-500">
                    {providerUsesSmsOtp(settingsInteg.provider)
                      ? 'Sau khi lưu số điện thoại → nhấn Login trên card để gửi OTP rồi xác nhận OTP.'
                      : (creds.__sessionRefreshMode ?? getDefaultSessionRefreshMode(settingsInteg.provider)) === 'browser'
                      ? 'Nếu chọn Browser relog, khi session hết hạn hãy dùng nút Login browser để chạy browser automation, capture session mới và cập nhật lại trạng thái account.'
                      : 'Sau khi lưu → nhấn nút Login trên card để chạy automation.'}
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
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-violet-500" /> Đăng nhập & Lưu Session
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Chọn cách lấy session token</p>
              </div>
              <button onClick={() => { setAutoLoginId(null); setAutoLoginWaiting(null); setAutoLoginResult(null) }}
                className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>

            {/* Mode tabs */}
            {!autoLoginResult && (
              <div className="px-6 pt-4">
                <div className="grid grid-cols-2 gap-2">
                  {!autoLoginUsesSmsOtp && (
                    <button onClick={() => { setAutoLoginMode('auto'); setAutoLoginResult(null) }}
                      className={cn('py-2 rounded-xl border-2 text-xs font-medium transition-all',
                        autoLoginMode === 'auto'
                          ? 'border-violet-400 bg-violet-50 text-violet-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                      🤖 Auto
                    </button>
                  )}
                  {autoLoginUsesSmsOtp && (
                    <button onClick={() => { setAutoLoginMode('otp'); setAutoLoginWaiting(null); setAutoLoginResult(null) }}
                      className={cn('py-2 rounded-xl border-2 text-xs font-medium transition-all',
                        autoLoginMode === 'otp'
                          ? 'border-orange-400 bg-orange-50 text-orange-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                      📱 OTP Login
                    </button>
                  )}
                  <button onClick={() => { setAutoLoginMode('manual'); setAutoLoginWaiting(null); setAutoLoginResult(null) }}
                    className={cn('py-2 rounded-xl border-2 text-xs font-medium transition-all',
                      autoLoginMode === 'manual'
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300')}>
                    📋 Manual
                  </button>
                </div>
              </div>
            )}

            <div className="p-6 space-y-4">

              {/* ── OTP via automation mode (Shopee Food / Xanh SM – SMS, no password) ── */}
              {autoLoginMode === 'otp' && !autoLoginResult && (
                <div className="space-y-3">
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-700 space-y-1">
                    <p className="font-medium">📱 Đăng nhập qua SMS OTP bằng automation:</p>
                    <p>1. Nhập số điện thoại → nhấn <strong>Gửi OTP</strong></p>
                    <p>2. Hệ thống mở luồng đăng nhập sàn trên VPS và chờ OTP</p>
                    <p>3. Điền mã SMS nhận được → nhấn <strong>Xác nhận OTP</strong></p>
                    {autoLoginInteg?.provider === 'shopee' && (
                      <>
                        <p>Nếu VPS chưa lấy được phiên, chuyển sang tab Manual và đăng nhập trực tiếp trên Shopee Merchant để dán cookie/session.</p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <a href={SHOPEE_MERCHANT_LOGIN_URL} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">Mở Shopee Merchant</a>
                          <a href={SHOPEE_SMS_LOGIN_URL} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">Mở Shopee SMS Login</a>
                          <a href={SHOPEE_PARTNER_OTP_URL} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">Mở Shopee Partner OTP</a>
                        </div>
                      </>
                    )}
                  </div>
                  {!autoLoginWaiting && (
                    <div>
                      <label className="label">Số điện thoại đăng ký tài khoản</label>
                      <input className="input w-full" type="tel"
                        placeholder="VD: 0901234567"
                        value={autoLoginForm.username}
                        onChange={e => setAutoLoginForm(p => ({ ...p, username: e.target.value }))} />
                    </div>
                  )}
                  {autoLoginWaiting?.requiresOtp && (
                    <div className="space-y-3">
                      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-800">
                        📱 OTP đã gửi đến <strong>{autoLoginWaiting.otpTarget ?? autoLoginForm.username}</strong>
                      </div>
                      <div>
                        <label className="label">Mã OTP (6 chữ số)</label>
                        <input className="input w-full text-center text-xl font-mono tracking-widest"
                          type="text" inputMode="numeric" maxLength={6} placeholder="000000"
                          autoFocus
                          value={autoLoginForm.otp}
                          onChange={e => setAutoLoginForm(p => ({ ...p, otp: e.target.value }))} />
                      </div>
                    </div>
                  )}
                  {autoLoginLoading && (
                    <div className="flex items-center gap-2 text-sm text-orange-700">
                      <Loader2 className="w-4 h-4 animate-spin" /> Đang chạy phiên đăng nhập SMS OTP…
                    </div>
                  )}
                </div>
              )}

              {/* ── AUTO mode ── */}
              {autoLoginMode === 'auto' && !autoLoginResult && (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 space-y-1">
                    <p>{usesBrowserRelog(autoLoginInteg)
                      ? '🌐 Browser relog: hệ thống chạy browser automation trên VPS để đăng nhập lại, capture session và cập nhật trạng thái account ngay sau khi thành công.'
                      : '🤖 Auto login: hệ thống dùng Playwright trên VPS để đăng nhập và lưu session tự động.'}</p>
                    <p>Yêu cầu VPS automation service đang chạy. Nếu VPS hết RAM hoặc sàn chặn phiên automation, chuyển sang <strong>Manual</strong>.</p>
                  </div>
                  {!autoLoginWaiting && (
                    <div className="space-y-3">
                      <div>
                        <label className="label">Tài khoản (Email hoặc username)</label>
                        <input className="input w-full" type="text"
                          placeholder="vd: ooo.cashier.ds3 hoặc email@example.com"
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
                  {autoLoginWaiting?.requiresOtp && (
                    <div className="space-y-3">
                      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-800">
                        📱 OTP đã gửi đến <strong>{autoLoginWaiting.otpTarget}</strong>
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
                    <div className="flex items-center gap-3 bg-blue-50 border border-blue-100 rounded-xl p-3 text-blue-700">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Đang chạy Playwright…</p>
                        <p className="text-xs mt-0.5">Mở trình duyệt, đăng nhập (15–90s)</p>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── MANUAL mode ── */}
              {autoLoginMode === 'manual' && !autoLoginResult && (
                <div className="space-y-3">
                  {providerUsesSmsOtp(autoLoginInteg?.provider) ? (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-2">
                      <p className="font-medium">Flow login tay cho {autoLoginInteg?.provider === 'shopee' ? 'Shopee' : 'Xanh SM'}:</p>
                      <p>1. Mở trang đăng nhập chính thức và đăng nhập tay bằng tài khoản của anh.</p>
                      <p>2. Khi sàn yêu cầu OTP, nhập OTP trực tiếp trên portal.</p>
                      <p>3. Sau khi vào được dashboard, mở DevTools để copy cookie hoặc token rồi dán vào form này để lưu session vào DB.</p>
                      <a href={LOGIN_PORTAL_LINKS[autoLoginInteg.provider]} target="_blank" rel="noopener noreferrer" className="inline-flex font-medium underline underline-offset-2">
                        Mở trang đăng nhập {autoLoginInteg.provider === 'shopee' ? 'Shopee Merchant' : 'Xanh SM Merchant'}
                      </a>
                    </div>
                  ) : (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-1">
                      <p className="font-medium">Cách lấy JWT token:</p>
                      <p>1. Mở trình duyệt → đăng nhập vào merchant portal</p>
                      <p>2. Nhấn <kbd className="bg-white border rounded px-1">F12</kbd> → tab <strong>Application</strong> → <strong>Local Storage</strong></p>
                      <p>3. Tìm key <code className="bg-white rounded px-1">token</code> hoặc <code className="bg-white rounded px-1">access_token</code> → copy value</p>
                      <p>4. Hoặc tab <strong>Network</strong> → tìm request → copy header <code className="bg-white rounded px-1">Authorization: Bearer …</code></p>
                    </div>
                  )}
                  {providerUsesSmsOtp(autoLoginInteg?.provider) && (
                    <div>
                      <label className="label">Cookie string <span className="text-gray-400 font-normal">(copy từ DevTools)</span></label>
                      <textarea className="input w-full font-mono text-xs resize-none" rows={4}
                        placeholder="SPC_CDS=...; SPC_F=...; ..."
                        value={manualCookieString}
                        onChange={e => setManualCookieString(e.target.value)} />
                      <p className="text-xs text-gray-400 mt-1">
                        Với Shopee nên copy toàn bộ cookie sau khi qua OTP. Với Xanh SM có thể dán cookie hoặc chỉ token ở ô bên dưới.
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="label">
                      {autoLoginInteg?.provider === 'shopee' ? 'CSRF token / SPC_F' : autoLoginInteg?.provider === 'xanh_sm' ? 'JWT token / access token' : 'JWT Token (Bearer token)'}
                      {providerUsesSmsOtp(autoLoginInteg?.provider) && (
                        <span className="text-gray-400 font-normal"> {autoLoginInteg?.provider === 'shopee' ? '(tuỳ chọn)' : '(khuyến nghị)'}</span>
                      )}
                    </label>
                    <textarea className="input w-full font-mono text-xs resize-none" rows={4}
                      placeholder={autoLoginInteg?.provider === 'shopee'
                        ? 'SPC_F hoặc x-csrftoken nếu cần'
                        : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'}
                      value={manualJwt}
                      onChange={e => setManualJwt(e.target.value)} />
                    <p className="text-xs text-gray-400 mt-1">
                      {autoLoginInteg?.provider === 'shopee'
                        ? 'Nếu không nhập, hệ thống sẽ tự thử lấy x-csrftoken từ cookie SPC_F.'
                        : 'Có thể paste cả chuỗi "Bearer eyJ…" hoặc chỉ phần token sau Bearer.'}
                    </p>
                  </div>
                  <div>
                    <label className="label">Store / Restaurant ID <span className="text-gray-400 font-normal">(tuỳ chọn — dùng để pull đơn)</span></label>
                    <input className="input w-full font-mono" placeholder="VD: 129990 hoặc C73WNZCKANCXTN"
                      value={manualStoreId}
                      onChange={e => setManualStoreId(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Tên đăng nhập (để hiển thị)</label>
                    <input className="input w-full" placeholder="email hoặc username"
                      value={autoLoginForm.username}
                      onChange={e => setAutoLoginForm(p => ({ ...p, username: e.target.value }))} />
                  </div>
                  {autoLoginLoading && (
                    <div className="flex items-center gap-2 text-sm text-blue-700">
                      <Loader2 className="w-4 h-4 animate-spin" /> Đang lưu session…
                    </div>
                  )}
                </div>
              )}

              {/* Result */}
              {autoLoginResult && (
                <div className={cn('rounded-xl p-4 text-sm space-y-2',
                  autoLoginResult.ok
                    ? 'bg-green-50 border border-green-100 text-green-700'
                    : 'bg-red-50 border border-red-100 text-red-600')}>
                  <div className="flex items-start gap-2">
                    {autoLoginResult.ok ? <CheckCircle className="w-5 h-5 shrink-0" /> : <XCircle className="w-5 h-5 shrink-0" />}
                    <span>{autoLoginResult.message}</span>
                  </div>
                  {autoLoginResult.debug && (
                    <details className="text-xs">
                      <summary className="cursor-pointer font-medium text-gray-500">Debug (endpoint responses)</summary>
                      <pre className="mt-2 overflow-x-auto bg-white/60 rounded p-2 text-gray-700 text-[10px]">
                        {JSON.stringify(autoLoginResult.debug, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => { setAutoLoginId(null); setAutoLoginWaiting(null); setAutoLoginResult(null) }}
                className="btn-outline flex-1">Đóng</button>
              {!autoLoginResult && autoLoginMode === 'otp' && (
                <button
                  onClick={handleShopeeOtpLogin}
                  disabled={
                    autoLoginLoading ||
                    (!autoLoginWaiting && !autoLoginForm.username) ||
                    (!!autoLoginWaiting && !autoLoginForm.otp)
                  }
                  className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 bg-orange-600 hover:bg-orange-700">
                  {autoLoginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  {autoLoginWaiting?.requiresOtp ? 'Xác nhận OTP' : 'Gửi OTP'}
                </button>
              )}
              {!autoLoginResult && autoLoginMode === 'auto' && (
                <button
                  onClick={() => autoLoginWaiting?.requiresOtp ? handleAutoLogin(true) : handleAutoLogin(false)}
                  disabled={
                    autoLoginLoading ||
                    (!autoLoginWaiting && (!autoLoginForm.username || (!autoLoginUsesSmsOtp && !autoLoginForm.password))) ||
                    (!!autoLoginWaiting && !autoLoginForm.otp)
                  }
                  className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
                  {autoLoginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  {autoLoginWaiting?.requiresOtp ? 'Xác nhận OTP' : 'Bắt đầu Login'}
                </button>
              )}
              {!autoLoginResult && autoLoginMode === 'manual' && (
                <button
                  onClick={handleManualSession}
                  disabled={autoLoginLoading || (providerUsesSmsOtp(autoLoginInteg?.provider) ? (!manualCookieString.trim() && !manualJwt.trim()) : !manualJwt.trim())}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
                  {autoLoginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Lưu Session
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
