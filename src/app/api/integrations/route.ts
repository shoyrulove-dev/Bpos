import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { ok, err, requireAdmin } from '@/lib/api-helpers'
import { encrypt } from '@/lib/crypto'

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
  const { provider, brandId, hubId, externalStoreId, externalStoreName, credentials, loginMode, loginUsername, loginPassword } = body
  if (!provider || !brandId) return err('Thiếu thông tin bắt buộc')
  const integDoc: Record<string, unknown> = {
    provider, brandId, hubId, externalStoreId, externalStoreName,
    credentials: credentials || {},
    createdBy: token!.id,
  }
  if (loginMode)    integDoc.loginMode    = loginMode
  if (loginUsername) integDoc.loginUsername = loginUsername
  if (loginPassword) integDoc.loginPassword = encrypt(String(loginPassword))
  const integration = await IntegrationModel.create(integDoc)
  return ok(integration, 201)
}
