export interface OrderAlertSettings {
  soundEnabled: boolean
  autoPrintEnabled: boolean
}

export const ORDER_ALERT_POLL_INTERVAL_MS = 5_000
export const PRINTER_MODEL_LABEL = 'Xprinter XP-T80L (80mm / ESC/POS)'

const SOUND_SETTING_KEY = 'bpos.order-alert.sound-enabled'
const AUTO_PRINT_SETTING_KEY = 'bpos.order-alert.auto-print-enabled'
const PRINTED_IDS_KEY = 'bpos.order-alert.printed-order-ids'
const MAX_RECENT_PRINTED_IDS = 120

export const DEFAULT_ORDER_ALERT_SETTINGS: OrderAlertSettings = {
  soundEnabled: true,
  autoPrintEnabled: true,
}

function getAudioContextClass() {
  return window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
}

function readBooleanSetting(key: string, defaultValue: boolean) {
  if (typeof window === 'undefined') return defaultValue

  const rawValue = window.localStorage.getItem(key)
  if (rawValue === null) return defaultValue

  return rawValue === '1'
}

function writeBooleanSetting(key: string, value: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, value ? '1' : '0')
}

function readRecentPrintedIds() {
  if (typeof window === 'undefined') return [] as string[]

  try {
    const rawValue = window.localStorage.getItem(PRINTED_IDS_KEY)
    if (!rawValue) return []

    const parsed = JSON.parse(rawValue) as unknown
    if (!Array.isArray(parsed)) return []

    return parsed.filter((value): value is string => typeof value === 'string').slice(-MAX_RECENT_PRINTED_IDS)
  } catch {
    return []
  }
}

function writeRecentPrintedIds(orderIds: string[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PRINTED_IDS_KEY, JSON.stringify(orderIds.slice(-MAX_RECENT_PRINTED_IDS)))
}

export function loadOrderAlertSettings(): OrderAlertSettings {
  return {
    soundEnabled: readBooleanSetting(SOUND_SETTING_KEY, DEFAULT_ORDER_ALERT_SETTINGS.soundEnabled),
    autoPrintEnabled: readBooleanSetting(AUTO_PRINT_SETTING_KEY, DEFAULT_ORDER_ALERT_SETTINGS.autoPrintEnabled),
  }
}

export function persistOrderAlertSettings(settings: OrderAlertSettings) {
  writeBooleanSetting(SOUND_SETTING_KEY, settings.soundEnabled)
  writeBooleanSetting(AUTO_PRINT_SETTING_KEY, settings.autoPrintEnabled)
}

export function playOrderAlert(times = 3) {
  if (typeof window === 'undefined') return

  let currentRing = 0

  const ring = () => {
    try {
      const AudioContextClass = getAudioContextClass()
      if (!AudioContextClass) return

      const context = new AudioContextClass()
      const oscillator = context.createOscillator()
      const gain = context.createGain()

      oscillator.connect(gain)
      gain.connect(context.destination)

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(988, context.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(523.25, context.currentTime + 0.35)
      gain.gain.setValueAtTime(0.45, context.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.6)

      oscillator.start(context.currentTime)
      oscillator.stop(context.currentTime + 0.6)
    } catch {
      return
    }

    currentRing += 1
    if (currentRing < times) {
      window.setTimeout(ring, 450)
    }
  }

  ring()
}

export function primeOrderAlertAudio() {
  if (typeof window === 'undefined') return

  try {
    const AudioContextClass = getAudioContextClass()
    if (!AudioContextClass) return

    const context = new AudioContextClass()
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.connect(gain)
    gain.connect(context.destination)

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(440, context.currentTime)
    gain.gain.setValueAtTime(0.00001, context.currentTime)

    oscillator.start(context.currentTime)
    oscillator.stop(context.currentTime + 0.05)
    window.setTimeout(() => void context.close().catch(() => undefined), 120)
  } catch {
    return
  }
}

export function buildReceiptPrintUrl(orderId: string, options?: { autoprint?: boolean; embedded?: boolean }) {
  const searchParams = new URLSearchParams()

  if (options?.autoprint) searchParams.set('autoprint', '1')
  if (options?.embedded) searchParams.set('embedded', '1')

  const query = searchParams.toString()
  return query ? `/print/receipt/${orderId}?${query}` : `/print/receipt/${orderId}`
}

export function getRecentPrintedOrderIds() {
  return readRecentPrintedIds()
}

export function rememberPrintedOrders(orderIds: string[]) {
  const nextIds = [...readRecentPrintedIds()]

  orderIds.forEach((orderId) => {
    if (!nextIds.includes(orderId)) {
      nextIds.push(orderId)
    }
  })

  writeRecentPrintedIds(nextIds)
}
