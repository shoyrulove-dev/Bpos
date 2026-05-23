'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, MapPin, Phone, Printer, RefreshCw, TicketPercent, Truck } from 'lucide-react'
import { useOrder } from '@/hooks/use-orders-channels'
import { getActualReceived as getSettlementActualReceived, getDisplayCustomerName, getDisplayCustomerPhone, getDisplayDriverName, getDisplayDriverPhone, getFinancialBreakdown as getSettlementFinancialBreakdown, getGrabMoneyBreakdown as getSettlementGrabMoneyBreakdown } from '@/lib/order-financials'
import { buildReceiptPrintUrl } from '@/lib/order-alerts'
import { buildOrderPrintHtml, printItemLabels, printOrderWithFallback, printOrderWithHtmlTemplate } from '@/lib/local-printer'
import { CHANNEL_SOURCE_LABEL, cn, formatCurrency, formatDate, getOrderDisplayCode, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from '@/lib/utils'
import { PlatformIcon } from '@/components/ui/PlatformIcon'
import type { Order } from '@/types'

function openPrintWindow(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer,width=430,height=900')
}

// Inline receipt preview panel â€” shows exactly what the bridge will print
function PrintPreviewPanel({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [html, setHtml] = useState('')
  const [paperSize, setPaperSize] = useState<'80mm' | '58mm'>('80mm')
  const [printStatus, setPrintStatus] = useState<'idle' | 'printing' | 'ok' | 'error'>('idle')
  const [printError, setPrintError] = useState('')

  const openPreview = async () => {
    if (open) { setOpen(false); return }
    setLoading(true)
    setOpen(true)
    setHtml('')
    try {
      const result = await buildOrderPrintHtml(orderId, 'receipt')
      setHtml(result.html)
      setPaperSize(result.paperSize)
    } catch (err) {
      setHtml(`<div style="color:red;padding:12px">Lá»—i táº£i máº«u: ${err instanceof Error ? err.message : String(err)}</div>`)
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = async () => {
    if (printStatus === 'printing') return
    setPrintStatus('printing')
    setPrintError('')
    try {
      const ok = await printOrderWithHtmlTemplate(orderId, 'receipt')
      setPrintStatus(ok ? 'ok' : 'error')
      if (!ok) setPrintError('MÃ¡y in khÃ´ng pháº£n há»“i')
      else window.setTimeout(() => setPrintStatus('idle'), 4000)
    } catch (err) {
      setPrintStatus('error')
      setPrintError(err instanceof Error ? err.message : 'Lá»—i khÃ´ng xÃ¡c Ä‘á»‹nh')
    }
  }

  const paperWidthPx = paperSize === '58mm' ? '219px' : '302px'

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => void openPreview()}
        className={cn('btn-outline h-9 text-sm', open && 'border-orange-400 text-orange-600')}
      >
        <Printer className="h-4 w-4" />{open ? 'ÄÃ³ng preview' : 'Xem máº«u in'}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-4 overflow-y-auto" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="my-auto bg-white rounded-[24px] shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">Preview máº«u in ({paperSize})</p>
                <p className="text-xs text-gray-500 mt-0.5">ÄÃ¢y lÃ  HTML sáº½ Ä‘Æ°á»£c gá»­i tá»›i mÃ¡y in bridge. Äiá»u chá»‰nh táº¡i <a href="/bill-templates" className="underline text-orange-600" target="_blank">HÃ³a Ä‘Æ¡n máº«u</a>.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="bg-[#f0ece4] p-5 flex flex-col items-center min-h-[300px]">
              {loading
                ? <div className="flex items-center gap-2 text-gray-500 py-16"><Loader2 className="h-5 w-5 animate-spin" /> Äang táº£i máº«u...</div>
                : <iframe
                    srcDoc={html}
                    title="Receipt preview"
                    className="bg-white shadow-lg rounded-[12px]"
                    style={{ width: paperWidthPx, maxWidth: '100%', border: 'none', minHeight: '320px', height: 'auto' }}
                    onLoad={(e) => {
                      const iframe = e.currentTarget
                      try { iframe.style.height = iframe.contentDocument?.body.scrollHeight + 'px' } catch { /* cross-origin */ }
                    }}
                  />}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => void handlePrint()}
                  disabled={printStatus === 'printing'}
                  className={cn(
                    'btn-primary h-9 text-sm disabled:opacity-60',
                    printStatus === 'ok' && 'bg-green-600 hover:bg-green-700',
                    printStatus === 'error' && 'bg-red-600 hover:bg-red-700',
                  )}
                >
                  {printStatus === 'printing' ? <><Loader2 className="h-4 w-4 animate-spin" /> Äang in...</>
                    : printStatus === 'ok' ? 'âœ“ ÄÃ£ gá»­i in'
                    : printStatus === 'error' ? 'âœ— Lá»—i in'
                    : <><Printer className="h-4 w-4" /> In ngay</>}
                </button>
                <button
                  type="button"
                  onClick={() => openPrintWindow(buildReceiptPrintUrl(orderId, { autoprint: false, paperSize }))}
                  className="btn-outline h-9 text-sm"
                >
                  Má»Ÿ popup
                </button>
              </div>
              {printStatus === 'error' && printError && (
                <p className="text-xs text-red-500 max-w-[200px] text-right">{printError}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

type PrintStatus = 'idle' | 'printing' | 'ok' | 'error'

function PrintButton({ orderId, type = 'receipt', label, className }: { orderId: string; type?: 'receipt' | 'label'; label?: string; className?: string }) {
  const [status, setStatus] = useState<PrintStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')

  const handlePrint = async () => {
    if (status === 'printing') return
    setStatus('printing')
    setErrorMsg('')
    let failed = false
    try {
      const ok = type === 'label'
        ? await printItemLabels(orderId)
        : await printOrderWithFallback(orderId, type, { autoprint: true })
      if (ok) {
        setStatus('ok')
      } else {
        failed = true
        setStatus('error')
        setErrorMsg('MÃ¡y in khÃ´ng pháº£n há»“i')
      }
    } catch (err) {
      failed = true
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Lá»—i khÃ´ng xÃ¡c Ä‘á»‹nh')
    }
    // Success auto-resets after 4s; error stays until user closes
    if (!failed) window.setTimeout(() => { setStatus('idle'); setErrorMsg('') }, 4000)
  }

  const defaultLabel = type === 'receipt' ? 'In Ä‘Æ¡n' : 'In phiáº¿u tem'
  const displayLabel = status === 'printing' ? 'Äang in...' : status === 'ok' ? 'âœ“ ÄÃ£ in' : status === 'error' ? 'âœ— Lá»—i in' : (label ?? defaultLabel)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handlePrint()}
          disabled={status === 'printing'}
          className={cn(
            'btn-outline h-9 text-sm disabled:opacity-60',
            status === 'ok' && 'border-green-400 text-green-700',
            status === 'error' && 'border-red-400 text-red-600',
            className,
          )}
        >
          {status === 'printing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          {displayLabel}
        </button>
        {status === 'error' && (
          <button
            type="button"
            onClick={() => { setStatus('idle'); setErrorMsg('') }}
            className="text-xs text-gray-400 hover:text-gray-600"
            title="ÄÃ³ng thÃ´ng bÃ¡o lá»—i"
          >
            âœ•
          </button>
        )}
      </div>
      {status === 'printing' && (
        <p className="text-xs text-blue-600">Äang gá»­i Ä‘áº¿n mÃ¡y in...</p>
      )}
      {status === 'ok' && (
        <p className="text-xs text-green-600">ÄÃ£ gá»­i lá»‡nh in thÃ nh cÃ´ng</p>
      )}
      {status === 'error' && errorMsg && (
        <p className="text-xs text-red-500 max-w-xs break-words">{errorMsg}</p>
      )}
    </div>
  )
}

function formatMaybeDate(value?: string) {
  if (!value) return '-'
  try {
    return formatDate(value)
  } catch {
    return value
  }
}

function parseAmount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined

  const normalized = value.replace(/[^\d-]/g, '')
  if (!normalized || normalized === '-') return undefined

  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : undefined
}

function getRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function getGrabTimeline(order: Order) {
  const raw = getRecord(order.rawPayload)
  const times = getRecord(raw?.times)
  const deliveryTaskpoolStatus = String(raw?.deliveryTaskpoolStatus ?? '').toUpperCase()

  if (order.status === 'completed') {
    return {
      label: 'ÄÃ£ giao',
      at: String(times?.deliveredAt ?? order.deliveredAt ?? ''),
    }
  }

  if (deliveryTaskpoolStatus === 'DRIVER_AT_STORE') {
    return {
      label: 'TÃ i xáº¿ Ä‘Ã£ Ä‘áº¿n',
      at: String(times?.driverArriveRestoAt ?? ''),
    }
  }

  if (deliveryTaskpoolStatus === 'PICKING_UP') {
    return {
      label: 'Äang láº¥y hÃ ng',
      at: String(times?.driverArriveRestoAt ?? times?.readyAt ?? ''),
    }
  }

  if (order.status === 'waiting_pickup') {
    return {
      label: 'Äang chuáº©n bá»‹',
      at: String(times?.acceptedAt ?? order.placedAt ?? ''),
    }
  }

  if (order.status === 'delivering') {
    return {
      label: 'Äang giao',
      at: String(times?.driverArriveRestoAt ?? times?.readyAt ?? ''),
    }
  }

  return {
    label: ORDER_STATUS_LABEL[order.status],
    at: String(times?.createdAt ?? order.placedAt ?? ''),
  }
}

function getGrabDetailItems(order: Order) {
  const raw = getRecord(order.rawPayload)
  const itemInfo = getRecord(raw?.itemInfo)

  // itemInfo.items = Grab API canonical source (correct). raw.items may be stale
  // DOM-extracted placeholders (e.g. "HOÃ ÄÆ N / No data") â€” skip those.
  const isPlaceholder = (i: unknown) => {
    const r = getRecord(i)
    const name = String(r?.name ?? '').toUpperCase()
    const note = String(r?.note ?? '').toLowerCase()
    return name.includes('HOÃ ÄÆ N') || name.includes('HOA DON') || note === 'no data'
  }

  const itemInfoCandidates = Array.isArray(itemInfo?.items)
    ? (itemInfo.items as unknown[]).filter((i) => !isPlaceholder(i))
    : []
  const rawDomCandidates = Array.isArray(raw?.items)
    ? (raw.items as unknown[]).filter((i) => !isPlaceholder(i))
    : []

  const rawItems = itemInfoCandidates.length
    ? itemInfoCandidates
    : rawDomCandidates.length
    ? rawDomCandidates
    : Array.isArray(raw?.orderItems)
    ? raw.orderItems as unknown[]
    : Array.isArray(raw?.lineItems)
    ? raw.lineItems as unknown[]
    : []

  if (!rawItems.length && order.items.length) {
    return order.items.map((item): GrabDetailItem => ({
      name: item.name,
      quantity: Number(item.quantity ?? 1),
      originalPrice: Number(item.price ?? 0),
      strikePrice: 0,
      sellingPrice: Number(item.price ?? 0),
      total: Number(item.total ?? 0),
      note: item.note === 'No data' || item.note === 'no data' ? undefined : item.note,
      addonGroups: [],
    }))
  }

  return rawItems.map((item): GrabDetailItem => {
    const record = getRecord(item)
    const fare = getRecord(record?.fare)
    const discountInfo = Array.isArray(record?.discountInfo) ? record.discountInfo : []
    const modifierGroups = Array.isArray(record?.modifierGroups) ? record.modifierGroups : []
    const legacyModifierGroups = [
      ...(Array.isArray(record?.modifiers) ? record.modifiers : []),
      ...(Array.isArray(record?.addons) ? record.addons : []),
    ]
    const quantity = Number(record?.quantity ?? 1)
    const sellingPrice = Number(
      fare?.priceFloat ??
      fare?.priceInMin ??
      parseAmount(fare?.priceDisplay) ??
      record?.price ??
      record?.itemPrice ??
      record?.unitPrice ??
      0
    )
    const itemDiscountTotal = discountInfo.reduce((sum, discount) => {
      const discountRecord = getRecord(discount)
      const amount = parseAmount(discountRecord?.itemDiscountPriceDisplay ?? discountRecord?.discountAmount ?? discountRecord?.amount)
      return sum + (typeof amount === 'number' ? amount : 0)
    }, 0)
    const strikePrice = quantity > 0 ? Math.round(itemDiscountTotal / quantity) : itemDiscountTotal
    const originalPrice = sellingPrice + strikePrice

    const addonGroups = [...modifierGroups, ...legacyModifierGroups].map((group) => {
      const groupRecord = getRecord(group)
      const modifiers = Array.isArray(groupRecord?.modifiers)
        ? groupRecord.modifiers
        : Array.isArray(groupRecord?.modifierItems)
        ? groupRecord.modifierItems
        : Array.isArray(groupRecord?.items)
        ? groupRecord.items
        : []
      const title = String(groupRecord?.modifierGroupName ?? groupRecord?.name ?? groupRecord?.title ?? '').trim() || 'TÃ¹y chá»n'

      const lines = modifiers.map((modifier) => {
        const modifierRecord = getRecord(modifier)
        const modifierQuantity = Number(modifierRecord?.quantity ?? 1)
        const quantityLabel = modifierQuantity > 1 ? `${modifierQuantity} x ` : ''
        const modifierName = String(modifierRecord?.modifierName ?? modifierRecord?.name ?? '').trim()
        const priceLabel = parseAmount(modifierRecord?.priceDisplay ?? modifierRecord?.revampedPriceDisplay ?? modifierRecord?.price)
        return `${quantityLabel}${modifierName}${typeof priceLabel === 'number' && priceLabel > 0 ? ` ${formatCurrency(priceLabel)}` : ''}`.trim()
      }).filter(Boolean)

      return { title, lines }
    })

    return {
      name: String(record?.name ?? ''),
      quantity,
      originalPrice,
      strikePrice,
      sellingPrice,
      total: Number(record?.total ?? (quantity * sellingPrice)),
      note: String(record?.comment ?? record?.remarks ?? record?.note ?? record?.specialInstruction ?? record?.specialInstructions ?? '').trim() || undefined,
      addonGroups: addonGroups.filter((group) => group.lines.length > 0),
    }
  })
}

function getGrabCustomerName(order: Order) {
  return getDisplayCustomerName(order) ?? 'KhÃ¡ch hÃ ng'
}

function getGrabCustomerNote(order: Order) {
  const raw = getRecord(order.rawPayload)
  const eater = getRecord(raw?.eater)
  return String(raw?.customerNote ?? raw?.specialRequest ?? raw?.note ?? raw?.remarks ?? raw?.deliveryNote ?? eater?.comment ?? order.deliveryInfo?.note ?? order.note ?? '').trim()
}

function getGrabPaymentMethodLabel(order: Order) {
  const raw = getRecord(order.rawPayload)
  const paymentMethod = String(raw?.paymentMethod ?? order.paymentMethod ?? '').trim()
  const normalized = paymentMethod.toLowerCase()

  if (!normalized) return 'KhÃ¡c'
  if (normalized === 'cashless') return 'KhÃ´ng tiá»n máº·t'
  if (normalized === 'cash') return 'Tiá»n máº·t'

  return PAYMENT_METHOD_LABEL[normalized] ?? paymentMethod
}

function getBeDetailItems(order: Order) {
  const raw = getRecord(order.rawPayload)
  const rawItems = Array.isArray(raw?.order_items)
    ? raw.order_items
    : Array.isArray(raw?.items)
    ? raw.items
    : []

  if (!rawItems.length && order.items.length) {
    return order.items.map((item) => ({
      name: item.name,
      quantity: Number(item.quantity ?? 1),
      originalPrice: Number(item.price ?? 0),
      strikePrice: 0,
      sellingPrice: Number(item.price ?? 0),
      total: Number(item.total ?? 0),
      note: item.note === 'No data' || item.note === 'no data' ? undefined : item.note,
      addonGroups: item.note && item.note !== 'No data' && item.note !== 'no data'
        ? [{ title: '', lines: item.note.split('|').map((line) => line.trim()).filter(Boolean) }]
        : [],
    }))
  }

  return rawItems.map((item) => {
    const record = getRecord(item)
    const quantity = Math.max(1, Number(record?.quantity ?? record?.item_quantity ?? 1))
    const unitPriceRaw = Number(record?.unit_price ?? record?.uint_price ?? record?.item_price ?? 0)
    const sellingAmountRaw = Number(record?.amount ?? 0)
    const originalAmountRaw = Number(record?.original_amount ?? 0)
    // Fallback: náº¿u amount=0 (list API cÅ© khÃ´ng cÃ³), dÃ¹ng unit_price * quantity
    const sellingAmount = sellingAmountRaw > 0 ? sellingAmountRaw : (originalAmountRaw > 0 ? originalAmountRaw : unitPriceRaw * quantity)
    const originalAmount = originalAmountRaw > 0 ? originalAmountRaw : sellingAmount
    const originalPrice = Math.round(originalAmount / quantity)
    const sellingPrice = Math.round(sellingAmount / quantity)
    const strikePrice = Math.max(0, originalPrice - sellingPrice)
    const customizeJson = String(record?.customize_json ?? '').trim()
    let addonGroups: { title: string; lines: string[] }[] = []

    if (customizeJson) {
      try {
        const parsed = JSON.parse(customizeJson) as Array<{ name?: string; options?: Array<{ name?: string; quantity?: number; price?: number }> }>
        addonGroups = parsed
          .map((group) => {
            const title = String(group.name ?? '').trim()
            const lines = (group.options ?? []).map((option) => {
              const quantityText = option.quantity && option.quantity > 1 ? `${option.quantity} x ` : ''
              const priceText = typeof option.price === 'number' && option.price > 0 ? ` ${formatCurrency(option.price)}` : ''
              return `${quantityText}${option.name ?? ''}${priceText}`.trim()
            }).filter(Boolean)
            return { title, lines }
          })
          .filter((group) => group.lines.length > 0)
      } catch {
        const fallbackLines = String(record?.customize_object ?? '').split(/[:,]/).map((part) => part.trim()).filter(Boolean)
        if (fallbackLines.length) addonGroups = [{ title: '', lines: fallbackLines }]
      }
    } else if (record?.customize_object) {
      addonGroups = [{ title: '', lines: [String(record.customize_object).trim()] }]
    }

    return {
      name: String(record?.item_name ?? ''),
      quantity,
      originalPrice,
      strikePrice,
      sellingPrice,
      total: sellingAmount || sellingPrice * quantity,
      note: String(record?.note ?? '').trim() || undefined,
      addonGroups,
    }
  })
}

function getBePaymentMethodLabel(order: Order) {
  const raw = getRecord(order.rawPayload)
  const paymentMode = String(raw?.payment_mode ?? order.paymentMethod ?? '').trim().toLowerCase()
  if (paymentMode === '1') return 'KhÃ´ng tiá»n máº·t'
  if (paymentMode === '2') return 'Tiá»n máº·t'
  return PAYMENT_METHOD_LABEL[paymentMode] ?? order.paymentMethod ?? 'KhÃ¡c'
}

type BeVoucherLine = {
  title: string
  discountValue: number | undefined
  scopeLabel: string
}

type GrabVoucherLine = {
  title: string
  discountValue: number | undefined
  scopeLabel: string
}

type GrabAddonGroup = {
  title: string
  lines: string[]
}

type GrabDetailItem = {
  name: string
  quantity: number
  originalPrice: number
  strikePrice: number
  sellingPrice: number
  total: number
  note?: string
  addonGroups: GrabAddonGroup[]
}

function buildGrabVoucherLine(value: unknown, scopeLabel: string): GrabVoucherLine | null {
  const record = getRecord(value)
  if (!record) return null

  const title = String(
    record.title ??
    record.name ??
    record.voucherName ??
    record.promotionName ??
    record.promoName ??
    record.discountName ??
    record.description ??
    ''
  ).trim()

  const discountValue =
    parseAmount(record.discountValue) ??
    parseAmount(record.discount_value) ??
    parseAmount(record.discountAmount) ??
    parseAmount(record.discountAmountDisplay) ??
    parseAmount(record.discountPriceDisplay) ??
    parseAmount(record.itemDiscountPriceDisplay) ??
    parseAmount(record.amount) ??
    parseAmount(record.value)

  if (!title && typeof discountValue !== 'number') return null

  return {
    title: title || 'Æ¯u Ä‘Ã£i Grab',
    discountValue,
    scopeLabel,
  }
}

function getGrabVoucherLines(order: Order) {
  const raw = getRecord(order.rawPayload)
  const itemInfo = getRecord(raw?.itemInfo)
  const rawItems = Array.isArray(raw?.items)
    ? raw.items
    : Array.isArray(raw?.orderItems)
    ? raw.orderItems
    : Array.isArray(raw?.lineItems)
    ? raw.lineItems
    : Array.isArray(itemInfo?.items)
    ? itemInfo.items
    : []
  const orderLevelDiscounts = Array.isArray(raw?.orderLevelDiscounts) ? raw.orderLevelDiscounts : []
  const voucherInfo = getRecord(raw?.voucherInfo)
  const price = getRecord(raw?.price)
  const voucherCandidates = [
    ...(Array.isArray(voucherInfo?.vouchers) ? voucherInfo.vouchers : []),
    ...(Array.isArray(voucherInfo?.discounts) ? voucherInfo.discounts : []),
    ...(Array.isArray(voucherInfo?.appliedVouchers) ? voucherInfo.appliedVouchers : []),
    ...(Array.isArray(voucherInfo?.items) ? voucherInfo.items : []),
  ]

  const lines: GrabVoucherLine[] = []

  for (const discount of orderLevelDiscounts) {
    const line = buildGrabVoucherLine(discount, 'Voucher Ä‘Æ¡n hÃ ng')
    if (line) lines.push(line)
  }

  for (const voucher of voucherCandidates) {
    const line = buildGrabVoucherLine(voucher, 'Voucher Ä‘Æ¡n hÃ ng')
    if (line) lines.push(line)
  }

  for (const item of rawItems) {
    const itemRecord = getRecord(item)
    const discountInfo = Array.isArray(itemRecord?.discountInfo) ? itemRecord.discountInfo : []

    for (const discount of discountInfo) {
      const line = buildGrabVoucherLine(discount, 'Voucher mÃ³n')
      if (line) lines.push(line)
    }
  }

  if (!lines.length) {
    const genericDiscount =
      parseAmount(price?.basketPromo) ??
      parseAmount(price?.discount) ??
      parseAmount(raw?.discountAmount) ??
      parseAmount(raw?.discount)

    if (typeof genericDiscount === 'number' && genericDiscount > 0) {
      lines.push({
        title: 'Æ¯u Ä‘Ã£i Grab',
        discountValue: genericDiscount,
        scopeLabel: 'Voucher Ä‘Æ¡n hÃ ng',
      })
    }
  }

  const deduped = new Map<string, GrabVoucherLine>()
  for (const line of lines) {
    const key = `${line.scopeLabel}|${line.title}|${line.discountValue ?? ''}`
    if (!deduped.has(key)) deduped.set(key, line)
  }

  return Array.from(deduped.values())
}

function getGrabUtensilRequest(order: Order) {
  const raw = getRecord(order.rawPayload)
  const candidateValues = [
    raw?.cutlery,
    raw?.utensils,
    raw?.needCutlery,
    raw?.need_cutlery,
    raw?.needUtensils,
    raw?.need_utensils,
    raw?.tableware,
  ]

  for (const value of candidateValues) {
    if (typeof value === 'boolean') return value ? 'CÃ³' : 'KhÃ´ng'
    if (typeof value === 'number') {
      // Grab encodes cutlery as integer enum:
      // 0 = khÃ´ng cáº§n dá»¥ng cá»¥, 1 = cáº§n dá»¥ng cá»¥, 2 = khÃ´ng cáº§n (eco/no plastic)
      if (value === 0) return 'KhÃ´ng'
      if (value === 2) return 'KhÃ´ng (eco)'
      if (value === 1) return 'CÃ³'
      return value > 0 ? `CÃ³ (${value})` : 'KhÃ´ng'
    }

    const normalized = String(value ?? '').trim().toLowerCase()
    if (!normalized) continue
    if (['true', 'yes', 'co', 'cÃ³', '1'].includes(normalized)) return 'CÃ³'
    if (['false', 'no', 'khong', 'khÃ´ng', '0'].includes(normalized)) return 'KhÃ´ng'
    return String(value).trim()
  }

  return '-'
}

function getBeVoucherLines(order: Order) {
  const raw = getRecord(order.rawPayload)
  const offers = getRecord(raw?.offers)
  const foodDiscounts = Array.isArray(offers?.food_discounts) ? offers.food_discounts : []
  const deliveryDiscounts = Array.isArray(offers?.delivery_discounts) ? offers.delivery_discounts : []
  const orderDiscount = getRecord(raw?.order_discount)

  const lines = [...foodDiscounts, ...deliveryDiscounts]
    .map((offer) => {
      const record = getRecord(offer)
      const title = String(record?.title ?? '').trim()
      const discountValue = parseAmount(record?.discount_value)
      const type = String(record?.type ?? '').trim().toLowerCase()
      const scopeLabel = type === 'delivery' ? 'Æ¯u Ä‘Ã£i giao hÃ ng' : 'Voucher mÃ³n'

      if (!title && typeof discountValue !== 'number') return null

      return {
        title: title || 'Æ¯u Ä‘Ã£i tá»« Be',
        discountValue,
        scopeLabel,
      }
    })
    .filter((offer): offer is BeVoucherLine => Boolean(offer))

  if (!lines.length && orderDiscount) {
    const discountValue =
      parseAmount(orderDiscount.total_customer_discount) ??
      parseAmount(orderDiscount.be_discount) ??
      parseAmount(orderDiscount.merchant_discount) ??
      parseAmount(orderDiscount.partner_discount) ??
      parseAmount(raw?.partner_discount)

    if (typeof discountValue === 'number' && discountValue > 0) {
      lines.push({
        title: String(orderDiscount.title ?? orderDiscount.voucher_title ?? orderDiscount.voucher_name ?? orderDiscount.promotion_name ?? 'Æ¯u Ä‘Ã£i tá»« Be').trim() || 'Æ¯u Ä‘Ã£i tá»« Be',
        discountValue,
        scopeLabel: 'Voucher Ä‘Æ¡n hÃ ng',
      })
    }
  }

  return lines
}

function getBeUtensilRequest(order: Order) {
  const raw = getRecord(order.rawPayload)
  const candidateValues = [
    raw?.need_cutlery,
    raw?.need_utensils,
    raw?.need_tableware,
    raw?.cutlery,
    raw?.utensils,
    raw?.tableware,
    raw?.is_need_cutlery,
  ]

  for (const value of candidateValues) {
    if (typeof value === 'boolean') return value ? 'CÃ³' : 'KhÃ´ng'
    if (typeof value === 'number') return value > 0 ? `CÃ³ (${value})` : 'KhÃ´ng'

    const normalized = String(value ?? '').trim().toLowerCase()
    if (!normalized) continue
    if (['true', 'yes', 'co', 'cÃ³', '1'].includes(normalized)) return 'CÃ³'
    if (['false', 'no', 'khong', 'khÃ´ng', '0'].includes(normalized)) return 'KhÃ´ng'
    return String(value).trim()
  }

  return '-'
}

function renderAmountCell(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '-'
  return formatCurrency(value)
}

function GrabDetailView({ order, displayOrderCode, actualReceived, financialBreakdown, onRefresh, isRefreshing }: {
  order: Order
  displayOrderCode: string
  actualReceived: number
  financialBreakdown: ReturnType<typeof getSettlementFinancialBreakdown>
  onRefresh: () => void
  isRefreshing: boolean
}) {
  const raw = getRecord(order.rawPayload)
  const times = getRecord(raw?.times)
  const items = getGrabDetailItems(order)
  const timeline = getGrabTimeline(order)
  const customerName = getGrabCustomerName(order)
  const customerNote = getGrabCustomerNote(order)
  const driverName = getDisplayDriverName(order) ?? '-'
  const driverPhone = getDisplayDriverPhone(order) || '-'
  const customerPhone = getDisplayCustomerPhone(order) || '-'
  const longOrderCode = String(order.externalOrderId ?? '-')
  const bookingCode = String(raw?.bookingCode ?? raw?.bookingID ?? raw?.bookingId ?? raw?.preparationTaskID ?? '-')
  const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  const paymentMethodLabel = getGrabPaymentMethodLabel(order)
  const voucherLines = getGrabVoucherLines(order)
  const utensilRequest = getGrabUtensilRequest(order)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-gray-200 bg-white px-4 py-3">
        <div className="flex items-start gap-3">
          <Link href="/orders" className="mt-0.5 rounded-full border border-gray-200 p-1.5 text-gray-500 transition hover:text-gray-900"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('badge', ORDER_STATUS_COLOR[order.status])}>{ORDER_STATUS_LABEL[order.status]}</span>
              <PlatformIcon source={order.source} size="md" />
            </div>
            <h1 className="mt-1 text-2xl font-semibold leading-none text-gray-950">{displayOrderCode || order.shortId}</h1>
            <p className="mt-0.5 font-mono text-xs text-gray-500">{longOrderCode}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onRefresh} className="btn-outline h-9 text-sm" disabled={isRefreshing}><RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} /> LÃ m má»›i</button>
          <PrintButton orderId={order._id} />
          <PrintButton orderId={order._id} type="label" />
          <PrintPreviewPanel orderId={order._id} />
        </div>
      </div>

      <div className="rounded-[28px] border border-gray-200 bg-white px-4 py-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">TÃ i xáº¿</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{driverName || '-'}</p>
            <p className="text-xs text-gray-500">{driverPhone || '-'}</p>
            <p className="mt-0.5 text-[11px] text-emerald-600">{timeline.label} Â· {formatMaybeDate(timeline.at)}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">MÃ£ Ä‘áº·t: <span className="font-mono text-gray-500 break-all">{bookingCode}</span></p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">KhÃ¡ch hÃ ng</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{customerName}</p>
            <p className="text-xs text-gray-500">{customerPhone}</p>
            {customerNote && <p className="mt-0.5 text-[11px] text-gray-500 whitespace-pre-line">{customerNote}</p>}
            <p className="mt-0.5 text-[11px] text-gray-400">Dá»¥ng cá»¥: <span className="text-gray-700">{utensilRequest}</span></p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400">ThÆ°Æ¡ng hiá»‡u & Hub</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{order.brandName || '-'}</p>
            <p className="text-xs text-gray-500">{order.hubName || '-'}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400">Äáº·t lÃºc Â· Sá»‘ mÃ³n</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{formatMaybeDate(String(times?.createdAt ?? order.placedAt ?? ''))}</p>
            <p className="text-xs text-gray-500">{itemCount} mÃ³n</p>
          </div>
        </div>
      </div>

<div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_260px]">
        <div className="rounded-[28px] border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-950">TÃ³m táº¯t Ä‘Æ¡n hÃ ng</h2>
            <span className="text-sm text-gray-500">{itemCount} mÃ³n</span>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-100 text-gray-500 text-xs">
                <tr>
                  <th className="px-3 py-2.5 font-medium">MÃ³n</th>
                  <th className="px-3 py-2.5 text-center font-medium">SL</th>
                  <th className="px-3 py-2.5 text-right font-medium">GiÃ¡ gá»‘c</th>
                  <th className="px-3 py-2.5 text-right font-medium">Gáº¡ch giÃ¡</th>
                  <th className="px-3 py-2.5 text-right font-medium">GiÃ¡ bÃ¡n</th>
                  <th className="px-3 py-2.5 text-right font-medium">ThÃ nh tiá»n</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={`${item.name}-${index}`} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2.5">
                      <p className="text-base font-semibold text-gray-950">{item.name}</p>
                      {item.note && <p className="mt-0.5 whitespace-pre-line text-xs text-gray-500">{item.note}</p>}
                      {item.addonGroups.length > 0 && (
                        <div className="mt-1.5 space-y-1.5 text-xs text-gray-500">
                          {item.addonGroups.map((group, groupIndex) => (
                            <div key={`${group.title}-${groupIndex}`}>
                              <p className="font-medium text-gray-600">{group.title}</p>
                              <div className="space-y-0.5">
                                {group.lines.map((addon, addonIndex) => <p key={`${addon}-${addonIndex}`}>â€¢ {addon}</p>)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center text-sm font-medium text-gray-900">{item.quantity}</td>
                    <td className="px-3 py-2.5 text-right text-sm text-gray-700">{renderAmountCell(item.originalPrice)}</td>
                    <td className="px-3 py-2.5 text-right text-sm text-gray-700">{renderAmountCell(item.strikePrice)}</td>
                    <td className="px-3 py-2.5 text-right text-sm text-gray-700">{renderAmountCell(item.sellingPrice)}</td>
                    <td className="px-3 py-2.5 text-right text-sm font-semibold text-gray-950">{renderAmountCell(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(order.deliveryInfo?.address || order.deliveryInfo?.note) && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl bg-gray-50 px-4 py-3 text-gray-700">
              <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-500" />
              <div>
                {order.deliveryInfo?.address && <p>{order.deliveryInfo.address}</p>}
                {order.deliveryInfo?.note && <p className="mt-1 text-sm text-gray-500">{order.deliveryInfo.note}</p>}
              </div>
            </div>
          )}

          {voucherLines.length > 0 && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 px-3 py-2">
              <div className="flex items-center gap-2 mb-1.5">
                <TicketPercent className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-emerald-700">Voucher</span>
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600">{voucherLines.length}</span>
              </div>
              <div className="space-y-1">
                {voucherLines.map((voucher, index) => (
                  <div key={`${voucher.title}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-white/80 px-2.5 py-1.5">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{voucher.title}</p>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-600">{voucher.scopeLabel}</p>
                    </div>
                    {typeof voucher.discountValue === 'number' && (
                      <p className="text-xs font-semibold text-emerald-600 flex-shrink-0">-{formatCurrency(voucher.discountValue)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-[28px] border border-gray-200 bg-white p-4">
          <div className="space-y-2 text-sm text-gray-500">
            <div className="flex items-center justify-between gap-3"><span>Tiá»n hÃ ng</span><span className="font-medium text-gray-900">{formatCurrency(financialBreakdown.subtotal)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Giáº£m giÃ¡ sáº£n pháº©m</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.productDiscount)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Giáº£m giÃ¡ tá»•ng Ä‘Æ¡n (ÄH + VC)</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.orderDiscount)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Chiáº¿t kháº¥u (CK) sÃ n</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.platformFee)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Doanh thu sau KM</span><span className="font-medium text-gray-900">{formatCurrency(financialBreakdown.revenueAfterPromotion || order.total)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Kháº¥u trá»« thuáº¿</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.taxWithheld)}</span></div>
          </div>

          <div className="mt-3 border-t border-gray-200 pt-3">
            <div className="flex items-center justify-between gap-3 text-xl font-semibold text-gray-950">
              <span>Thá»±c nháº­n tá»« sÃ n</span>
              <span>{formatCurrency(actualReceived)}</span>
            </div>
          </div>

          <div className="mt-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
            <p className="font-medium text-gray-900">PhÆ°Æ¡ng thá»©c thanh toÃ¡n</p>
            <p className="mt-1">{paymentMethodLabel}</p>
          </div>

          <div className="mt-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
            <div className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" /><div><p className="font-medium text-gray-900">LiÃªn há»‡ giao nháº­n</p><p className="mt-0.5">{driverPhone || order.customerPhone || '-'}</p></div></div>
            <div className="mt-2 flex items-start gap-2"><Truck className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" /><div><p className="font-medium text-gray-900">TÃ i xáº¿</p><p className="mt-0.5">{driverName || '-'}</p></div></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function BeDetailView({ order, displayOrderCode, actualReceived, financialBreakdown, onRefresh, isRefreshing }: {
  order: Order
  displayOrderCode: string
  actualReceived: number
  financialBreakdown: ReturnType<typeof getSettlementFinancialBreakdown>
  onRefresh: () => void
  isRefreshing: boolean
}) {
  const raw = getRecord(order.rawPayload)
  const items = getBeDetailItems(order)
  const customerPhone = getDisplayCustomerPhone(order) || '-'
  const driverPhone = getDisplayDriverPhone(order) || '-'
  const driverName = String(order.driverInfo?.name ?? raw?.driver_name ?? '-')
  const paymentMethodLabel = getBePaymentMethodLabel(order)
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
  const voucherLines = getBeVoucherLines(order)
  const utensilRequest = getBeUtensilRequest(order)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-gray-200 bg-white px-4 py-3">
        <div className="flex items-start gap-3">
          <Link href="/orders" className="mt-0.5 rounded-full border border-gray-200 p-1.5 text-gray-500 transition hover:text-gray-900"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('badge', ORDER_STATUS_COLOR[order.status])}>{ORDER_STATUS_LABEL[order.status]}</span>
              <PlatformIcon source={order.source} size="md" />
            </div>
            <h1 className="mt-1 text-2xl font-semibold leading-none text-gray-950">{displayOrderCode || order.shortId}</h1>
            <p className="mt-0.5 font-mono text-xs text-gray-500">Ref code: {order.externalOrderId}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onRefresh} className="btn-outline h-9 text-sm" disabled={isRefreshing}><RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} /> LÃ m má»›i</button>
          <PrintButton orderId={order._id} />
          <PrintButton orderId={order._id} type="label" />
          <PrintPreviewPanel orderId={order._id} />
        </div>
      </div>

      <div className="rounded-[28px] border border-gray-200 bg-white px-4 py-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
          <div>
            <p className="text-[10px] text-gray-400">Site & Hub</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{order.brandName || '-'}</p>
            <p className="text-xs text-gray-500">{order.channelName || CHANNEL_SOURCE_LABEL[order.source]} Â· {order.hubName || '-'}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400">Thá»i gian</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{formatMaybeDate(order.placedAt)}</p>
            <p className="text-xs text-gray-500">Láº¥y: {formatMaybeDate(order.deliveryInfo?.estimatedTime || order.deliveredAt)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">KhÃ¡ch hÃ ng</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{order.customerName}</p>
            <p className="text-xs text-gray-500">{customerPhone}</p>
            {order.deliveryInfo?.address && <p className="mt-0.5 text-[11px] text-gray-500 line-clamp-1">{order.deliveryInfo.address}</p>}
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">TÃ i xáº¿</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{driverName}</p>
            <p className="text-xs text-gray-500">{driverPhone}</p>
            {order.driverInfo?.vehiclePlate && <p className="mt-0.5 text-[11px] text-gray-400">Biá»ƒn sá»‘: <span className="text-gray-700">{order.driverInfo.vehiclePlate}</span></p>}
            {utensilRequest !== '-' && <p className="mt-0.5 text-[11px] text-gray-400">Dá»¥ng cá»¥: <span className="text-gray-700">{utensilRequest}</span></p>}
          </div>
        </div>
        {(order.deliveryInfo?.note || order.note) && (
          <p className="mt-2.5 border-t border-gray-100 pt-2.5 text-xs text-gray-500">Ghi chÃº: {order.deliveryInfo?.note || order.note}</p>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_260px]">
        <div className="rounded-[28px] border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-gray-950">ThÃ´ng tin Ä‘Æ¡n hÃ ng</h2><span className="text-sm text-gray-500">{totalItems} mÃ³n</span></div>
          <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-100 text-gray-500 text-xs"><tr><th className="px-3 py-2.5 font-medium">Sáº£n pháº©m</th><th className="px-3 py-2.5 text-center font-medium">SL</th><th className="px-3 py-2.5 text-right font-medium">GiÃ¡ gá»‘c</th><th className="px-3 py-2.5 text-right font-medium">Gáº¡ch</th><th className="px-3 py-2.5 text-right font-medium">BÃ¡n</th><th className="px-3 py-2.5 text-right font-medium">ThÃ nh tiá»n</th></tr></thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={`${item.name}-${index}`} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2.5"><p className="text-base font-semibold text-gray-950">{item.name}</p>{item.note && <p className="mt-0.5 whitespace-pre-line text-xs text-gray-500">{item.note}</p>}{item.addonGroups.length > 0 && <div className="mt-1 space-y-1 text-xs text-gray-500">{item.addonGroups.map((group, gi) => (<div key={`grp-${gi}`}>{group.title && <p className="font-medium text-gray-600">{group.title}:</p>}<div className="space-y-0.5">{group.lines.map((line, li) => <p key={`${gi}-${li}`}>â€¢ {line}</p>)}</div></div>))}</div>}</td>
                    <td className="px-3 py-2.5 text-center text-sm font-medium text-gray-900">{item.quantity}</td>
                    <td className="px-3 py-2.5 text-right text-sm text-gray-700">{formatCurrency(item.originalPrice)}</td>
                    <td className="px-3 py-2.5 text-right text-sm text-gray-700">{formatCurrency(item.strikePrice)}</td>
                    <td className="px-3 py-2.5 text-right text-sm text-gray-700">{formatCurrency(item.sellingPrice)}</td>
                    <td className="px-3 py-2.5 text-right text-sm font-semibold text-gray-950">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {voucherLines.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2">
              <div className="flex items-center gap-2 mb-1.5">
                <TicketPercent className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-amber-700">Voucher</span>
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">{voucherLines.length}</span>
              </div>
              <div className="space-y-1">
                {voucherLines.map((voucher, index) => (
                  <div key={`${voucher.title}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-white/80 px-2.5 py-1.5">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{voucher.title}</p>
                      <p className="text-[10px] font-medium uppercase tracking-wide text-amber-600">{voucher.scopeLabel}</p>
                    </div>
                    {typeof voucher.discountValue === 'number' && (
                      <p className="text-xs font-semibold text-emerald-600 flex-shrink-0">-{formatCurrency(voucher.discountValue)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-[28px] border border-gray-200 bg-white p-4">
          <div className="space-y-2 text-sm text-gray-500">
            <div className="flex items-center justify-between gap-3"><span>Tiá»n hÃ ng</span><span className="font-medium text-gray-900">{formatCurrency(financialBreakdown.subtotal)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Giáº£m giÃ¡ sáº£n pháº©m</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.productDiscount)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Giáº£m giÃ¡ tá»•ng Ä‘Æ¡n (ÄH + VC)</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.orderDiscount)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Chiáº¿t kháº¥u (CK) sÃ n</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.platformFee)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Doanh thu sau KM</span><span className="font-medium text-gray-900">{formatCurrency(financialBreakdown.revenueAfterPromotion)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Kháº¥u trá»« thuáº¿</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.taxWithheld)}</span></div>
          </div>

          <div className="mt-3 border-t border-gray-200 pt-3"><div className="flex items-center justify-between gap-3 text-xl font-semibold text-gray-950"><span>Thá»±c nháº­n tá»« sÃ n</span><span>{formatCurrency(actualReceived)}</span></div></div>
          <div className="mt-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600"><p className="font-medium text-gray-900">PhÆ°Æ¡ng thá»©c thanh toÃ¡n</p><p className="mt-1">{paymentMethodLabel}</p></div>
          <div className="mt-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
            <div className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" /><div><p className="font-medium text-gray-900">LiÃªn há»‡ giao nháº­n</p><p className="mt-0.5">{driverPhone || customerPhone || '-'}</p></div></div>
            <div className="mt-2 flex items-start gap-2"><Truck className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" /><div><p className="font-medium text-gray-900">TÃ i xáº¿</p><p className="mt-0.5">{driverName || 'ChÆ°a cÃ³ thÃ´ng tin'}</p></div></div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OrderDetailView({ orderId }: { orderId: string }) {
  const { data, isLoading, error, refetch, isRefetching } = useOrder(orderId)
  const order = (data as Order | undefined) ?? null

  if (isLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center rounded-[28px] border border-gray-200 bg-white"><div className="flex items-center gap-3 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> Äang táº£i chi tiáº¿t Ä‘Æ¡n hÃ ng...</div></div>
  }

  if (!order) {
    return <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-10 text-red-700">{error instanceof Error ? error.message : 'KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n hÃ ng.'}</div>
  }

  const actualReceived = getSettlementActualReceived(order)
  const totalItems = order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  const displayOrderCode = getOrderDisplayCode(order)
  const financialBreakdown = getSettlementFinancialBreakdown(order)
  const showExternalReference = Boolean(order.externalOrderId && order.externalOrderId !== displayOrderCode)

  if (order.source === 'grab') {
    return <GrabDetailView order={order} displayOrderCode={displayOrderCode} actualReceived={actualReceived} financialBreakdown={financialBreakdown} onRefresh={() => refetch()} isRefreshing={isRefetching} />
  }

  if (order.source === 'be') {
    return <BeDetailView order={order} displayOrderCode={displayOrderCode} actualReceived={actualReceived} financialBreakdown={financialBreakdown} onRefresh={() => refetch()} isRefreshing={isRefetching} />
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-gray-200 bg-white px-4 py-3">
        <div className="flex items-start gap-3">
          <Link href="/orders" className="mt-0.5 rounded-full border border-gray-200 p-1.5 text-gray-500 transition hover:text-gray-900"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('badge', ORDER_STATUS_COLOR[order.status])}>{ORDER_STATUS_LABEL[order.status]}</span>
              <PlatformIcon source={order.source} size="md" />
            </div>
            <h1 className="mt-1 text-2xl font-semibold leading-none text-gray-950">{displayOrderCode || order.shortId}</h1>
            {showExternalReference && <p className="mt-0.5 font-mono text-xs text-gray-500">Ref code: {order.externalOrderId}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => refetch()} className="btn-outline h-9 text-sm" disabled={isRefetching}><RefreshCw className={cn('h-4 w-4', isRefetching && 'animate-spin')} /> LÃ m má»›i</button>
          <PrintButton orderId={order._id} />
          <PrintButton orderId={order._id} type="label" />
          <PrintPreviewPanel orderId={order._id} />
        </div>
      </div>

      <div className="rounded-[28px] border border-gray-200 bg-white px-4 py-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
          <div>
            <p className="text-[10px] text-gray-400">Site & Hub</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{order.brandName || '-'}</p>
            <p className="text-xs text-gray-500">{order.channelName || CHANNEL_SOURCE_LABEL[order.source]} Â· {order.hubName || '-'}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400">Thá»i gian</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{formatMaybeDate(order.placedAt)}</p>
            <p className="text-xs text-gray-500">Láº¥y: {formatMaybeDate(order.deliveredAt || order.deliveryInfo?.estimatedTime)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">KhÃ¡ch hÃ ng</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{order.customerName || '-'}</p>
            <p className="text-xs text-gray-500">{getDisplayCustomerPhone(order) || '-'}</p>
            {order.deliveryInfo?.address && <p className="mt-0.5 text-[11px] text-gray-500 line-clamp-1">{order.deliveryInfo.address}</p>}
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">TÃ i xáº¿</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{order.driverInfo?.name || '-'}</p>
            <p className="text-xs text-gray-500">{getDisplayDriverPhone(order) || '-'}</p>
            {order.driverInfo?.vehiclePlate && <p className="mt-0.5 text-[11px] text-gray-400">Biá»ƒn sá»‘: <span className="text-gray-700">{order.driverInfo.vehiclePlate}</span></p>}
            <p className="mt-0.5 text-[11px] text-emerald-600">Thá»±c nháº­n: {formatCurrency(actualReceived)}</p>
          </div>
        </div>
        {(order.deliveryInfo?.note || order.note) && (
          <p className="mt-2.5 border-t border-gray-100 pt-2.5 text-xs text-gray-500">Ghi chÃº: {order.deliveryInfo?.note || order.note}</p>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_260px]">
        <div className="rounded-[28px] border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-gray-950">ThÃ´ng tin Ä‘Æ¡n hÃ ng</h2><span className="text-sm text-gray-500">{totalItems} mÃ³n</span></div>
          <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-100 text-gray-500 text-xs"><tr><th className="px-3 py-2.5 font-medium">Sáº£n pháº©m</th><th className="px-3 py-2.5 text-center font-medium">SL</th><th className="px-3 py-2.5 text-right font-medium">GiÃ¡ gá»‘c</th><th className="px-3 py-2.5 text-right font-medium">ThÃ nh tiá»n</th></tr></thead>
              <tbody>
                {order.items.map((item, index) => (
                  <tr key={`${item.name}-${index}`} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2.5"><p className="text-sm font-medium text-gray-950">{item.name}</p>{item.note && <p className="mt-0.5 whitespace-pre-line text-xs text-gray-500">{item.note}</p>}</td>
                    <td className="px-3 py-2.5 text-center text-sm font-medium text-gray-900">{item.quantity}</td>
                    <td className="px-3 py-2.5 text-right text-sm text-gray-700">{formatCurrency(item.price)}</td>
                    <td className="px-3 py-2.5 text-right text-sm font-semibold text-gray-950">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(order.deliveryInfo?.address || order.deliveryInfo?.note) && (
            <div className="mt-3 flex items-start gap-2 rounded-2xl bg-gray-50 px-3 py-2.5 text-sm text-gray-700"><MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-500" /><div>{order.deliveryInfo?.address && <p className="whitespace-pre-line break-words">{order.deliveryInfo.address}</p>}{order.deliveryInfo?.note && <p className="mt-0.5 text-xs text-gray-500">{order.deliveryInfo.note}</p>}</div></div>
          )}
        </div>

        <div className="rounded-[28px] border border-gray-200 bg-white p-4">
          <div className="space-y-2 text-sm text-gray-500">
            <div className="flex items-center justify-between gap-3"><span>Tiá»n hÃ ng</span><span className="font-medium text-gray-900">{formatCurrency(financialBreakdown.subtotal)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Giáº£m giÃ¡ sáº£n pháº©m</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.productDiscount)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Giáº£m giÃ¡ tá»•ng Ä‘Æ¡n (ÄH + VC)</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.orderDiscount)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Chiáº¿t kháº¥u (CK) sÃ n</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.platformFee)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Doanh thu sau KM</span><span className="font-medium text-gray-900">{formatCurrency(financialBreakdown.revenueAfterPromotion)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Kháº¥u trá»« thuáº¿</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.taxWithheld)}</span></div>
          </div>

          <div className="mt-3 border-t border-gray-200 pt-3"><div className="flex items-center justify-between gap-3 text-xl font-semibold text-gray-950"><span>Thá»±c nháº­n tá»« sÃ n</span><span>{formatCurrency(actualReceived)}</span></div></div>
          <div className="mt-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600"><p className="font-medium text-gray-900">PhÆ°Æ¡ng thá»©c thanh toÃ¡n</p><p className="mt-1">{PAYMENT_METHOD_LABEL[order.paymentMethod || 'other'] || order.paymentMethod || 'KhÃ¡c'}</p></div>
          <div className="mt-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
            <div className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" /><div><p className="font-medium text-gray-900">LiÃªn há»‡ giao nháº­n</p><p className="mt-0.5">{getDisplayDriverPhone(order) || getDisplayCustomerPhone(order) || '-'}</p></div></div>
            <div className="mt-2 flex items-start gap-2"><Truck className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" /><div><p className="font-medium text-gray-900">TÃ i xáº¿</p><p className="mt-0.5">{order.driverInfo?.name || 'ChÆ°a cÃ³ thÃ´ng tin'}</p></div></div>
          </div>
        </div>
      </div>
    </div>
  )
}