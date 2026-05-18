import { getDisplayCustomerName, getDisplayCustomerPhone, getDisplayDriverName, getDisplayDriverPhone } from '@/lib/order-financials'
import { hasMeaningfulCustomerName, hasMeaningfulDriverName, hasMeaningfulPhone } from '@/lib/order-upsert'
import type { NormalizedOrder, Order } from '@/types'

type CustomerProfileCandidate = {
  name: string
  phone: string
  brandId: string
  total: number
  isNew: boolean
  placedAt?: string | Date
}

type DriverProfileCandidate = {
  name: string
  phone: string
  platform: string
  isNew: boolean
  placedAt?: string | Date
}

export function getOrderContactProfileCandidates(
  normalized: NormalizedOrder,
  options: { brandId: string; platform: string; isNew: boolean },
) {
  const order = normalized as unknown as Order

  const customerName = getDisplayCustomerName(order) ?? normalized.customerName?.trim()
  const customerPhone = getDisplayCustomerPhone(order) || normalized.customerPhone?.trim()
  const customer = customerName && customerPhone && hasMeaningfulCustomerName(customerName) && hasMeaningfulPhone(customerPhone)
    ? {
      name: customerName,
      phone: customerPhone,
      brandId: options.brandId,
      total: normalized.total ?? 0,
      isNew: options.isNew,
      placedAt: normalized.placedAt,
    } satisfies CustomerProfileCandidate
    : undefined

  const driverNameRaw = getDisplayDriverName(order) ?? normalized.driverInfo?.name?.trim()
  const driverPhone = getDisplayDriverPhone(order) || normalized.driverInfo?.phone?.trim()
  const driverName = (driverNameRaw && hasMeaningfulDriverName(driverNameRaw))
    ? driverNameRaw
    : (driverPhone && hasMeaningfulPhone(driverPhone) ? `(Tai xe ${options.platform})` : undefined)

  const driver = driverName && driverPhone && hasMeaningfulPhone(driverPhone)
    ? {
      name: driverName,
      phone: driverPhone,
      platform: options.platform,
      isNew: options.isNew,
      placedAt: normalized.placedAt,
    } satisfies DriverProfileCandidate
    : undefined

  return { customer, driver }
}
