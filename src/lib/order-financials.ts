import type { Order } from '@/types'

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

export function extractPhone(value?: string) {
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

export function getGrabMoneyBreakdown(order: Order) {
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

export function getBeMoneyBreakdown(order: Order) {
  const raw = getRecord(order.rawPayload)
  if (!raw) return null

  const itemRecords = Array.isArray(raw.order_items) ? raw.order_items.map((item) => getRecord(item)).filter(Boolean) as Record<string, unknown>[] : []
  const offers = getRecord(raw.offers)
  const foodDiscounts = Array.isArray(offers?.food_discounts) ? offers.food_discounts : []
  const deliveryDiscounts = Array.isArray(offers?.delivery_discounts) ? offers.delivery_discounts : []
  const originalSubtotal = parseAmount(raw.originial_amount ?? raw.original_amount ?? raw.order_amount ?? raw.sub_total ?? raw.subtotal) ?? order.subtotal
  const originalItemSubtotal = itemRecords.reduce((sum, item) => {
    const amount = parseAmount(item.original_amount)
    return sum + (typeof amount === 'number' ? amount : 0)
  }, 0)
  const soldItemSubtotal = itemRecords.reduce((sum, item) => {
    const amount = parseAmount(item.amount)
    return sum + (typeof amount === 'number' ? amount : 0)
  }, 0)
  const productDiscount = Math.max(0, originalItemSubtotal - soldItemSubtotal)
  const orderDiscountRecord = getRecord(raw.order_discount)
  const offerDiscountTotal = [...foodDiscounts, ...deliveryDiscounts].reduce((sum, offer) => {
    const offerRecord = getRecord(offer)
    const amount = parseAmount(offerRecord?.discount_value)
    return sum + (typeof amount === 'number' ? amount : 0)
  }, 0)
  const orderDiscount = Math.max(0,
    parseAmount(orderDiscountRecord?.total_customer_discount)
    ?? parseAmount(orderDiscountRecord?.be_discount)
    ?? parseAmount(orderDiscountRecord?.merchant_discount)
    ?? parseAmount(orderDiscountRecord?.partner_discount)
    ?? parseAmount(raw.partner_discount)
    ?? (offerDiscountTotal > 0 ? offerDiscountTotal : undefined)
    ?? 0,
  )
  const platformFee = Math.max(0,
    parseAmount(raw.jugnoo_commission)
    ?? parseAmount(raw.merchant_pays)
    ?? parseAmount(raw.commission)
    ?? parseAmount(raw.marketing_fee)
    ?? parseAmount(raw.gateway_fee)
    ?? order.platformFee
    ?? 0,
  )
  const revenueAfterPromotion = parseAmount(raw.order_amount ?? raw.originial_amount ?? raw.original_amount ?? raw.sub_total ?? raw.subtotal) ?? order.total
  const taxWithheld = Math.max(0,
    (parseAmount(raw.vat_amount) ?? 0)
    + (parseAmount(raw.pit_amount) ?? 0)
    + (parseAmount(raw.tax_amount) ?? 0),
  )
  const actualReceived = parseAmount(raw.net_order_amount ?? raw.received_amount ?? raw.merchant_receivable)
    ?? Math.max(0, revenueAfterPromotion - platformFee - taxWithheld)

  return {
    subtotal: originalSubtotal,
    productDiscount,
    orderDiscount,
    platformFee,
    revenueAfterPromotion,
    taxWithheld,
    actualReceived,
  }
}

export function getActualReceived(order: Order) {
  if (order.source === 'grab') {
    const grabMoneyBreakdown = getGrabMoneyBreakdown(order)
    if (grabMoneyBreakdown) return grabMoneyBreakdown.actualReceived
  }

  if (order.source === 'be') {
    const beMoneyBreakdown = getBeMoneyBreakdown(order)
    if (beMoneyBreakdown) return beMoneyBreakdown.actualReceived
  }

  const raw = getRecord(order.rawPayload) ?? {}
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

export function getFinancialBreakdown(order: Order) {
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

  if (order.source === 'be') {
    const beMoneyBreakdown = getBeMoneyBreakdown(order)
    if (beMoneyBreakdown) return beMoneyBreakdown
  }

  const raw = getRecord(order.rawPayload) ?? {}

  return {
    subtotal: getBreakdownAmount(raw, ['merchandiseAmount', 'grossFoodSales', 'itemSubtotal', 'subTotal']) ?? order.subtotal,
    productDiscount: getBreakdownAmount(raw, ['productDiscount', 'productDiscountAmount', 'itemDiscount', 'itemDiscountAmount', 'lineItemDiscount']) ?? 0,
    orderDiscount: getBreakdownAmount(raw, ['orderDiscount', 'orderDiscountAmount', 'basketDiscount', 'campaignDiscount', 'discountAmount']) ?? order.discount,
    platformFee: getBreakdownAmount(raw, ['platformCommission', 'platformFee', 'commissionFee', 'merchantCommission', 'serviceFee']) ?? (order.platformFee ?? 0),
    revenueAfterPromotion: getBreakdownAmount(raw, ['revenueAfterPromotion', 'afterPromotionRevenue', 'netSales', 'salesAfterDiscount']) ?? order.total,
    taxWithheld: getBreakdownAmount(raw, ['taxWithheld', 'taxDeduction', 'withholdingTax', 'withheldTax', 'deductedTax', 'taxAmount']) ?? 0,
  }
}

export function getDisplayCustomerPhone(order: Order) {
  const raw = getRecord(order.rawPayload)
  const customer = getRecord(raw?.customer)
  const consumer = getRecord(raw?.consumer)
  const eater = getRecord(raw?.eater)

  return String(
    order.customerPhone
    ?? raw?.customer_phone_no
    ?? raw?.receiver_phone_no
    ?? customer?.phone
    ?? customer?.phoneNumber
    ?? customer?.mobileNumber
    ?? consumer?.phone
    ?? consumer?.phoneNumber
    ?? consumer?.mobileNumber
    ?? eater?.phone
    ?? eater?.phoneNumber
    ?? eater?.mobileNumber
    ?? extractPhone(String(eater?.comment ?? ''))
    ?? ''
  ).trim()
}

export function getDisplayDriverPhone(order: Order) {
  const raw = getRecord(order.rawPayload)
  const driver = getRecord(raw?.driver)

  return String(
    order.driverInfo?.phone
    ?? raw?.driver_phone_no
    ?? driver?.phone
    ?? driver?.phoneNumber
    ?? driver?.mobileNumber
    ?? ''
  ).trim()
}