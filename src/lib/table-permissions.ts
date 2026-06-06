import type { Role, TableStatus } from '@/types'

const TABLE_MANAGER_ROLES: Role[] = ['admin', 'brand_manager', 'hub_manager']

export function canDeleteTable(role?: string | null) {
  return TABLE_MANAGER_ROLES.includes((role ?? '') as Role)
}

export function isTableCancellation(fromStatus?: string | null, toStatus?: string | null) {
  if (fromStatus !== 'reserved') return false
  return toStatus === 'available' || toStatus === 'cleaning'
}

export function canCancelReservedTable(role?: string | null, fromStatus?: TableStatus | null, toStatus?: TableStatus | null) {
  if (!isTableCancellation(fromStatus, toStatus)) return true
  return canDeleteTable(role)
}
