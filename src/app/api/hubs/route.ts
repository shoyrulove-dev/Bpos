import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import HubModel from '@/models/Hub'
import BrandModel from '@/models/Brand'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const brandId = searchParams.get('brandId') || ''
  const filter: Record<string, unknown> = {}
  if (q) filter.$or = [
    { name: { $regex: q, $options: 'i' } },
    { code: { $regex: q, $options: 'i' } },
  ]
  if (brandId) filter.brandId = brandId
  const hubs = await HubModel.find(filter).populate('brandId', 'name').sort({ createdAt: -1 }).lean()
  return ok(hubs)
}

export async function POST(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { code, name, address, brandId, servicePackage, status } = body
  if (!code || !name || !address || !brandId) return err('Thiếu thông tin bắt buộc')
  const brand = await BrandModel.findById(brandId).lean()
  if (!brand) return err('Thương hiệu không tồn tại')
  const hub = await HubModel.create({ code: code.toUpperCase(), name, address, brandId, servicePackage: servicePackage || 'basic', status: status || 'active' })
  return ok(hub, 201)
}
