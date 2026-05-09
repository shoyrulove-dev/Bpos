'use client'

import Link from 'next/link'
import { ArrowLeft, Loader2, MapPin, Phone, Printer, RefreshCw, TicketPercent, Truck, UtensilsCrossed } from 'lucide-react'
import { useOrder } from '@/hooks/use-orders-channels'
import { getActualReceived as getSettlementActualReceived, getDisplayCustomerPhone, getDisplayDriverPhone, getFinancialBreakdown as getSettlementFinancialBreakdown, getGrabMoneyBreakdown as getSettlementGrabMoneyBreakdown } from '@/lib/order-financials'
import { buildReceiptPrintUrl } from '@/lib/order-alerts'
import { CHANNEL_SOURCE_COLOR, CHANNEL_SOURCE_LABEL, cn, formatCurrency, formatDate, getOrderDisplayCode, ORDER_STATUS_COLOR, ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from '@/lib/utils'
import type { Order } from '@/types'

function openPrintWindow(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer,width=430,height=900')
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

function getBreakdownAmount(raw: Record<string, unknown>, keys: string[]) {
  const sources = [getRecord(raw.financialBreakdown), raw]

  for (const source of sources) {
    if (!source) continue

    for (const key of keys) {
      const amount = parseAmount(source[key])
      if (typeof amount === 'number') return amount
    }
  }

  return undefined
}

function extractPhone(value?: string) {
  const match = String(value ?? '').match(/((?:\+?84|0)\d[\d .-]{7,13}\d)/)
  return match?.[1]?.trim()
}

function getGrabFareRecord(order: Order) {
  const raw = getRecord(order.rawPayload)
  return getRecord(raw?.fare)
}

function getGrabItemDiscountTotal(order: Order) {
  const raw = getRecord(order.rawPayload)
  const itemInfo = getRecord(raw?.itemInfo)
  const items = Array.isArray(itemInfo?.items) ? itemInfo.items : []

  let totalDiscount = 0

  for (const item of items) {
    const itemRecord = getRecord(item)
    const discounts = Array.isArray(itemRecord?.discountInfo) ? itemRecord.discountInfo : []

    for (const discount of discounts) {
      const discountRecord = getRecord(discount)
      const amount = parseAmount(discountRecord?.itemDiscountPriceDisplay)
      if (typeof amount === 'number') totalDiscount += amount
    }
  }

  return totalDiscount
}

function getGrabMoneyBreakdown(order: Order) {
  const fare = getGrabFareRecord(order)
  if (!fare) return null

  const originalSubtotal = parseAmount(fare.subTotalDisplay ?? fare.subtotalIncludeMerchantCharge ?? fare.originalPriceInMin) ?? order.subtotal
  const itemDiscount = getGrabItemDiscountTotal(order)
  const totalDiscount = parseAmount(fare.totalDiscountAmountDisplay) ?? order.discount ?? 0
  const promotionDiscount = Math.max(0, totalDiscount - itemDiscount)
  const revenueAfterPromotion = parseAmount(fare.totalDisplay ?? fare.revampedSubtotalDisplay) ?? order.total
  const deliveryFee = parseAmount(fare.deliveryFeeDisplay) ?? 0
  const smallOrderFee = parseAmount(fare.smallOrderFeeDisplay) ?? 0
  const serviceFee = parseAmount(fare.serviceChargeFeeDisplay) ?? 0
  const customerPaid = parseAmount(fare.passengerTotalDisplay) ?? (revenueAfterPromotion + deliveryFee + smallOrderFee + serviceFee)
  const platformCommission = parseAmount(fare.mexCommissionDisplay ?? fare.platformCommissionDisplay) ?? (order.platformFee ?? 0)
  const vatAmount = parseAmount(fare.mexVatAmountDisplay) ?? 0
  const pitAmount = parseAmount(fare.mexPitAmountDisplay) ?? 0
  const taxWithheld = parseAmount(fare.onBehalfWithholdTaxDisplay) ?? 0
  const actualReceived = Math.max(0, revenueAfterPromotion - platformCommission - vatAmount - pitAmount - taxWithheld)

  return {
    originalSubtotal,
    itemDiscount,
    promotionDiscount,
    deliveryFee,
    smallOrderFee,
    serviceFee,
    customerPaid,
    revenueAfterPromotion,
    platformCommission,
    vatAmount,
    pitAmount,
    taxWithheld,
    actualReceived,
  }
}

function getActualReceived(order: Order) {
  if (order.source === 'grab') {
    const grabMoneyBreakdown = getGrabMoneyBreakdown(order)
    if (grabMoneyBreakdown) return grabMoneyBreakdown.actualReceived
  }

  const raw = order.rawPayload ?? {}
  const candidateValues = [
    raw.escrow_amount,
    raw.received_amount,
    raw.actual_received_amount,
    raw.net_order_amount,
    raw.amount_receive,
    raw.merchant_receivable,
    raw.merchantReceivable,
    raw.merchantPayment,
    raw.payToMerchant,
    raw.orderEarningsInMinorUnit,
  ]

  for (const value of candidateValues) {
    const amount = Number(value)
    if (Number.isFinite(amount) && amount > 0) return amount
  }

  return Math.max(0, order.total - (order.platformFee ?? 0))
}

function getFinancialBreakdown(order: Order) {
  if (order.source === 'grab') {
    const grabMoneyBreakdown = getGrabMoneyBreakdown(order)
    if (grabMoneyBreakdown) {
      return {
        subtotal: grabMoneyBreakdown.originalSubtotal,
        productDiscount: grabMoneyBreakdown.itemDiscount,
        orderDiscount: grabMoneyBreakdown.promotionDiscount,
        platformFee: grabMoneyBreakdown.platformCommission,
        revenueAfterPromotion: grabMoneyBreakdown.revenueAfterPromotion,
        taxWithheld: grabMoneyBreakdown.taxWithheld + grabMoneyBreakdown.vatAmount + grabMoneyBreakdown.pitAmount,
      }
    }
  }

  const raw = order.rawPayload ?? {}

  return {
    subtotal: getBreakdownAmount(raw, ['merchandiseAmount', 'grossFoodSales', 'itemSubtotal', 'subTotal']) ?? order.subtotal,
    productDiscount: getBreakdownAmount(raw, ['productDiscount', 'productDiscountAmount', 'itemDiscount', 'itemDiscountAmount', 'lineItemDiscount']) ?? 0,
    orderDiscount: getBreakdownAmount(raw, ['orderDiscount', 'orderDiscountAmount', 'basketDiscount', 'campaignDiscount', 'discountAmount']) ?? order.discount,
    platformFee: getBreakdownAmount(raw, ['platformCommission', 'platformFee', 'commissionFee', 'merchantCommission', 'serviceFee']) ?? (order.platformFee ?? 0),
    revenueAfterPromotion: getBreakdownAmount(raw, ['revenueAfterPromotion', 'afterPromotionRevenue', 'netSales', 'salesAfterDiscount']) ?? order.total,
    taxWithheld: getBreakdownAmount(raw, ['taxWithheld', 'taxDeduction', 'withholdingTax', 'withheldTax', 'deductedTax', 'taxAmount']) ?? 0,
  }
}

function getGrabTimeline(order: Order) {
  const raw = getRecord(order.rawPayload)
  const times = getRecord(raw?.times)
  const deliveryTaskpoolStatus = String(raw?.deliveryTaskpoolStatus ?? '').toUpperCase()

  if (order.status === 'completed') {
    return {
      label: 'Đã giao',
      at: String(times?.deliveredAt ?? order.deliveredAt ?? ''),
    }
  }

  if (deliveryTaskpoolStatus === 'DRIVER_AT_STORE') {
    return {
      label: 'Tài xế đã đến',
      at: String(times?.driverArriveRestoAt ?? ''),
    }
  }

  if (deliveryTaskpoolStatus === 'PICKING_UP') {
    return {
      label: 'Đang lấy hàng',
      at: String(times?.driverArriveRestoAt ?? times?.readyAt ?? ''),
    }
  }

  if (order.status === 'waiting_pickup') {
    return {
      label: 'Đang chuẩn bị',
      at: String(times?.acceptedAt ?? order.placedAt ?? ''),
    }
  }

  if (order.status === 'delivering') {
    return {
      label: 'Đang giao',
      at: String(times?.driverArriveRestoAt ?? times?.readyAt ?? ''),
    }
  }

  return {
    label: ORDER_STATUS_LABEL[order.status],
    at: String(times?.createdAt ?? order.placedAt ?? ''),
  }
}

function getGrabDetailItems(order: Order) {
  if (order.items.length && order.items.some((item) => (item.price ?? 0) > 0 || (item.total ?? 0) > 0)) {
    return order.items.map((item) => ({
      ...item,
      addonLines: [],
    }))
  }

  const raw = getRecord(order.rawPayload)
  const itemInfo = getRecord(raw?.itemInfo)
  const rawItems = Array.isArray(itemInfo?.items) ? itemInfo.items : []

  return rawItems.map((item) => {
    const record = getRecord(item)
    const fare = getRecord(record?.fare)
    const modifierGroups = Array.isArray(record?.modifierGroups) ? record.modifierGroups : []
    const quantity = Number(record?.quantity ?? 1)
    const price = Number(
      fare?.priceFloat ??
      fare?.priceInMin ??
      parseAmount(fare?.priceDisplay) ??
      record?.price ??
      record?.itemPrice ??
      record?.unitPrice ??
      0
    )

    const addonLines = modifierGroups.flatMap((group) => {
      const groupRecord = getRecord(group)
      const modifiers = Array.isArray(groupRecord?.modifiers) ? groupRecord.modifiers : []

      return modifiers.map((modifier) => {
        const modifierRecord = getRecord(modifier)
        const modifierQuantity = Number(modifierRecord?.quantity ?? 1)
        const quantityLabel = modifierQuantity > 1 ? `${modifierQuantity} x ` : ''
        const priceLabel = parseAmount(modifierRecord?.priceDisplay ?? modifierRecord?.price)
        return `${quantityLabel}${String(modifierRecord?.name ?? '').trim()}${typeof priceLabel === 'number' && priceLabel > 0 ? ` ${formatCurrency(priceLabel)}` : ''}`.trim()
      }).filter(Boolean)
    })

    return {
      name: String(record?.name ?? ''),
      quantity,
      price,
      total: Number(record?.total ?? (quantity * price)),
      note: String(record?.comment ?? '').trim() || undefined,
      addonLines,
    }
  })
}

function getGrabCustomerName(order: Order) {
  const raw = getRecord(order.rawPayload)
  const eater = getRecord(raw?.eater)
  return String(eater?.name ?? order.customerName ?? 'Khach hang')
}

function getGrabCustomerNote(order: Order) {
  const raw = getRecord(order.rawPayload)
  const eater = getRecord(raw?.eater)
  return String(raw?.customerNote ?? raw?.note ?? raw?.deliveryNote ?? eater?.comment ?? order.deliveryInfo?.note ?? order.note ?? '').trim()
}

function getGrabPaymentMethodLabel(order: Order) {
  const raw = getRecord(order.rawPayload)
  const paymentMethod = String(raw?.paymentMethod ?? order.paymentMethod ?? '').trim()
  const normalized = paymentMethod.toLowerCase()

  if (!normalized) return 'Khác'
  if (normalized === 'cashless') return 'Không tiền mặt'
  if (normalized === 'cash') return 'Tiền mặt'

  return PAYMENT_METHOD_LABEL[normalized] ?? paymentMethod
}

function getBeDetailItems(order: Order) {
  const raw = getRecord(order.rawPayload)
  const rawItems = Array.isArray(raw?.order_items) ? raw.order_items : []

  return rawItems.map((item) => {
    const record = getRecord(item)
    const quantity = Math.max(1, Number(record?.quantity ?? record?.item_quantity ?? 1))
    const originalAmount = Number(record?.original_amount ?? record?.amount ?? 0)
    const sellingAmount = Number(record?.amount ?? record?.original_amount ?? 0)
    const originalPrice = Math.round(originalAmount / quantity)
    const sellingPrice = Math.round(sellingAmount / quantity)
    const strikePrice = Math.max(0, originalPrice - sellingPrice)
    const customizeJson = String(record?.customize_json ?? '').trim()
    let addonLines: string[] = []

    if (customizeJson) {
      try {
        const groups = JSON.parse(customizeJson) as Array<{ options?: Array<{ name?: string; quantity?: number; price?: number }> }>
        addonLines = groups.flatMap((group) =>
          (group.options ?? []).map((option) => {
            const quantityText = option.quantity && option.quantity > 1 ? `${option.quantity} x ` : ''
            const priceText = typeof option.price === 'number' && option.price > 0 ? ` ${formatCurrency(option.price)}` : ''
            return `${quantityText}${option.name ?? ''}${priceText}`.trim()
          })
        ).filter(Boolean)
      } catch {
        addonLines = String(record?.customize_object ?? '').split(/[:,]/).map((part) => part.trim()).filter(Boolean)
      }
    } else if (record?.customize_object) {
      addonLines = [String(record.customize_object).trim()]
    }

    return {
      name: String(record?.item_name ?? ''),
      quantity,
      originalPrice,
      strikePrice,
      sellingPrice,
      total: Number(record?.amount ?? 0),
      note: String(record?.note ?? '').trim() || undefined,
      addonLines,
    }
  })
}

function getBePaymentMethodLabel(order: Order) {
  const raw = getRecord(order.rawPayload)
  const paymentMode = String(raw?.payment_mode ?? order.paymentMethod ?? '').trim().toLowerCase()
  if (paymentMode === '1') return 'Không tiền mặt'
  if (paymentMode === '2') return 'Tiền mặt'
  return PAYMENT_METHOD_LABEL[paymentMode] ?? order.paymentMethod ?? 'Khác'
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
    title: title || 'Ưu đãi Grab',
    discountValue,
    scopeLabel,
  }
}

function getGrabVoucherLines(order: Order) {
  const raw = getRecord(order.rawPayload)
  const itemInfo = getRecord(raw?.itemInfo)
  const rawItems = Array.isArray(itemInfo?.items) ? itemInfo.items : []
  const orderLevelDiscounts = Array.isArray(raw?.orderLevelDiscounts) ? raw.orderLevelDiscounts : []
  const voucherInfo = getRecord(raw?.voucherInfo)
  const voucherCandidates = [
    ...(Array.isArray(voucherInfo?.vouchers) ? voucherInfo.vouchers : []),
    ...(Array.isArray(voucherInfo?.discounts) ? voucherInfo.discounts : []),
    ...(Array.isArray(voucherInfo?.appliedVouchers) ? voucherInfo.appliedVouchers : []),
    ...(Array.isArray(voucherInfo?.items) ? voucherInfo.items : []),
  ]

  const lines: GrabVoucherLine[] = []

  for (const discount of orderLevelDiscounts) {
    const line = buildGrabVoucherLine(discount, 'Voucher đơn hàng')
    if (line) lines.push(line)
  }

  for (const voucher of voucherCandidates) {
    const line = buildGrabVoucherLine(voucher, 'Voucher đơn hàng')
    if (line) lines.push(line)
  }

  for (const item of rawItems) {
    const itemRecord = getRecord(item)
    const discountInfo = Array.isArray(itemRecord?.discountInfo) ? itemRecord.discountInfo : []

    for (const discount of discountInfo) {
      const line = buildGrabVoucherLine(discount, 'Voucher món')
      if (line) lines.push(line)
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
    if (typeof value === 'boolean') return value ? 'Có' : 'Không'
    if (typeof value === 'number') return value > 0 ? `Có (${value})` : 'Không'

    const normalized = String(value ?? '').trim().toLowerCase()
    if (!normalized) continue
    if (['true', 'yes', 'co', 'có', '1'].includes(normalized)) return 'Có'
    if (['false', 'no', 'khong', 'không', '0'].includes(normalized)) return 'Không'
    return String(value).trim()
  }

  return '-'
}

function getBeVoucherLines(order: Order) {
  const raw = getRecord(order.rawPayload)
  const offers = getRecord(raw?.offers)
  const foodDiscounts = Array.isArray(offers?.food_discounts) ? offers.food_discounts : []
  const deliveryDiscounts = Array.isArray(offers?.delivery_discounts) ? offers.delivery_discounts : []

  return [...foodDiscounts, ...deliveryDiscounts]
    .map((offer) => {
      const record = getRecord(offer)
      const title = String(record?.title ?? '').trim()
      const discountValue = parseAmount(record?.discount_value)
      const type = String(record?.type ?? '').trim().toLowerCase()
      const scopeLabel = type === 'delivery' ? 'Ưu đãi giao hàng' : 'Voucher món'

      if (!title && typeof discountValue !== 'number') return null

      return {
        title: title || 'Ưu đãi từ Be',
        discountValue,
        scopeLabel,
      }
    })
    .filter((offer): offer is BeVoucherLine => Boolean(offer))
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
    if (typeof value === 'boolean') return value ? 'Có' : 'Không'
    if (typeof value === 'number') return value > 0 ? `Có (${value})` : 'Không'

    const normalized = String(value ?? '').trim().toLowerCase()
    if (!normalized) continue
    if (['true', 'yes', 'co', 'có', '1'].includes(normalized)) return 'Có'
    if (['false', 'no', 'khong', 'không', '0'].includes(normalized)) return 'Không'
    return String(value).trim()
  }

  return '-'
}

function renderAmountCell(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '-'
  return formatCurrency(value)
}

function GrabDetailView({ order, displayOrderCode, actualReceived, financialBreakdown, grabMoneyBreakdown, onRefresh, isRefreshing }: {
  order: Order
  displayOrderCode: string
  actualReceived: number
  financialBreakdown: ReturnType<typeof getFinancialBreakdown>
  grabMoneyBreakdown: ReturnType<typeof getGrabMoneyBreakdown>
  onRefresh: () => void
  isRefreshing: boolean
}) {
  const raw = getRecord(order.rawPayload)
  const times = getRecord(raw?.times)
  const items = getGrabDetailItems(order)
  const timeline = getGrabTimeline(order)
  const customerName = getGrabCustomerName(order)
  const customerNote = getGrabCustomerNote(order)
  const driverName = String(order.driverInfo?.name ?? getRecord(raw?.driver)?.name ?? '-')
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
              <span className={cn('badge', CHANNEL_SOURCE_COLOR[order.source])}>{CHANNEL_SOURCE_LABEL[order.source]}</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold leading-none text-gray-950">{displayOrderCode || order.shortId}</h1>
            <p className="mt-0.5 font-mono text-xs text-gray-500">{longOrderCode}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onRefresh} className="btn-outline h-9 text-sm" disabled={isRefreshing}><RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} /> Làm mới</button>
          <button type="button" onClick={() => openPrintWindow(buildReceiptPrintUrl(order._id, { autoprint: true, paperSize: '80mm' }))} className="btn-outline h-9 text-sm"><Printer className="h-4 w-4" /> In đơn</button>
        </div>
      </div>

      <div className="rounded-[28px] border border-gray-200 bg-white px-4 py-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Tài xế</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{driverName || '-'}</p>
            <p className="text-xs text-gray-500">{driverPhone || '-'}</p>
            <p className="mt-0.5 text-[11px] text-emerald-600">{timeline.label} · {formatMaybeDate(timeline.at)}</p>
            <p className="mt-0.5 text-[11px] text-gray-400">Mã đặt: <span className="font-mono text-gray-500 break-all">{bookingCode}</span></p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Khách hàng</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{customerName}</p>
            <p className="text-xs text-gray-500">{customerPhone}</p>
            {customerNote && <p className="mt-0.5 text-[11px] text-gray-500 whitespace-pre-line">{customerNote}</p>}
            <p className="mt-0.5 text-[11px] text-gray-400">Dụng cụ: <span className="text-gray-700">{utensilRequest}</span></p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400">Thương hiệu & Hub</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{order.brandName || '-'}</p>
            <p className="text-xs text-gray-500">{order.hubName || '-'}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400">Đặt lúc · Số món</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{formatMaybeDate(String(times?.createdAt ?? order.placedAt ?? ''))}</p>
            <p className="text-xs text-gray-500">{itemCount} món</p>
          </div>
        </div>
      </div>

<div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_260px]">
        <div className="rounded-[28px] border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-950">Tóm tắt đơn hàng</h2>
            <span className="text-sm text-gray-500">{itemCount} món</span>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-100 text-gray-500 text-xs">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Món</th>
                  <th className="px-3 py-2.5 text-right font-medium">Giá</th>
                  <th className="px-3 py-2.5 text-center font-medium">SL</th>
                  <th className="px-3 py-2.5 text-right font-medium">Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={`${item.name}-${index}`} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2.5">
                      <p className="text-base font-semibold text-gray-950">{item.name}</p>
                      {item.note && <p className="mt-0.5 whitespace-pre-line text-xs text-gray-500">{item.note}</p>}
                      {item.addonLines.length > 0 && <div className="mt-0.5 space-y-0.5 text-xs text-gray-500">{item.addonLines.map((addon, addonIndex) => <p key={`${addon}-${addonIndex}`}>• {addon}</p>)}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sm text-gray-700">{renderAmountCell(item.price)}</td>
                    <td className="px-3 py-2.5 text-center text-sm font-medium text-gray-900">{item.quantity}</td>
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
            <div className="flex items-center justify-between gap-3"><span>Tiền gốc</span><span className="font-medium text-gray-900">{formatCurrency(financialBreakdown.subtotal)}</span></div>
            {financialBreakdown.productDiscount > 0 && <div className="flex items-center justify-between gap-3"><span>Chiết khấu món</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.productDiscount)}</span></div>}
            {financialBreakdown.orderDiscount > 0 && <div className="flex items-center justify-between gap-3"><span>Khuyến mãi trên đơn</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.orderDiscount)}</span></div>}
            {grabMoneyBreakdown?.deliveryFee ? <div className="flex items-center justify-between gap-3"><span>Phí giao hàng khách trả</span><span className="font-medium text-gray-900">{formatCurrency(grabMoneyBreakdown.deliveryFee)}</span></div> : null}
            {grabMoneyBreakdown?.smallOrderFee ? <div className="flex items-center justify-between gap-3"><span>Phí đơn nhỏ</span><span className="font-medium text-gray-900">{formatCurrency(grabMoneyBreakdown.smallOrderFee)}</span></div> : null}
            {grabMoneyBreakdown?.serviceFee ? <div className="flex items-center justify-between gap-3"><span>Phí dịch vụ</span><span className="font-medium text-gray-900">{formatCurrency(grabMoneyBreakdown.serviceFee)}</span></div> : null}
            {grabMoneyBreakdown?.customerPaid ? <div className="flex items-center justify-between gap-3"><span>Khách thanh toán</span><span className="font-medium text-gray-900">{formatCurrency(grabMoneyBreakdown.customerPaid)}</span></div> : null}
            <div className="flex items-center justify-between gap-3"><span>Doanh thu sau KM</span><span className="font-medium text-gray-900">{formatCurrency(financialBreakdown.revenueAfterPromotion || order.total)}</span></div>
            {grabMoneyBreakdown?.platformCommission ? <div className="flex items-center justify-between gap-3"><span>Chiết khấu Grab</span><span className="font-medium text-gray-900">-{formatCurrency(grabMoneyBreakdown.platformCommission)}</span></div> : null}
            {grabMoneyBreakdown?.vatAmount ? <div className="flex items-center justify-between gap-3"><span>Thuế GTGT</span><span className="font-medium text-gray-900">-{formatCurrency(grabMoneyBreakdown.vatAmount)}</span></div> : null}
            {grabMoneyBreakdown?.pitAmount ? <div className="flex items-center justify-between gap-3"><span>Thuế TNCN</span><span className="font-medium text-gray-900">-{formatCurrency(grabMoneyBreakdown.pitAmount)}</span></div> : null}
            {grabMoneyBreakdown?.taxWithheld ? <div className="flex items-center justify-between gap-3"><span>Khấu trừ khác</span><span className="font-medium text-gray-900">-{formatCurrency(grabMoneyBreakdown.taxWithheld)}</span></div> : null}
          </div>

          <div className="mt-3 border-t border-gray-200 pt-3">
            <div className="flex items-center justify-between gap-3 text-xl font-semibold text-gray-950">
              <span>Thực nhận từ sàn</span>
              <span>{formatCurrency(actualReceived)}</span>
            </div>
          </div>

          <div className="mt-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
            <p className="font-medium text-gray-900">Phương thức thanh toán</p>
            <p className="mt-1">{paymentMethodLabel}</p>
          </div>

          <div className="mt-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
            <div className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" /><div><p className="font-medium text-gray-900">Liên hệ giao nhận</p><p className="mt-0.5">{driverPhone || order.customerPhone || '-'}</p></div></div>
            <div className="mt-2 flex items-start gap-2"><Truck className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" /><div><p className="font-medium text-gray-900">Tài xế</p><p className="mt-0.5">{driverName || '-'}</p></div></div>
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
  financialBreakdown: ReturnType<typeof getFinancialBreakdown>
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
              <span className={cn('badge', CHANNEL_SOURCE_COLOR[order.source])}>{CHANNEL_SOURCE_LABEL[order.source]}</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold leading-none text-gray-950">{displayOrderCode || order.shortId}</h1>
            <p className="mt-0.5 font-mono text-xs text-gray-500">Ref code: {order.externalOrderId}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onRefresh} className="btn-outline h-9 text-sm" disabled={isRefreshing}><RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} /> Làm mới</button>
          <button type="button" onClick={() => openPrintWindow(buildReceiptPrintUrl(order._id, { autoprint: true, paperSize: '80mm' }))} className="btn-outline h-9 text-sm"><Printer className="h-4 w-4" /> In đơn</button>
        </div>
      </div>

      <div className="rounded-[28px] border border-gray-200 bg-white px-4 py-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
          <div>
            <p className="text-[10px] text-gray-400">Site & Hub</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{order.brandName || '-'}</p>
            <p className="text-xs text-gray-500">{order.channelName || CHANNEL_SOURCE_LABEL[order.source]} · {order.hubName || '-'}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400">Thời gian</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{formatMaybeDate(order.placedAt)}</p>
            <p className="text-xs text-gray-500">Lấy: {formatMaybeDate(order.deliveryInfo?.estimatedTime || order.deliveredAt)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Khách hàng</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{order.customerName}</p>
            <p className="text-xs text-gray-500">{customerPhone}</p>
            {order.deliveryInfo?.address && <p className="mt-0.5 text-[11px] text-gray-500 line-clamp-1">{order.deliveryInfo.address}</p>}
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Tài xế</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{driverName}</p>
            <p className="text-xs text-gray-500">{driverPhone}</p>
            {order.driverInfo?.vehiclePlate && <p className="mt-0.5 text-[11px] text-gray-400">Biển số: <span className="text-gray-700">{order.driverInfo.vehiclePlate}</span></p>}
            <p className="mt-0.5 text-[11px] text-gray-400">Dụng cụ: <span className="text-gray-700">{utensilRequest}</span></p>
          </div>
        </div>
        {(order.deliveryInfo?.note || order.note) && (
          <p className="mt-2.5 border-t border-gray-100 pt-2.5 text-xs text-gray-500">Ghi chú: {order.deliveryInfo?.note || order.note}</p>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_260px]">
        <div className="rounded-[28px] border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-gray-950">Thông tin đơn hàng</h2><span className="text-sm text-gray-500">{totalItems} món</span></div>
          <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-100 text-gray-500 text-xs"><tr><th className="px-3 py-2.5 font-medium">Sản phẩm</th><th className="px-3 py-2.5 text-center font-medium">SL</th><th className="px-3 py-2.5 text-right font-medium">Giá gốc</th><th className="px-3 py-2.5 text-right font-medium">Gạch</th><th className="px-3 py-2.5 text-right font-medium">Bán</th><th className="px-3 py-2.5 text-right font-medium">Thành tiền</th></tr></thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={`${item.name}-${index}`} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2.5"><p className="text-base font-semibold text-gray-950">{item.name}</p>{item.note && <p className="mt-0.5 whitespace-pre-line text-xs text-gray-500">{item.note}</p>}{item.addonLines.length > 0 && <div className="mt-0.5 space-y-0.5 text-xs text-gray-500">{item.addonLines.map((addon, addonIndex) => <p key={`${addon}-${addonIndex}`}>• {addon}</p>)}</div>}</td>
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
            <div className="flex items-center justify-between gap-3"><span>Tiền hàng</span><span className="font-medium text-gray-900">{formatCurrency(financialBreakdown.subtotal)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Giảm giá sản phẩm</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.productDiscount)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Giảm giá tổng đơn (ĐH + VC)</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.orderDiscount)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Chiết khấu (CK) sàn</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.platformFee)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Doanh thu sau KM</span><span className="font-medium text-gray-900">{formatCurrency(financialBreakdown.revenueAfterPromotion)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Khấu trừ thuế</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.taxWithheld)}</span></div>
          </div>

          <div className="mt-3 border-t border-gray-200 pt-3"><div className="flex items-center justify-between gap-3 text-xl font-semibold text-gray-950"><span>Thực nhận từ sàn</span><span>{formatCurrency(actualReceived)}</span></div></div>
          <div className="mt-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600"><p className="font-medium text-gray-900">Phương thức thanh toán</p><p className="mt-1">{paymentMethodLabel}</p></div>
          <div className="mt-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
            <div className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" /><div><p className="font-medium text-gray-900">Liên hệ giao nhận</p><p className="mt-0.5">{driverPhone || customerPhone || '-'}</p></div></div>
            <div className="mt-2 flex items-start gap-2"><Truck className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" /><div><p className="font-medium text-gray-900">Tài xế</p><p className="mt-0.5">{driverName || 'Chưa có thông tin'}</p></div></div>
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
    return <div className="flex min-h-[50vh] items-center justify-center rounded-[28px] border border-gray-200 bg-white"><div className="flex items-center gap-3 text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> Đang tải chi tiết đơn hàng...</div></div>
  }

  if (!order) {
    return <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-10 text-red-700">{error instanceof Error ? error.message : 'Không tìm thấy đơn hàng.'}</div>
  }

  const actualReceived = getSettlementActualReceived(order)
  const totalItems = order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  const displayOrderCode = getOrderDisplayCode(order)
  const financialBreakdown = getSettlementFinancialBreakdown(order)
  const grabMoneyBreakdown = getSettlementGrabMoneyBreakdown(order)
  const showExternalReference = Boolean(order.externalOrderId && order.externalOrderId !== displayOrderCode)

  if (order.source === 'grab') {
    return <GrabDetailView order={order} displayOrderCode={displayOrderCode} actualReceived={actualReceived} financialBreakdown={financialBreakdown} grabMoneyBreakdown={grabMoneyBreakdown} onRefresh={() => refetch()} isRefreshing={isRefetching} />
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
              <span className={cn('badge', CHANNEL_SOURCE_COLOR[order.source])}>{CHANNEL_SOURCE_LABEL[order.source]}</span>
            </div>
            <h1 className="mt-1 text-2xl font-semibold leading-none text-gray-950">{displayOrderCode || order.shortId}</h1>
            {showExternalReference && <p className="mt-0.5 font-mono text-xs text-gray-500">Ref code: {order.externalOrderId}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => refetch()} className="btn-outline h-9 text-sm" disabled={isRefetching}><RefreshCw className={cn('h-4 w-4', isRefetching && 'animate-spin')} /> Làm mới</button>
          <button type="button" onClick={() => openPrintWindow(buildReceiptPrintUrl(order._id, { autoprint: true, paperSize: '80mm' }))} className="btn-outline h-9 text-sm"><Printer className="h-4 w-4" /> In đơn</button>
          <button type="button" onClick={() => openPrintWindow(buildReceiptPrintUrl(order._id, { autoprint: true, paperSize: '58mm' }))} className="btn-outline h-9 text-sm"><Printer className="h-4 w-4" /> In phiếu tem</button>
          <button type="button" onClick={() => openPrintWindow(buildReceiptPrintUrl(order._id, { autoprint: false, paperSize: '80mm' }))} className="btn-outline h-9 text-sm"><Printer className="h-4 w-4" /> In qua dialog</button>
        </div>
      </div>

      <div className="rounded-[28px] border border-gray-200 bg-white px-4 py-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
          <div>
            <p className="text-[10px] text-gray-400">Site & Hub</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{order.brandName || '-'}</p>
            <p className="text-xs text-gray-500">{order.channelName || CHANNEL_SOURCE_LABEL[order.source]} · {order.hubName || '-'}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400">Thời gian</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{formatMaybeDate(order.placedAt)}</p>
            <p className="text-xs text-gray-500">Lấy: {formatMaybeDate(order.deliveredAt)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Khách hàng</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{order.customerName || '-'}</p>
            <p className="text-xs text-gray-500">{getDisplayCustomerPhone(order) || '-'}</p>
            {order.deliveryInfo?.address && <p className="mt-0.5 text-[11px] text-gray-500 line-clamp-1">{order.deliveryInfo.address}</p>}
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Tài xế</p>
            <p className="mt-0.5 text-sm font-semibold text-gray-950">{order.driverInfo?.name || '-'}</p>
            <p className="text-xs text-gray-500">{getDisplayDriverPhone(order) || '-'}</p>
            {order.driverInfo?.vehiclePlate && <p className="mt-0.5 text-[11px] text-gray-400">Biển số: <span className="text-gray-700">{order.driverInfo.vehiclePlate}</span></p>}
            <p className="mt-0.5 text-[11px] text-emerald-600">Thực nhận: {formatCurrency(actualReceived)}</p>
          </div>
        </div>
        {(order.deliveryInfo?.note || order.note) && (
          <p className="mt-2.5 border-t border-gray-100 pt-2.5 text-xs text-gray-500">Ghi chú: {order.deliveryInfo?.note || order.note}</p>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_260px]">
        <div className="rounded-[28px] border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-gray-950">Thông tin đơn hàng</h2><span className="text-sm text-gray-500">{totalItems} món</span></div>
          <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-100 text-gray-500 text-xs"><tr><th className="px-3 py-2.5 font-medium">Sản phẩm</th><th className="px-3 py-2.5 text-center font-medium">SL</th><th className="px-3 py-2.5 text-right font-medium">Giá gốc</th><th className="px-3 py-2.5 text-right font-medium">Thành tiền</th></tr></thead>
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
            <div className="flex items-center justify-between gap-3"><span>Tiền hàng</span><span className="font-medium text-gray-900">{formatCurrency(financialBreakdown.subtotal)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Giảm giá sản phẩm</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.productDiscount)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Giảm giá tổng đơn (ĐH + VC)</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.orderDiscount)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Chiết khấu (CK) sàn</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.platformFee)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Doanh thu sau KM</span><span className="font-medium text-gray-900">{formatCurrency(financialBreakdown.revenueAfterPromotion)}</span></div>
            <div className="flex items-center justify-between gap-3"><span>Khấu trừ thuế</span><span className="font-medium text-gray-900">-{formatCurrency(financialBreakdown.taxWithheld)}</span></div>
          </div>

          <div className="mt-3 border-t border-gray-200 pt-3"><div className="flex items-center justify-between gap-3 text-xl font-semibold text-gray-950"><span>Thực nhận từ sàn</span><span>{formatCurrency(actualReceived)}</span></div></div>
          <div className="mt-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600"><p className="font-medium text-gray-900">Phương thức thanh toán</p><p className="mt-1">{PAYMENT_METHOD_LABEL[order.paymentMethod || 'other'] || order.paymentMethod || 'Khác'}</p></div>
          <div className="mt-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
            <div className="flex items-start gap-2"><Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" /><div><p className="font-medium text-gray-900">Liên hệ giao nhận</p><p className="mt-0.5">{getDisplayDriverPhone(order) || getDisplayCustomerPhone(order) || '-'}</p></div></div>
            <div className="mt-2 flex items-start gap-2"><Truck className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" /><div><p className="font-medium text-gray-900">Tài xế</p><p className="mt-0.5">{order.driverInfo?.name || 'Chưa có thông tin'}</p></div></div>
          </div>
        </div>
      </div>
    </div>
  )
}