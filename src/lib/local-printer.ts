'use client'

import { buildDemoPrintTemplateContext, buildLabelUnitTemplateData, buildPrintTemplateContext, getDefaultTemplateContent, getTemplateTypeForPaperSize, renderPrintTemplateHtml, renderPrintTemplateText, renderTemplateTextAsHtml } from '@/lib/print-template'
import { buildReceiptPrintUrl } from '@/lib/order-alerts'
import type { BillTemplate, Order } from '@/types'

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

// Build a complete self-contained HTML page for thermal printing
// NOTE: No external font links — bridge Playwright renders offline; use system fonts
// On Windows, Consolas/Arial/Tahoma all support Vietnamese Unicode properly
function buildThermalHtmlPage(renderedContent: string, paperWidth: '80mm' | '58mm' | 'A4', type: LocalPrinterType = 'receipt'): string {
  const isLabel = type === 'label'
  // Most 58mm printers have an effective printable width around 48mm.
  // Using 54mm causes clipping and blurry raster scaling on some heads.
  // For labels: tighten to 42mm usable content width.
  // Label height (40mm) matches physical 58mm × 40mm self-adhesive label stock.
  // Each .label-sheet div = exactly 1 physical sticker; content fills the full sticker height.
  const wrapWidth = paperWidth === '58mm' ? (isLabel ? '46mm' : '42mm') : paperWidth === 'A4' ? '190mm' : '72mm'
  const fontFamily = isLabel
    ? "Tahoma,Arial,'Segoe UI',sans-serif"
    : "'Courier New',Consolas,'Lucida Console',monospace"
  // NOTE: No @page rule here — Playwright uses screenshot (not print), so @page is irrelevant.
  // html/body height must be fit-content so scrollHeight = actual content height (not viewport 4000px).
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><title>Print</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff!important;color:#000;height:fit-content;min-height:0;color-scheme:light}
body{width:${paperWidth};${isLabel ? 'padding-left:3mm;' : ''}font-family:${fontFamily}}
  .receipt-wrap{width:${wrapWidth};margin:0;padding:${isLabel ? '0 0.5mm 0 0' : '2mm 2mm 6mm'}}
  .receipt-template{font-family:${fontFamily};font-size:${isLabel ? '4mm' : '4.2mm'};line-height:${isLabel ? '1.25' : '1.35'};white-space:normal}
.tpl-line{white-space:pre-wrap;word-break:break-word;margin:0}
.tpl-empty{height:1.35em;margin:0}
.tpl-center{text-align:center}
.tpl-strong{font-weight:700;letter-spacing:.01em}
.tpl-slot{text-align:center;font-size:${isLabel ? '5mm' : '4.6mm'};font-weight:700;line-height:1.1}
.tpl-divider{border:none;border-top:.35mm dashed #000;margin:1.5mm 0}
.tpl-indent{padding-left:3mm}
${isLabel ? '.receipt-template,.tpl-line,.tpl-slot{background:transparent!important;color:#000!important;font-weight:600;letter-spacing:0;font-synthesis:none;margin:0;padding:0;forced-color-adjust:none!important}.label-sheet{background:#fff!important;width:100%;min-height:26mm;margin:0;padding:2mm 0 1mm;display:block;break-inside:avoid;page-break-inside:avoid;forced-color-adjust:none!important}.receipt-template{margin:0;padding:0}.label-sheet .tpl-empty{display:none}.label-sheet .tpl-line:not(.tpl-slot){font-size:3mm;font-weight:700;line-height:1.25;margin:0 0 0.4mm}.label-sheet .tpl-slot{font-size:4.5mm;font-weight:700;text-align:center;line-height:1.2;margin:0.4mm 0}' : ''}
</style></head><body>
<div class="receipt-wrap receipt-template">${renderedContent}</div>
</body></html>`
}

// Fetch order + active template and return the full thermal HTML (same as what bridge prints).
// Used for the inline preview panel in OrderDetailView.
export async function buildOrderPrintHtml(orderId: string, type: LocalPrinterType): Promise<{ html: string; paperSize: '80mm' | '58mm'; order: Order }> {
  const orderRes = await fetch(`/api/orders/${orderId}`, { signal: AbortSignal.timeout(10000) })
  if (!orderRes.ok) throw new Error('Không tải được đơn hàng')
  const order = await orderRes.json() as Order

  const paperSize: '80mm' | '58mm' = type === 'label' ? '58mm' : '80mm'
  const templateType = getTemplateTypeForPaperSize(paperSize)
  let templateContent = ''
  try {
    const tplRes = await fetch('/api/bill-templates', { signal: AbortSignal.timeout(8000) })
    if (tplRes.ok) {
      const templates = await tplRes.json() as BillTemplate[]
      const active = templates.find((t) => t.isActive && t.type === templateType && t.size === paperSize)
        ?? templates.find((t) => t.isActive && t.type === templateType)
      templateContent = active?.templateContent?.trim() ?? ''
    }
  } catch { /* fall through to default template */ }
  if (!templateContent || isTemplateBroken(templateContent)) templateContent = getDefaultTemplateContent(templateType)

  const context = buildPrintTemplateContext(order, {
    BillName: type === 'label' ? 'TEM IN BẾP' : 'PHIẾU LÀM MÓN',
  })
  const items = order.items ?? []
  // Detect broken custom templates (unresolved {{.Var}} tokens) and fall back to built-in default
  let textContent = renderPrintTemplateText(templateContent, context, items)
  if (/\{\{[\s-]*\./.test(textContent)) {
    templateContent = getDefaultTemplateContent(templateType)
    textContent = renderPrintTemplateText(templateContent, context, items)
  }
  const renderedContent = renderTemplateTextAsHtml(textContent)
  const html = buildThermalHtmlPage(renderedContent, paperSize, type)
  return { html, paperSize, order }
}

// Print an order using the active HTML bill template via the bridge's Playwright renderer.
// This produces output that EXACTLY matches the template preview in the browser.
export async function printOrderWithHtmlTemplate(orderId: string, type: LocalPrinterType): Promise<boolean> {
  // 1. Fetch order data
  const orderRes = await fetch(`/api/orders/${orderId}`, { signal: AbortSignal.timeout(10000) })
  if (!orderRes.ok) throw new Error('Không tải được đơn hàng')
  const order = await orderRes.json() as Order

  // 2. Fetch active bill template
  const paperSize: '80mm' | '58mm' = type === 'label' ? '58mm' : '80mm'
  const templateType = getTemplateTypeForPaperSize(paperSize)
  let templateContent = ''
  try {
    const tplRes = await fetch('/api/bill-templates', { signal: AbortSignal.timeout(8000) })
    if (tplRes.ok) {
      const templates = await tplRes.json() as BillTemplate[]
      const active = templates.find((t) => t.isActive && t.type === templateType && t.size === paperSize)
        ?? templates.find((t) => t.isActive && t.type === templateType)
      templateContent = active?.templateContent?.trim() ?? ''
    }
  } catch { /* fall through to default template */ }
  if (!templateContent || isTemplateBroken(templateContent)) templateContent = getDefaultTemplateContent(templateType)

  // 3. Render HTML — for labels each item becomes a separate .label-sheet div
  //    so the scraper screenshots them individually (correct size, white bg, no scaling blur)
  let renderedContent: string
  if (type === 'label') {
    const items = order.items ?? []
    renderedContent = items.map((item) => {
      const slotTotal = Math.max(1, item.quantity)
      const { context: labelCtx, items: labelItems } = buildLabelUnitTemplateData(order, item, 1, slotTotal)
      return `<div class="label-sheet">${renderPrintTemplateHtml(templateContent, labelCtx, labelItems)}</div>`
    }).join('\n')
  } else {
    const context = buildPrintTemplateContext(order, { BillName: 'PHIẾU LÀM MÓN' })
    renderedContent = renderPrintTemplateHtml(templateContent, context, order.items ?? [])
  }
  const fullHtml = buildThermalHtmlPage(renderedContent, paperSize, type)

  // 4. POST to bridge — bridge uses Playwright to screenshot → ESC/POS raster → LAN/USB
  const res = await fetch(`${LOCAL_PRINTER_BRIDGE_ORIGIN}/print-template-html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html: fullHtml, paperWidth: paperSize, type }),
    signal: AbortSignal.timeout(35000), // Playwright rendering can take several seconds
  })
  const data = await res.json() as { ok?: boolean; message?: string }
  if (!data.ok) throw new Error(data.message ?? 'Máy in không phản hồi')
  return true
}

export async function printOrderWithFallback(orderId: string, type: LocalPrinterType, options?: { autoprint?: boolean }): Promise<boolean> {
  try {
    return await printOrderWithHtmlTemplate(orderId, type)
  } catch {
    openFallbackPrintWindow(orderId, type, { autoprint: options?.autoprint ?? true })
    return true
  }
}

// Send the currently-editing template to the real printer via bridge using demo data.
// Used by the bill-templates editor page to verify layout before going live.
export async function printDemoTemplateWithBridge(templateContent: string, type: LocalPrinterType, size?: '80mm' | '58mm'): Promise<boolean> {
  const paperSize: '80mm' | '58mm' = size ?? (type === 'label' ? '58mm' : '80mm')
  const templateType = getTemplateTypeForPaperSize(paperSize)
  const context = buildDemoPrintTemplateContext(templateType)
  const content = templateContent.trim() || getDefaultTemplateContent(templateType)
  // Demo items matching buildDemoPrintTemplateContext's demoOrder.items
  const demoItems = [
    { name: 'Trà sữa trân châu', quantity: 2, price: 35_000, total: 70_000, note: 'Ít đường' },
    { name: 'Bánh mì gà xé', quantity: 1, price: 45_000, total: 45_000 },
    { name: 'Cơm sườn trứng', quantity: 1, price: 70_000, total: 70_000, note: 'Thêm nước mắm' },
  ]
  const renderedContent = type === 'label'
    ? (() => {
        const { context: labelContext, items: labelItems } = buildLabelUnitTemplateData({
          source: 'grab',
          externalOrderId: '00123456789-C76DEMO',
          shortId: 'ORD-DEMO',
          brandName: 'BPOS Demo Hub',
          hubName: 'Chi nhánh Q1',
          customerName: 'Nguyễn Văn A',
          customerPhone: '+84901234567',
          driverInfo: { name: 'Tài xế Demo', phone: '+84987654321' },
          deliveryInfo: { address: '123 Lê Lợi, Q1, TP.HCM', note: 'Không hành', estimatedTime: new Date(Date.now() + 30 * 60_000).toISOString() },
          note: 'Dán lên ly',
          subtotal: 185_000,
          discount: 15_000,
          total: 170_000,
          platformFee: 28_000,
          placedAt: new Date().toISOString(),
          deliveredAt: new Date(Date.now() + 25 * 60_000).toISOString(),
          items: demoItems,
        }, demoItems[0], 1, 3)
        return renderPrintTemplateHtml(content, labelContext, labelItems)
      })()
    : renderPrintTemplateHtml(content, context, demoItems)
  const fullHtml = buildThermalHtmlPage(renderedContent, paperSize, type)
  const res = await fetch(`${LOCAL_PRINTER_BRIDGE_ORIGIN}/print-template-html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html: fullHtml, paperWidth: paperSize, type }),
    signal: AbortSignal.timeout(35000),
  })
  const data = await res.json() as { ok?: boolean; message?: string }
  if (!data.ok) throw new Error(data.message ?? 'Máy in không phản hồi')
  return true
}

// Detect broken templates: item-level vars present but no {{range .Items}} block.
// These templates cannot render items correctly and should fall back to the default.
function isTemplateBroken(content: string): boolean {
  const hasItemVars = /\{\{\s*\.(?:Name|Qty|Quantity|Price|FinalPrice|Note|NoteLine|OptionsText)\s*\}\}/.test(content)
  const hasRange = /\{\{\s*range\s+\.Items\s*\}\}/.test(content)
  return hasItemVars && !hasRange
}

// Print one 58mm USB label per item×quantity unit.
// qty=2 → 2 labels: 1/2, 2/2. qty=3 → 3 labels: 1/3, 2/3, 3/3.
export async function printItemLabels(orderId: string): Promise<boolean> {
  const orderRes = await fetch(`/api/orders/${orderId}`, { signal: AbortSignal.timeout(10000) })
  if (!orderRes.ok) throw new Error('Không tải được đơn hàng')
  const order = await orderRes.json() as Order

  const items = (order.items ?? [])
    .filter((item) => Number(item.quantity ?? 0) > 0)
    .filter((item) => String(item.name ?? '').trim().length > 0)
  if (items.length === 0) return false

  let templateContent = ''
  try {
    const tplRes = await fetch('/api/bill-templates', { signal: AbortSignal.timeout(8000) })
    if (tplRes.ok) {
      const templates = await tplRes.json() as BillTemplate[]
      const active = templates.find((t) => t.isActive && t.type === 'label' && t.size === '58mm')
        ?? templates.find((t) => t.isActive && t.type === 'label')
      templateContent = active?.templateContent?.trim() ?? ''
    }
  } catch { /* fall through to default template */ }
  if (!templateContent || isTemplateBroken(templateContent)) templateContent = getDefaultTemplateContent('label')

  const labelBlocks: string[] = []
  for (const item of items) {
    const total = Math.max(1, item.quantity || 1)
    const printCount = Math.min(total, 20) // safety cap
    for (let slot = 1; slot <= printCount; slot++) {
      const { context, items: labelItems } = buildLabelUnitTemplateData(order, item, slot, total)
      labelBlocks.push(`<div class="label-sheet">${renderPrintTemplateHtml(templateContent, context, labelItems)}</div>`)
    }
  }

  if (!labelBlocks.length) return false

  const html = buildThermalHtmlPage(labelBlocks.join(''), '58mm', 'label')
  try {
    const res = await fetch(`${LOCAL_PRINTER_BRIDGE_ORIGIN}/print-template-html`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, paperWidth: '58mm', type: 'label' }),
      signal: AbortSignal.timeout(35000),
    })
    const data = await res.json() as { ok?: boolean; message?: string }
    return Boolean(data.ok)
  } catch {
    return false
  }
}
