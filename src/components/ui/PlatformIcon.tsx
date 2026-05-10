'use client'

import { cn } from '@/lib/utils'

/**
 * PlatformIcon — logo nhỏ của từng sàn giao đồ ăn
 * size: 'sm' = 20px (badge inline), 'md' = 24px, 'lg' = 32px
 */

type Size = 'sm' | 'md' | 'lg' | 'xl'

const SIZE: Record<Size, { px: number; cls: string }> = {
  sm: { px: 20, cls: 'h-5 w-5' },
  md: { px: 24, cls: 'h-6 w-6' },
  lg: { px: 32, cls: 'h-8 w-8' },
  xl: { px: 40, cls: 'h-10 w-10' },
}

// ─── GrabFood logo ──────────────────────────────────────────────────────────
function GrabLogo({ px }: { px: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#00B14F"/>
      <text x="20" y="26.5" textAnchor="middle" fontFamily="'Arial Black',Arial,sans-serif" fontWeight="900" fontSize="13" fill="white" letterSpacing="-0.3">grab</text>
    </svg>
  )
}

// ─── Be logo ────────────────────────────────────────────────────────────────
function BeLogo({ px }: { px: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#F5C800"/>
      <text x="20" y="27" textAnchor="middle" fontFamily="'Arial Black',Arial,sans-serif" fontWeight="900" fontSize="16" fill="#111111" letterSpacing="-0.5">be</text>
    </svg>
  )
}

// ─── ShopeeFood logo ─────────────────────────────────────────────────────────
function ShopeeLogo({ px }: { px: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#EE4D2D"/>
      {/* Shopee bag icon simplified */}
      <path d="M13 17h14l-1.5 11H14.5L13 17z" fill="white" opacity="0.95"/>
      <path d="M16 17v-2.5a4 4 0 018 0V17" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
      <circle cx="17.5" cy="22" r="1" fill="#EE4D2D"/>
      <circle cx="22.5" cy="22" r="1" fill="#EE4D2D"/>
    </svg>
  )
}

// ─── Xanh SM logo ────────────────────────────────────────────────────────────
function XanhSMLogo({ px }: { px: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#00A79D"/>
      <text x="20" y="25" textAnchor="middle" fontFamily="'Arial Black',Arial,sans-serif" fontWeight="900" fontSize="10" fill="white" letterSpacing="0">XANH</text>
      <text x="20" y="33" textAnchor="middle" fontFamily="'Arial Black',Arial,sans-serif" fontWeight="900" fontSize="8.5" fill="white" letterSpacing="1">SM</text>
    </svg>
  )
}

// ─── POS (internal) ─────────────────────────────────────────────────────────
function PosLogo({ px }: { px: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#334155"/>
      <text x="20" y="26" textAnchor="middle" fontFamily="'Arial Black',Arial,sans-serif" fontWeight="900" fontSize="12" fill="white" letterSpacing="0.5">POS</text>
    </svg>
  )
}

// ─── Generic ─────────────────────────────────────────────────────────────────
function GenericLogo({ px, label }: { px: number; label: string }) {
  return (
    <svg width={px} height={px} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="10" fill="#94A3B8"/>
      <text x="20" y="26" textAnchor="middle" fontFamily="'Arial Black',Arial,sans-serif" fontWeight="900" fontSize="11" fill="white">
        {label.slice(0, 2).toUpperCase()}
      </text>
    </svg>
  )
}

// ─── Main export ─────────────────────────────────────────────────────────────
export function PlatformIcon({
  source,
  size = 'md',
  className,
}: {
  source: string
  size?: Size
  className?: string
}) {
  const { px, cls } = SIZE[size]

  const icon = (() => {
    switch (source) {
      case 'grab':     return <GrabLogo px={px} />
      case 'be':       return <BeLogo px={px} />
      case 'shopee':   return <ShopeeLogo px={px} />
      case 'xanh_sm':  return <XanhSMLogo px={px} />
      case 'internal': return <PosLogo px={px} />
      default:         return <GenericLogo px={px} label={source} />
    }
  })()

  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center', cls, className)} title={source}>
      {icon}
    </span>
  )
}

/**
 * PlatformBadge — icon nhỏ + label, dùng trong bảng/danh sách
 */
export function PlatformBadge({
  source,
  size = 'sm',
  showLabel = false,
  className,
}: {
  source: string
  size?: Size
  showLabel?: boolean
  className?: string
}) {
  const LABELS: Record<string, string> = {
    grab: 'Grab',
    be: 'Be',
    shopee: 'Shopee',
    xanh_sm: 'Xanh SM',
    internal: 'POS',
  }

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <PlatformIcon source={source} size={size} />
      {showLabel && (
        <span className="text-xs font-semibold text-gray-700">
          {LABELS[source] ?? source}
        </span>
      )}
    </span>
  )
}
