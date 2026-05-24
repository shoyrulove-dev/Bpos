const MOJIBAKE_PATTERN = /[ÃÂÆÄÐáºâ€œž™¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿]/
const VIETNAMESE_ACCENT_PATTERN = /[ĂăÂâÊêÔôƠơƯưĐđÁÀẢÃẠÂẤẦẨẪẬĂẮẰẲẴẶÉÈẺẼẸÊẾỀỂỄỆÍÌỊĨÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ]/

function countMojibakeSignals(value: string) {
  const matches = value.match(/Ã.|Â.|Æ.|Ä.|Ð.|á.|â./g)
  return matches?.length ?? 0
}

function countVietnameseAccentCharacters(value: string) {
  return value.match(VIETNAMESE_ACCENT_PATTERN)?.length ?? 0
}

function decodeBytes(value: string, encoding: 'utf-8' | 'windows-1252') {
  const bytes = Uint8Array.from(Array.from(value, (char) => char.charCodeAt(0) & 0xff))
  return new TextDecoder(encoding, { fatal: false }).decode(bytes)
}

function normalizeCandidate(value: string) {
  return value.replace(/\uFFFD/g, '').trim()
}

function scoreCandidate(value: string) {
  const mojibakeScore = countMojibakeSignals(value)
  const replacementScore = (value.match(/\uFFFD/g) ?? []).length
  const accentScore = countVietnameseAccentCharacters(value)
  return mojibakeScore * 1000 + replacementScore * 10000 - accentScore
}

export function repairVietnameseText(value: string): string
export function repairVietnameseText<T>(value: T): T
export function repairVietnameseText(value: unknown) {
  if (typeof value !== 'string') return value
  if (!value || !MOJIBAKE_PATTERN.test(value)) return value

  const candidates = new Set<string>()
  candidates.add(value)

  try {
    const utf8Decoded = normalizeCandidate(decodeBytes(value, 'utf-8'))
    if (utf8Decoded) candidates.add(utf8Decoded)

    const win1252Decoded = normalizeCandidate(decodeBytes(value, 'windows-1252'))
    if (win1252Decoded) candidates.add(win1252Decoded)

    if (utf8Decoded && utf8Decoded !== value) {
      const utf8Double = normalizeCandidate(decodeBytes(utf8Decoded, 'utf-8'))
      if (utf8Double) candidates.add(utf8Double)
    }

    if (win1252Decoded && win1252Decoded !== value) {
      const win1252Double = normalizeCandidate(decodeBytes(win1252Decoded, 'utf-8'))
      if (win1252Double) candidates.add(win1252Double)
    }
  } catch {
    return value
  }

  let bestValue = value
  let bestScore = scoreCandidate(value)

  Array.from(candidates).forEach((candidate) => {
    const candidateScore = scoreCandidate(candidate)
    if (candidateScore < bestScore) {
      bestScore = candidateScore
      bestValue = candidate
    }
  })

  return bestValue
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
