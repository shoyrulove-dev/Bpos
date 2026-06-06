import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import TableModel from '@/models/Table'
import { ok, err, requireAuth } from '@/lib/api-helpers'
import { canCancelReservedTable, canDeleteTable } from '@/lib/table-permissions'
import type { TableStatus } from '@/types'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAuth(_req)
  if (res) return res
  await connectDB()
  const table = await TableModel.findById(params.id).lean()
  if (!table) return err('Không tìm thấy', 404)
  return ok(table)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { res, token } = await requireAuth(req)
  if (res) return res
  await connectDB()

  const body = await req.json()
  const existing = await TableModel.findById(params.id).lean<{ status?: string } | null>()
  if (!existing) return err('Không tìm thấy', 404)

  if (!canCancelReservedTable(token?.role, existing.status as TableStatus | undefined, body.status as TableStatus | undefined)) {
    return err('Chỉ quản lý hoặc admin mới được hủy bàn đặt trước.', 403)
  }

  const table = await TableModel.findByIdAndUpdate(params.id, body, { new: true, runValidators: true }).lean()
  if (!table) return err('Không tìm thấy', 404)
  return ok(table)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { res, token } = await requireAuth(req)
  if (res) return res
  if (!canDeleteTable(token?.role)) {
    return err('Chỉ quản lý hoặc admin mới được xóa bàn.', 403)
  }

  await connectDB()
  await TableModel.findByIdAndDelete(params.id)
  return ok({ success: true })
}
