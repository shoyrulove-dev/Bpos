import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import { ok, err, requireAdmin, requireAuth } from '@/lib/api-helpers'
import SystemSetting from '@/models/SystemSetting'
import { ORDER_ALERT_VOICE_MESSAGE, ORDER_ALERT_DEFAULT_REPEAT_COUNT } from '@/lib/order-alerts'

const SYSTEM_SETTING_KEY = 'global'

async function getOrCreateSettings() {
  return SystemSetting.findOneAndUpdate(
    { key: SYSTEM_SETTING_KEY },
    {
      $setOnInsert: {
        key: SYSTEM_SETTING_KEY,
        orderAlertVoiceMessage: ORDER_ALERT_VOICE_MESSAGE,
      },
    },
    { upsert: true, new: true }
  )
}

export async function GET(req: NextRequest) {
  const { token, res } = await requireAuth(req)
  if (res) return res

  await connectDB()
  const settings = await getOrCreateSettings()

  return ok({
    voiceMessage: settings.orderAlertVoiceMessage || ORDER_ALERT_VOICE_MESSAGE,
    soundRepeatCount: settings.orderAlertSoundRepeatCount ?? ORDER_ALERT_DEFAULT_REPEAT_COUNT,
    canEdit: token?.role === 'admin',
  })
}

export async function PATCH(req: NextRequest) {
  const { res } = await requireAdmin(req)
  if (res) return res

  const body = await req.json().catch(() => null) as { voiceMessage?: string; soundRepeatCount?: number } | null
  const voiceMessage = String(body?.voiceMessage || '').trim()
  if (!voiceMessage) return err('Thiếu câu thông báo')
  if (voiceMessage.length > 200) return err('Câu thông báo quá dài')

  const rawRepeat = Number(body?.soundRepeatCount)
  const soundRepeatCount = Number.isFinite(rawRepeat) && rawRepeat >= 1 && rawRepeat <= 10
    ? Math.round(rawRepeat)
    : undefined

  await connectDB()
  const update: Record<string, unknown> = { orderAlertVoiceMessage: voiceMessage }
  if (soundRepeatCount !== undefined) update.orderAlertSoundRepeatCount = soundRepeatCount

  const settings = await SystemSetting.findOneAndUpdate(
    { key: SYSTEM_SETTING_KEY },
    {
      $set: update,
      $setOnInsert: {
        key: SYSTEM_SETTING_KEY,
      },
    },
    { upsert: true, new: true }
  )

  return ok({
    success: true,
    voiceMessage: settings.orderAlertVoiceMessage,
    soundRepeatCount: settings.orderAlertSoundRepeatCount ?? ORDER_ALERT_DEFAULT_REPEAT_COUNT,
  })
}