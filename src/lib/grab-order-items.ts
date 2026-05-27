import type { OrderItem } from '@/types'

function getRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function parseAmount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined

  const normalized = value.replace(/[^\d-]/g, '')
  if (!normalized || normalized === '-') return undefined

  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : undefined
}

function cleanText(value: unknown) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildModifierNote(item: Record<string, unknown>) {
  const modifierTexts: string[] = []
  const modifiers = Array.isArray(item.modifiers) ? item.modifiers as Record<string, unknown>[] : []
  const addons = Array.isArray(item.addons) ? item.addons as Record<string, unknown>[] : []
  const modifierGroups = Array.isArray(item.modifierGroups) ? item.modifierGroups as Record<string, unknown>[] : []

  for (const group of [...modifiers, ...addons]) {
    const mItems = Array.isArray(group.modifierItems)
      ? group.modifierItems as Record<string, unknown>[]
      : Array.isArray(group.items)
      ? group.items as Record<string, unknown>[]
      : []
    const groupLabel = cleanText(group.name ?? group.groupName)
    for (const mItem of mItems) {
      const name = cleanText(mItem.name ?? mItem.itemName)
      if (name) modifierTexts.push(groupLabel ? `${groupLabel}: ${name}` : name)
    }
    if (mItems.length === 0 && groupLabel) modifierTexts.push(groupLabel)
  }

  for (const group of modifierGroups) {
    const groupLabel = cleanText(group.modifierGroupName ?? group.groupName ?? group.name ?? group.groupTitle)
    const groupModifiers = Array.isArray(group.modifiers) ? group.modifiers as Record<string, unknown>[] : []
    for (const modifier of groupModifiers) {
      const modifierName = cleanText(modifier.modifierName ?? modifier.name ?? modifier.itemName)
      if (!modifierName) continue
      modifierTexts.push(groupLabel ? `${groupLabel}: ${modifierName}` : modifierName)
    }
  }

  return modifierTexts.join('\n')
}

function getGrabStoredUnitPrice(item: Record<string, unknown>) {
  const fare = getRecord(item.fare)
  const basePrice = parseAmount(fare?.originalItemPriceDisplay)
    ?? parseAmount(fare?.beforeAdjustedPriceDisplay)
    ?? parseAmount(fare?.basePriceDisplay)
    ?? parseAmount(item.originalPrice)
    ?? parseAmount(item.basePrice)

  const displayedUnitTotal = Number(
    fare?.priceFloat ??
    fare?.priceInMin ??
    item.itemPrice ??
    item.price ??
    item.unitPrice ??
    parseAmount(fare?.priceDisplay) ??
    0
  )

  const modifierGroups = Array.isArray(item.modifierGroups) ? item.modifierGroups as Record<string, unknown>[] : []
  const legacyGroups = [
    ...(Array.isArray(item.modifiers) ? item.modifiers as Record<string, unknown>[] : []),
    ...(Array.isArray(item.addons) ? item.addons as Record<string, unknown>[] : []),
  ]

  const addonUnitTotal = [...modifierGroups, ...legacyGroups].reduce((sum, group) => {
    const groupRecord = getRecord(group)
    const modifiers = Array.isArray(groupRecord?.modifiers)
      ? groupRecord.modifiers
      : Array.isArray(groupRecord?.modifierItems)
      ? groupRecord.modifierItems
      : Array.isArray(groupRecord?.items)
      ? groupRecord.items
      : []

    return sum + modifiers.reduce((groupSum, modifier) => {
      const modifierRecord = getRecord(modifier)
      const quantity = Number(modifierRecord?.quantity ?? 1)
      const modifierPrice = parseAmount(
        modifierRecord?.priceDisplay
        ?? modifierRecord?.revampedPriceDisplay
        ?? modifierRecord?.price
      ) ?? 0
      return groupSum + (modifierPrice * Math.max(quantity, 1))
    }, 0)
  }, 0)

  const sellingBasePrice = Math.max(0, displayedUnitTotal - addonUnitTotal)
  return basePrice ?? sellingBasePrice
}

export function normalizeGrabItemsFromRawPayload(rawPayload: unknown, fallbackItems?: OrderItem[]) {
  const raw = getRecord(rawPayload)
  if (!raw) return fallbackItems ?? []

  const itemInfo = getRecord(raw.itemInfo)
  const rawItems = Array.isArray(itemInfo?.items)
    ? itemInfo.items as Record<string, unknown>[]
    : Array.isArray(raw.items)
    ? raw.items as Record<string, unknown>[]
    : Array.isArray(raw.orderItems)
    ? raw.orderItems as Record<string, unknown>[]
    : Array.isArray(raw.lineItems)
    ? raw.lineItems as Record<string, unknown>[]
    : []

  if (!rawItems.length) return fallbackItems ?? []

  return rawItems.map((item) => {
    const quantity = Number(item.quantity ?? 1)
    const note = [cleanText(item.remarks ?? item.note ?? item.specialInstruction ?? item.comment), buildModifierNote(item)]
      .filter(Boolean)
      .join('\n') || undefined
    const price = getGrabStoredUnitPrice(item)
    const total = Number(item.total ?? item.itemTotal ?? item.totalPrice ?? item.soldAmount ?? (quantity * price))

    return {
      name: cleanText(item.name ?? item.itemName),
      quantity,
      price,
      total,
      ...(note ? { note } : {}),
    } satisfies OrderItem
  }).filter((item) => item.name)
}
