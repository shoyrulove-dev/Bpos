import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { runRecentGrabEnrich } from '@/lib/grab-recent-enrich'

export const maxDuration = 60

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secretParam = req.nextUrl.searchParams.get('secret')

  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hours = Math.max(1, Math.min(24, Number(req.nextUrl.searchParams.get('hours') ?? 6) || 6))
  const limit = Math.max(1, Math.min(200, Number(req.nextUrl.searchParams.get('limit') ?? 100) || 100))
  const externalOrderIds = (req.nextUrl.searchParams.get('orderIds') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  await connectDB()

  const result = await runRecentGrabEnrich({
    hours,
    limit,
    externalOrderIds,
  })

  return NextResponse.json(result)
}
