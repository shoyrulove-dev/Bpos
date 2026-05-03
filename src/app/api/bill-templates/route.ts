import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import BillTemplateModel from '@/models/BillTemplate'
import { ok, err, requireAuth } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const brandId = searchParams.get('brandId') || ''
  const filter: Record<string, unknown> = {}
  if (brandId) filter.brandId = brandId
  const templates = await BillTemplateModel.find(filter).populate('brandId', 'name').sort({ createdAt: -1 }).lean()
  return ok(templates)
}

export async function POST(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { name, type, size, brandId, isActive, templateContent } = body
  if (!name) return err('Tên mẫu là bắt buộc')
  const template = await BillTemplateModel.create({ name, type: type || 'order', size: size || '80mm', brandId, isActive: isActive ?? true, templateContent: templateContent || '' })
  return ok(template, 201)
}
