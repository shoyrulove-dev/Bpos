import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { ok, err, requireAdmin } from '@/lib/api-helpers'
import { encrypt } from '@/lib/crypto'
import { ensureChannelForIntegration } from '@/lib/channel-sync'

type IntegrationChannelDoc = {
  provider: string
  brandId: unknown
  hubId?: unknown | null
  externalStoreId?: string
  externalStoreName?: string
  isActive?: boolean
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAdmin(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { credentials, externalStoreId, externalStoreName, isActive, loginMode, loginUsername, loginPassword, sessionRefreshMode } = body
  const update: Record<string, unknown> = {}
  if (externalStoreId)                 update.externalStoreId   = externalStoreId
  if (externalStoreName !== undefined) update.externalStoreName  = externalStoreName
  if (isActive !== undefined)          update.isActive           = isActive
  if (loginMode)                       update.loginMode          = loginMode
  if (loginUsername !== undefined)     update.loginUsername      = loginUsername
  if (loginPassword)                   update.loginPassword      = encrypt(String(loginPassword))
  if (sessionRefreshMode)              update.sessionRefreshMode = sessionRefreshMode
  // Merge individual credential keys using dot notation
  if (credentials && typeof credentials === 'object') {
    Object.entries(credentials as Record<string, string>).forEach(([k, v]) => {
      update[`credentials.${k}`] = v
    })
  }
  const intg = await IntegrationModel.findByIdAndUpdate(params.id, { $set: update }, { new: true }).lean() as IntegrationChannelDoc | null
  if (!intg) return err('Không tìm thấy', 404)
  await ensureChannelForIntegration({
    provider: intg.provider,
    brandId: intg.brandId,
    hubId: intg.hubId,
    externalStoreId: intg.externalStoreId,
    externalStoreName: intg.externalStoreName,
    isActive: intg.isActive,
  })
  return ok(intg)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAdmin(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { credentials: _cred, ...safe } = body
  const intg = await IntegrationModel.findByIdAndUpdate(params.id, safe, { new: true }).lean() as IntegrationChannelDoc | null
  if (!intg) return err('Không tìm thấy', 404)
  await ensureChannelForIntegration({
    provider: intg.provider,
    brandId: intg.brandId,
    hubId: intg.hubId,
    externalStoreId: intg.externalStoreId,
    externalStoreName: intg.externalStoreName,
    isActive: intg.isActive,
  })
  return ok(intg)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAdmin(req)
  if (res) return res
  await connectDB()
  await IntegrationModel.findByIdAndDelete(params.id)
  return ok({ success: true })
}
