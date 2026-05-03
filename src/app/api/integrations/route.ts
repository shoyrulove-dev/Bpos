import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { ok, err, requireAdmin } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAdmin(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const brandId = searchParams.get('brandId') || ''
  const filter: Record<string, unknown> = {}
  if (brandId) filter.brandId = brandId
  const integrations = await IntegrationModel.find(filter)
    .populate('brandId', 'name')
    .populate('hubId', 'name')
    .populate('createdBy', 'name')
    .sort({ createdAt: -1 }).lean()
  return ok(integrations)
}

export async function POST(req: NextRequest) {
  const { token, res } = await requireAdmin(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { provider, brandId, hubId, externalStoreId, externalStoreName, credentials } = body
  if (!provider || !brandId) return err('Thiếu thông tin bắt buộc')
  const integration = await IntegrationModel.create({
    provider, brandId, hubId, externalStoreId, externalStoreName,
    credentials: credentials || {},
    createdBy: token!.id,
  })
  return ok(integration, 201)
}
