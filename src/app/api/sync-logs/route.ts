import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import SyncLogModel from '@/models/SyncLog'
import { ok, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || ''
  const status = searchParams.get('status') || ''
  const brandId = searchParams.get('brandId') || ''
  const filter: Record<string, unknown> = {}
  if (type) filter.type = type
  if (status) filter.status = status
  if (brandId) filter.brandId = brandId
  const logs = await SyncLogModel.find(filter).populate('brandId', 'name').sort({ createdAt: -1 }).limit(200).lean()
  return ok(logs)
}
