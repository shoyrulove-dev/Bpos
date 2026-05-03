import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { vi } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date, fmt = 'dd/MM/yyyy HH:mm') {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, fmt, { locale: vi })
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

export const ORDER_STATUS_LABEL: Record<string, string> = {
  draft: 'Đơn nháp',
  pre_order: 'Đặt trước',
  waiting_confirm: 'Chờ xác nhận',
  waiting_pickup: 'Chờ lấy hàng',
  delivering: 'Đang giao',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
}

export const ORDER_STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pre_order: 'bg-blue-100 text-blue-700',
  waiting_confirm: 'bg-yellow-100 text-yellow-700',
  waiting_pickup: 'bg-orange-100 text-orange-700',
  delivering: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

export const CHANNEL_SOURCE_LABEL: Record<string, string> = {
  shopee: 'Shopee',
  grab: 'GrabFood',
  xanh_sm: 'Xanh SM',
  be: 'Be',
  internal: 'Nội bộ',
  other: 'Khác',
}

export const CHANNEL_SOURCE_COLOR: Record<string, string> = {
  shopee: 'bg-orange-100 text-orange-700',
  grab: 'bg-green-100 text-green-700',
  xanh_sm: 'bg-teal-100 text-teal-700',
  be: 'bg-yellow-100 text-yellow-700',
  internal: 'bg-gray-100 text-gray-700',
  other: 'bg-purple-100 text-purple-700',
}

export const BRAND_TYPE_LABEL: Record<string, string> = {
  fnb: 'F&B',
  retail: 'Bán lẻ',
  service: 'Dịch vụ',
  other: 'Khác',
}

export const PROMOTION_TYPE_LABEL: Record<string, string> = {
  discount_percent: 'Giảm %',
  discount_amount: 'Giảm tiền',
  free_item: 'Tặng món',
  combo: 'Combo',
}

export const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  assigned: 'Đã phân công',
  picked_up: 'Đã lấy hàng',
  delivering: 'Đang giao',
  delivered: 'Đã giao',
  failed: 'Giao thất bại',
}
