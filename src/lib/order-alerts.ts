export interface OrderAlertSettings {
  soundEnabled: boolean
  autoPrintEnabled: boolean
  printerName: string
  printerPaperSize: '80mm' | '58mm' | 'A4'
  voiceMessage: string
  soundRepeatCount: number
}

export const ORDER_ALERT_POLL_INTERVAL_MS = 5_000
export const PRINTER_MODEL_LABEL = 'Xprinter XP-T80L (80mm / ESC/POS)'
export const ORDER_ALERT_VOICE_MESSAGE = 'Anh ơi. Mình có đơn hàng mới. Anh kiểm tra giúp em nhé.'
export const ORDER_ALERT_DEFAULT_REPEAT_COUNT = 3
const ORDER_ALERT_AUDIO_URL = '/audio/order-alert-vi.mp3?v=20260508'

const SOUND_SETTING_KEY = 'bpos.order-alert.sound-enabled'
const AUTO_PRINT_SETTING_KEY = 'bpos.order-alert.auto-print-enabled'
const PRINTER_NAME_SETTING_KEY = 'bpos.order-alert.printer-name'
const PRINTER_PAPER_SIZE_SETTING_KEY = 'bpos.order-alert.printer-paper-size'
const VOICE_MESSAGE_SETTING_KEY = 'bpos.order-alert.voice-message'
const SOUND_REPEAT_COUNT_SETTING_KEY = 'bpos.order-alert.sound-repeat-count'
const PRINTED_IDS_KEY = 'bpos.order-alert.printed-order-ids'
const MAX_RECENT_PRINTED_IDS = 120

export const DEFAULT_ORDER_ALERT_SETTINGS: OrderAlertSettings = {
  soundEnabled: true,
  autoPrintEnabled: true,
  printerName: PRINTER_MODEL_LABEL,
  printerPaperSize: '80mm',
  voiceMessage: ORDER_ALERT_VOICE_MESSAGE,
  soundRepeatCount: ORDER_ALERT_DEFAULT_REPEAT_COUNT,
}

let activeAlertAudio: HTMLAudioElement | null = null

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

function readStringSetting(key: string, defaultValue: string) {
  if (typeof window === 'undefined') return defaultValue
  return window.localStorage.getItem(key) || defaultValue
}

function writeStringSetting(key: string, value: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, value)
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
  const printerPaperSize = readStringSetting(PRINTER_PAPER_SIZE_SETTING_KEY, DEFAULT_ORDER_ALERT_SETTINGS.printerPaperSize)
  const rawRepeat = parseInt(readStringSetting(SOUND_REPEAT_COUNT_SETTING_KEY, String(ORDER_ALERT_DEFAULT_REPEAT_COUNT)), 10)
  const soundRepeatCount = Number.isFinite(rawRepeat) && rawRepeat >= 1 && rawRepeat <= 10 ? rawRepeat : ORDER_ALERT_DEFAULT_REPEAT_COUNT

  return {
    soundEnabled: readBooleanSetting(SOUND_SETTING_KEY, DEFAULT_ORDER_ALERT_SETTINGS.soundEnabled),
    autoPrintEnabled: readBooleanSetting(AUTO_PRINT_SETTING_KEY, DEFAULT_ORDER_ALERT_SETTINGS.autoPrintEnabled),
    printerName: readStringSetting(PRINTER_NAME_SETTING_KEY, DEFAULT_ORDER_ALERT_SETTINGS.printerName),
    printerPaperSize: printerPaperSize === '58mm' || printerPaperSize === 'A4' ? printerPaperSize : '80mm',
    voiceMessage: readStringSetting(VOICE_MESSAGE_SETTING_KEY, DEFAULT_ORDER_ALERT_SETTINGS.voiceMessage).trim() || DEFAULT_ORDER_ALERT_SETTINGS.voiceMessage,
    soundRepeatCount,
  }
}

export function persistOrderAlertSettings(settings: OrderAlertSettings) {
  writeBooleanSetting(SOUND_SETTING_KEY, settings.soundEnabled)
  writeBooleanSetting(AUTO_PRINT_SETTING_KEY, settings.autoPrintEnabled)
  writeStringSetting(PRINTER_NAME_SETTING_KEY, settings.printerName.trim() || DEFAULT_ORDER_ALERT_SETTINGS.printerName)
  writeStringSetting(PRINTER_PAPER_SIZE_SETTING_KEY, settings.printerPaperSize)
  writeStringSetting(VOICE_MESSAGE_SETTING_KEY, settings.voiceMessage.trim() || DEFAULT_ORDER_ALERT_SETTINGS.voiceMessage)
  writeStringSetting(SOUND_REPEAT_COUNT_SETTING_KEY, String(settings.soundRepeatCount ?? ORDER_ALERT_DEFAULT_REPEAT_COUNT))
}

function normalizeVoiceMessage(message?: string) {
  return String(message || '').trim() || ORDER_ALERT_VOICE_MESSAGE
}

function pickPreferredVietnameseVoice() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null

  const voices = window.speechSynthesis.getVoices()
  const vietnameseVoices = voices.filter((voice) => {
    const lang = voice.lang.toLowerCase()
    const name = voice.name.toLowerCase()
    return lang.includes('vi') || name.includes('viet') || name.includes('hoaimy')
  })

  const preferredPatterns = ['hoaimy', 'linh', 'female', 'woman', 'girl', 'natural', 'microsoft']
  for (const pattern of preferredPatterns) {
    const match = vietnameseVoices.find((voice) => voice.name.toLowerCase().includes(pattern))
    if (match) return match
  }

  return vietnameseVoices[0] ?? voices[0] ?? null
}

function stopActiveAlertAudio() {
  if (!activeAlertAudio) return
  activeAlertAudio.pause()
  activeAlertAudio.currentTime = 0
  activeAlertAudio = null
}

function playBundledAlertAudio(times: number, onFailure: () => void) {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return false

  stopActiveAlertAudio()

  let played = 0

  const playOnce = () => {
    const audio = new Audio(ORDER_ALERT_AUDIO_URL)
    audio.preload = 'auto'
    audio.volume = 1
    activeAlertAudio = audio

    audio.onended = () => {
      played += 1
      if (played < Math.max(1, times)) {
        window.setTimeout(playOnce, 220)
      } else if (activeAlertAudio === audio) {
        activeAlertAudio = null
      }
    }

    audio.onerror = () => {
      if (activeAlertAudio === audio) {
        activeAlertAudio = null
      }
      if (played === 0) {
        onFailure()
      }
    }

    const playPromise = audio.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        if (activeAlertAudio === audio) {
          activeAlertAudio = null
        }
        if (played === 0) {
          onFailure()
        }
      })
    }
  }

  playOnce()
  return true
}

function speakAlertMessage(message: string, times: number) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false

  const synth = window.speechSynthesis
  const voice = pickPreferredVietnameseVoice()
  if (!voice) return false

  synth.cancel()

  let spoken = 0
  const speakOnce = () => {
    const utterance = new SpeechSynthesisUtterance(message)
    utterance.lang = voice.lang || 'vi-VN'
    utterance.voice = voice
    utterance.rate = 0.86
    utterance.pitch = 0.96
    utterance.volume = 1
    utterance.onend = () => {
      spoken += 1
      if (spoken < Math.max(1, times)) {
        window.setTimeout(speakOnce, 400)
      }
    }
    synth.speak(utterance)
  }

  speakOnce()
  return true
}

export function playOrderAlert(times = 3, message = ORDER_ALERT_VOICE_MESSAGE) {
  if (typeof window === 'undefined') return

  const normalizedMessage = normalizeVoiceMessage(message)

  const ringFallback = () => {
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

  const fallbackToSpeech = () => {
    if (speakAlertMessage(normalizedMessage, times)) return
    ringFallback()
  }

  if (normalizedMessage !== ORDER_ALERT_VOICE_MESSAGE) {
    fallbackToSpeech()
    return
  }

  if (playBundledAlertAudio(times, fallbackToSpeech)) return
  fallbackToSpeech()
}

export function primeOrderAlertAudio() {
  if (typeof window === 'undefined') return

  try {
    const alertAudio = new Audio(ORDER_ALERT_AUDIO_URL)
    alertAudio.preload = 'auto'
    alertAudio.load()

    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices()
    }

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

export function buildReceiptPrintUrl(orderId: string, options?: { autoprint?: boolean; embedded?: boolean; paperSize?: OrderAlertSettings['printerPaperSize'] }) {
  const searchParams = new URLSearchParams()
  const settings = loadOrderAlertSettings()

  if (options?.autoprint) searchParams.set('autoprint', '1')
  if (options?.embedded) searchParams.set('embedded', '1')
  searchParams.set('paperSize', options?.paperSize ?? settings.printerPaperSize)

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
