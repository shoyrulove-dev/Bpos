import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import InventoryModel from '@/models/Inventory'
import StockMovementModel from '@/models/StockMovement'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(_req)
  if (res) return res
  await connectDB()
  const inv = await InventoryModel.findById(params.id).populate('productId', 'name code unit').populate('hubId', 'name').lean()
  if (!inv) return err('Không tìm thấy', 404)
  return ok(inv)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { res, token } = await requireAuth(req)
  if (res) return res
  void token
  await connectDB()
  const body = await req.json()

  const inv = await InventoryModel.findById(params.id)
  if (!inv) return err('Không tìm thấy', 404)

  const { type, quantity, note, minQuantity, maxQuantity } = body

  // If it's a movement (nhập/xuất/điều chỉnh)
  if (type && quantity !== undefined) {
    const beforeQty = inv.quantity
    let afterQty = beforeQty

    if (type === 'import' || type === 'transfer') afterQty = beforeQty + Math.abs(quantity)
    else if (type === 'export' || type === 'consume') afterQty = Math.max(0, beforeQty - Math.abs(quantity))
    else if (type === 'adjust') afterQty = Math.abs(quantity) // set absolute

    await StockMovementModel.create({
      productId: inv.productId,
      hubId: inv.hubId,
      brandId: inv.brandId,
      type,
      quantity: afterQty - beforeQty,
      beforeQty,
      afterQty,
      note,
      createdById: token?.id,
    })

    inv.quantity = afterQty
    inv.lastMovementAt = new Date()
    if (minQuantity !== undefined) inv.minQuantity = minQuantity
    if (maxQuantity !== undefined) inv.maxQuantity = maxQuantity
    await inv.save()
    return ok(inv)
  }

  // General update (min/max threshold)
  if (minQuantity !== undefined) inv.minQuantity = minQuantity
  if (maxQuantity !== undefined) inv.maxQuantity = maxQuantity
  await inv.save()
  return ok(inv)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  await InventoryModel.findByIdAndDelete(params.id)
  return ok({ success: true })
}
