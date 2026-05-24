const MOJIBAKE_PATTERN = /[ÃÂÆÄÐáºâ€œž™¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿]/

function countMojibakeSignals(value: string) {
  const matches = value.match(/Ã.|Â.|Æ.|Ä.|Ð.|á.|â./g)
  return matches?.length ?? 0
}

export function repairVietnameseText(value: string): string
export function repairVietnameseText<T>(value: T): T
export function repairVietnameseText(value: unknown) {
  if (typeof value !== 'string') return value
  if (!value || !MOJIBAKE_PATTERN.test(value)) return value

  try {
    let bestValue = value
    let bestScore = countMojibakeSignals(value)
    let currentValue = value

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const bytes = Uint8Array.from(Array.from(currentValue, (char) => char.charCodeAt(0) & 0xff))
      const repaired = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
      if (!repaired.trim()) break

      const repairedScore = countMojibakeSignals(repaired)
      if (repairedScore >= bestScore) break

      bestValue = repaired
      bestScore = repairedScore
      currentValue = repaired
    }

    return bestValue
  } catch {
    return value
  }
}

export function repairVietnameseTextDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return repairVietnameseText(value) as T
  }

  if (Array.isArray(value)) {
    return value.map((item) => repairVietnameseTextDeep(item)) as T
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, repairVietnameseTextDeep(entry)])
    ) as T
  }

  return value
}

export function repairTextRecord<T extends Record<string, string>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, repairVietnameseText(value)])
  ) as T
}
