import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, isValid, parseISO } from 'date-fns'
import { vi } from 'date-fns/locale'
import { repairTextRecord, repairVietnameseText } from '@/lib/text-normalizer'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function toValidDate(value: string | Date | null | undefined) {
  if (!value) return null
  const date = typeof value === 'string' ? parseISO(value) : value
  return isValid(date) ? date : null
}

export function formatDate(date: string | Date, fmt = 'dd/MM/yyyy HH:mm') {
  const d = toValidDate(date)
  if (!d) return '--'
  return format(d, fmt, { locale: vi })
}

export function formatDateNative(
  date: string | Date | null | undefined,
  mode: 'date' | 'time' | 'datetime' = 'datetime',
  locale = 'vi-VN',
) {
  const d = toValidDate(date)
  if (!d) return '--'
  if (mode === 'date') return d.toLocaleDateString(locale)
  if (mode === 'time') return d.toLocaleTimeString(locale)
  return d.toLocaleString(locale)
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount)
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n)
}

type OrderCodeLike = {
  source?: string
  shortId?: string
  externalOrderId?: string
  rawPayload?: Record<string, unknown>
}

export function getOrderDisplayCode(order: OrderCodeLike) {
  const raw = order.rawPayload ?? {}

  if (order.source === 'grab') {
    const grabCode = raw.displayID ?? raw.shortOrderID ?? raw.shortOrderId
    if (grabCode) return repairVietnameseText(String(grabCode))
  }

  return repairVietnameseText(String(order.externalOrderId ?? order.shortId ?? ''))
}

export function generateId() {
  return Math.random().toString(36).substring(2, 10).toUpperCase()
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

export const ORDER_STATUS_LABEL: Record<string, string> = repairTextRecord({
  draft: 'Đơn nháp',
  pre_order: 'Đặt trước',
  waiting_confirm: 'Chờ xác nhận',
  waiting_pickup: 'Chờ lấy hàng',
  delivering: 'Đang giao',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
})

export const ORDER_STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pre_order: 'bg-blue-100 text-blue-700',
  waiting_confirm: 'bg-yellow-100 text-yellow-700',
  waiting_pickup: 'bg-orange-100 text-orange-700',
  delivering: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

export const CHANNEL_SOURCE_LABEL: Record<string, string> = repairTextRecord({
  shopee: 'Shopee',
  grab: 'GrabFood',
  xanh_sm: 'Xanh SM',
  be: 'Be',
  internal: 'Nội bộ',
  other: 'Khác',
})

export const CHANNEL_SOURCE_COLOR: Record<string, string> = {
  shopee: 'bg-orange-100 text-orange-700',
  grab: 'bg-green-100 text-green-700',
  xanh_sm: 'bg-teal-100 text-teal-700',
  be: 'bg-yellow-100 text-yellow-700',
  internal: 'bg-gray-100 text-gray-700',
  other: 'bg-purple-100 text-purple-700',
}

export const BRAND_TYPE_LABEL: Record<string, string> = repairTextRecord({
  fnb: 'F&B',
  retail: 'Bán lẻ',
  service: 'Dịch vụ',
  other: 'Khác',
})

export const PROMOTION_TYPE_LABEL: Record<string, string> = repairTextRecord({
  discount_percent: 'Giảm % theo SP',
  discount_amount: 'Giảm tiền theo SP',
  free_item: 'Tặng món theo đơn',
  combo: 'Mua X tặng/giảm Y',
  order_tiered_discount: 'Giảm theo tổng đơn',
  shipping_discount: 'Giảm phí vận chuyển',
})

export const PROMOTION_TYPE_COLOR: Record<string, string> = {
  discount_percent: 'bg-blue-100 text-blue-700',
  discount_amount: 'bg-violet-100 text-violet-700',
  free_item: 'bg-green-100 text-green-700',
  combo: 'bg-orange-100 text-orange-700',
  order_tiered_discount: 'bg-amber-100 text-amber-700',
  shipping_discount: 'bg-teal-100 text-teal-700',
}

export const PRODUCT_TYPE_LABEL: Record<string, string> = repairTextRecord({
  raw_material: 'Nguyên vật liệu',
  semi_product: 'Bán thành phẩm',
  finished_product: 'Thành phẩm',
  goods: 'Hàng hóa',
})

export const PRODUCT_TYPE_COLOR: Record<string, string> = {
  raw_material: 'bg-yellow-100 text-yellow-700',
  semi_product: 'bg-blue-100 text-blue-700',
  finished_product: 'bg-green-100 text-green-700',
  goods: 'bg-purple-100 text-purple-700',
}

export const STAFF_ROLE_LABEL: Record<string, string> = repairTextRecord({
  admin: 'Admin',
  brand_manager: 'Quản lý thương hiệu',
  hub_manager: 'Quản lý cửa hàng',
  cashier: 'Thu ngân',
})

export const STAFF_ROLE_COLOR: Record<string, string> = {
  admin: 'bg-red-100 text-red-700',
  brand_manager: 'bg-blue-100 text-blue-700',
  hub_manager: 'bg-green-100 text-green-700',
  cashier: 'bg-gray-100 text-gray-700',
}

export const SHIFT_STATUS_LABEL: Record<string, string> = repairTextRecord({
  open: 'Đang mở',
  closed: 'Đã đóng',
})

export const SHIPMENT_STATUS_LABEL: Record<string, string> = repairTextRecord({
  assigned: 'Đã phân công',
  picked_up: 'Đã lấy hàng',
  delivering: 'Đang giao',
  delivered: 'Đã giao',
  failed: 'Giao thất bại',
})

export const TABLE_STATUS_LABEL: Record<string, string> = repairTextRecord({
  available: 'Trống',
  occupied: 'Đang dùng',
  reserved: 'Đặt trước',
  cleaning: 'Đang dọn',
})

export const TABLE_STATUS_COLOR: Record<string, string> = {
  available: 'bg-green-100 text-green-700',
  occupied: 'bg-red-100 text-red-700',
  reserved: 'bg-blue-100 text-blue-700',
  cleaning: 'bg-yellow-100 text-yellow-700',
}

export const LOYALTY_TIER_LABEL: Record<string, string> = repairTextRecord({
  bronze: 'Đồng',
  silver: 'Bạc',
  gold: 'Vàng',
  platinum: 'Bạch Kim',
})

export const LOYALTY_TIER_COLOR: Record<string, string> = {
  bronze: 'bg-amber-100 text-amber-700',
  silver: 'bg-gray-200 text-gray-700',
  gold: 'bg-yellow-100 text-yellow-700',
  platinum: 'bg-indigo-100 text-indigo-700',
}

export const MOVEMENT_TYPE_LABEL: Record<string, string> = repairTextRecord({
  import: 'Nhập kho',
  export: 'Xuất kho',
  adjust: 'Điều chỉnh',
  consume: 'Tiêu thụ',
  transfer: 'Chuyển kho',
})

export const MOVEMENT_TYPE_COLOR: Record<string, string> = {
  import: 'bg-green-100 text-green-700',
  export: 'bg-red-100 text-red-700',
  adjust: 'bg-blue-100 text-blue-700',
  consume: 'bg-orange-100 text-orange-700',
  transfer: 'bg-purple-100 text-purple-700',
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = repairTextRecord({
  cash: 'Tiền mặt',
  card: 'Thẻ ngân hàng',
  momo: 'MoMo',
  zalopay: 'ZaloPay',
  vnpay: 'VNPay',
  banking: 'Chuyển khoản',
  other: 'Khác',
})
