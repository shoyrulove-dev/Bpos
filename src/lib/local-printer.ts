'use client'

import { buildReceiptPrintUrl } from '@/lib/order-alerts'

export type LocalPrinterType = 'receipt' | 'label'
export type LocalPrinterPaperSize = '80mm' | '58mm' | 'A4'
export type LocalPrinterConnectionType = 'lan' | 'usb'

export interface LocalPrinterProfile {
  name: string
  paperSize: LocalPrinterPaperSize
  connectionType: LocalPrinterConnectionType
  ip: string
  port: string
  usbName: string
  enabled: boolean
}

export interface LocalPrinterSettings {
  receipt: LocalPrinterProfile
  label: LocalPrinterProfile
}

export interface BridgePrinterResponse {
  ok: boolean
  type?: LocalPrinterType
  ip?: string
  port?: number
  connectionType?: LocalPrinterConnectionType
  usbName?: string
  status?: string
  autoDiscover?: boolean
  discovered?: Array<{ ip: string; port: number }>
  printers?: string[]
  message?: string
}

const STORAGE_KEY = 'bpos.local-printers'
export const LOCAL_PRINTER_BRIDGE_ORIGIN = 'http://127.0.0.1:3846'

export const DEFAULT_LOCAL_PRINTER_SETTINGS: LocalPrinterSettings = {
  receipt: {
    name: 'Xprinter XP-T80L',
    paperSize: '80mm',
    connectionType: 'lan',
    ip: '192.168.1.100',
    port: '9100',
    usbName: '',
    enabled: true,
  },
  label: {
    name: 'Xprinter XP-Q361U',
    paperSize: '58mm',
    connectionType: 'usb',
    ip: '192.168.1.100',
    port: '9100',
    usbName: 'XPrinter XP-Q361U',
    enabled: true,
  },
}

function normalizePaperSize(value: unknown, fallback: LocalPrinterPaperSize): LocalPrinterPaperSize {
  return value === '58mm' || value === 'A4' || value === '80mm' ? value : fallback
}

function normalizeConnectionType(value: unknown, fallback: LocalPrinterConnectionType): LocalPrinterConnectionType {
  return value === 'usb' || value === 'lan' ? value : fallback
}

function normalizeProfile(value: unknown, fallback: LocalPrinterProfile): LocalPrinterProfile {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<LocalPrinterProfile>
    : {}

  return {
    name: String(record.name ?? fallback.name).trim() || fallback.name,
    paperSize: normalizePaperSize(record.paperSize, fallback.paperSize),
    connectionType: normalizeConnectionType(record.connectionType, fallback.connectionType),
    ip: String(record.ip ?? fallback.ip).trim() || fallback.ip,
    port: String(record.port ?? fallback.port).trim() || fallback.port,
    usbName: String(record.usbName ?? fallback.usbName ?? '').trim(),
    enabled: record.enabled !== false,
  }
}

function mergePrinterSettings(value: unknown): LocalPrinterSettings {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<Record<LocalPrinterType, LocalPrinterProfile>>
    : {}

  return {
    receipt: normalizeProfile(record.receipt, DEFAULT_LOCAL_PRINTER_SETTINGS.receipt),
    label: normalizeProfile(record.label, DEFAULT_LOCAL_PRINTER_SETTINGS.label),
  }
}

export function loadLocalPrinterSettings(): LocalPrinterSettings {
  if (typeof window === 'undefined') return DEFAULT_LOCAL_PRINTER_SETTINGS

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY)
    if (!rawValue) return DEFAULT_LOCAL_PRINTER_SETTINGS
    return mergePrinterSettings(JSON.parse(rawValue) as unknown)
  } catch {
    return DEFAULT_LOCAL_PRINTER_SETTINGS
  }
}

export function persistLocalPrinterSettings(settings: LocalPrinterSettings) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(mergePrinterSettings(settings)))
}

export function saveLocalPrinterProfile(type: LocalPrinterType, profile: LocalPrinterProfile) {
  const nextSettings = loadLocalPrinterSettings()
  nextSettings[type] = normalizeProfile(profile, DEFAULT_LOCAL_PRINTER_SETTINGS[type])
  persistLocalPrinterSettings(nextSettings)
}

export function isBridgePrintingEnabled(type: LocalPrinterType) {
  return loadLocalPrinterSettings()[type].enabled
}

function buildBridgeUrl(pathname: string, type: LocalPrinterType) {
  const url = new URL(pathname, LOCAL_PRINTER_BRIDGE_ORIGIN)
  url.searchParams.set('type', type)
  return url.toString()
}

async function callBridge(pathname: string, type: LocalPrinterType, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(buildBridgeUrl(pathname, type), {
    ...init,
    headers,
  })
  const payload = await response.json() as BridgePrinterResponse
  if (!response.ok) {
    throw new Error(payload.message || 'Không kết nối được printer bridge')
  }
  return payload
}

export function buildFallbackPrintUrl(orderId: string, type: LocalPrinterType, options?: { autoprint?: boolean }) {
  const settings = loadLocalPrinterSettings()
  return buildReceiptPrintUrl(orderId, {
    autoprint: options?.autoprint ?? true,
    paperSize: settings[type].paperSize,
  })
}

export function openFallbackPrintWindow(orderId: string, type: LocalPrinterType, options?: { autoprint?: boolean }) {
  if (typeof window === 'undefined') return
  window.open(buildFallbackPrintUrl(orderId, type, options), '_blank', 'noopener,noreferrer,width=430,height=900')
}

export async function getBridgePrinterConfig(type: LocalPrinterType) {
  return callBridge('/printer-config', type)
}

export async function setBridgePrinterConfig(type: LocalPrinterType, payload: { connectionType: LocalPrinterConnectionType; ip: string; port: number; usbName: string }) {
  return callBridge('/set-printer', type, {
    method: 'POST',
    body: JSON.stringify({ type, ...payload }),
  })
}

export async function listWindowsPrinters(): Promise<string[]> {
  try {
    const response = await fetch(`${LOCAL_PRINTER_BRIDGE_ORIGIN}/printer-list`, {
      signal: AbortSignal.timeout(8000),
    })
    const data = await response.json() as BridgePrinterResponse
    return Array.isArray(data.printers) ? data.printers : []
  } catch {
    return []
  }
}

export async function discoverBridgePrinters(type: LocalPrinterType) {
  return callBridge('/printer-discover', type, {
    method: 'POST',
    body: JSON.stringify({ type }),
  })
}

export async function checkBridgePrinter(type: LocalPrinterType) {
  return callBridge('/printer-check', type)
}

export async function testBridgePrinter(type: LocalPrinterType) {
  return callBridge('/printer-test', type, {
    method: 'POST',
    body: JSON.stringify({ type }),
  })
}

export async function tryBridgePrintOrder(orderId: string, type: LocalPrinterType) {
  const orderResponse = await fetch(`/api/orders/${orderId}`)
  if (!orderResponse.ok) {
    throw new Error('Không tải được dữ liệu đơn hàng để in')
  }

  const order = await orderResponse.json() as Record<string, unknown>
  const payload = await callBridge('/print-order', type, {
    method: 'POST',
    body: JSON.stringify({ type, order }),
  })

  return Boolean(payload.ok)
}

export async function printOrderWithFallback(orderId: string, type: LocalPrinterType, options?: { autoprint?: boolean; allowBrowserFallback?: boolean }) {
  if (isBridgePrintingEnabled(type)) {
    try {
      const printed = await tryBridgePrintOrder(orderId, type)
      if (printed) return true
    } catch {
      // Fall back to browser print below.
    }
  }

  if (options?.allowBrowserFallback === false) return false
  openFallbackPrintWindow(orderId, type, { autoprint: options?.autoprint })
  return true
}