import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import StockMovementModel from '@/models/StockMovement'
import { ok, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const productId = searchParams.get('productId') || ''
  const hubId = searchParams.get('hubId') || ''
  const brandId = searchParams.get('brandId') || ''
  const type = searchParams.get('type') || ''
  const limit = parseInt(searchParams.get('limit') || '100')

  const filter: Record<string, unknown> = {}
  if (productId) filter.productId = productId
  if (hubId) filter.hubId = hubId
  if (brandId) filter.brandId = brandId
  if (type) filter.type = type

  const movements = await StockMovementModel.find(filter)
    .populate('productId', 'name code')
    .populate('hubId', 'name')
    .populate('createdById', 'name')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()

  const result = movements.map((m: Record<string, unknown>) => {
    const product = m.productId as Record<string, unknown> | null
    const hub = m.hubId as Record<string, unknown> | null
    const user = m.createdById as Record<string, unknown> | null
    return { ...m, productName: product?.name, productCode: product?.code, hubName: hub?.name, createdByName: user?.name }
  })
  return ok(result)
}
