import { CHANNEL_SOURCE_LABEL, formatCurrency, formatDate } from '@/lib/utils'
import type { BillSize, BillType, Order, OrderItem } from '@/types'

type TemplateContext = Record<string, string>
type NamedRef = string | { _id?: string; name?: string } | null | undefined
type PrintableTemplateOrder = Pick<Order, 'source' | 'externalOrderId' | 'shortId' | 'brandName' | 'hubName' | 'customerName' | 'customerPhone' | 'driverInfo' | 'deliveryInfo' | 'note' | 'subtotal' | 'discount' | 'total' | 'platformFee' | 'placedAt' | 'deliveredAt' | 'items'> & {
  brandId?: NamedRef
  hubId?: NamedRef
}

export type EditablePrintTemplateType = Extract<BillType, 'receipt' | 'delivery' | 'label'>

export const PRINT_TEMPLATE_VARIABLES: Array<{ token: string; label: string; example: string }> = [
  { token: '{{.BillName}}', label: 'Tên phiếu', example: 'PHIẾU LÀM MÓN' },
  { token: '{{.SiteName}}', label: 'Tên cửa hàng', example: 'BPOS Demo Hub' },
  { token: '{{.OrderSource}}', label: 'Nguồn đơn', example: 'GrabFood' },
  { token: '{{.ShortOrderID}}', label: 'Mã đơn rút gọn', example: 'GF-001' },
  { token: '{{.CurrentTime}}', label: 'Thời gian hiện tại', example: '09/05/2026 18:30' },
  { token: '{{.OrderCreatedAt}}', label: 'Thời gian đặt đơn', example: '09/05/2026 18:05' },
  { token: '{{.OrderDeliveryAt}}', label: 'Thời gian giao dự kiến', example: '09/05/2026 18:45' },
  { token: '{{.CustomerName}}', label: 'Tên khách', example: 'Nguyễn Văn A' },
  { token: '{{.CustomerPhone}}', label: 'SĐT khách', example: '+84901234567' },
  { token: '{{.DriverName}}', label: 'Tên tài xế', example: 'Tài xế BE' },
  { token: '{{.DriverPhone}}', label: 'SĐT tài xế', example: '+84987654321' },
  { token: '{{.DeliveryAddress}}', label: 'Địa chỉ giao', example: '123 Lê Lợi, Q1, TP.HCM' },
  { token: '{{.OrderNote}}', label: 'Ghi chú đơn', example: 'Không hành' },
  { token: '{{.Subtotal}}', label: 'Tạm tính', example: '185.000 đ' },
  { token: '{{.Discount}}', label: 'Giảm giá', example: '15.000 đ' },
  { token: '{{.Total}}', label: 'Tổng tiền', example: '170.000 đ' },
  { token: '{{.PlatformFee}}', label: 'Phí sàn', example: '28.000 đ' },
  { token: '{{.ItemLines}}', label: 'Danh sách món dạng text', example: 'Trà sữa x2 70.000 đ' },
]

const DEFAULT_TEMPLATES: Record<EditablePrintTemplateType, string> = {
  receipt: [
    '===== {{.BillName}} =====',
    '{{.SiteName}}',
    'Kênh: {{.OrderSource}}',
    'Mã đơn: {{.ShortOrderID}}',
    'Đặt lúc: {{.OrderCreatedAt}}',
    '----------------------------',
    'Khách: {{.CustomerName}}',
    'SĐT: {{.CustomerPhone}}',
    'Địa chỉ: {{.DeliveryAddress}}',
    '----------------------------',
    '{{range .Items}}',
    '{{.Name}} x{{.Qty}}',
    '  {{.Total}}',
    '{{.NoteLine}}',
    '{{end}}',
    '----------------------------',
    'Tạm tính: {{.Subtotal}}',
    'Giảm giá: {{.Discount}}',
    'Tổng tiền: {{.Total}}',
    'Phí sàn: {{.PlatformFee}}',
    '============================',
  ].join('\n'),
  delivery: [
    '===== PHIẾU GIAO HÀNG =====',
    '{{.SiteName}}',
    'Mã đơn: {{.ShortOrderID}}',
    'Kênh: {{.OrderSource}}',
    'Giao dự kiến: {{.OrderDeliveryAt}}',
    'Khách: {{.CustomerName}}',
    'SĐT: {{.CustomerPhone}}',
    'Địa chỉ: {{.DeliveryAddress}}',
    'Tài xế: {{.DriverName}}',
    'SĐT tài xế: {{.DriverPhone}}',
    '----------------------------',
    '{{.ItemLines}}',
  ].join('\n'),
  label: [
    '===== TEM ĐƠN HÀNG =====',
    '{{.ShortOrderID}}',
    '{{.CustomerName}}',
    '{{.OrderSource}}',
    '----------------------------',
    '{{range .Items}}',
    '{{.Name}} x{{.Qty}}',
    '{{.NoteLine}}',
    '{{end}}',
    '----------------------------',
    '{{.OrderNote}}',
  ].join('\n'),
}

function getNamedValue(value: string | { _id?: string; name?: string } | null | undefined, fallback = '') {
  if (typeof value === 'string') return fallback || value
  if (value && typeof value === 'object' && typeof value.name === 'string') return value.name
  return fallback
}

function formatDateTime(value?: string) {
  if (!value) return ''

  try {
    return formatDate(value, 'dd/MM/yyyy HH:mm')
  } catch {
    return value
  }
}

function getReceiptCode(order: Pick<Order, 'source' | 'externalOrderId' | 'shortId'>) {
  const prefixMap: Record<string, string> = {
    grab: 'GF',
    be: 'BE',
    shopee: 'SP',
    xanh_sm: 'XS',
    internal: 'NB',
    other: 'OD',
  }

  const prefix = prefixMap[order.source] ?? 'OD'
  const digits = String(order.externalOrderId ?? order.shortId ?? '').replace(/\D/g, '')
  const suffix = digits.slice(-3) || order.shortId.replace(/[^A-Z0-9]/gi, '').slice(-3) || '001'
  return `${prefix}-${suffix}`
}

function getItemTotal(item: OrderItem) {
  return item.total > 0 ? item.total : item.quantity * item.price
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderItemBlock(block: string, item: OrderItem) {
  const noteLine = item.note ? `  Ghi chú: ${item.note}` : ''
  const replacements: TemplateContext = {
    Name: item.name,
    Qty: String(item.quantity),
    Quantity: String(item.quantity),
    Price: formatCurrency(item.price),
    Total: formatCurrency(getItemTotal(item)),
    Note: item.note ?? '',
    NoteLine: noteLine,
  }

  // Use function replacer to avoid special $ sequences in values being misinterpreted
  const rendered = Object.entries(replacements).reduce((output, [key, value]) => {
    return output.replace(new RegExp(`\\{\\{\\s*\\.${key}\\s*\\}\\}`, 'g'), () => value)
  }, block)

  // If noteLine is empty, remove lines that became blank after NoteLine substitution
  if (!noteLine) {
    return rendered.split('\n').filter((l) => l.trim() !== '').join('\n')
  }
  return rendered
}

export function getDefaultTemplateContent(type: EditablePrintTemplateType) {
  return DEFAULT_TEMPLATES[type]
}

export function getTemplateTypeForPaperSize(size: BillSize): EditablePrintTemplateType {
  if (size === '58mm') return 'label'
  return 'receipt'
}

export function buildPrintTemplateContext(order: PrintableTemplateOrder, overrides?: Partial<TemplateContext>) {
  const safeItems = Array.isArray(order.items) ? order.items : []
  const itemLines = safeItems.length
    ? safeItems.map((item) => `${item.name} x${item.quantity} ${formatCurrency(getItemTotal(item))}${item.note ? ` (${item.note})` : ''}`).join('\n')
    : 'Chưa có món nào'

  return {
    BillName: 'PHIẾU LÀM MÓN',
    SiteName: order.brandName || getNamedValue(order.brandId, 'BPOS Portal'),
    HubName: order.hubName || getNamedValue(order.hubId),
    OrderSource: CHANNEL_SOURCE_LABEL[order.source] || order.source,
    ShortOrderID: getReceiptCode(order),
    CurrentTime: formatDateTime(new Date().toISOString()),
    OrderCreatedAt: formatDateTime(order.placedAt),
    OrderDeliveryAt: formatDateTime(order.deliveredAt || order.deliveryInfo?.estimatedTime),
    CustomerName: order.customerName || 'Khách hàng',
    CustomerPhone: order.customerPhone || '',
    DriverName: order.driverInfo?.name || '',
    DriverPhone: order.driverInfo?.phone || '',
    DeliveryAddress: order.deliveryInfo?.address || '',
    OrderNote: order.note || order.deliveryInfo?.note || '',
    Subtotal: formatCurrency(order.subtotal),
    Discount: formatCurrency(order.discount),
    Total: formatCurrency(order.total),
    PlatformFee: formatCurrency(order.platformFee ?? 0),
    ItemLines: itemLines,
    ...(overrides ?? {}),
  }
}

export function buildDemoPrintTemplateContext(type: EditablePrintTemplateType = 'receipt') {
  const demoOrder: PrintableTemplateOrder = {
    source: 'grab',
    externalOrderId: '00123456789-C76DEMO',
    shortId: 'ORD-DEMO',
    brandName: 'BPOS Demo Hub',
    brandId: '',
    hubName: 'Chi nhánh Q1',
    hubId: '',
    customerName: 'Nguyễn Văn A',
    customerPhone: '+84901234567',
    driverInfo: { name: 'Tài xế Demo', phone: '+84987654321' },
    deliveryInfo: { address: '123 Lê Lợi, Q1, TP.HCM', note: 'Không hành', estimatedTime: new Date(Date.now() + 30 * 60_000).toISOString() },
    note: type === 'label' ? 'TEM DÙNG LÊN LY 1' : 'Thêm đá riêng',
    subtotal: 185_000,
    discount: 15_000,
    total: 170_000,
    platformFee: 28_000,
    placedAt: new Date().toISOString(),
    deliveredAt: new Date(Date.now() + 25 * 60_000).toISOString(),
    items: [
      { name: 'Trà sữa trân châu', quantity: 2, price: 35_000, total: 70_000, note: 'Ít đường' },
      { name: 'Bánh mì gà xé', quantity: 1, price: 45_000, total: 45_000 },
      { name: 'Cơm sườn trứng', quantity: 1, price: 70_000, total: 70_000, note: 'Thêm nước mắm' },
    ],
  }

  return buildPrintTemplateContext(demoOrder, {
    BillName: type === 'label' ? 'TEM IN BẾP' : type === 'delivery' ? 'PHIẾU GIAO HÀNG' : 'PHIẾU LÀM MÓN',
  })
}

export function renderPrintTemplateText(content: string, context: TemplateContext, items: OrderItem[]) {
  const source = content.trim() || DEFAULT_TEMPLATES.receipt
  const safeItems = Array.isArray(items) ? items : []

  const withItems = source.replace(/\{\{\s*range\s+\.Items\s*\}\}([\s\S]*?)\{\{\s*end\s*\}\}/g, (_match, block: string) => {
    if (!safeItems.length) return ''
    return safeItems.map((item) => renderItemBlock(block, item)).join('\n')
  })

  // Use function replacer to safely handle $ in context values
  return Object.entries(context).reduce((output, [key, value]) => {
    return output.replace(new RegExp(`\\{\\{\\s*\\.${key}\\s*\\}\\}`, 'g'), () => value)
  }, withItems)
}

export function renderPrintTemplateHtml(content: string, context: TemplateContext, items: OrderItem[]) {
  return renderTemplateTextAsHtml(renderPrintTemplateText(content, context, items))
}

export function renderTemplateTextAsHtml(content: string) {
  const lines = content.split('\n')
  // Trim trailing empty lines to prevent excess blank space at bottom of print
  while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop()
  return lines.map((line) => {
    const trimmed = line.trim()
    if (!trimmed) return '<div class="tpl-line tpl-empty">&nbsp;</div>'
    if (/^={3,}/.test(trimmed)) return `<div class="tpl-line tpl-center tpl-strong">${escapeHtml(trimmed)}</div>`
    if (/^-{3,}/.test(trimmed)) return '<div class="tpl-line tpl-divider"></div>'
    if (/^\s{2,}/.test(line)) return `<div class="tpl-line tpl-indent">${escapeHtml(trimmed)}</div>`
    return `<div class="tpl-line">${escapeHtml(trimmed)}</div>`
  }).join('')
}