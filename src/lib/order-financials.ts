import type { Order } from '@/types'
import { extractCompactPhone, normalizeCompactPhone } from '@/lib/phone'

function parseAmount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined

  const normalized = value.replace(/[^\d-]/g, '')
  if (!normalized || normalized === '-') return undefined

  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : undefined
}

function parseDeductionAmount(value: unknown) {
  const amount = parseAmount(value)
  if (typeof amount !== 'number') return undefined
  return Math.abs(amount)
}

function getRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

function getPhoneCandidateValue(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim()
    return text || undefined
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = getPhoneCandidateValue(item)
      if (candidate) return candidate
    }
    return undefined
  }

  const record = getRecord(value)
  if (!record) return undefined

  const nestedCandidates = [
    record.phone,
    record.phoneNumber,
    record.mobileNumber,
    record.contactNumber,
    record.contactNo,
    record.contact,
    record.displayPhone,
    record.phoneNo,
    record.mobile,
    record.value,
    record.number,
  ]

  for (const candidate of nestedCandidates) {
    const resolved = getPhoneCandidateValue(candidate)
    if (resolved) return resolved
  }

  return undefined
}

function getNormalizedPhoneFromCandidates(candidates: unknown[]) {
  for (const candidate of candidates) {
    const value = getPhoneCandidateValue(candidate)
    if (!value) continue

    const normalized = normalizeCompactPhone(value) ?? extractCompactPhone(value)
    if (normalized) return normalized
  }

  return ''
}

function normalizeDisplayName(value: unknown, placeholders: string[]) {
  if (!hasText(value)) return undefined

  const trimmed = String(value).trim()
  const compact = trimmed.replace(/\s+/g, '')
  if (compact.includes('*') || /^[xX#._-]+$/.test(compact)) return undefined

  const normalized = trimmed.toLowerCase()
  if (placeholders.includes(normalized)) return undefined

  return trimmed
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
  return extractCompactPhone(value)
}

function getGrabFareRecord(order: Order) {
  const raw = getRecord(order.rawPayload)
  return getRecord(raw?.fare)
}

function getGrabPriceRecord(order: Order) {
  const raw = getRecord(order.rawPayload)
  return getRecord(raw?.price ?? raw?.pricing)
}

function getAmountFromSources(sources: Array<Record<string, unknown> | undefined>, keys: string[]) {
  for (const source of sources) {
    if (!source) continue

    for (const key of keys) {
      const amount = parseAmount(source[key])
      if (typeof amount === 'number') return amount
    }
  }

  return undefined
}

function getDeductionAmountFromSources(sources: Array<Record<string, unknown> | undefined>, keys: string[]) {
  for (const source of sources) {
    if (!source) continue

    for (const key of keys) {
      const amount = parseDeductionAmount(source[key])
      if (typeof amount === 'number') return amount
    }
  }

  return undefined
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
  const raw = getRecord(order.rawPayload)
  const financialBreakdown = getRecord(raw?.financialBreakdown)
  const fare = getGrabFareRecord(order)
  const price = getGrabPriceRecord(order)
  const amountSources = [financialBreakdown, fare, price, raw]

  const hasMoneySignals = [
    getAmountFromSources(amountSources, ['merchandiseAmount', 'subtotal', 'subTotal', 'originalPriceInMin']),
    getAmountFromSources(amountSources, ['productDiscount', 'orderDiscount', 'discount', 'discountAmount', 'basketPromo']),
    getAmountFromSources(amountSources, ['revenueAfterPromotion', 'totalDisplay', 'revampedSubtotalDisplay', 'eaterPayment', 'total', 'orderTotal']),
    getAmountFromSources(amountSources, ['platformCommission', 'mexCommissionDisplay', 'platformFee', 'commissionFee', 'merchantCommission', 'merchantFee', 'serviceFee']),
    getAmountFromSources(amountSources, ['taxWithheld', 'onBehalfWithholdTaxDisplay', 'withholdingTax', 'withheldTax', 'vatAmount', 'mexVatAmountDisplay', 'pitAmount', 'mexPitAmountDisplay']),
    getAmountFromSources(amountSources, ['actualReceived', 'merchantReceivable', 'merchantPayment', 'payToMerchant', 'receivedAmount']),
  ].some((value) => typeof value === 'number')

  if (!fare && !financialBreakdown && !price && !hasMoneySignals) return null

  const originalSubtotal = getAmountFromSources(
    [financialBreakdown, fare, price, raw],
    ['merchandiseAmount', 'subTotalDisplay', 'subtotalIncludeMerchantCharge', 'originalPriceInMin', 'subtotal', 'subTotal'],
  ) ?? order.subtotal
  const explicitItemDiscount = getDeductionAmountFromSources([financialBreakdown, price, raw], ['productDiscount', 'itemDiscount'])
  const explicitPromotionDiscount = getDeductionAmountFromSources([financialBreakdown, price, raw], ['orderDiscount', 'merchantDiscount', 'merchantPromotionDiscount', 'basketPromo', 'discountAmount', 'discount'])
  const explicitRevenueAfterPromotion = getAmountFromSources([financialBreakdown], ['revenueAfterPromotion'])
  const itemDiscount = explicitItemDiscount ?? getGrabItemDiscountTotal(order)
  // Voucher / order-level discount from voucherInfo (used when explicit discount fields are 0 or absent)
  const voucherInfoRecord = getRecord(raw?.voucherInfo)
  const voucherDiscount = Array.isArray(voucherInfoRecord?.vouchers)
    ? (voucherInfoRecord.vouchers as Record<string, unknown>[]).reduce(
        (s, v) => s + Math.abs(Number((v as Record<string, unknown>)?.discountAmount ?? (v as Record<string, unknown>)?.amount ?? (v as Record<string, unknown>)?.value ?? 0)), 0)
    : Array.isArray(voucherInfoRecord?.discounts)
    ? (voucherInfoRecord.discounts as Record<string, unknown>[]).reduce(
        (s, v) => s + Math.abs(Number((v as Record<string, unknown>)?.discountAmount ?? (v as Record<string, unknown>)?.amount ?? (v as Record<string, unknown>)?.value ?? 0)), 0)
    : 0
  const orderLevelDiscount = Array.isArray(raw?.orderLevelDiscounts)
    ? (raw.orderLevelDiscounts as Record<string, unknown>[]).reduce(
        (s, d) => s + Math.abs(Number((d as Record<string, unknown>)?.discountAmountValueInMin ?? (d as Record<string, unknown>)?.discountAmount ?? (d as Record<string, unknown>)?.amount ?? (d as Record<string, unknown>)?.value ?? 0)), 0)
    : 0
  const promotionDiscount = (typeof explicitPromotionDiscount === 'number' && explicitPromotionDiscount > 0)
    ? explicitPromotionDiscount
    : (voucherDiscount || orderLevelDiscount || 0)
  const computedRevenueAfterPromotion = Math.max(0, originalSubtotal - itemDiscount - promotionDiscount)
  const revenueAfterPromotion = typeof explicitRevenueAfterPromotion === 'number'
    ? explicitRevenueAfterPromotion
    : computedRevenueAfterPromotion
  const deliveryFee = getAmountFromSources([fare, price, raw], ['deliveryFeeDisplay', 'deliveryFee']) ?? 0
  const smallOrderFee = getAmountFromSources([fare, price, raw], ['smallOrderFeeDisplay', 'smallOrderFee']) ?? 0
  const serviceFee = getAmountFromSources([fare, price, raw], ['serviceChargeFeeDisplay', 'serviceFee']) ?? 0
  const customerPaid = getAmountFromSources([fare, price, raw], ['passengerTotalDisplay', 'eaterPayment', 'total', 'orderTotal']) ?? (revenueAfterPromotion + deliveryFee + smallOrderFee + serviceFee)
  const platformCommission = getDeductionAmountFromSources(
    [financialBreakdown, fare, price, raw],
    ['platformCommission', 'mexCommissionDisplay', 'platformFee', 'commissionFee', 'merchantCommission', 'merchantFee', 'serviceFee'],
  ) ?? Math.abs(order.platformFee ?? 0)
  const explicitTaxWithheld = getDeductionAmountFromSources(
    [financialBreakdown],
    ['taxWithheld', 'onBehalfWithholdTaxDisplay', 'withholdingTax', 'withheldTax', 'onBehalfWithholdTax', 'deductedTax'],
  )
  const vatAmount = explicitTaxWithheld === undefined
    ? (getDeductionAmountFromSources([fare, price, raw], ['mexVatAmountDisplay', 'vatAmount', 'vat', 'commissionVat']) ?? 0)
    : 0
  const pitAmount = explicitTaxWithheld === undefined
    ? (getDeductionAmountFromSources([fare, price, raw], ['mexPitAmountDisplay', 'pitAmount', 'pit', 'personalIncomeTax']) ?? 0)
    : 0
  const taxWithheld = explicitTaxWithheld
    ?? getDeductionAmountFromSources(
      [fare, price, raw],
      ['onBehalfWithholdTaxDisplay', 'withholdingTax', 'withheldTax', 'onBehalfWithholdTax', 'deductedTax'],
    )
    ?? 0
  const explicitActualReceived = getAmountFromSources(
    [financialBreakdown, price, raw],
    ['actualReceived', 'merchantReceivable', 'receivedAmount', 'merchantPayment', 'payToMerchant'],
  )
  const computedActualReceived = Math.max(0, revenueAfterPromotion - platformCommission - vatAmount - pitAmount - taxWithheld)
  const actualReceived = typeof explicitActualReceived === 'number' && explicitActualReceived > 0
    ? explicitActualReceived
    : computedActualReceived

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
  const receiver = getRecord(raw?.receiver)
  const consumer = getRecord(raw?.consumer)
  const eater = getRecord(raw?.eater)

  return getNormalizedPhoneFromCandidates([
    order.customerPhone,
    raw?.customer_phone_no,
    raw?.receiver_phone_no,
    raw?.customerPhone,
    raw?.receiverPhone,
    customer?.phones,
    customer?.phone,
    customer?.phoneNumber,
    customer?.mobileNumber,
    customer?.contactNumber,
    customer?.displayPhone,
    consumer?.phones,
    consumer?.phone,
    consumer?.phoneNumber,
    consumer?.mobileNumber,
    consumer?.contactNumber,
    consumer?.displayPhone,
    // eater = Grab app user (the customer). Check before receiver because receiver may
    // hold driver or system contact on some Grab API versions.
    eater?.phones,
    eater?.phone,
    eater?.phoneNumber,
    eater?.mobileNumber,
    eater?.contactNumber,
    eater?.displayPhone,
    receiver?.phones,
    receiver?.phone,
    receiver?.phoneNumber,
    receiver?.mobileNumber,
    receiver?.contactNumber,
    receiver?.displayPhone,
    extractPhone(String(receiver?.comment ?? '')),
    extractPhone(String(consumer?.comment ?? '')),
    extractPhone(String(eater?.comment ?? '')),
    extractPhone(String(raw?.specialRequest ?? raw?.note ?? raw?.remarks ?? '')),
  ])
}

export function getDisplayCustomerName(order: Order) {
  const raw = getRecord(order.rawPayload)
  const customer = getRecord(raw?.customer)
  const receiver = getRecord(raw?.receiver)
  const consumer = getRecord(raw?.consumer)
  const eater = getRecord(raw?.eater)

  const candidates = [
    order.customerName,
    customer?.name,
    customer?.displayName,
    receiver?.name,
    receiver?.displayName,
    consumer?.name,
    consumer?.displayName,
    eater?.name,
    eater?.displayName,
    raw?.customer_name,
    raw?.receiver_name,
  ]

  for (const candidate of candidates) {
    const name = normalizeDisplayName(candidate, ['khách hàng', 'khach hang'])
    if (name) return name
  }

  return undefined
}

export function getDisplayDriverPhone(order: Order) {
  const raw = getRecord(order.rawPayload)
  const delivery = getRecord(raw?.delivery)
  const deliveryDriver = getRecord(delivery?.driver)
  const driver = getRecord(raw?.driver)
  const rider = getRecord(raw?.rider)
  // Additional nested sources Grab/Be may use
  const driverDetails = getRecord(raw?.driverDetails)
  const driverInfo = getRecord(raw?.driverInfo)
  const courier = getRecord(raw?.courier)
  const deliveryPerson = getRecord(raw?.deliveryPerson ?? raw?.deliveryAgent)

  return getNormalizedPhoneFromCandidates([
    order.driverInfo?.phone,
    raw?.driver_phone_no,
    raw?.driver_contact,
    raw?.driver_phone,
    raw?.driverPhone,
    raw?.driverContactNo,
    raw?.driverPhoneNumber,
    deliveryDriver?.phones,
    deliveryDriver?.phone,
    deliveryDriver?.phoneNumber,
    deliveryDriver?.mobileNumber,
    deliveryDriver?.contactNumber,
    deliveryDriver?.displayPhone,
    deliveryDriver?.contact,
    driver?.phones,
    driver?.phone,
    driver?.phoneNumber,
    driver?.mobileNumber,
    driver?.contactNumber,
    driver?.displayPhone,
    driver?.contact,
    rider?.phones,
    rider?.phone,
    rider?.phoneNumber,
    rider?.mobileNumber,
    rider?.contactNumber,
    rider?.displayPhone,
    driverDetails?.phones,
    driverDetails?.phone,
    driverDetails?.phoneNumber,
    driverDetails?.mobileNumber,
    driverDetails?.contactNumber,
    driverDetails?.displayPhone,
    driverInfo?.phones,
    driverInfo?.phone,
    driverInfo?.phoneNumber,
    driverInfo?.contactNumber,
    driverInfo?.displayPhone,
    courier?.phones,
    courier?.phone,
    courier?.phoneNumber,
    courier?.contactNumber,
    courier?.displayPhone,
    deliveryPerson?.phones,
    deliveryPerson?.phone,
    deliveryPerson?.phoneNumber,
    deliveryPerson?.contactNumber,
    deliveryPerson?.displayPhone,
  ])
}

export function getDisplayDriverName(order: Order) {
  const raw = getRecord(order.rawPayload)
  const delivery = getRecord(raw?.delivery)
  const deliveryDriver = getRecord(delivery?.driver)
  const driver = getRecord(raw?.driver)
  const rider = getRecord(raw?.rider)
  const driverDetails = getRecord(raw?.driverDetails)
  const driverInfo = getRecord(raw?.driverInfo)
  const courier = getRecord(raw?.courier)
  const deliveryPerson = getRecord(raw?.deliveryPerson ?? raw?.deliveryAgent)

  const DRIVER_PLACEHOLDERS = ['tài xế', 'tai xe', 'driver', 'shipper']
  const candidates = [
    order.driverInfo?.name,
    deliveryDriver?.name,
    deliveryDriver?.displayName,
    deliveryDriver?.fullName,
    // firstName + lastName combination
    (deliveryDriver?.firstName && deliveryDriver?.lastName) ? `${deliveryDriver.firstName} ${deliveryDriver.lastName}` : undefined,
    driver?.name,
    driver?.displayName,
    driver?.fullName,
    (driver?.firstName && driver?.lastName) ? `${driver.firstName} ${driver.lastName}` : undefined,
    rider?.name,
    rider?.displayName,
    rider?.fullName,
    (rider?.firstName && rider?.lastName) ? `${rider.firstName} ${rider.lastName}` : undefined,
    driverDetails?.name,
    driverDetails?.displayName,
    driverDetails?.fullName,
    driverInfo?.name,
    driverInfo?.displayName,
    courier?.name,
    courier?.displayName,
    deliveryPerson?.name,
    deliveryPerson?.displayName,
    raw?.driver_name,
    raw?.driverName,
    raw?.driverDisplayName,
  ]

  for (const candidate of candidates) {
    const name = normalizeDisplayName(candidate, DRIVER_PLACEHOLDERS)
    if (name) return name
  }

  return undefined
}