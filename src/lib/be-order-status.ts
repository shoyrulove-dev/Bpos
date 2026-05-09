function normalizeStatusText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function hasCancelledText(value: unknown) {
  const normalized = normalizeStatusText(value)
  if (!normalized) return false

  return (
    normalized.includes('cancel') ||
    normalized.includes('huy') ||
    normalized.includes('da huy') ||
    normalized.includes('order canceled') ||
    normalized.includes('order cancelled')
  )
}

export function hasBeCancelSignal(raw: Record<string, unknown>) {
  if (
    Boolean(raw.cancel_reason) ||
    Boolean(raw.cancel_time) ||
    Boolean(raw.cancelled_at) ||
    Boolean(raw.cancel_date) ||
    Boolean(raw.cancel_code) ||
    Boolean(raw.cancel_status) ||
    Boolean(raw.cancel_by) ||
    Boolean(raw.cancel_note) ||
    Boolean(raw.order_cancel_reason_id) ||
    Boolean(raw.driver_cancel_reason) ||
    Boolean(raw.restaurant_cancel_reason) ||
    Boolean(raw.customer_cancel_reason) ||
    raw.is_cancelled === true ||
    raw.is_cancel === true ||
    raw.cancelled === true
  ) {
    return true
  }

  const statusTextFields = [
    raw.status_reason,
    raw.status_text,
    raw.status_name,
    raw.order_status_text,
    raw.order_status_name,
    raw.current_status_text,
    raw.current_status_name,
    raw.delivery_status,
    raw.delivery_status_text,
    raw.delivery_status_name,
    raw.order_state_text,
    raw.state_text,
    raw.reason,
    raw.note,
  ]

  return statusTextFields.some((value) => hasCancelledText(value))
}