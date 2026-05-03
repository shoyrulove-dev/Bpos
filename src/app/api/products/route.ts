import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import ProductModel from '@/models/Product'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const brandId = searchParams.get('brandId') || ''
  const type = searchParams.get('type') || ''
  const saleStatus = searchParams.get('saleStatus') || ''
  const filter: Record<string, unknown> = {}
  if (q) filter.$or = [
    { name: { $regex: q, $options: 'i' } },
    { code: { $regex: q, $options: 'i' } },
  ]
  if (brandId) filter.brandId = brandId
  if (type) filter.type = type
  if (saleStatus) filter.saleStatus = saleStatus
  const products = await ProductModel.find(filter).populate('brandId', 'name').sort({ createdAt: -1 }).lean()
  return ok(products)
}

export async function POST(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { name, code, category, type, unit, brandId, price, saleStatus, status } = body
  if (!name || !code || !category || !brandId) return err('Thiếu thông tin bắt buộc')
  const product = await ProductModel.create({ name, code, category, type: type || 'single', unit: unit || 'Cái', brandId, price, saleStatus: saleStatus || 'selling', status: status || 'active' })
  return ok(product, 201)
}
