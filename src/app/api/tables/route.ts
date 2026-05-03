import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import TableModel from '@/models/Table'
import { ok, err, requireAuth } from '@/lib/api-helpers'
import crypto from 'crypto'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const hubId = searchParams.get('hubId') || ''
  const brandId = searchParams.get('brandId') || ''
  const zone = searchParams.get('zone') || ''
  const status = searchParams.get('status') || ''
  const filter: Record<string, unknown> = {}
  if (hubId) filter.hubId = hubId
  if (brandId) filter.brandId = brandId
  if (zone) filter.zone = zone
  if (status) filter.status = status
  const tables = await TableModel.find(filter).populate('hubId', 'name').populate('brandId', 'name').sort({ zone: 1, name: 1 }).lean()
  return ok(tables)
}

export async function POST(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { name, zone, capacity, hubId, brandId, note } = body
  if (!name || !hubId || !brandId) return err('Thiếu thông tin bắt buộc')
  const qrToken = crypto.randomBytes(12).toString('hex')
  const table = await TableModel.create({ name, zone: zone || 'Tầng 1', capacity: capacity || 4, hubId, brandId, qrToken, note })
  return ok(table, 201)
}
