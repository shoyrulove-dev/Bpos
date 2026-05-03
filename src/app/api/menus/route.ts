import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import MenuModel from '@/models/Menu'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const brandId = searchParams.get('brandId') || ''
  const filter: Record<string, unknown> = {}
  if (brandId) filter.brandId = brandId
  const menus = await MenuModel.find(filter).populate('brandId', 'name').sort({ createdAt: -1 }).lean()
  return ok(menus)
}

export async function POST(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { name, description, brandId, productIds, status } = body
  if (!name || !brandId) return err('Thiếu thông tin bắt buộc')
  const menu = await MenuModel.create({ name, description, brandId, productIds: productIds || [], status: status || 'active' })
  return ok(menu, 201)
}
