import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import EInvoiceModel from '@/models/EInvoiceConnection'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const brandId = searchParams.get('brandId') || ''
  const filter: Record<string, unknown> = {}
  if (brandId) filter.brandId = brandId
  const connections = await EInvoiceModel.find(filter).populate('brandId', 'name').sort({ createdAt: -1 }).lean()
  return ok(connections)
}

export async function POST(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { provider, brandId, taxCode, username } = body
  if (!provider || !brandId) return err('Thiếu thông tin bắt buộc')
  const conn = await EInvoiceModel.create({ provider, brandId, taxCode, username, isConnected: false })
  return ok(conn, 201)
}
