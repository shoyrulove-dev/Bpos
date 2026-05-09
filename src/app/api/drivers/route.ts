import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import DriverModel from '@/models/Driver'
import { ok, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const platform = searchParams.get('platform') || ''
  const filter: Record<string, unknown> = {}
  if (q) filter.$or = [
    { name: { $regex: q, $options: 'i' } },
    { phone: { $regex: q, $options: 'i' } },
  ]
  if (platform) filter.platform = platform
  const drivers = await DriverModel.find(filter).sort({ lastSeenAt: -1 }).lean()
  return ok(drivers)
}
