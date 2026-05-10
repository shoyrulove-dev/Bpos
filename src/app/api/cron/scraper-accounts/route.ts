/**
 * GET /api/cron/scraper-accounts
 *
 * Trả về danh sách tài khoản Grab + BE để scraper tự fetch thay vì hardcode.
 * Auth: Bearer bpos-cron-2024 (cron token, giống push-orders)
 *
 * Response:
 *   { grab: GrabAccount[], be: BeAccount[] }
 *
 * GrabAccount:  { integrationId, username, password, storeId, label }
 * BeAccount:    { username, password, restaurantId, label }
 */
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { decrypt } from '@/lib/crypto'

const CRON_TOKEN = 'bpos-cron-2024'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${CRON_TOKEN}`) return unauthorized()

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
      // restaurantId lưu ở externalStoreId
      const restaurantId = Number(integ.externalStoreId ?? 0)
      if (!restaurantId) continue
      be.push({
        username,
        password,
        restaurantId,
        label,
      })
    }
  }

  return NextResponse.json({ grab, be })
}
