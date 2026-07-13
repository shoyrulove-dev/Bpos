'use client'



import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

import { useSession } from 'next-auth/react'

import { useQueryClient } from '@tanstack/react-query'

import {

  ShoppingBag, Plus, Trash2, Settings, PlayCircle, Loader2, Lock,

  CheckCircle, XCircle, Zap, Info, RefreshCw, KeyRound, Wifi, Pencil, ChevronLeft, ChevronRight, Search,

} from 'lucide-react'

import { useIntegrations, useCreateIntegration, useDeleteIntegration, useUpdateIntegration } from '@/hooks/use-data'

import { useBrands } from '@/hooks/use-brands'

import { useHubs } from '@/hooks/use-hubs'

import { getDefaultSessionRefreshMode } from '@/lib/session-refresh-mode'

import { canonicalizePauseStoreState, getStoreIdentityKeys, normalizeStoreId, normalizeStoreSource, resolvePauseStoreState } from '@/lib/store-pause-status'

import { cn, formatDateNative, toValidDate } from '@/lib/utils'

import { PlatformIcon } from '@/components/ui/PlatformIcon'

import { PlatformStatusIcon } from '@/components/ui/PlatformStatusIcon'



const PROVIDERS = [

  { value: 'grab',     label: 'GrabFood',    color: 'bg-green-100 text-green-700' },

  { value: 'be',       label: 'Be Food',     color: 'bg-yellow-100 text-yellow-800' },

  { value: 'shopee',   label: 'Shopee Food', color: 'bg-orange-100 text-orange-700' },

  { value: 'xanh_sm',  label: 'Xanh SM',     color: 'bg-teal-100 text-teal-700' },

]



const PROVIDER_TAB_STORAGE_KEY = 'bpos-integ-tab'

const PAGE_SIZE = 20

const ACCOUNTS_PAGE_SIZE = 10

const PAUSE_PAGE_SIZE = 10



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

  scraperPaused?: boolean

  scraperPausedUntil?: string | null

  scraperLoggedIn?: boolean

  scraperLastSeen?: string

  scraperPauseMode?: 'tomorrow' | 'until-reopen' | null

  scraperPauseLabel?: string | null

  scraperIsUnknown?: boolean

  scraperPlatformStatus?: string | null

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

const SHOPEE_PARTNER_LOGIN_URL = 'https://partner.business.accounts.shopee.vn/'

const SHOPEE_PARTNER_OTP_URL = 'https://partner.business.accounts.shopee.vn/authenticate/login/otp?client_id=5&next=https%3A%2F%2Fpartner.shopee.vn%2Faccount%2Flogin%2Fauth&state=https%3A%2F%2Fpartner.shopee.vn%2F%3Fbusiness_next%3Dhttps%253A%252F%252Fpartner.shopee.vn%252Flogin%252Fauth%26business_state%3Dhttps%253A%252F%252Fpartner.shopee.vn%26business_client_id%3D1'

const LOGIN_PORTAL_LINKS: Record<string, string> = {

  shopee: SHOPEE_PARTNER_LOGIN_URL,

  grab: 'https://portal.grab.com',

  xanh_sm: 'https://merchant.xanhsm.com/login',

  be: 'https://merchant.be.com.vn',

}

const TARGET_PROVIDER_COUNTS: Partial<Record<string, number>> = {

  grab: 5,

  be: 5,

}



function providerUsesSmsOtp(provider?: string | null) {

  return provider === 'xanh_sm'

}



function PaginationControls({

  page,

  totalPages,

  totalItems,

  label,

  onPageChange,

}: {

  page: number

  totalPages: number

  totalItems: number

  label: string

  onPageChange: (page: number) => void

}) {

  if (totalPages <= 1) return null



  return (

    <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3">

      <p className="text-sm text-gray-500">

        {totalItems} {label} · Trang {page} / {totalPages}

      </p>

      <div className="flex items-center gap-2">

        <button onClick={() => onPageChange(page - 1)} disabled={page === 1} className="btn-outline btn-sm disabled:opacity-50">

          <ChevronLeft className="w-4 h-4" />

        </button>

        <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className="btn-outline btn-sm disabled:opacity-50">

          <ChevronRight className="w-4 h-4" />

        </button>

      </div>

    </div>

  )

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

      '1. Đăng nhập Shopee Partner bằng email hoặc username',

      '2. Ưu tiên lưu session browser/manual cho Shopee Partner',

      '3. Chỉ dùng partnerId + partnerKey + accessToken nếu có Open API thật',

    ],

    link: 'https://partner.business.accounts.shopee.vn/',

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

  { brand: 'BDT', hub: 'Ò Ó O', provider: 'shopee', username: 'Nguyenduyphuoc25@gmail.com',         password: 'Bin@2521', note: 'Shopee Partner / browser' },

  { brand: 'BDT', hub: '3B',   provider: 'xanh_sm', username: '0393655295',                         password: 'OTP', note: 'Đăng nhập OTP' },

  // BDT - Ò Ó O

  { brand: 'BDT', hub: 'Ò Ó O', provider: 'grab',   username: 'ooo.cashier.ds3',                    password: 'Nexdor@123' },

  { brand: 'BDT', hub: 'Ò Ó O', provider: 'be',     username: 'deliveryapp+ooohub30day@nexdor.tech', password: 'Be@99372' },

  // BDT - ĐMX

  { brand: 'BDT', hub: 'ĐMX',  provider: 'grab',    username: 'dmx.nexdor.bdt',                     password: 'Nexdor@123' },

  { brand: 'BDT', hub: 'ĐMX',  provider: 'be',      username: 'deliveryapp+dmmbdt@nexdor.tech',      password: 'Be@99347' },

  // 30B - 3B (grab 1ketoan: 3 cua hang chung 1 tai khoan)

  { brand: '30B', hub: '3B',            provider: 'grab', username: '1ketoan@takogroup.com.vn', password: 'Bdt2026@',  note: '3B chinh' },

  { brand: '30B', hub: '3B Duong so 3', provider: 'grab', username: '1ketoan@takogroup.com.vn', password: 'Bdt2026@',  note: 'chung TK' },

  { brand: '30B', hub: '3B moi',        provider: 'grab', username: '1ketoan@takogroup.com.vn', password: 'Bdt2026@',  note: 'chung TK' },

  { brand: '30B', hub: '3B',   provider: 'be',      username: 'ketoan@takogroup.com.vn',             password: 'Bdt2026@' },

  // 30B - Ò Ó O

  { brand: '30B', hub: 'Ò Ó O', provider: 'grab',   username: 'ooo.tech.ds33',                      password: 'Nexdor@123' },

  { brand: '30B', hub: 'Ò Ó O', provider: 'be',     username: 'deliveryapp+ooods3@nexdor.tech',      password: 'Be@99379' },

]



type PlatformAccountGroup = {

  key: string

  provider: string

  username: string

  password: string

  entries: {

    brand: string

    hub: string

    note?: string

  }[]

}



function PlatformAccountsSection() {

  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  const [showSection, setShowSection] = useState(false)

  const [activeProvider, setActiveProvider] = useState(PROVIDERS[0].value)

  const [accountPage, setAccountPage] = useState(1)

  const listRef = useRef<HTMLDivElement | null>(null)



  const toggle = (key: string) =>

    setRevealed(prev => {

      const next = new Set(prev)

      if (next.has(key)) next.delete(key); else next.add(key)

      return next

    })



  const sortedAccounts = useMemo(

    () => Array.from(

      PLATFORM_ACCOUNTS.reduce((acc, account) => {

        const key = `${account.provider}::${account.username}`.toLowerCase()

        const existing = acc.get(key)

        if (existing) {

          existing.entries.push({ brand: account.brand, hub: account.hub, note: account.note })

          return acc

        }



        acc.set(key, {

          key,

          provider: account.provider,

          username: account.username,

          password: account.password,

          entries: [{ brand: account.brand, hub: account.hub, note: account.note }],

        })

        return acc

      }, new Map<string, PlatformAccountGroup>()).values()

    ).sort((a, b) => {

      if (a.provider !== b.provider) return a.provider.localeCompare(b.provider)

      return a.username.localeCompare(b.username, 'vi')

    }),

    []

  )

  const groupedAccounts = useMemo(

    () => PROVIDERS.reduce((acc, provider) => {

      acc[provider.value] = sortedAccounts.filter((account) => account.provider === provider.value)

      return acc

    }, {} as Record<string, PlatformAccountGroup[]>),

    [sortedAccounts]

  )

  const visibleAccounts = groupedAccounts[activeProvider] ?? []

  const totalPages = Math.max(1, Math.ceil(visibleAccounts.length / ACCOUNTS_PAGE_SIZE))

  const paginatedAccounts = visibleAccounts.slice((accountPage - 1) * ACCOUNTS_PAGE_SIZE, accountPage * ACCOUNTS_PAGE_SIZE)



  useEffect(() => {

    setAccountPage(1)

  }, [showSection, activeProvider])



  useEffect(() => {

    if (accountPage > totalPages) setAccountPage(totalPages)

  }, [accountPage, totalPages])



  const handlePageChange = (nextPage: number) => {

    const boundedPage = Math.min(Math.max(nextPage, 1), totalPages)

    if (boundedPage === accountPage) return

    setAccountPage(boundedPage)

    window.requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))

  }



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

            <p className="text-xs text-gray-400 mt-0.5">{sortedAccounts.length} tài khoản · gộp theo username/email · 10 tài khoản mỗi trang</p>

          </div>

          <PaginationControls

            page={accountPage}

            totalPages={totalPages}

            totalItems={visibleAccounts.length}

            label="tài khoản"

            onPageChange={handlePageChange}

          />

        </div>

        <span className="text-xs text-gray-400">{showSection ? 'Thu gọn' : 'Mở rộng'}</span>

      </button>



      {showSection && (

        <div ref={listRef} className="px-5 pb-5 space-y-3 border-t border-gray-100">

          <div className="flex gap-2 pt-3 flex-wrap items-center justify-between">

            {PROVIDERS.map((provider) => (

              <button

                key={provider.value}

                onClick={() => setActiveProvider(provider.value)}

                className={cn(

                  'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all',

                  activeProvider === provider.value

                    ? 'border-gray-900 bg-gray-900 text-white'

                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'

                )}

              >

                <PlatformIcon source={provider.value} size="sm" />

                <span>{provider.label}</span>

                <span className={cn('text-xs', activeProvider === provider.value ? 'text-white/70' : 'text-gray-400')}>

                  {groupedAccounts[provider.value]?.length ?? 0}

                </span>

              </button>

            ))}

            {revealed.size > 0 && (

              <button onClick={() => setRevealed(new Set())} className="btn-ghost text-xs h-8 px-3 text-red-500">

                Ẩn tất cả

              </button>

            )}

          </div>



          <PaginationControls

            page={accountPage}

            totalPages={totalPages}

            totalItems={visibleAccounts.length}

            label="tài khoản"

            onPageChange={handlePageChange}

          />



          {paginatedAccounts.length > 0 ? (

            <div className="grid gap-4 md:grid-cols-2">

              {paginatedAccounts.map((acc) => {

                const show = revealed.has(acc.key)

                return (

                  <div key={acc.key} className="rounded-2xl border border-gray-100 bg-white">

                    <div className="flex items-center gap-3 px-3 py-3">

                      <PlatformIcon source={acc.provider} size="sm" />

                      <div className="min-w-0 flex-1">

                        <p className="truncate font-mono text-sm font-semibold text-gray-800">{acc.username}</p>

                        {acc.entries.length > 1 && (

                          <p className="truncate pt-0.5 text-xs text-gray-500">{acc.entries.length} store chung 1 tài khoản</p>

                        )}

                      </div>

                      <button

                        onClick={() => toggle(acc.key)}

                        className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"

                        title={show ? 'Ẩn chi tiết' : 'Hiện chi tiết'}

                      >

                        <Info className="h-3 w-3" />

                      </button>

                    </div>

                    {show && (

                      <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">

                        <div className="space-y-1">

                          {acc.entries.map((entry) => (

                            <p key={`${entry.brand}-${entry.hub}-${entry.note ?? ''}`}>

                              {[entry.brand, entry.hub, entry.note].filter(Boolean).join(' · ')}

                            </p>

                          ))}

                        </div>

                        <p className="pt-1 font-mono tracking-wide text-gray-700">{acc.password}</p>

                      </div>

                    )}

                  </div>

                )

              })}

            </div>

          ) : (

            <div className="px-4 py-8 text-center text-sm text-gray-400">Chưa có tài khoản cho sàn này.</div>

          )}

        </div>

      )}

    </div>

  )

}



type LiveStatusMap = Record<string, StoreStatus>



// ─── PauseStoreSection: tạm dừng / mở lại cửa hàng qua scraper ─────────────



type StoreStatus = {

  integrationId?: string

  storeId?: string

  label: string

  source: 'grab' | 'be'

  username?: string

  loggedIn: boolean

  paused: boolean

  pausedUntil?: string | null

  pauseMode?: 'tomorrow' | 'until-reopen' | null

  pauseLabel?: string | null

  isUnknown?: boolean

  platformStatus?: string | null

}



const SCRAPER_DIRECT = 'http://127.0.0.1:3845'

const PAUSE_STORE_API = '/api/integrations/pause-store'

const GRAB_PAUSE_DURATIONS = ['30m', '1h', '24h'] as const
const GRAB_DEFAULT_PAUSE_DURATION = '24h'
const BE_DEFAULT_BULK_ACTION = 'pause-until-reopen'

const BE_BULK_ACTIONS = [


  { value: 'pause-until-reopen', label: '⏸ Pause đến khi mở lại' },

  { value: 'resume', label: '▶ Mở lại' },

] as const



function PauseStoreSection() {

  const [stores, setStores]         = useState<StoreStatus[]>([])

  const [loading, setLoading]       = useState(false)

  const [statusMsg, setStatusMsg]   = useState<string>('')

  const [activeTab, setActiveTab]   = useState<'grab' | 'be'>('grab')

  const [selectedDur, setSelectedDur] = useState<string>(GRAB_DEFAULT_PAUSE_DURATION)

  const [selectedBeAction, setSelectedBeAction] = useState<string>(BE_DEFAULT_BULK_ACTION)

  const [busyKey, setBusyKey]       = useState<string | null>(null)

  const [bulkDur, setBulkDur]       = useState<string>(GRAB_DEFAULT_PAUSE_DURATION)

  const [selected, setSelected]     = useState<Set<string>>(new Set())

  const [bulkBusy, setBulkBusy]     = useState(false)

  const [scraperOnline, setScraperOnline] = useState<boolean | null>(null)

  const [scraperVersion, setScraperVersion] = useState<string | null>(null)

  const [pausePage, setPausePage] = useState(1)



  const getKey = (s: StoreStatus) => getStoreIdentityKeys(s)[0] ?? `${s.source}:${s.storeId ?? s.label}`



  const normalizeStores = useCallback((input: unknown): StoreStatus[] => {

    if (!Array.isArray(input)) return []

    const next: StoreStatus[] = []

    for (const entry of input) {

      const source = normalizeStoreSource((entry as Record<string, unknown>)?.source)

      if (!source) continue



      const store = entry as Record<string, unknown>

      next.push(canonicalizePauseStoreState({

        integrationId: typeof store.integrationId === 'string' ? store.integrationId : undefined,

        storeId: normalizeStoreId(store.storeId),

        label: String(store.label ?? store.storeName ?? store.storeId ?? 'Unknown store'),

        source,

        username: typeof store.username === 'string' ? store.username : undefined,

        loggedIn: Boolean(store.loggedIn),

        paused: Boolean(store.paused),

        pausedUntil: typeof store.pausedUntil === 'string' ? store.pausedUntil : null,

        pauseMode: store.pauseMode === 'tomorrow' || store.pauseMode === 'until-reopen' ? store.pauseMode : null,

        pauseLabel: typeof store.pauseLabel === 'string' ? store.pauseLabel : null,

        isUnknown: Boolean(store.isUnknown),

        platformStatus: typeof store.platformStatus === 'string' ? store.platformStatus : null,

      }))

    }

    return next

  }, [])



  const load = useCallback(async (live = false) => {

    setLoading(true)

    try {

      const response = await fetch(`${PAUSE_STORE_API}${live ? '?live=1' : ''}`, {

        signal: AbortSignal.timeout(live ? 30_000 : 8_000),

        cache: 'no-store',

      })

      const payload = await response.json().catch(() => null) as { ok?: boolean; stores?: unknown[]; scraperOnline?: boolean; version?: string } | null

      const scraperOnlineNow = Boolean(payload?.scraperOnline)

      setScraperOnline(scraperOnlineNow)

      if (payload?.version) setScraperVersion(String(payload.version))

      const merged = normalizeStores(payload?.stores)

      if (merged.length > 0 || scraperOnlineNow) {

        setStores(merged)

        setSelected(new Set())

      }

      setStatusMsg(

        scraperOnlineNow

          ? 'Cập nhật ' + new Date().toLocaleTimeString('vi-VN')

          : 'Scraper offline · Hiển thị danh sách DB'

      )

    } catch {

      setStatusMsg('Không tải được trạng thái')

    } finally {

      setLoading(false)

    }

  }, [normalizeStores])



  useEffect(() => { void load() }, [load])

  const refreshAfterAction = useCallback(async (source: 'grab' | 'be', action: 'pause' | 'resume') => {
    const rounds = source === 'be' ? 3 : 2
    const delayMs = source === 'be' ? 4_000 : 2_500
    setStatusMsg(
      source === 'be'
        ? `Đã gửi lệnh ${action === 'pause' ? 'tạm dừng' : 'mở lại'} Be, đang kiểm tra trạng thái thực tế...`
        : `Đã gửi lệnh ${action === 'pause' ? 'tạm dừng' : 'mở lại'} Grab, đang xác nhận trạng thái...`
    )

    for (let index = 0; index < rounds; index++) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs))
      await load(true)
    }
  }, [load])



  // Real-time polling — tự refresh trạng thái mỗi 15 giây

  useEffect(() => {

    const timer = window.setInterval(() => void load(), 15_000)

    return () => window.clearInterval(timer)

  }, [load])



  // Kiểm tra version scraper trực tiếp (port 3845) — refresh mỗi 30 giây

  useEffect(() => {

    const checkVersion = async () => {

      try {

        const r = await fetch(`${PAUSE_STORE_API}?live=1`, { signal: AbortSignal.timeout(8_000), cache: 'no-store' })

        const d = await r.json().catch(() => null)

        if (typeof d?.scraperOnline === 'boolean') setScraperOnline(Boolean(d.scraperOnline))

      } catch {

        // version endpoint optional — đồng bộ từ load() là chính

      }

    }

    void checkVersion()

    const timer = window.setInterval(checkVersion, 30_000)

    return () => window.clearInterval(timer)

  }, [])



  const doAction = async (action: 'pause' | 'resume', storeList: StoreStatus[], dur?: string) => {

    const isMultiBe = storeList.length > 1 && storeList.every(s => s.source === 'be')

    const buildPayload = (store: StoreStatus) => ({

      integrationId: store.integrationId,

      storeId: store.storeId,

      source: store.source,

      username: store.username,

      label: store.label,

      action,

      ...(dur ? { duration: dur } : {}),

    })



    if (isMultiBe) {

      // Be: xử lý nối tiếp để tránh đè thao tác trên cùng scraper session

      let ok = 0

      for (let i = 0; i < storeList.length; i++) {

        const s = storeList[i]

        setStatusMsg(`${action === 'pause' ? 'Đang dừng' : 'Đang mở lại'} ${i + 1}/${storeList.length}: ${s.label}…`)

        try {

          const r = await fetch(PAUSE_STORE_API, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json' },

            body: JSON.stringify(buildPayload(s)),

            signal: AbortSignal.timeout(60_000),

          })

          const data = await r.json() as { ok?: boolean }

          if (data?.ok !== false) ok++

        } catch { /* tiếp tục store kế tiếp */ }

      }

      setStatusMsg(`${action === 'pause' ? 'Đã dừng' : 'Đã mở lại'} ${ok}/${storeList.length} cửa hàng Be`)

      // Poll 2 lần để bắt trạng thái DB + live overlay mới nhất

      await refreshAfterAction('be', action)

    } else {

      // Grab hoặc single-store: gọi song song qua API BPOS

      const results = await Promise.allSettled(storeList.map(s =>

        fetch(PAUSE_STORE_API, {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify(buildPayload(s)),

          signal: AbortSignal.timeout(35_000),

        }).then(r => r.json())

      ))

      const ok = results.filter((result) => result.status === 'fulfilled' && result.value?.ok !== false).length

      setStatusMsg(`${action === 'pause' ? 'Đã dừng' : 'Đã mở lại'} ${ok}/${storeList.length} cửa hàng`)

      const refreshSource = storeList.some(s => s.source === 'be') ? 'be' : 'grab'
      await refreshAfterAction(refreshSource, action)

    }

  }



  const doPause = async (store: StoreStatus) => {

    const key = getKey(store)

    setBusyKey(key)

    try {

      const duration = store.source === 'be' ? 'until-reopen' : selectedDur

      await doAction('pause', [store], duration)

    } finally {

      setBusyKey(null)

    }

  }



  const doResume = async (store: StoreStatus) => {

    const key = getKey(store)

    setBusyKey(key)

    try { await doAction('resume', [store]) } finally { setBusyKey(null) }

  }



  const doBulk = async (action: 'pause' | 'resume') => {

    if (activeTab !== 'grab') {

      setStatusMsg('Bulk Grab chỉ áp dụng cho tab Grab.')

      return

    }

    const tabStores = stores.filter(s => s.source === activeTab)

    const targets = selected.size > 0

      ? tabStores.filter(s => selected.has(getKey(s)))

      : tabStores

    setBulkBusy(true)

    try { await doAction(action, targets, action === 'pause' ? bulkDur : undefined) }

    finally { setBulkBusy(false) }

  }



  const doBulkBeAction = async () => {

    if (activeTab !== 'be') {

      setStatusMsg('Hành động Be chỉ áp dụng cho tab Be.')

      return

    }

    if (!selectedBeAction) {

      setStatusMsg('Chọn hành động Be trước khi thực hiện.')

      return

    }



    const targets = selected.size > 0

      ? tabStores.filter(s => selected.has(getKey(s)))

      : tabStores



    if (targets.length === 0) {

      setStatusMsg('Chưa có cửa hàng Be nào để thao tác.')

      return

    }



    setBulkBusy(true)

    try {

      if (selectedBeAction === 'resume') {

        await doAction('resume', targets)

      } else {

        await doAction('pause', targets, selectedBeAction.replace('pause-', ''))

      }

      setSelectedBeAction(BE_DEFAULT_BULK_ACTION)

      setSelected(new Set())

    } finally {

      setBulkBusy(false)

    }

  }



  const toggleSelect = (key: string) => setSelected(prev => {

    const next = new Set(prev)

    if (next.has(key)) next.delete(key)

    else next.add(key)

    return next

  })



  const toggleAll = (checked: boolean) => {

    const tabStores = stores.filter(s => s.source === activeTab)

    setSelected(checked ? new Set(tabStores.map(getKey)) : new Set())

  }



  const tabStores = [...stores.filter(s => s.source === activeTab)].sort((a, b) => {

    const aUser = String(a.username ?? '').trim().toLowerCase()

    const bUser = String(b.username ?? '').trim().toLowerCase()

    if (aUser !== bUser) return aUser.localeCompare(bUser, 'vi')

    return String(a.label ?? '').localeCompare(String(b.label ?? ''), 'vi')

  })

  const pauseTotalPages = Math.max(1, Math.ceil(tabStores.length / PAUSE_PAGE_SIZE))

  const paginatedTabStores = tabStores.slice((pausePage - 1) * PAUSE_PAGE_SIZE, pausePage * PAUSE_PAGE_SIZE)

  const grabCount = stores.filter(s => s.source === 'grab').length

  const beCount   = stores.filter(s => s.source === 'be').length



  // Group by username

  const uCount: Record<string, number> = {}

  for (const s of tabStores) if (s.username) uCount[s.username] = (uCount[s.username] ?? 0) + 1



  useEffect(() => {

    setPausePage(1)

  }, [activeTab])



  useEffect(() => {

    if (pausePage > pauseTotalPages) setPausePage(pauseTotalPages)

  }, [pausePage, pauseTotalPages])



  const handlePausePageChange = (nextPage: number) => {

    const boundedPage = Math.min(Math.max(nextPage, 1), pauseTotalPages)

    if (boundedPage === pausePage) return

    setPausePage(boundedPage)

  }



  return (

    <div className="rounded-3xl border border-gray-200 bg-white shadow-sm overflow-hidden">

      {/* Header */}

      <div className="px-5 py-4 flex items-center justify-between gap-2 border-b border-gray-100 flex-wrap">

        <div className="flex items-center gap-2">

          <span className="text-xl">⏸</span>

          <div>

            <div className="flex items-center gap-2">

              <p className="font-semibold text-gray-900 text-sm">Tạm dừng / Mở lại cửa hàng</p>

              <span className={cn(

                'flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full',

                scraperOnline === true

                  ? 'bg-green-100 text-green-700'

                  : scraperOnline === false

                    ? 'bg-red-100 text-red-600'

                    : 'bg-gray-100 text-gray-400'

              )}>

                <span className={cn(

                  'w-1.5 h-1.5 rounded-full flex-shrink-0',

                  scraperOnline === true ? 'bg-green-500' : scraperOnline === false ? 'bg-red-500' : 'bg-gray-300'

                )} />

                {scraperOnline === true

                  ? `Scraper${scraperVersion ? ` v${scraperVersion}` : ''} Online`

                  : scraperOnline === false

                    ? 'Scraper Offline'

                    : 'Scraper…'}

              </span>

            </div>

            <p className="text-xs text-gray-400 mt-0.5">Dừng nhận đơn trên Grab / Be qua scraper</p>

          </div>

        </div>

        <div className="flex items-center gap-2 flex-wrap">

          {statusMsg && <span className="text-xs text-gray-400">{statusMsg}</span>}

          <button onClick={() => void load()} disabled={loading}

            className="btn-outline flex items-center gap-1.5 disabled:opacity-50 text-sm py-1.5">

            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}

            Làm mới

          </button>

          <button onClick={() => void load(true)} disabled={loading}

            className="btn-outline flex items-center gap-1.5 disabled:opacity-50 text-sm py-1.5 text-blue-600 border-blue-300 hover:bg-blue-50">

            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}

            Kiểm tra thực tế

          </button>

        </div>

      </div>



      {/* Grab / Be tabs */}

      <div className="flex gap-2 px-4 pt-3 pb-0">

        <button

          onClick={() => { setActiveTab('grab'); setSelected(new Set()) }}

          className={cn(

            'flex items-center gap-1.5 px-4 py-1.5 rounded-t-xl border-b-2 text-sm font-semibold transition-colors',

            activeTab === 'grab'

              ? 'border-green-500 text-green-700 bg-green-50'

              : 'border-transparent text-gray-500 hover:text-gray-700'

          )}

        >

          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />

          Grab

          <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold', activeTab === 'grab' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>

            {grabCount}

          </span>

        </button>

        <button

          onClick={() => { setActiveTab('be'); setSelected(new Set()) }}

          className={cn(

            'flex items-center gap-1.5 px-4 py-1.5 rounded-t-xl border-b-2 text-sm font-semibold transition-colors',

            activeTab === 'be'

              ? 'border-yellow-500 text-yellow-700 bg-yellow-50'

              : 'border-transparent text-gray-500 hover:text-gray-700'

          )}

        >

          <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />

          Be

          <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold', activeTab === 'be' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500')}>

            {beCount}

          </span>

        </button>

      </div>



      {/* Toolbar: select all + bulk actions */}

      <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2 flex-wrap bg-gray-50">

        {activeTab === 'grab' ? (

          <>

            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">

              <input

                type="checkbox"

                className="w-3.5 h-3.5"

                checked={tabStores.length > 0 && selected.size === tabStores.length}

                onChange={e => toggleAll(e.target.checked)}

              />

              Chọn tất cả

            </label>

            <span className="text-xs text-gray-500">Chỉ áp dụng cho Grab</span>

            <div className="flex-1" />

            {GRAB_PAUSE_DURATIONS.map(d => (

              <button key={d}

                onClick={() => setBulkDur(d)}

                className={cn(

                  'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors',

                  bulkDur === d ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'

                )}

              >{d === '30m' ? '30 phút' : d === '1h' ? '1 giờ' : '24 giờ'}</button>

            ))}

            <button

              onClick={() => void doBulk('pause')}

              disabled={bulkBusy || tabStores.length === 0}

              className="flex items-center gap-1 rounded-lg bg-red-500 text-white px-3 py-1.5 text-xs font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"

            >

              {bulkBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : '⏸'}

              Dừng {selected.size > 0 ? `(${selected.size})` : 'tất cả'}

            </button>

            <button

              onClick={() => void doBulk('resume')}

              disabled={bulkBusy || tabStores.length === 0}

              className="flex items-center gap-1 rounded-lg bg-green-500 text-white px-3 py-1.5 text-xs font-semibold hover:bg-green-600 disabled:opacity-50 transition-colors"

            >

              {bulkBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : '▶'}

              Mở lại {selected.size > 0 ? `(${selected.size})` : 'tất cả'}

            </button>

          </>

        ) : (

          <>

            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">

              <input

                type="checkbox"

                className="w-3.5 h-3.5"

                checked={tabStores.length > 0 && selected.size === tabStores.length}

                onChange={e => toggleAll(e.target.checked)}

              />

              Chọn tất cả

            </label>

            <span className="text-xs text-amber-700">Chỉ áp dụng cho Be</span>

            <select

              value={selectedBeAction}

              onChange={e => setSelectedBeAction(e.target.value)}

              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700"

            >

              <option value="">-- Hành động --</option>

              {BE_BULK_ACTIONS.map(action => (

                <option key={action.value} value={action.value}>{action.label}</option>

              ))}

            </select>

            <button

              onClick={() => void doBulkBeAction()}

              disabled={bulkBusy || tabStores.length === 0}

              className="flex items-center gap-1 rounded-lg bg-amber-500 text-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-600 disabled:opacity-50 transition-colors"

            >

              {bulkBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : '⚙'}

              Thực hiện {selected.size > 0 ? `(${selected.size})` : ''}

            </button>

            <div className="flex-1" />

          </>

        )}

      </div>



      <div className="px-4 py-3">

        <PaginationControls

          page={pausePage}

          totalPages={pauseTotalPages}

          totalItems={tabStores.length}

          label="cửa hàng"

          onPageChange={handlePausePageChange}

        />

      </div>



      {/* Store list */}

      <div className="divide-y divide-gray-100">

        {loading && tabStores.length === 0 ? (

          <div className="py-8 text-center text-sm text-gray-400 flex items-center justify-center gap-2">

            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải...

          </div>

        ) : tabStores.length === 0 ? (

          <div className="py-8 text-center text-sm text-gray-400">

            Chưa có cửa hàng nào online. Kiểm tra scraper đã chạy chưa.

          </div>

        ) : (() => {

          let lastUsername = ''

          return paginatedTabStores.map((store, idx) => {

            const key = getKey(store)

            const isBusy = busyKey === key

            const isGrouped = (uCount[store.username ?? ''] ?? 0) > 1

            const showGroupHeader = isGrouped && store.username && store.username !== lastUsername

            if (showGroupHeader) lastUsername = store.username!

            const isSelected = selected.has(key)

            const isUnknownStatus = store.isUnknown === true

            const rowBg = !store.loggedIn

              ? 'bg-red-50'

              : isUnknownStatus

                ? (isGrouped ? (idx % 2 === 0 ? 'bg-gray-100' : 'bg-gray-50') : 'bg-gray-100')

                : store.paused

                  ? (isGrouped ? (idx % 2 === 0 ? 'bg-amber-50' : 'bg-amber-50/70') : 'bg-amber-50')

                  : (isGrouped ? (idx % 2 === 0 ? 'bg-green-50/60' : 'bg-green-50/40') : (idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'))

            const pausedUntilDate = toValidDate(store.pausedUntil)

            const statusTone = !store.loggedIn ? 'offline' : isUnknownStatus ? 'unknown' : store.paused ? 'paused' : 'active'

            const statusTitle = !store.loggedIn

              ? 'Offline'

              : isUnknownStatus

                ? (store.platformStatus ?? 'Unknown')

                : store.paused

                  ? [store.pauseLabel ?? 'Paused', pausedUntilDate ? `đến ${formatDateNative(pausedUntilDate, 'time')}` : null].filter(Boolean).join(' · ')

                  : 'Active'

            return (

              <div key={key}>

                {showGroupHeader && (

                  <div className="px-4 py-1.5 bg-green-50 border-y border-green-100 flex items-center gap-1.5 text-xs font-bold text-green-800">

                    <span>👤</span>

                    <span>{store.username}</span>

                    <span className="text-green-600 font-normal">· {uCount[store.username!]} cửa hàng chung 1 tài khoản</span>

                  </div>

                )}

                <div className={cn('flex items-center gap-2.5 px-4 py-2.5', rowBg, isGrouped && 'pl-8')}>

                  {activeTab === 'grab' || activeTab === 'be' ? (

                    <input

                      type="checkbox"

                      className="w-3.5 h-3.5 flex-shrink-0 cursor-pointer"

                      checked={isSelected}

                      onChange={() => toggleSelect(key)}

                    />

                  ) : (

                    <span className="w-3.5 h-3.5 flex-shrink-0" />

                  )}

                  <PlatformStatusIcon status={statusTone} title={statusTitle} />

                  <span className="flex-1 min-w-0">

                    <span className="text-sm font-semibold text-gray-900">{store.label}</span>

                    {!isGrouped && store.username && (

                      <span className="ml-1.5 text-xs font-bold text-gray-500">({store.username})</span>

                    )}

                  </span>

                  {/* Duration select (Grab only, not paused, not unknown) */}

                  {store.source === 'grab' && !store.paused && !isUnknownStatus && store.loggedIn && (

                    <select

                      value={selectedDur}

                      onChange={e => setSelectedDur(e.target.value)}

                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 flex-shrink-0"

                    >

                      <option value="30m">30 phút</option>

                      <option value="1h">1 giờ</option>

                      <option value="24h">24 giờ</option>

                    </select>

                  )}

                  {/* Action button */}

                  <button

                    onClick={() => (store.paused || isUnknownStatus) ? void doResume(store) : void doPause(store)}

                    disabled={isBusy || !store.loggedIn}

                    className={cn(

                      'flex-shrink-0 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50',

                      (store.paused || isUnknownStatus)

                        ? 'bg-green-500 hover:bg-green-600 text-white'

                        : 'bg-red-500 hover:bg-red-600 text-white'

                    )}

                  >

                    {isBusy

                      ? <Loader2 className="w-3 h-3 animate-spin" />

                      : (store.paused || isUnknownStatus) ? '▶ Mở lại' : '⏸ Dừng'}

                  </button>

                </div>

              </div>

            )

          })

        })()}

      </div>



      <div className="px-4 py-3 border-t border-gray-100">

        <PaginationControls

          page={pausePage}

          totalPages={pauseTotalPages}

          totalItems={tabStores.length}

          label="cửa hàng"

          onPageChange={handlePausePageChange}

        />

      </div>

    </div>

  )

}



// ─── PrinterSection: kiểm tra + in thử máy in nhiệt LAN ────────────────────

const SCRAPER_CONTROL = 'http://127.0.0.1:3846'



// eslint-disable-next-line @typescript-eslint/no-unused-vars

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  const [scraperVersion, setScraperVersion] = useState<string | null>(null)

  const [scraperOnline, setScraperOnline] = useState(false)



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

      setScraperOnline(true)



      // Lấy version scraper song song

      try {

        const vr = await fetch(`${SCRAPER_CONTROL}/version`, { signal: AbortSignal.timeout(4000) })

        const vd = await vr.json()

        if (vd?.version) setScraperVersion(String(vd.version))

      } catch { /* ignore */ }



      if (showResult) {

        setResult({

          ok: true,

          message: `Đã đồng bộ cấu hình từ scraper: ${String(data?.ip ?? printerIp)}:${String(data?.port ?? printerPort)}`,

        })

      }

    } catch (e) {

      setPrinterStatus('unknown')

      setScraperOnline(false)

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

      <div className="flex items-center justify-between gap-2 flex-wrap">

        <div className="flex items-center gap-2">

          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-xl">🖨️</div>

          <div>

            <h2 className="font-semibold text-gray-900 text-sm">Máy in nhiệt (LAN)</h2>

            <p className="text-xs text-gray-400">Kết nối qua scraper · ESC/POS TCP · 80mm</p>

          </div>

        </div>

        <div className="flex items-center gap-2">

          {scraperOnline ? (

            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2.5 py-1 text-xs font-semibold text-green-700">

              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />

              Scraper {scraperVersion ? `v${scraperVersion}` : 'Online'}

            </span>

          ) : (

            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500">

              <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />

              Scraper offline

            </span>

          )}

          <a

            href={SCRAPER_DIRECT}

            target="_blank"

            rel="noopener noreferrer"

            className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"

            title="Mở scraper control panel"

          >

            <Zap className="w-3 h-3" /> Control Panel

          </a>

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

        In qua scraper dùng ESC/POS trực tiếp (không dùng mẫu HTML). Để in theo mẫu template → dùng nút &quot;In đơn&quot; trên trang đơn hàng.

        Xem log và control scraper tại <a href={SCRAPER_DIRECT} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">127.0.0.1:3845</a>.

      </p>

    </div>

  )

}



export default function IntegrationsPage() {

  const { data: session } = useSession()

  const isAdmin = (session?.user as { role?: string })?.role === 'admin'

  const qc = useQueryClient()



  const { data: rawInteg = [], isLoading } = useIntegrations({ list: true })

  const integrations = rawInteg as Integ[]



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

  const metadataEnabled = showForm || !!settingsId

  const { data: rawBrands = [] } = useBrands(undefined, { enabled: metadataEnabled })

  const brands = rawBrands as Record<string, string>[]

  const { data: rawHubs = [] } = useHubs(undefined, { enabled: metadataEnabled })

  const hubs = rawHubs as Record<string, string>[]



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

  const [integrationSearch, setIntegrationSearch] = useState('')

  const [activeProviderTab, setActiveProviderTab] = useState(() => {

    if (typeof window !== 'undefined') {

      const saved = window.localStorage.getItem(PROVIDER_TAB_STORAGE_KEY)

      const validTabs = new Set([...PROVIDERS.map((provider) => provider.value), 'pause'])

      if (saved && validTabs.has(saved)) {

        return saved

      }

    }

    return PROVIDERS[0].value

  })

  const [providerPage, setProviderPage] = useState(1)

  const providerListRef = useRef<HTMLDivElement | null>(null)

  const [livePauseStatuses, setLivePauseStatuses] = useState<LiveStatusMap>({})



  // Inline name edit

  const [editingNameId, setEditingNameId]   = useState<string | null>(null)

  const [editingNameVal, setEditingNameVal] = useState('')

  const [savingNameId, setSavingNameId]     = useState<string | null>(null)



  const startEditName = (integ: Integ) => {

    setEditingNameId(integ._id)

    setEditingNameVal(integ.externalStoreName ?? '')

  }



  const saveEditName = async (id: string) => {

    setSavingNameId(id)

    try {

      await updateMutation.mutateAsync({ id, externalStoreName: editingNameVal.trim() } as Record<string, unknown>)

      setEditingNameId(null)

    } catch (err) {

      setActionStatus({ tone: 'error', message: err instanceof Error ? err.message : 'Lưu tên thất bại.' })

    } finally {

      setSavingNameId(null)

    }

  }

  const autoLoginInteg = autoLoginId ? integrations.find(i => i._id === autoLoginId) ?? null : null

  const autoLoginUsesSmsOtp = providerUsesSmsOtp(autoLoginInteg?.provider)



  // Live "time ago" ticker — re-renders every 30s so lastSyncAt label refreshes

  const [, setTick] = useState(0)

  useEffect(() => {

    const t = setInterval(() => setTick(n => n + 1), 30_000)

    return () => clearInterval(t)

  }, [])



  useEffect(() => {

    window.localStorage.setItem(PROVIDER_TAB_STORAGE_KEY, activeProviderTab)

  }, [activeProviderTab])



  useEffect(() => {

    setProviderPage(1)

  }, [activeProviderTab])



  // ─── Helpers ─────────────────────────────────────────────────────────────

  const provInfo  = (v: string) => PROVIDERS.find(p => p.value === v)

  const filteredHubs = hubs

  const providerCounts = PROVIDERS.reduce((acc, provider) => {

    acc[provider.value] = integrations.filter((integration) => integration.provider === provider.value).length

    return acc

  }, {} as Record<string, number>)

  const normalizedIntegrationSearch = integrationSearch.trim().toLowerCase()

  const providerSections = PROVIDERS.map((provider) => {

    const provIntegrations = [...integrations.filter((i) => {

      if (i.provider !== provider.value) return false

      if (!normalizedIntegrationSearch) return true

      const haystack = [

        i.loginUsername,

        i.externalStoreName,

        i.externalStoreId,

        typeof i.brandId === 'object' && i.brandId ? i.brandId.name : '',

      ]

        .filter(Boolean)

        .join(' ')

        .toLowerCase()

      return haystack.includes(normalizedIntegrationSearch)

    })]

    // Group by loginUsername so shared-account entries (e.g. 1ketoan × 3 stores) appear together

    provIntegrations.sort((a, b) => (a.loginUsername ?? '').localeCompare(b.loginUsername ?? ''))

    return {

      ...provider,

      integrations: provIntegrations,

      target: TARGET_PROVIDER_COUNTS[provider.value],

    }

  })

  const activeProviderSection = providerSections.find((section) => section.value === activeProviderTab) ?? providerSections[0]

  const providerTotalPages = Math.max(1, Math.ceil(activeProviderSection.integrations.length / PAGE_SIZE))

  const paginatedProviderIntegrations = activeProviderSection.integrations.slice((providerPage - 1) * PAGE_SIZE, providerPage * PAGE_SIZE)



  useEffect(() => {

    if (providerPage > providerTotalPages) setProviderPage(providerTotalPages)

  }, [providerPage, providerTotalPages])



  useEffect(() => {

    let cancelled = false



    const loadLivePauseStatuses = async () => {

      try {

        const response = await fetch('/api/integrations/pause-store?live=1', { cache: 'no-store' })

        if (!response.ok) return

        const payload = await response.json() as { stores?: unknown[] }

        if (cancelled || !Array.isArray(payload.stores)) return



        const nextMap: LiveStatusMap = payload.stores.reduce<LiveStatusMap>((acc, entry) => {

          const store = entry as Record<string, unknown>

          const source = normalizeStoreSource(store.source)

          if (!source) return acc



          const normalized = canonicalizePauseStoreState({

            integrationId: typeof store.integrationId === 'string' ? store.integrationId : undefined,

            storeId: normalizeStoreId(store.storeId),

            label: String(store.label ?? store.storeName ?? store.storeId ?? 'Unknown store'),

            source,

            username: typeof store.username === 'string' ? store.username : undefined,

            loggedIn: Boolean(store.loggedIn),

            paused: Boolean(store.paused),

            pausedUntil: typeof store.pausedUntil === 'string' ? store.pausedUntil : null,

            pauseMode: store.pauseMode === 'tomorrow' || store.pauseMode === 'until-reopen' ? store.pauseMode : null,

            pauseLabel: typeof store.pauseLabel === 'string' ? store.pauseLabel : null,

            isUnknown: Boolean(store.isUnknown),

            platformStatus: typeof store.platformStatus === 'string' ? store.platformStatus : null,

          })



          for (const key of getStoreIdentityKeys(normalized)) {

            acc[key] = normalized

          }

          return acc

        }, {})



        setLivePauseStatuses(nextMap)

      } catch {

        if (!cancelled) setLivePauseStatuses({})

      }

    }



    void loadLivePauseStatuses()

    const timer = window.setInterval(loadLivePauseStatuses, 30_000)

    return () => {

      cancelled = true

      window.clearInterval(timer)

    }

  }, [])



  const handleProviderPageChange = (nextPage: number) => {

    const boundedPage = Math.min(Math.max(nextPage, 1), providerTotalPages)

    if (boundedPage === providerPage) return

    setProviderPage(boundedPage)

    window.requestAnimationFrame(() => providerListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))

  }



  const getBrandName = (integ: Integ) =>

    typeof integ.brandId === 'object' && integ.brandId ? integ.brandId.name : String(integ.brandId ?? '—')



  const getHubName = (integ: Integ) => {

    if (!integ.hubId) return '—'

    if (typeof integ.hubId === 'object' && integ.hubId) return integ.hubId.name

    return String(integ.hubId)

  }



  const safeTimeAgo = (isoStr?: string | null) => {

    const date = toValidDate(isoStr)

    if (!date) return null

    const secs = Math.floor((Date.now() - date.getTime()) / 1000)

    if (secs < 60) return `${Math.max(secs, 0)}s trước`

    if (secs < 3600) return `${Math.floor(secs / 60)}p trước`

    if (secs < 86400) return `${Math.floor(secs / 3600)}h trước`

    return formatDateNative(date, 'date')

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

    const tr = testResults[integ._id]

    const sr = syncResults[integ._id]

    const isPendingSetup = integ.isActive === false

    const supportsSessionLogin = SESSION_LOGIN_PROVIDERS.includes(integ.provider)

    const isExternalScraperManaged = integ.loginMode === 'auto' && (integ.provider === 'grab' || integ.provider === 'be')

    const displayedSyncStatus = isExternalScraperManaged ? (integ.scraperSyncStatus ?? 'pending') : integ.syncStatus

    const displayedSyncAt = isExternalScraperManaged ? integ.scraperLastSyncAt : integ.lastSyncAt



    const syncBadgeClass = isPendingSetup ? 'badge-gray' :

      displayedSyncStatus === 'success' ? 'badge-green' :

      displayedSyncStatus === 'error' ? 'badge-red' :

      (displayedSyncStatus === 'syncing' || displayedSyncStatus === 'starting' || displayedSyncStatus === 'logging-in') ? 'badge-blue' : 'badge-gray'

    const displayedSyncTime = toValidDate(displayedSyncAt)

    const isScraperFresh = displayedSyncTime ? (Date.now() - displayedSyncTime.getTime()) <= 5 * 60 * 1000 : false

    const liveStatus = isExternalScraperManaged

      ? resolvePauseStoreState(livePauseStatuses, {

          source: integ.provider === 'be' ? 'be' : 'grab',

          integrationId: integ._id,

          storeId: normalizeStoreId(integ.externalStoreId),

          username: integ.loginUsername,

          label: integ.externalStoreName || integ.externalStoreId || integ.loginUsername || 'Unknown store',

        })

      : undefined

    const persistedScraperStatus = isExternalScraperManaged

      ? canonicalizePauseStoreState({

          integrationId: integ._id,

          source: integ.provider === 'be' ? 'be' : 'grab',

          storeId: normalizeStoreId(integ.externalStoreId),

          label: integ.externalStoreName || integ.externalStoreId || integ.loginUsername || 'Unknown store',

          username: integ.loginUsername,

          paused: Boolean(integ.scraperPaused),

          loggedIn: Boolean(integ.scraperLoggedIn && integ.scraperLastSeen && (Date.now() - new Date(integ.scraperLastSeen).getTime()) <= 5 * 60 * 1000),

          pausedUntil: integ.scraperPausedUntil ?? null,

          pauseMode: integ.scraperPauseMode ?? null,

          pauseLabel: integ.scraperPauseLabel ?? null,

          isUnknown: Boolean(integ.scraperIsUnknown),

          platformStatus: integ.scraperPlatformStatus ?? null,

        })

      : undefined

    const effectiveStatus = liveStatus ?? persistedScraperStatus



    const syncLabel = isPendingSetup ? 'Chờ cấu hình' :

      isExternalScraperManaged

        ? displayedSyncStatus === 'success' ? 'OK'

        : displayedSyncStatus === 'error' ? 'Stale'

        : displayedSyncStatus === 'starting' ? 'Khởi động'

        : displayedSyncStatus === 'logging-in' ? 'Đang login'

        : 'Chờ scraper'

        : displayedSyncStatus === 'success' ? 'Sync OK'

        : displayedSyncStatus === 'error' ? 'Lỗi sync'

        : displayedSyncStatus === 'syncing' ? 'Đang sync…' : 'Chưa sync'



    const sessionBadge = integ.loginMode === 'auto' ? (() => {

      if (isExternalScraperManaged) {

        if (effectiveStatus) {

          const liveTone = !effectiveStatus.loggedIn

            ? 'offline'

            : effectiveStatus.isUnknown

              ? 'unknown'

              : effectiveStatus.paused

                ? 'paused'

                : 'active'

          const liveTitle = !effectiveStatus.loggedIn

            ? 'Offline'

            : effectiveStatus.isUnknown

              ? (effectiveStatus.platformStatus ?? 'Unknown')

              : effectiveStatus.paused

                ? (effectiveStatus.pauseLabel ?? effectiveStatus.platformStatus ?? 'Paused')

                : (effectiveStatus.platformStatus ?? 'Active')

          return <PlatformStatusIcon status={liveTone} title={liveTitle} />

        }



        if (displayedSyncStatus === 'success' && isScraperFresh) {

          return <PlatformStatusIcon status="active" title={displayedSyncAt ? `Active · ${formatDateNative(displayedSyncAt, 'datetime')}` : 'Active'} />

        }

        if (integ.sessionStatus === 'expired') {

          return <PlatformStatusIcon status="paused" title="Pause / hết hạn phiên" />

        }

        return <PlatformStatusIcon status="offline" title={integ.scraperSyncMessage ?? integ.sessionError ?? 'Scraper offline'} />

      }



      if (integ.sessionStatus === 'active') {

        return <PlatformStatusIcon status="active" title={integ.sessionExpiresAt ? `Active · hết hạn ${formatDateNative(integ.sessionExpiresAt, 'datetime')}` : 'Active'} />

      }

      if (integ.sessionStatus === 'expired') {

        return <PlatformStatusIcon status="paused" title="Pause / hết hạn phiên" />

      }

      if (integ.sessionStatus === 'error') {

        return <PlatformStatusIcon status="offline" title={integ.sessionError ?? 'Lỗi phiên'} />

      }

      return <PlatformStatusIcon status="offline" title="Offline / chưa đăng nhập" />

    })() : null



    const brandName = getBrandName(integ)

    const hubName = getHubName(integ)

    const primaryLabel = integ.loginUsername || integ.externalStoreName || integ.externalStoreId || 'Chưa cấu hình'

    const secondaryLabel = [

      integ.externalStoreName && integ.externalStoreName !== primaryLabel ? integ.externalStoreName : '',

      hubName !== '—' ? hubName : '',

    ].filter(Boolean).join(' · ')

    const detailMeta = [

      integ.externalStoreId && integ.externalStoreId !== primaryLabel ? integ.externalStoreId : '',

      brandName !== '—' ? brandName : '',

      hubName !== '—' ? hubName : '',

    ].filter(Boolean).join(' · ')



    const isEditingName = editingNameId === integ._id

    const isSavingName  = savingNameId === integ._id



    return (

      <div key={integ._id} className={cn('relative rounded-2xl border border-gray-200 bg-white', isPendingSetup && 'opacity-60')}>

        <div className="flex items-center gap-3 px-4 py-2.5">

          <PlatformIcon source={integ.provider} size="sm" />

          <div className="min-w-0 flex-1">

            {isEditingName ? (

              <div className="flex items-center gap-1">

                <input

                  autoFocus

                  className="input h-7 min-w-0 flex-1 text-sm"

                  value={editingNameVal}

                  onChange={e => setEditingNameVal(e.target.value)}

                  onKeyDown={e => { if (e.key === 'Enter') void saveEditName(integ._id); if (e.key === 'Escape') setEditingNameId(null) }}

                  placeholder="Username / email / tên cửa hàng"

                />

                <button onClick={() => void saveEditName(integ._id)} disabled={isSavingName}

                  className="shrink-0 rounded-lg bg-green-500 px-2 py-1 text-[11px] font-semibold text-white hover:bg-green-600 disabled:opacity-50">

                  {isSavingName ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Lưu'}

                </button>

                <button onClick={() => setEditingNameId(null)}

                  className="shrink-0 rounded-lg bg-gray-100 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-200">

                  Huỷ

                </button>

              </div>

            ) : (

              <div className="flex items-center gap-2">

                <p className="truncate font-mono text-sm font-semibold text-gray-900">{primaryLabel}</p>

                {secondaryLabel && <span className="truncate text-xs text-gray-500">{secondaryLabel}</span>}

                {sessionBadge}

              </div>

            )}

          </div>

          <div className="flex items-center gap-2 shrink-0">

            <details className="group">

              <summary className="list-none rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">

                <Info className="h-3 w-3" />

              </summary>

              <div className="absolute right-4 z-10 mt-2 max-w-[320px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 shadow-lg">

                <div className="space-y-2">

                  {detailMeta && <p className="break-words">{detailMeta}</p>}

                  <div className="flex flex-wrap items-center gap-1.5">

                    <span className={cn('badge badge-sm', syncBadgeClass)}>{syncLabel}</span>

                    {safeTimeAgo(displayedSyncAt) && <span title={formatDateNative(displayedSyncAt)}>{safeTimeAgo(displayedSyncAt)}</span>}

                    {isExternalScraperManaged && integ.scraperSyncMessage && (

                      <span className="truncate text-sky-600">{integ.scraperSyncMessage}</span>

                    )}

                  </div>



                  {isExternalScraperManaged && integ.provider === 'be' && integ.appLastSyncAt && (

                    <p title={formatDateNative(integ.appLastSyncAt)}>

                      API nền: {integ.appSyncStatus === 'success' ? 'OK' : integ.appSyncStatus === 'error' ? 'lỗi' : integ.appSyncStatus ?? 'n/a'} · {safeTimeAgo(integ.appLastSyncAt)}

                    </p>

                  )}



                  {sr && !sr.loading && (

                    <div className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1.5', sr.ok ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600')}>

                      {sr.ok ? <RefreshCw className="h-3 w-3 shrink-0" /> : <XCircle className="h-3 w-3 shrink-0" />}

                      <span>{sr.ok ? `+${sr.upserted ?? 0} mới · ${sr.updated ?? 0} cập nhật` : sr.message}</span>

                    </div>

                  )}



                  {tr && !tr.loading && (

                    <div className={cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1.5', tr.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>

                      {tr.ok ? <CheckCircle className="h-3 w-3 shrink-0" /> : <XCircle className="h-3 w-3 shrink-0" />}

                      <span>{tr.ok ? `${tr.message ?? 'Kết nối thành công'}${tr.count !== undefined ? ` — ${tr.count} đơn` : ''}` : tr.message}</span>

                    </div>

                  )}



                  <div className="flex flex-wrap gap-1.5 pt-1">

                    <button onClick={() => openSettings(integ)} className="btn-outline btn-sm flex items-center gap-1 px-2 text-xs">

                      <Settings className="h-3 w-3" /> Cài đặt

                    </button>

                    {supportsSessionLogin ? (

                      <button onClick={() => openAutoLogin(integ)} className="btn-outline btn-sm flex items-center gap-1 px-2 text-xs text-violet-600 border-violet-200 hover:bg-violet-50">

                        <KeyRound className="h-3 w-3" /> Login

                      </button>

                    ) : (

                      <button onClick={() => handleTest(integ._id)} disabled={isPendingSetup || !!tr?.loading}

                        className="btn-outline btn-sm flex items-center gap-1 px-2 text-xs text-primary-600 border-primary-200 hover:bg-primary-50 disabled:opacity-50">

                        {tr?.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}

                        Test

                      </button>

                    )}

                    {!isExternalScraperManaged && (

                      <button onClick={() => handleSync(integ._id)} disabled={isPendingSetup || !!sr?.loading}

                        className="btn-primary btn-sm flex items-center justify-center gap-1 text-xs disabled:opacity-50">

                        {sr?.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}

                        {isPendingSetup ? 'Chờ bật' : 'Sync'}

                      </button>

                    )}

                  </div>

                </div>

              </div>

            </details>

            <button

              onClick={() => startEditName(integ)}

              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"

              title="Đổi tên hiển thị"

            >

              <Pencil className="h-3 w-3" />

            </button>

            <button onClick={() => void handleDelete(integ._id)} className="rounded-lg p-1 text-red-400 hover:bg-red-50 hover:text-red-600">

              <Trash2 className="h-3 w-3" />

            </button>

          </div>

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

    const brandIdStr = typeof integ.brandId === 'object' && integ.brandId ? (integ.brandId as { _id: string })._id : String(integ.brandId ?? '')

    const hubIdStr   = integ.hubId ? (typeof integ.hubId === 'object' ? (integ.hubId as { _id: string })._id : String(integ.hubId)) : ''

    const init: Record<string, string> = {

      __brandId: brandIdStr,

      __hubId: hubIdStr,

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

    const { __externalStoreId, __loginMode, __sessionRefreshMode, __loginUsername, __loginPassword, __brandId, __hubId, ...credFields } = creds

    const usesSmsOtp = providerUsesSmsOtp(settingsInteg.provider)

    const body: Record<string, unknown> = {}

    if (__brandId)                       body.brandId           = __brandId

    if (__hubId !== undefined)           body.hubId             = __hubId || null

    if (__loginMode)                     body.loginMode         = __loginMode

    if (__sessionRefreshMode)            body.sessionRefreshMode = __sessionRefreshMode

    if (__externalStoreId !== undefined) body.externalStoreId   = __externalStoreId.trim()

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

    setAutoLoginMode(integ.provider === 'shopee' ? 'auto' : (providerUsesSmsOtp(integ.provider) ? 'otp' : 'auto'))

    setAutoLoginForm({ username: integ.loginUsername ?? '', password: '', otp: '' })

    setManualJwt('')

    setManualCookieString('')

    setManualStoreId(integ.provider === 'shopee' ? (integ.externalStoreId ?? '') : (providerUsesSmsOtp(integ.provider) ? '' : integ.externalStoreId ?? ''))

    setAutoLoginWaiting(null)

    setAutoLoginResult(null)

  }



  const handleAutoLogin = async (withOtp = false) => {

    if (!autoLoginId) return

    setAutoLoginLoading(true)

    setAutoLoginResult(null)

    try {

      const autoLoginBody: Record<string, string | undefined> = {

        username: autoLoginForm.username,

        password: autoLoginForm.password || undefined,

        otp: (withOtp && autoLoginForm.otp) ? autoLoginForm.otp : undefined,

        sessionKey: autoLoginWaiting?.sessionKey,

      }

      const endpoint = `/api/integrations/${autoLoginId}/auto-login`



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



      const { res, data, parseError } = await requestLogin(endpoint, autoLoginBody)



      if (data?.data?.requiresOtp) {

        setAutoLoginWaiting({ requiresOtp: true, otpTarget: data.data.otpTarget, sessionKey: data.data.sessionKey })

      } else if (data?.data?.success) {

        setAutoLoginResult({ ok: true, message: '??ng nh?p th?nh c?ng! Session ?? ???c l?u.' })

        setAutoLoginWaiting(null)

        qc.invalidateQueries({ queryKey: ['integrations'] })

      } else {

        setAutoLoginResult({

          ok: false,

          message: data?.error ?? parseError ?? `??ng nh?p th?t b?i (${res.status})`,

          debug: attempts,

        })

      }

    } catch (e) {

      setAutoLoginResult({ ok: false, message: e instanceof Error ? e.message : 'L?i m?ng' })

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



        if (provider === 'shopee' && !manualCookieString.trim()) {

          throw new Error('C?n paste cookie Shopee Partner ?? l?u session th? c?ng')

        }

        if (provider === 'xanh_sm' && !manualCookieString.trim() && !trimmedToken) {

          throw new Error('C?n paste cookie ho?c token ?? l?u session th? c?ng')

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

        if (!res.ok) throw new Error(data?.error ?? parseError ?? 'L?i l?u session')



        await updateMutation.mutateAsync({

          id: autoLoginId,

          loginMode: 'auto',

          loginUsername: autoLoginForm.username || undefined,

          externalStoreId: manualStoreId.trim() || undefined,

        })



        setAutoLoginResult({

          ok: true,

          message: provider === 'shopee'

            ? 'Session Shopee Partner ?? ???c l?u v?o DB.'

            : 'Session ?? ???c l?u v?o DB. C? th? d?ng session n?y ?? ki?m th? automation ? b??c ti?p theo.',

        })

        qc.invalidateQueries({ queryKey: ['integrations'] })

      } else {

        if (!manualJwt.trim()) throw new Error('C?n JWT token ?? l?u session th? c?ng')



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

          setAutoLoginResult({ ok: true, message: 'Session ?? ???c l?u! Cron s? t? pull ??n m?i ph?t.' })

          qc.invalidateQueries({ queryKey: ['integrations'] })

        } else {

          setAutoLoginResult({ ok: false, message: data?.error ?? parseError ?? `L?i l?u session (${res.status})` })

        }

      }

    } catch (e) {

      setAutoLoginResult({ ok: false, message: e instanceof Error ? e.message : 'L?i m?ng' })

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

    <div className="space-y-5" style={{ fontFamily: 'Tahoma, Verdana, sans-serif' }}>



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



      <div className="card card-body">

        <div className="relative max-w-sm">

          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />

          <input

            className="input w-full pl-9"

            placeholder="Tìm theo username / email / store..."

            value={integrationSearch}

            onChange={(event) => setIntegrationSearch(event.target.value)}

          />

        </div>

      </div>



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

          <button

            onClick={() => setActiveProviderTab('pause')}

            className={cn(

              'flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition-all',

              activeProviderTab === 'pause'

                ? 'border-gray-900 bg-gray-900 text-white shadow-sm'

                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'

            )}

          >

            <span className="text-base leading-none">⏸</span>

            <span className="font-semibold">Tạm dừng</span>

          </button>

        </div>



        {activeProviderTab === 'pause' ? (

          <PauseStoreSection />

        ) : (

        <section key={activeProviderSection.value} ref={providerListRef} className="flex flex-col gap-4">

          <div className="flex items-start justify-between gap-3">

            <div className="flex items-center gap-3 min-w-0">

              <PlatformIcon source={activeProviderSection.value} size="xl" />

              <div className="min-w-0">

                <h2 className="text-lg font-semibold text-gray-900">

                  {activeProviderSection.label} &middot; {activeProviderSection.integrations.length} kết nối{activeProviderSection.target ? ` / ${activeProviderSection.target}` : ''}

                </h2>

              </div>

            </div>

            <button onClick={() => openCreateModal(activeProviderSection.value)} className="btn-outline btn-sm shrink-0">

              <Plus className="w-4 h-4" /> Thêm

            </button>

          </div>



          {false && (activeProviderSection.value === 'shopee' || activeProviderSection.value === 'xanh_sm') && (

            <div className={cn(

              'rounded-2xl border px-4 py-3 text-sm',

              activeProviderSection.value === 'shopee'

                ? 'border-amber-200 bg-amber-50 text-amber-900'

                : 'border-teal-200 bg-teal-50 text-teal-900'

            )}>

              <p>

                {activeProviderSection.value === 'shopee'

                  ? 'Shopee hiện ưu tiên đăng nhập browser/manual bằng email hoặc username trên Shopee Partner. Khi cần sync order, ưu tiên lấy session browser thay vì trông vào OTP cũ.'

                  : 'Xanh SM cũng dùng flow OTP SMS, không cần mật khẩu ở màn hình login session.'}

              </p>

              <a

                href={activeProviderSection.value === 'shopee' ? LOGIN_PORTAL_LINKS.shopee : LOGIN_PORTAL_LINKS.xanh_sm}

                target="_blank"

                rel="noopener noreferrer"

                className="mt-2 inline-flex text-sm font-medium underline underline-offset-2"

              >

                {activeProviderSection.value === 'shopee' ? 'Mở trang Shopee Partner' : 'Mở trang đăng nhập Xanh SM'}

              </a>

            </div>

          )}



          <PaginationControls

            page={providerPage}

            totalPages={providerTotalPages}

            totalItems={activeProviderSection.integrations.length}

            label="tích hợp"

            onPageChange={handleProviderPageChange}

          />

          {paginatedProviderIntegrations.length > 0 ? (

            <div className="grid gap-4 md:grid-cols-2">

              {paginatedProviderIntegrations.map((integration) => renderIntegrationCard(integration))}

            </div>

          ) : (

            <div className="rounded-2xl bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">

              <ShoppingBag className="mx-auto mb-3 h-8 w-8 text-gray-300" />

              {activeProviderSection.value === 'shopee'

                ? 'Chưa tạo bản ghi Shopee nào. Có thể thêm account browser/manual ngay trong tab này, ưu tiên email hoặc username Partner.'

                : activeProviderSection.value === 'xanh_sm'

                ? 'Chưa tạo bản ghi Xanh SM nào. Có thể lưu account chờ OTP ngay trong tab này.'

                : 'Chưa có tích hợp nào trong tab này.'}

            </div>

          )}

          <PaginationControls

            page={providerPage}

            totalPages={providerTotalPages}

            totalItems={activeProviderSection.integrations.length}

            label="tích hợp"

            onPageChange={handleProviderPageChange}

          />

        </section>

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

                  <p className="text-xs text-violet-600 -mt-1">Grab và Be theo flow mới chỉ cần tài khoản đăng nhập. Store ID hoặc Restaurant ID sẽ được hệ thống tự học sau khi login hoặc lưu session.</p>

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

                    <p className="text-xs text-violet-600 mt-1">Bạn có thể tạo mới mà chưa cần nhập Store ID hoặc Restaurant ID.</p>

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



            <div className="grid grid-cols-2 gap-3">

              <div>

                <label className="label">Thương hiệu</label>

                <select className="input w-full" value={creds.__brandId ?? ''}

                  onChange={e => setCreds(p => ({ ...p, __brandId: e.target.value, __hubId: '' }))}>

                  <option value="">— Chọn —</option>

                  {brands.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}

                </select>

              </div>

              <div>

                <label className="label">Điểm bán</label>

                <select className="input w-full" value={creds.__hubId ?? ''}

                  onChange={e => setCreds(p => ({ ...p, __hubId: e.target.value }))}>

                  <option value="">— Tất cả —</option>

                  {hubs.map(h =>

                    <option key={h._id} value={h._id}>{h.name}</option>

                  )}

                </select>

              </div>

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

                <p className="text-xs text-violet-600 mt-1">Với Grab và Be auto, trường này không bắt buộc. Có thể để trống để hệ thống tự học lại từ lần login hoặc lưu session kế tiếp.</p>

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

                  {(settingsInteg.provider === 'grab' || settingsInteg.provider === 'be') && (
                    <p className="text-xs text-violet-600">Flow mới cho Grab và Be cho phép để trống Store ID ban đầu. Hệ thống sẽ tự học lại khi login hoặc lưu session thành công.</p>
                  )}

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



              {/* ── Session/browser login mode (Shopee Food / Xanh SM) ── */}

              {autoLoginMode === 'otp' && !autoLoginResult && (

                <div className="space-y-3">

                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-700 space-y-1">

                    <p className="font-medium">Đăng nhập session qua browser:</p>

                    <p>1. Với Shopee, ưu tiên email hoặc username Partner rồi lấy session browser.</p>

                    <p>2. Nếu flow OTP cũ không còn phù hợp, chuyển sang tab Manual để dán cookie/session.</p>

                    <p>3. Với Xanh SM vẫn có thể tiếp tục dùng OTP như cũ.</p>

                    {autoLoginInteg?.provider === 'shopee' && (

                      <>

                        <p>Tài khoản Shopee mới hiện login được ở Shopee Partner. Nếu Merchant chưa sinh session tự động, chuyển sang tab Manual và dán cookie/session browser.</p>

                        <div className="flex flex-wrap gap-2 pt-1">

                          <a href={SHOPEE_PARTNER_LOGIN_URL} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">Mở Shopee Partner</a>

                          <a href={SHOPEE_PARTNER_OTP_URL} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">Mở Shopee Partner OTP</a>

                        </div>

                      </>

                    )}

                  </div>

                  {!autoLoginWaiting && (

                    <div>

                      <label className="label">{autoLoginInteg?.provider === 'shopee' ? 'Email / username Shopee Partner' : 'Số điện thoại đăng ký tài khoản'}</label>

                      <input className="input w-full" type={autoLoginInteg?.provider === 'shopee' ? 'text' : 'tel'}

                        placeholder={autoLoginInteg?.provider === 'shopee' ? 'VD: Nguyenduyphuoc25@gmail.com' : 'VD: 0901234567'}

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

                  {autoLoginInteg?.provider === 'shopee' ? (

                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-2">

                      <p className="font-medium">Flow login tay cho Shopee Partner:</p>

                      <p>1. M? partner.business.accounts.shopee.vn v? ??ng nh?p b?ng email/username.</p>

                      <p>2. Ch?n ??ng merchant sau khi v?o partner.shopee.vn.</p>

                      <p>3. Copy to?n b? cookie session browser v? d?n v?o form n?y ?? l?u session.</p>

                      <a href={LOGIN_PORTAL_LINKS.shopee} target="_blank" rel="noopener noreferrer" className="inline-flex font-medium underline underline-offset-2">

                        M? Shopee Partner

                      </a>

                    </div>

                  ) : providerUsesSmsOtp(autoLoginInteg?.provider) ? (

                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-2">

                      <p className="font-medium">Flow login tay cho Xanh SM:</p>

                      <p>1. M? trang ??ng nh?p ch?nh th?c v? ??ng nh?p tay b?ng t?i kho?n c?a anh.</p>

                      <p>2. Khi s?n y?u c?u OTP, nh?p OTP tr?c ti?p tr?n portal.</p>

                      <p>3. Sau khi v?o ???c dashboard, m? DevTools ?? copy cookie ho?c token r?i d?n v?o form n?y ?? l?u session v?o DB.</p>

                      <a href={LOGIN_PORTAL_LINKS[autoLoginInteg.provider]} target="_blank" rel="noopener noreferrer" className="inline-flex font-medium underline underline-offset-2">

                        M? trang ??ng nh?p Xanh SM Merchant

                      </a>

                    </div>

                  ) : (

                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-700 space-y-1">

                      <p className="font-medium">C?ch l?y JWT token:</p>

                      <p>1. M? tr?nh duy?t v? ??ng nh?p v?o merchant portal</p>

                      <p>2. Nh?n <kbd className="bg-white border rounded px-1">F12</kbd> ? tab <strong>Application</strong> / <strong>Local Storage</strong></p>

                      <p>3. T?m key <code className="bg-white rounded px-1">token</code> ho?c <code className="bg-white rounded px-1">access_token</code> ?? copy value</p>

                      <p>4. Ho?c ? tab <strong>Network</strong> copy header <code className="bg-white rounded px-1">Authorization: Bearer ?</code></p>

                    </div>

                  )}

                  {(autoLoginInteg?.provider === 'shopee' || providerUsesSmsOtp(autoLoginInteg?.provider)) && (

                    <div>

                      <label className="label">Cookie string <span className="text-gray-400 font-normal">(copy t? DevTools)</span></label>

                      <textarea className="input w-full font-mono text-xs resize-none" rows={4}

                        placeholder="SPC_CDS=...; SPC_F=...; ..."

                        value={manualCookieString}

                        onChange={e => setManualCookieString(e.target.value)} />

                      <p className="text-xs text-gray-400 mt-1">

                        {autoLoginInteg?.provider === 'shopee'

                          ? 'V?i Shopee n?n copy to?n b? cookie sau khi qua partner login v? merchant select.'

                          : 'V?i Xanh SM c? th? d?n cookie ho?c ch? token ? ? b?n d??i.'}

                      </p>

                    </div>

                  )}

                  <div>

                    <label className="label">

                      {autoLoginInteg?.provider === 'shopee' ? 'CSRF token / SPC_F' : autoLoginInteg?.provider === 'xanh_sm' ? 'JWT token / access token' : 'JWT Token (Bearer token)'}

                      {(autoLoginInteg?.provider === 'shopee' || providerUsesSmsOtp(autoLoginInteg?.provider)) && (

                        <span className="text-gray-400 font-normal"> {autoLoginInteg?.provider === 'shopee' ? '(t?y ch?n)' : '(khuy?n ngh?)'}</span>

                      )}

                    </label>

                    <textarea className="input w-full font-mono text-xs resize-none" rows={4}

                      placeholder={autoLoginInteg?.provider === 'shopee'

                        ? 'SPC_F ho?c x-csrftoken n?u c?n'

                        : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'}

                      value={manualJwt}

                      onChange={e => setManualJwt(e.target.value)} />

                    <p className="text-xs text-gray-400 mt-1">

                      {autoLoginInteg?.provider === 'shopee'

                        ? 'N?u kh?ng nh?p, h? th?ng s? t? th? l?y x-csrftoken t? cookie SPC_F.'

                        : 'C? th? paste c? chu?i Bearer ho?c ch? ph?n token.'}

                    </p>

                  </div>

                  <div>

                    <label className="label">Store / Restaurant ID <span className="text-gray-400 font-normal">(t?y ch?n ? d?ng ?? pull ??n)</span></label>

                    <input className="input w-full font-mono" placeholder="VD: 10354026"

                      value={manualStoreId}

                      onChange={e => setManualStoreId(e.target.value)} />

                    <p className="text-xs text-violet-600 mt-1">Có thể để trống. Nếu session hoặc automation tìm ra store thật, BPOS sẽ tự cập nhật lại integration và kênh bán.</p>

                  </div>

                  <div>

                    <label className="label">T?n ??ng nh?p (?? hi?n th?)</label>

                    <input className="input w-full" placeholder="email ho?c username"

                      value={autoLoginForm.username}

                      onChange={e => setAutoLoginForm(p => ({ ...p, username: e.target.value }))} />

                  </div>

                  {autoLoginLoading && (

                    <div className="flex items-center gap-2 text-sm text-blue-700">

                      <Loader2 className="w-4 h-4 animate-spin" /> ?ang l?u session?

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

                  disabled={autoLoginLoading || (autoLoginInteg?.provider === 'shopee' ? !manualCookieString.trim() : (providerUsesSmsOtp(autoLoginInteg?.provider) ? (!manualCookieString.trim() && !manualJwt.trim()) : !manualJwt.trim()))}

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
