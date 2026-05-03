import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import InventoryModel from '@/models/Inventory'
import ProductModel from '@/models/Product'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const hubId = searchParams.get('hubId') || ''
  const brandId = searchParams.get('brandId') || ''
  const lowStock = searchParams.get('lowStock') === '1'
  const filter: Record<string, unknown> = {}
  if (hubId) filter.hubId = hubId
  if (brandId) filter.brandId = brandId
  if (lowStock) filter.$expr = { $lte: ['$quantity', '$minQuantity'] }

  const items = await InventoryModel.find(filter)
    .populate('productId', 'name code unit type')
    .populate('hubId', 'name')
    .sort({ quantity: 1 })
    .lean()

  // Annotate with product/hub name
  const result = items.map((i: Record<string, unknown>) => {
    const product = i.productId as Record<string, unknown> | null
    const hub = i.hubId as Record<string, unknown> | null
    return {
      ...i,
      productName: product?.name,
      productCode: product?.code,
      unit: product?.unit || i.unit,
      hubName: hub?.name,
    }
  })
  return ok(result)
}

export async function POST(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { productId, hubId, brandId, quantity, minQuantity, maxQuantity, unit } = body
  if (!productId || !hubId || !brandId) return err('Thiếu thông tin bắt buộc')

  const product = await ProductModel.findById(productId).lean()
  if (!product) return err('Sản phẩm không tồn tại', 404)

  const existing = await InventoryModel.findOne({ productId, hubId }).lean()
  if (existing) return err('Tồn kho sản phẩm này đã tồn tại cho cửa hàng này')

  const inv = await InventoryModel.create({
    productId, hubId, brandId,
    quantity: quantity ?? 0,
    minQuantity: minQuantity ?? 0,
    maxQuantity,
    unit: unit || (product as Record<string, unknown>).unit || 'Cái',
  })
  return ok(inv, 201)
}
