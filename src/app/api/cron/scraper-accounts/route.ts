/**
 * GET /api/cron/scraper-accounts
 *
 * Trả về danh sách tài khoản Grab + BE để scraper tự fetch thay vì hardcode.
 * Auth: Bearer bpos-cron-2024 (cron token, giống push-orders)
 * v2: integrationId trả về cho cả be accounts
 *
 * Response:
 *   { grab: GrabAccount[], be: BeAccount[] }
 *
 * GrabAccount:  { integrationId, username, password, storeId, label }
 * BeAccount:    { username, password, restaurantId|null, label }
 */
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { decrypt } from '@/lib/crypto'

const LEGACY_CRON_TOKEN = 'bpos-cron-2024'
const CRON_SECRET = process.env.CRON_SECRET

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const acceptedTokens = [
    LEGACY_CRON_TOKEN,
    String(CRON_SECRET ?? '').trim(),
  ].filter(Boolean)
  const isAuthorized = acceptedTokens.some((token) => auth === `Bearer ${token}`)
  if (!isAuthorized) return unauthorized()

  await connectDB()

  // Lấy tất cả integration Grab + BE đang active với loginUsername/loginPassword
  const integrations = await IntegrationModel
    .find({ provider: { $in: ['grab', 'be'] }, isActive: true })
    .select('+loginPassword +credentials')
    .lean()

  const grab: unknown[] = []
  const be: unknown[] = []

  for (const integ of integrations) {
    const username = integ.loginUsername ?? ''
    if (!username) continue

    let password = ''
    if (integ.loginPassword) {
      try { password = decrypt(integ.loginPassword) } catch { password = '' }
    }
    if (!password) continue

    const label = integ.externalStoreName || username

    if (integ.provider === 'grab') {
      const storeId = integ.externalStoreId ?? ''
      if (!storeId) continue
      grab.push({
        integrationId: String(integ._id),
        username,
        password,
        storeId,
        label,
      })
    } else if (integ.provider === 'be') {
      // restaurantId lưu ở externalStoreId.
      // Nếu chưa có, vẫn trả account về cho scraper để scraper tự resolve
      // khi account chỉ quản lý đúng 1 store.
      const restaurantId = Number(integ.externalStoreId ?? 0)
      be.push({
        integrationId: String(integ._id),
        username,
        password,
        restaurantId: restaurantId || null,
        label,
      })
    }
  }

  return NextResponse.json({ grab, be })
}
