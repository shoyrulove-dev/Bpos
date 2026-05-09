import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { runOrderRepair } from '@/lib/order-repair'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secretParam = req.nextUrl.searchParams.get('secret')

  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const days = Math.max(1, Math.min(90, Number(req.nextUrl.searchParams.get('days') ?? 30) || 30))
  const providers = (req.nextUrl.searchParams.get('providers') ?? 'be,grab')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const includeHistorical = req.nextUrl.searchParams.get('historical') !== 'false'

  await connectDB()
  const result = await runOrderRepair({ days, providers, includeHistorical })
  return NextResponse.json(result)
}