export function normalizeCompactPhone(value?: string | null) {
  if (!value) return undefined

  const trimmed = String(value).trim()
  if (!trimmed) return undefined

  const compact = trimmed.replace(/[^\d+]/g, '')
  if (!compact) return undefined

  if (compact.startsWith('+84')) return compact
  if (compact.startsWith('84')) return `+${compact}`
  if (compact.startsWith('0')) return `+84${compact.slice(1)}`

  return compact
}

export function extractCompactPhone(value?: string | null) {
  const match = String(value ?? '').match(/((?:\+?84|0)\d[\d .\-()]{7,13}\d)/)
  return normalizeCompactPhone(match?.[1])
}