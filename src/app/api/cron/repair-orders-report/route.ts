import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { getOrderRepairReport } from '@/lib/order-repair'

const CRON_SECRET = process.env.CRON_SECRET

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secretParam = req.nextUrl.searchParams.get('secret')

  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const providers = (req.nextUrl.searchParams.get('providers') ?? 'be,grab')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const limit = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get('limit') ?? 20) || 20))
  const externalOrderIds = (req.nextUrl.searchParams.get('orderIds') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const shortIds = (req.nextUrl.searchParams.get('shortIds') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  await connectDB()
  const result = await getOrderRepairReport({ providers, limit, externalOrderIds, shortIds })
  return NextResponse.json(result)
}