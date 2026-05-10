import mongoose from 'mongoose'
import CustomerModel from '@/models/Customer'
import { hasMeaningfulCustomerName, hasMeaningfulPhone } from '@/lib/order-upsert'

export const CUSTOMER_SOURCE_OPTIONS = ['grab', 'be', 'shopee', 'xanh_sm', 'internal', 'other'] as const

export type CustomerSource = (typeof CUSTOMER_SOURCE_OPTIONS)[number]

type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum'

export function calcCustomerTier(totalSpend: number): LoyaltyTier {
  if (totalSpend >= 10_000_000) return 'platinum'
  if (totalSpend >= 5_000_000) return 'gold'
  if (totalSpend >= 1_000_000) return 'silver'
  return 'bronze'
}

function normalizeCustomerSource(source: unknown): CustomerSource | undefined {
  const normalized = String(source ?? '').trim().toLowerCase()
  if (!normalized) return undefined
  return CUSTOMER_SOURCE_OPTIONS.includes(normalized as CustomerSource)
    ? (normalized as CustomerSource)
    : 'other'
}

function parseDateValue(value: unknown) {
  if (!value) return undefined
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? undefined : date
}

type UpsertCustomerProfileInput = {
  phone: string
  name: string
  brandId: mongoose.Types.ObjectId | string
  source?: string
  placedAt?: Date | string | null
  orderTotal?: number
  isNewOrder?: boolean
}

type UpsertCustomerProfileResult = {
  ok: boolean
  customerId?: string
  totalSpend?: number
  tier?: LoyaltyTier
  error?: string
}

export async function upsertCustomerProfile(input: UpsertCustomerProfileInput): Promise<UpsertCustomerProfileResult> {
  const phone = String(input.phone ?? '').trim()
  const name = String(input.name ?? '').trim()
  const source = normalizeCustomerSource(input.source)
  const orderTotal = Math.max(0, Number(input.orderTotal ?? 0) || 0)
  const isNewOrder = input.isNewOrder === true
  const placedAt = parseDateValue(input.placedAt) ?? new Date()

  if (!hasMeaningfulPhone(phone) || !hasMeaningfulCustomerName(name)) {
    return { ok: false, error: 'Thiếu tên hoặc số điện thoại khách hàng hợp lệ' }
  }

  if (!mongoose.isValidObjectId(input.brandId)) {
    return { ok: false, error: 'brandId khách hàng không hợp lệ' }
  }

  const brandId = input.brandId instanceof mongoose.Types.ObjectId
    ? input.brandId
    : new mongoose.Types.ObjectId(String(input.brandId))

  const existingCustomer = await CustomerModel.findOne({ phone, brandId }).select('name').lean() as { name?: string } | null
  const shouldUpdateName = !existingCustomer || !hasMeaningfulCustomerName(existingCustomer.name)

  const saved = await CustomerModel.findOneAndUpdate(
    { phone, brandId },
    {
      $set: {
        ...(shouldUpdateName ? { name } : {}),
        ...(source ? { source } : {}),
        lastOrderAt: placedAt,
        status: 'active',
      },
      ...(source ? { $addToSet: { sources: source } } : {}),
      ...(isNewOrder ? { $inc: { orderCount: 1, totalSpend: orderTotal } } : {}),
      $setOnInsert: {
        phone,
        brandId,
        name,
        points: 0,
        totalSpend: isNewOrder ? 0 : orderTotal,
        orderCount: isNewOrder ? 0 : 1,
        tier: 'bronze',
        status: 'active',
        ...(source ? { source, sources: [source] } : {}),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )

  if (!saved) {
    return { ok: false, error: 'Không thể lưu hồ sơ khách hàng' }
  }

  const nextTier = calcCustomerTier(Number(saved.totalSpend ?? 0))
  if (saved.tier !== nextTier) {
    await CustomerModel.findByIdAndUpdate(saved._id, { $set: { tier: nextTier } })
  }

  return {
    ok: true,
    customerId: String(saved._id),
    totalSpend: Number(saved.totalSpend ?? 0),
    tier: nextTier,
  }
}