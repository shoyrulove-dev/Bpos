'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { CheckCircle2, Loader2, Printer, Receipt, RefreshCw, Save, Ticket, Volume2, Wifi, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEFAULT_ORDER_ALERT_SETTINGS, loadOrderAlertSettings, persistOrderAlertSettings, playOrderAlert, type OrderAlertSettings } from '@/lib/order-alerts'
import {
  DEFAULT_LOCAL_PRINTER_SETTINGS,
  checkBridgePrinter,
  discoverBridgePrinters,
  getBridgePrinterConfig,
  listWindowsPrinters,
  loadLocalPrinterSettings,
  persistLocalPrinterSettings,
  saveLocalPrinterProfile,
  setBridgePrinterConfig,
  testBridgePrinter,
  type BridgePrinterResponse,
  type LocalPrinterConnectionType,
  type LocalPrinterProfile,
  type LocalPrinterSettings,
  type LocalPrinterType,
} from '@/lib/local-printer'

type PrinterFeedback = { ok: boolean; message: string } | null

function formatSyncTime() {
  return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function normalizeBridgeStatus(value: string | undefined): 'ok' | 'offline' | 'unknown' {
  return value === 'ok' || value === 'offline' ? value : 'unknown'
}

function mergeProfile(type: LocalPrinterType, previous: LocalPrinterProfile, payload: BridgePrinterResponse) {
  const nextProfile: LocalPrinterProfile = {
    ...previous,
    ip: String(payload.ip ?? previous.ip).trim() || previous.ip,
    port: String(payload.port ?? previous.port).trim() || previous.port,
    connectionType: (payload.connectionType ?? previous.connectionType) as LocalPrinterConnectionType,
    usbName: String(payload.usbName ?? previous.usbName ?? '').trim(),
  }
  saveLocalPrinterProfile(type, nextProfile)
  return nextProfile
}

function PrinterProfileCard({
  printerType,
  title,
  description,
}: {
  printerType: LocalPrinterType
  title: string
  description: string
}) {
  const [profile, setProfile] = useState<LocalPrinterProfile>(() => loadLocalPrinterSettings()[printerType])
  const [status, setStatus] = useState<'ok' | 'offline' | 'unknown'>('unknown')
  const [discoveredPrinters, setDiscoveredPrinters] = useState<Array<{ ip: string; port: number }>>([])
  const [windowsPrinters, setWindowsPrinters] = useState<string[]>([])
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<PrinterFeedback>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [checking, setChecking] = useState(false)
  const [testing, setTesting] = useState(false)
  const [loadingPrinters, setLoadingPrinters] = useState(false)

  const isUsb = profile.connectionType === 'usb'
  const busy = refreshing || saving || discovering || checking || testing

  useEffect(() => {
    const settings = loadLocalPrinterSettings()
    setProfile(settings[printerType])

    void (async () => {
      try {
        const payload = await getBridgePrinterConfig(printerType)
        setProfile((previous) => mergeProfile(printerType, previous, payload))
        setStatus(normalizeBridgeStatus(payload.status))
        setDiscoveredPrinters(Array.isArray(payload.discovered) ? payload.discovered : [])
        setLastSyncedAt(formatSyncTime())
      } catch {
        setStatus('unknown')
      }
    })()
  }, [printerType])

  const statusTone = useMemo(() => (
    status === 'ok'
      ? 'bg-green-50 text-green-700 border border-green-200'
      : status === 'offline'
        ? 'bg-red-50 text-red-600 border border-red-200'
        : 'bg-gray-50 text-gray-500 border border-gray-200'
  ), [status])

  const statusLabel = status === 'ok' ? 'Online' : status === 'offline' ? 'Offline' : 'Chưa rõ'

  const persistProfile = (nextProfile: LocalPrinterProfile) => {
    setProfile(nextProfile)
    const nextSettings: LocalPrinterSettings = {
      ...loadLocalPrinterSettings(),
      [printerType]: nextProfile,
    }
    persistLocalPrinterSettings(nextSettings)
  }

  const applyBridgePayload = (payload: BridgePrinterResponse, message?: string) => {
    setProfile((previous) => mergeProfile(printerType, previous, payload))
    setStatus(normalizeBridgeStatus(payload.status))
    setDiscoveredPrinters(Array.isArray(payload.discovered) ? payload.discovered : [])
    setLastSyncedAt(formatSyncTime())
    if (message) {
      setFeedback({ ok: payload.ok, message })
    }
  }

  const syncFromBridge = async (showMessage = false) => {
    setRefreshing(true)
    if (showMessage) setFeedback(null)
    try {
      const payload = await getBridgePrinterConfig(printerType)
      applyBridgePayload(payload, showMessage ? payload.message || `Đã đồng bộ cấu hình ${title.toLowerCase()}.` : undefined)
    } catch (error) {
      setStatus('unknown')
      if (showMessage) {
        setFeedback({ ok: false, message: `Không đọc được cấu hình từ bridge: ${(error as Error).message}` })
      }
    } finally {
      setRefreshing(false)
    }
  }

  const saveBridgeConfig = async () => {
    setSaving(true)
    setFeedback(null)
    persistProfile(profile)
    try {
      const payload = await setBridgePrinterConfig(printerType, {
        connectionType: profile.connectionType,
        ip: profile.ip,
        port: Number(profile.port),
        usbName: profile.usbName,
      })
      applyBridgePayload(payload, payload.message || `Đã lưu cấu hình ${title.toLowerCase()}.`)
    } catch (error) {
      setFeedback({ ok: false, message: `Không lưu được cấu hình bridge: ${(error as Error).message}` })
    } finally {
      setSaving(false)
    }
  }

  const discoverOnLan = async () => {
    setDiscovering(true)
    setFeedback(null)
    try {
      const payload = await discoverBridgePrinters(printerType)
      applyBridgePayload(payload, payload.message || 'Đã quét máy in trên LAN.')
    } catch (error) {
      setFeedback({ ok: false, message: `Không quét được máy in: ${(error as Error).message}` })
    } finally {
      setDiscovering(false)
    }
  }

  const checkConnection = async () => {
    setChecking(true)
    setFeedback(null)
    try {
      const payload = await checkBridgePrinter(printerType)
      applyBridgePayload(payload, payload.message || 'Đã kiểm tra kết nối máy in.')
    } catch (error) {
      setStatus('unknown')
      setFeedback({ ok: false, message: `Không kiểm tra được máy in: ${(error as Error).message}` })
    } finally {
      setChecking(false)
    }
  }

  const runTestPrint = async () => {
    setTesting(true)
    setFeedback(null)
    try {
      const payload = await testBridgePrinter(printerType)
      applyBridgePayload(payload, payload.message || 'Đã gửi lệnh in thử.')
    } catch (error) {
      setStatus('unknown')
      setFeedback({ ok: false, message: `Không gửi được lệnh in thử: ${(error as Error).message}` })
    } finally {
      setTesting(false)
    }
  }

  const loadPrinterList = async () => {
    setLoadingPrinters(true)
    setFeedback(null)
    try {
      const printers = await listWindowsPrinters()
      setWindowsPrinters(printers)
      if (printers.length === 0) {
        setFeedback({ ok: false, message: 'Bridge không liệt kê được máy in nào. Đảm bảo scraper đang chạy.' })
      }
    } catch {
      setFeedback({ ok: false, message: 'Không kết nối được bridge. Đảm bảo scraper đang chạy.' })
    } finally {
      setLoadingPrinters(false)
    }
  }

  const connectionLabel = isUsb
    ? (profile.usbName || 'Chưa chọn')
    : `${profile.ip}:${profile.port}`

  return (
    <div className="rounded-[28px] border border-gray-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            {printerType === 'receipt' ? <Receipt className="h-4 w-4" /> : <Ticket className="h-4 w-4" />}
            {title}
          </h2>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={profile.enabled}
            onChange={(event) => {
              const nextProfile = { ...profile, enabled: event.target.checked }
              persistProfile(nextProfile)
            }}
          />
          Dùng bridge local
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold', statusTone)}>
          Trạng thái: {statusLabel}
        </span>
        <span className="text-xs text-gray-500">
          {isUsb ? 'USB' : 'LAN'}: {connectionLabel}
        </span>
        {lastSyncedAt && <span className="text-xs text-gray-500">Đồng bộ lúc: {lastSyncedAt}</span>}
      </div>

      {/* Connection type toggle */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex">
          <button
            type="button"
            onClick={() => setProfile(p => ({ ...p, connectionType: 'lan' }))}
            className={cn(
              'flex-1 py-2 text-sm font-medium transition-colors',
              !isUsb ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            )}
          >
            📡 LAN / TCP-IP
          </button>
          <button
            type="button"
            onClick={() => setProfile(p => ({ ...p, connectionType: 'usb' }))}
            className={cn(
              'flex-1 py-2 text-sm font-medium transition-colors',
              isUsb ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            )}
          >
            🔌 USB / Windows
          </button>
        </div>
      </div>

      {/* Name + Paper size */}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label">Tên máy in (hiển thị)</label>
          <input
            className="input"
            value={profile.name}
            onChange={(event) => setProfile((previous) => ({ ...previous, name: event.target.value }))}
            placeholder={printerType === 'receipt' ? 'Xprinter XP-T80L' : 'Xprinter XP-Q361U'}
          />
        </div>
        <div>
          <label className="label">Khổ giấy</label>
          <select
            className="input"
            value={profile.paperSize}
            onChange={(event) => setProfile((previous) => ({
              ...previous,
              paperSize: event.target.value as LocalPrinterProfile['paperSize'],
            }))}
          >
            <option value="80mm">80mm</option>
            <option value="58mm">58mm</option>
            <option value="A4">A4</option>
          </select>
        </div>
      </div>

      {/* LAN fields */}
      {!isUsb && (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">IP máy in (LAN)</label>
            <input
              className="input"
              value={profile.ip}
              onChange={(event) => setProfile((previous) => ({ ...previous, ip: event.target.value }))}
              placeholder="192.168.1.100"
            />
          </div>
          <div>
            <label className="label">Port</label>
            <input
              className="input"
              value={profile.port}
              onChange={(event) => setProfile((previous) => ({ ...previous, port: event.target.value }))}
              placeholder="9100"
            />
          </div>
        </div>
      )}

      {/* USB fields */}
      {isUsb && (
        <div className="space-y-2">
          <div>
            <label className="label">Tên máy in trong Windows</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={profile.usbName}
                onChange={(event) => setProfile((previous) => ({ ...previous, usbName: event.target.value }))}
                placeholder="XPrinter XP-Q361U"
              />
              <button
                type="button"
                onClick={() => void loadPrinterList()}
                disabled={loadingPrinters}
                className="btn-outline shrink-0 disabled:opacity-50"
              >
                {loadingPrinters ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Liệt kê
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">Nhập đúng tên máy in xuất hiện trong Windows Printers (Control Panel).</p>
          </div>
          {windowsPrinters.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Máy in Windows phát hiện</p>
              <div className="flex flex-wrap gap-2">
                {windowsPrinters.map(name => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setProfile(p => ({ ...p, usbName: name }))}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      profile.usbName === name
                        ? 'border-green-300 bg-green-50 text-green-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-100'
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void syncFromBridge(true)} disabled={busy} className="btn-outline disabled:opacity-50">
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Đồng bộ bridge
        </button>
        {!isUsb && (
          <button type="button" onClick={() => void discoverOnLan()} disabled={busy} className="btn-outline disabled:opacity-50">
            {discovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />} Quét LAN
          </button>
        )}
        <button type="button" onClick={() => void checkConnection()} disabled={busy} className="btn-outline disabled:opacity-50">
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Kiểm tra
        </button>
        <button type="button" onClick={() => void runTestPrint()} disabled={busy} className="btn-outline disabled:opacity-50">
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} In thử
        </button>
        <button type="button" onClick={() => void saveBridgeConfig()} disabled={busy} className="btn-primary disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu cấu hình
        </button>
      </div>

      {!isUsb && discoveredPrinters.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Máy in bridge nhìn thấy</p>
          <div className="flex flex-wrap gap-2">
            {discoveredPrinters.map((printer) => {
              const key = `${printer.ip}:${printer.port}`
              const active = printer.ip === profile.ip && String(printer.port) === profile.port
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setProfile((previous) => ({ ...previous, ip: printer.ip, port: String(printer.port) }))}
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

      {feedback && (
        <div className={cn(
          'rounded-xl px-4 py-3 text-sm flex items-start gap-2',
          feedback.ok ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-600'
        )}>
          {feedback.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
          <span>{feedback.message}</span>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === 'admin'
  const [orderSettings, setOrderSettings] = useState<OrderAlertSettings>(DEFAULT_ORDER_ALERT_SETTINGS)
  const [settingsSaved, setSettingsSaved] = useState(false)

  useEffect(() => {
    setOrderSettings(loadOrderAlertSettings())

    const printerSettings = loadLocalPrinterSettings()
    if (printerSettings.receipt.name || printerSettings.receipt.paperSize) {
      setOrderSettings((previous) => ({
        ...previous,
        printerName: printerSettings.receipt.name,
        printerPaperSize: printerSettings.receipt.paperSize,
      }))
    }

    void fetch('/api/settings/order-alerts')
      .then(async (response) => {
        if (!response.ok) return null
        return response.json() as Promise<{ voiceMessage?: string; soundRepeatCount?: number }>
      })
      .then((payload) => {
        if (!payload?.voiceMessage) return
        setOrderSettings((previous) => ({
          ...previous,
          voiceMessage: payload.voiceMessage || previous.voiceMessage,
          soundRepeatCount: typeof payload.soundRepeatCount === 'number' ? payload.soundRepeatCount : previous.soundRepeatCount,
        }))
      })
      .catch(() => null)
  }, [])

  const handleSaveOrderSettings = async () => {
    const printerSettings = loadLocalPrinterSettings()
    persistOrderAlertSettings({
      ...orderSettings,
      printerName: printerSettings.receipt.name,
      printerPaperSize: printerSettings.receipt.paperSize,
    })

    if (isAdmin) {
      await fetch('/api/settings/order-alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceMessage: orderSettings.voiceMessage, soundRepeatCount: orderSettings.soundRepeatCount }),
      }).catch(() => null)
    }

    setSettingsSaved(true)
    window.setTimeout(() => setSettingsSaved(false), 2000)
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cài đặt</h1>
          <p className="page-subtitle">Âm thanh đơn mới, tự động in và hai cấu hình máy in tách riêng cho hóa đơn và tem.</p>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><Volume2 className="h-4 w-4" /> Âm thanh và tự động in</h2>
          <p className="mt-1 text-sm text-gray-500">Phần này chỉ giữ logic cảnh báo và auto-print. Cấu hình máy in LAN nằm ở hai khối phía dưới.</p>
        </div>

        <label className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Âm thanh đơn mới</p>
            <p className="text-xs text-gray-500">Phát âm báo khi có đơn mới chưa hoàn thành.</p>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={orderSettings.soundEnabled}
            onChange={(event) => setOrderSettings((previous) => ({ ...previous, soundEnabled: event.target.checked }))}
          />
        </label>

        <label className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Tự động in hóa đơn đơn mới</p>
            <p className="text-xs text-gray-500">Ưu tiên gửi qua bridge `receipt`; nếu bridge không sẵn sàng thì fallback sang cửa sổ in của trình duyệt.</p>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={orderSettings.autoPrintReceiptEnabled}
            onChange={(event) => setOrderSettings((previous) => ({
              ...previous,
              autoPrintReceiptEnabled: event.target.checked,
              autoPrintEnabled: event.target.checked || previous.autoPrintLabelEnabled,
            }))}
          />
        </label>

        <label className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Tự động in tem đơn mới</p>
            <p className="text-xs text-gray-500">Chỉ in khi kênh đang bật in tem và store đang active.</p>
          </div>
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={orderSettings.autoPrintLabelEnabled}
            onChange={(event) => setOrderSettings((previous) => ({
              ...previous,
              autoPrintLabelEnabled: event.target.checked,
              autoPrintEnabled: previous.autoPrintReceiptEnabled || event.target.checked,
            }))}
          />
        </label>

        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Câu thông báo đọc lên</p>
                <p className="text-xs text-gray-500">{isAdmin ? 'Admin có thể đổi câu này.' : 'Chỉ admin mới được đổi câu thông báo chung.'}</p>
              </div>
              <p className="text-sm font-medium text-gray-900 flex-shrink-0">Số lần phát</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <textarea
                  className="input w-full resize-none text-sm"
                  rows={2}
                  maxLength={200}
                  value={orderSettings.voiceMessage}
                  onChange={(event) => setOrderSettings((previous) => ({ ...previous, voiceMessage: event.target.value }))}
                  readOnly={!isAdmin}
                  placeholder="Anh ơi. Mình có đơn hàng mới. Anh kiểm tra giúp em nhé."
                />
                <p className="mt-0.5 text-right text-[11px] text-gray-400">{orderSettings.voiceMessage.length}/200</p>
              </div>
              <input
                type="number"
                min={1}
                className="input w-20 text-center text-sm flex-shrink-0"
                value={orderSettings.soundRepeatCount}
                onChange={(event) => {
                  const nextValue = parseInt(event.target.value, 10)
                  setOrderSettings((previous) => ({
                    ...previous,
                    soundRepeatCount: Number.isFinite(nextValue) && nextValue > 0 ? nextValue : previous.soundRepeatCount,
                  }))
                }}
                disabled={!isAdmin}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => playOrderAlert(1, orderSettings.voiceMessage)} className="btn-outline">
            <Volume2 className="h-4 w-4" /> Test âm thanh
          </button>
          <button type="button" onClick={handleSaveOrderSettings} className="btn-primary">
            {settingsSaved ? '✓ Đã lưu cài đặt' : 'Lưu cài đặt chung'}
          </button>
          <Link href="/orders" className="btn-outline">Về danh sách đơn</Link>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <PrinterProfileCard
          printerType="receipt"
          title="In hóa đơn"
          description="Dùng cho nút `In đơn` và luồng auto-print receipt. Mặc định đang nhắm Xprinter XP-T80L."
        />
        <PrinterProfileCard
          printerType="label"
          title="In tem"
          description="Dùng cho nút `In phiếu tem`. Cấu hình này tách riêng để bạn trỏ sang XP-Q361U nếu thiết bị có IP riêng."
        />
      </div>
    </div>
  )
}
