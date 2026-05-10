import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secretParam = req.nextUrl.searchParams.get('secret')

  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ids = (req.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  await connectDB()

  const filter = ids.length ? { _id: { $in: ids } } : { provider: 'grab', isActive: true }
  const integrations = await IntegrationModel.find(filter)
    .select('provider externalStoreId externalStoreName loginMode sessionRefreshMode loginUsername sessionStatus sessionCapturedAt sessionExpiresAt sessionError sessionFailureCount automationRunning isActive lastSyncAt syncStatus syncError updatedAt')
    .lean()

  return NextResponse.json({ ok: true, count: integrations.length, integrations })
}