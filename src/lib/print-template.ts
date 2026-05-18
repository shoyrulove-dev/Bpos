import { CHANNEL_SOURCE_LABEL, formatCurrency, formatDate } from '@/lib/utils'
import type { BillSize, BillType, Order, OrderItem } from '@/types'

type TemplateContext = Record<string, string>
type NamedRef = string | { _id?: string; name?: string } | null | undefined
type PrintableTemplateOrder = Pick<Order, 'source' | 'externalOrderId' | 'shortId' | 'rawPayload' | 'brandName' | 'hubName' | 'customerName' | 'customerPhone' | 'driverInfo' | 'deliveryInfo' | 'note' | 'subtotal' | 'discount' | 'total' | 'platformFee' | 'placedAt' | 'deliveredAt' | 'items'> & {
  brandId?: NamedRef
  hubId?: NamedRef
}

export type EditablePrintTemplateType = Extract<BillType, 'receipt' | 'delivery' | 'label'>

export const PRINT_TEMPLATE_VARIABLES: Array<{ token: string; label: string; example: string }> = [
  // ---- Thông tin phiếu / đơn ----
  { token: '{{.BillName}}',        label: 'Tên phiếu',                        example: 'PHIẾU LÀM MÓN' },
  { token: '{{.SiteName}}',        label: 'Tên cửa hàng / thương hiệu',       example: 'BPOS Demo' },
  { token: '{{.HubName}}',         label: 'Tên chi nhánh',                    example: 'Chi nhánh Q1' },
  { token: '{{.OrderSource}}',     label: 'Kênh đặt đơn',                     example: 'GrabFood' },
  { token: '{{.DisplayID}}',       label: 'Mã đơn của nền tảng',              example: 'GF-723' },
  { token: '{{.ShortOrderID}}',    label: 'Mã đơn rút gọn (DisplayID hoặc shortId)', example: 'GF-723' },
  { token: '{{.BposOrderID}}',     label: 'Mã BPOS nội bộ',                   example: 'LWB4AX06' },
  { token: '{{.ExternalOrderID}}', label: 'Mã đơn đầy đủ từ nền tảng',        example: '00123456789-C76DEMO' },
  { token: '{{.CurrentTime}}',     label: 'Thời gian in',                     example: '16/05/2026 18:30' },
  { token: '{{.OrderCreatedAt}}',  label: 'Thời gian đặt đơn',               example: '16/05/2026 18:05' },
  { token: '{{.OrderDeliveryAt}}', label: 'Dự kiến giao / giao xong',         example: '16/05/2026 18:45' },
  // ---- Khách & tài xế ----
  { token: '{{.CustomerName}}',    label: 'Tên khách',                        example: 'Nguyễn Văn A' },
  { token: '{{.CustomerPhone}}',   label: 'SĐT khách',                        example: '+84901234567' },
  { token: '{{.DriverName}}',      label: 'Tên tài xế',                       example: 'Tài xế BE' },
  { token: '{{.DriverPhone}}',     label: 'SĐT tài xế',                       example: '+84987654321' },
  { token: '{{.DeliveryAddress}}', label: 'Địa chỉ giao',                     example: '123 Lê Lợi, Q1' },
  { token: '{{.OrderNote}}',       label: 'Ghi chú đơn',                      example: 'Không hành' },
  // ---- Tính tiền ----
  { token: '{{.Subtotal}}',            label: 'Tạm tính',                   example: '185.000 đ' },
  { token: '{{.Discount}}',            label: 'Giảm giá',                   example: '15.000 đ' },
  { token: '{{.Total}}',               label: 'Tổng tiền',                  example: '170.000 đ' },
  { token: '{{.PlatformFee}}',         label: 'Phí sàn',                    example: '28.000 đ' },
  { token: '{{.OrderSubTotal}}',       label: 'Tạm tính (alias)',            example: '185.000 đ' },
  { token: '{{.OrderTotalDiscount}}',  label: 'Giảm giá (alias)',            example: '15.000 đ' },
  { token: '{{.OrderTotalPaid}}',      label: 'Thành tiền (alias)',          example: '170.000 đ' },
  // ---- Món ăn (tóm tắt) ----
  { token: '{{.ItemLines}}',       label: 'Tất cả món dạng text 1 dòng',      example: 'Trà sữa x2 70.000 đ' },
  { token: '{{.ItemCount}}',       label: 'Số loại món',                      example: '3' },
  { token: '{{.Slot}}',            label: 'Vị trí tem hiện tại',              example: '2' },
  { token: '{{.SlotTotal}}',       label: 'Tổng số tem của món',              example: '3' },
  { token: '{{.SlotLabel}}',       label: 'Nhãn vị trí tem',                  example: '2/3' },
  // ---- Trong {{range .Items}} ----
  { token: '{{.Name}}',         label: 'Tên món',                             example: 'Trà sữa trân châu' },
  { token: '{{.Qty}}',          label: 'Số lượng (rút gọn)',                  example: '2' },
  { token: '{{.Quantity}}',     label: 'Số lượng',                            example: '2' },
  { token: '{{.Price}}',        label: 'Đơn giá món',                         example: '35.000 đ' },
  { token: '{{.FinalPrice}}',   label: 'Thành tiền món (sốlượng × giá)',      example: '70.000 đ' },
  { token: '{{.Total}}',        label: 'Thành tiền món (alias FinalPrice)',    example: '70.000 đ' },
  { token: '{{.DiscountPrice}}', label: 'Giá sau giảm món',                   example: '35.000 đ' },
  { token: '{{.Note}}',         label: 'Ghi chú món (thuần)',                 example: 'ít đường' },
  { token: '{{.NoteLine}}',     label: 'Ghi chú món (kèm prefix)',            example: '  Ghi chú: ít đường' },
  { token: '{{.Description}}',  label: 'Mô tả món (nếu có)',                  example: '' },
  { token: '{{.OptionsText}}',  label: 'Tuỳ chọn món (nếu có)',               example: '' },
]

const DEFAULT_TEMPLATES: Record<EditablePrintTemplateType, string> = {
  // --- 80mm receipt: mẫu in đơn tự động (máy LAN) ---
  receipt: [
    '===== {{.BillName}} =====',
    '{{.SiteName}}',
    '{{if .HubName}}{{.HubName}}{{end}}',
    'Kênh: {{.OrderSource}}',
    'Mã: {{.DisplayID}}',
    'In lúc: {{.CurrentTime}}',
    'Đặt lúc: {{.OrderCreatedAt}}',
    '----------------------------',
    'Khách: {{.CustomerName}}',
    '{{if .CustomerPhone}}SĐT: {{.CustomerPhone}}{{end}}',
    '{{if .DriverName}}Tài xế: {{.DriverName}}{{end}}',
    '{{if .DeliveryAddress}}Địa chỉ: {{.DeliveryAddress}}{{end}}',
    '----------------------------',
    '{{range .Items}}',
    '{{.Name}}',
    '  x{{.Qty}}  {{.FinalPrice}}',
    '{{if .Note}}  * {{.Note}}{{end}}',
    '{{end}}',
    '----------------------------',
    'Tạm tính: {{.Subtotal}}',
    'Giảm giá: {{.Discount}}',
    'Tổng tiền: {{.Total}}',
    '{{if .OrderNote}}-----------------------------',
    'Ghi chú: {{.OrderNote}}{{end}}',
    '============================',
    'ĐƠN HÀNG ĐÃ HOÀN THÀNH',
    'Cảm ơn quý khách!',
    '============================',
  ].join('\n'),

  // --- delivery slip ---
  delivery: [
    '===== PHIẾU GIAO HÀNG =====',
    '{{.SiteName}}',
    'Mã: {{.DisplayID}}   Kênh: {{.OrderSource}}',
    'Giao dự kiến: {{.OrderDeliveryAt}}',
    'Khách: {{.CustomerName}}',
    '{{if .CustomerPhone}}SĐT: {{.CustomerPhone}}{{end}}',
    '{{if .DeliveryAddress}}Địa chỉ: {{.DeliveryAddress}}{{end}}',
    '{{if .DriverName}}Tài xế: {{.DriverName}}{{end}}',
    '----------------------------',
    '{{.ItemLines}}',
    '----------------------------',
    'Tổng tiền: {{.Total}}',
  ].join('\n'),

  // --- 58mm kitchen label: mẫu tem bếp (máy USB) ---
  label: [
    '{{range .Items}}',
    '{{.Name}} (x{{.SlotTotal}})',
    '{{.SlotLabel}}',
    '{{if .Note}}* {{.Note}}{{end}}',
    '{{end}}',
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

function getReceiptCode(order: PrintableTemplateOrder) {
  // Prefer the platform's own display ID (e.g. GF-723 from Grab rawPayload.displayID)
  const displayID = String(order.rawPayload?.displayID ?? '').trim()
  if (displayID) return displayID

  // Fallback: BPOS shortId
  if (order.shortId) return order.shortId

  // Last resort: generate a short prefix+suffix from externalOrderId
  const prefixMap: Record<string, string> = {
    grab: 'GF', be: 'BE', shopee: 'SP', xanh_sm: 'XS', internal: 'NB', other: 'OD',
  }
  const prefix = prefixMap[order.source] ?? 'OD'
  const digits = String(order.externalOrderId ?? '').replace(/\D/g, '')
  const suffix = digits.slice(-4) || '0001'
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

/**
 * Strip Go template directives that our engine doesn't support:
 *   - Variable assignments: {{$var := expr}}
 *   - Complex range blocks: {{range $k, $v := map}}...{{end}} (innermost first)
 */
function stripGoTemplateDirectives(template: string): string {
  // Remove variable assignments
  let result = template.replace(/\{\{-?\s*\$\w+\s*:=.*?-?\}\}/g, '')

  // Remove complex range blocks (with $var) from innermost out
  let prev = ''
  let iterations = 0
  while (result !== prev && iterations < 10) {
    prev = result
    iterations++
    result = result.replace(
      /\{\{-?\s*range\s+\$[\s\S]*?-?\}\}(?:(?!\{\{-?\s*(?:range|end)\b)[\s\S])*?\{\{-?\s*end\s*-?\}\}/g,
      '',
    )
  }

  return result
}

/**
 * Process {{if .Var}}...{{end}} and {{if ne .A .B}}...{{end}} conditionals.
 * Handles nesting by processing innermost blocks first (iteratively).
 * Inner blocks must not contain other {{if}} or {{range}} directives.
 */
function processConditionals(template: string, context: Record<string, string>): string {
  // Pattern for "content with no nested {{if / {{range / {{end"
  const FLAT_CONTENT = '((?:(?!\\{\\{-?\\s*(?:if|range|end)\\b)[\\s\\S])*?)'

  let result = template
  let prev = ''
  let iterations = 0

  while (result !== prev && iterations < 20) {
    prev = result
    iterations++

    // {{if ne .A .B}}...{{end}}
    result = result.replace(
      new RegExp(`\\{\\{-?\\s*if\\s+ne\\s+\\.(\\w+)\\s+\\.(\\w+)\\s*-?\\}\\}${FLAT_CONTENT}\\{\\{-?\\s*end\\s*-?\\}\\}`, 'g'),
      (_m, a, b, inner) => (context[a] ?? '') !== (context[b] ?? '') ? inner : '',
    )

    // {{if .Var}}...{{end}}
    result = result.replace(
      new RegExp(`\\{\\{-?\\s*if\\s+\\.(\\w+)\\s*-?\\}\\}${FLAT_CONTENT}\\{\\{-?\\s*end\\s*-?\\}\\}`, 'g'),
      (_m, varName, inner) => (context[varName] ?? '').trim() ? inner : '',
    )
  }

  return result
}

function buildItemContext(item: OrderItem, orderCtx: TemplateContext): TemplateContext {
  const noteLine = item.note ? `  Ghi chú: ${item.note}` : ''
  return {
    // Order-level vars available inside item blocks
    ...orderCtx,
    // Item-level vars (override order vars with same name if any)
    Name: item.name,
    Qty: String(item.quantity),
    Quantity: String(item.quantity),
    Price: formatCurrency(item.price),
    DiscountPrice: formatCurrency(item.price), // same as Price (no per-item discount in current model)
    FinalPrice: formatCurrency(getItemTotal(item)),
    Total: formatCurrency(getItemTotal(item)),
    Note: item.note ?? '',
    NoteLine: noteLine,
    Description: '',  // not in OrderItem model currently
    RawOptions: '',   // not in OrderItem model currently
    OptionsText: '',  // pre-rendered options (empty for now)
  }
}

function renderItemBlock(block: string, item: OrderItem, orderCtx?: TemplateContext) {
  const context = buildItemContext(item, orderCtx ?? {})

  // Strip unsupported Go template syntax, then process conditionals
  const stripped = stripGoTemplateDirectives(block)
  const withConditionals = processConditionals(stripped, context)

  // Use function replacer to avoid special $ sequences in values being misinterpreted
  const rendered = Object.entries(context).reduce((output, [key, value]) => {
    return output.replace(new RegExp(`\\{\\{\\s*\\.${key}\\s*\\}\\}`, 'g'), () => value)
  }, withConditionals)

  // If noteLine is empty, remove lines that became blank after NoteLine substitution
  if (!context.NoteLine) {
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

  // Platform display ID (e.g. GF-723 from Grab), BPOS shortId, and full external ID
  const platformDisplayID = String(order.rawPayload?.displayID ?? '').trim()
  const shortOrderID = getReceiptCode(order)  // prefers platformDisplayID

  return {
    BillName: 'PHIẾU LÀM MÓN',
    SiteName: order.brandName || getNamedValue(order.brandId, 'BPOS Portal'),
    HubName: order.hubName || getNamedValue(order.hubId),
    OrderSource: CHANNEL_SOURCE_LABEL[order.source] || order.source,
    // Order ID variants
    ShortOrderID: shortOrderID,            // nền tảng displayID hoặc shortId (GF-723, LWB4AX06)
    DisplayID: platformDisplayID || shortOrderID,  // mã đơn của nền tảng (GF-723)
    ExternalOrderID: order.externalOrderId ?? '',  // mã đầy đủ (00160658852-C76KECNGKAU1A2)
    BposOrderID: order.shortId ?? '',              // mã BPOS nội bộ (LWB4AX06)
    // Time
    CurrentTime: formatDateTime(new Date().toISOString()),
    OrderCreatedAt: formatDateTime(order.placedAt),
    OrderDeliveryAt: formatDateTime(order.deliveredAt || order.deliveryInfo?.estimatedTime),
    // Customer / delivery
    CustomerName: order.customerName || 'Khách hàng',
    CustomerPhone: order.customerPhone || '',
    DriverName: order.driverInfo?.name || '',
    DriverPhone: order.driverInfo?.phone || '',
    DeliveryAddress: order.deliveryInfo?.address || '',
    OrderNote: order.note || order.deliveryInfo?.note || '',
    // Totals
    Subtotal: formatCurrency(order.subtotal),
    Discount: formatCurrency(order.discount),
    Total: formatCurrency(order.total),
    PlatformFee: formatCurrency(order.platformFee ?? 0),
    // Items summary
    ItemLines: itemLines,
    ItemCount: String(safeItems.length),
    Slot: '',
    SlotTotal: '',
    SlotLabel: '',
    // Aliases used in custom templates
    OrderSubTotal: formatCurrency(order.subtotal),
    OrderTotalDiscount: formatCurrency(order.discount),
    OrderTotalPaid: formatCurrency(order.total),
    ...(overrides ?? {}),
  }
}

export function buildLabelUnitTemplateData(order: PrintableTemplateOrder, item: OrderItem, slot: number, slotTotal: number, overrides?: Partial<TemplateContext>) {
  const safeSlotTotal = Math.max(1, slotTotal)
  const safeSlot = Math.min(safeSlotTotal, Math.max(1, slot))
  const unitTotal = item.quantity > 0 && item.total > 0
    ? Math.round(item.total / item.quantity)
    : item.price

  const labelItem: OrderItem = {
    ...item,
    quantity: 1,
    total: unitTotal,
  }

  return {
    context: buildPrintTemplateContext({
      ...order,
      items: [labelItem],
    }, {
      BillName: 'TEM NHAN 58MM',
      Slot: String(safeSlot),
      SlotTotal: String(safeSlotTotal),
      SlotLabel: `${safeSlot}/${safeSlotTotal}`,
      ...(overrides ?? {}),
    }),
    items: [labelItem],
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

/**
 * Nesting-aware extractor for {{range .Items}}...{{end}}.
 * Simple regex with lazy match cuts at the FIRST inner {{end}} (e.g. from {{if .Note}}...{{end}}).
 * This function tracks depth so it finds the MATCHING closing {{end}} for the range.
 */
function extractItemsRangeBlock(source: string): { before: string; block: string; after: string } | null {
  const openMatch = source.match(/\{\{\s*range\s+\.Items\s*\}\}/)
  if (!openMatch || openMatch.index == null) return null

  const afterOpen = openMatch.index + openMatch[0].length
  const rest = source.slice(afterOpen)

  // Scan forward counting nesting depth
  const controlRe = /\{\{-?\s*(range|if|with|block|end)\b/g
  let depth = 1
  let matchingEndStart = -1
  let matchingEndFull = -1

  let m: RegExpExecArray | null
  while ((m = controlRe.exec(rest)) !== null) {
    if (m[1] === 'end') {
      depth--
      if (depth === 0) {
        matchingEndStart = m.index
        // Find closing }} of the {{end}} tag
        const closeIdx = rest.indexOf('}}', m.index)
        matchingEndFull = closeIdx >= 0 ? closeIdx + 2 : m.index + m[0].length + 2
        break
      }
    } else {
      depth++ // range, if, with, block all open a new scope
    }
  }

  if (matchingEndStart === -1) return null

  return {
    before: source.slice(0, openMatch.index),
    block: rest.slice(0, matchingEndStart),
    after: rest.slice(matchingEndFull),
  }
}

export function renderPrintTemplateText(content: string, context: TemplateContext, items: OrderItem[]) {
  const source = content.trim() || DEFAULT_TEMPLATES.receipt
  const safeItems = Array.isArray(items) ? items : []

  // Use nesting-aware extraction so inner {{if/end}} blocks don't confuse the range boundary
  const extracted = extractItemsRangeBlock(source)
  let withItems: string
  if (extracted) {
    const renderedItems = safeItems.length > 0
      ? safeItems.map((item) => renderItemBlock(extracted.block, item, context)).join('\n')
      : ''
    withItems = extracted.before + renderedItems + extracted.after
  } else {
    withItems = source
  }

  // Strip unsupported Go directives, process conditionals, then substitute order-level vars
  const stripped = stripGoTemplateDirectives(withItems)
  const withConditionals = processConditionals(stripped, context)

  // Use function replacer to safely handle $ in context values
  const substituted = Object.entries(context).reduce((output, [key, value]) => {
    return output.replace(new RegExp(`\\{\\{\\s*\\.${key}\\s*\\}\\}`, 'g'), () => value)
  }, withConditionals)

  // Strip any remaining unresolved template directives so raw {{...}} never appears in output
  return substituted
    .replace(/\{\{-?\s*end\s*-?\}\}/g, '')           // orphaned {{end}}
    .replace(/\{\{-?\s*\.\w[\w]*\s*-?\}\}/g, '')    // unresolved {{.Var}}
    .replace(/\{\{-?\s*range\s[^}]+\}\}/g, '')        // orphaned {{range ...}}
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
    if (/^\d+\/\d+$/.test(trimmed)) return `<div class="tpl-line tpl-slot">${escapeHtml(trimmed)}</div>`
    if (/^={3,}/.test(trimmed)) return `<div class="tpl-line tpl-center tpl-strong">${escapeHtml(trimmed)}</div>`
    if (/^-{3,}/.test(trimmed)) return '<div class="tpl-line tpl-divider"></div>'
    if (/^\s{2,}/.test(line)) return `<div class="tpl-line tpl-indent">${escapeHtml(trimmed)}</div>`
    return `<div class="tpl-line">${escapeHtml(trimmed)}</div>`
  }).join('')
}