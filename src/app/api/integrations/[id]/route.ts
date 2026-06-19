import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { ok, err, requireAdmin } from '@/lib/api-helpers'
import { encrypt } from '@/lib/crypto'
import { deleteChannelForIntegration, ensureChannelForIntegration } from '@/lib/channel-sync'

type IntegrationChannelDoc = {
  provider: string
  brandId: unknown
  hubId?: unknown | null
  externalStoreId?: string
  externalStoreName?: string
  isActive?: boolean
  loginMode?: string
  loginUsername?: string
  loginPassword?: string
}

function validateAutoMarketplaceIntegration(input: {
  provider?: unknown
  loginMode?: unknown
  loginUsername?: unknown
  loginPassword?: unknown
}, options?: { requirePassword?: boolean }) {
  const provider = String(input.provider ?? '').trim()
  const loginMode = String(input.loginMode ?? 'api').trim()
  if (!['grab', 'be'].includes(provider) || loginMode !== 'auto') return null

  const loginUsername = String(input.loginUsername ?? '').trim()
  const loginPassword = String(input.loginPassword ?? '').trim()

  if (!loginUsername) return 'Thiếu tài khoản đăng nhập sàn'
  if (options?.requirePassword !== false && !loginPassword) return 'Thiếu mật khẩu đăng nhập sàn'
  return null
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAdmin(req)
  if (res) return res

  await connectDB()
  const existing = await IntegrationModel.findById(params.id).select('+loginPassword').lean() as IntegrationChannelDoc | null
  if (!existing) return err('Không tìm thấy', 404)

  const body = await req.json()
  const {
    credentials,
    externalStoreId,
    externalStoreName,
    isActive,
    loginMode,
    loginUsername,
    loginPassword,
    sessionRefreshMode,
    brandId,
    hubId,
  } = body

  const autoValidationError = validateAutoMarketplaceIntegration({
    provider: existing.provider,
    loginMode: loginMode ?? existing.loginMode ?? 'api',
    loginUsername: loginUsername !== undefined ? loginUsername : existing.loginUsername,
    loginPassword: loginPassword ? String(loginPassword) : (existing.loginPassword ? '__existing__' : ''),
  }, { requirePassword: true })
  if (autoValidationError) return err(autoValidationError)

  const update: Record<string, unknown> = {}
  if (externalStoreId !== undefined) update.externalStoreId = externalStoreId || null
  if (externalStoreName !== undefined) update.externalStoreName = externalStoreName || null
  if (isActive !== undefined) update.isActive = isActive
  if (loginMode) update.loginMode = loginMode
  if (loginUsername !== undefined) update.loginUsername = loginUsername
  if (loginPassword) update.loginPassword = encrypt(String(loginPassword))
  if (sessionRefreshMode) update.sessionRefreshMode = sessionRefreshMode
  if (brandId) update.brandId = brandId
  if (hubId !== undefined) update.hubId = hubId || null

  if (credentials && typeof credentials === 'object') {
    Object.entries(credentials as Record<string, string>).forEach(([k, v]) => {
      update[`credentials.${k}`] = v
    })
  }

  const intg = await IntegrationModel.findByIdAndUpdate(params.id, { $set: update }, { new: true }).lean() as IntegrationChannelDoc | null
  if (!intg) return err('Không tìm thấy', 404)

  await deleteChannelForIntegration({
    provider: existing.provider,
    brandId: existing.brandId,
    hubId: existing.hubId,
    externalStoreId: existing.externalStoreId,
    externalStoreName: existing.externalStoreName,
    isActive: existing.isActive,
  })
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
  const existing = await IntegrationModel.findById(params.id).select('+loginPassword').lean() as IntegrationChannelDoc | null
  if (!existing) return err('Không tìm thấy', 404)

  const body = await req.json()
  const { credentials: _cred, ...safe } = body

  const autoValidationError = validateAutoMarketplaceIntegration({
    provider: safe.provider ?? existing.provider,
    loginMode: safe.loginMode ?? existing.loginMode ?? 'api',
    loginUsername: safe.loginUsername ?? existing.loginUsername,
    loginPassword: safe.loginPassword ? String(safe.loginPassword) : (existing.loginPassword ? '__existing__' : ''),
  }, { requirePassword: true })
  if (autoValidationError) return err(autoValidationError)

  const intg = await IntegrationModel.findByIdAndUpdate(params.id, safe, { new: true }).lean() as IntegrationChannelDoc | null
  if (!intg) return err('Không tìm thấy', 404)

  await deleteChannelForIntegration({
    provider: existing.provider,
    brandId: existing.brandId,
    hubId: existing.hubId,
    externalStoreId: existing.externalStoreId,
    externalStoreName: existing.externalStoreName,
    isActive: existing.isActive,
  })
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
  const integration = await IntegrationModel.findById(params.id).lean() as IntegrationChannelDoc | null
  if (!integration) return err('Không tìm thấy', 404)

  await deleteChannelForIntegration({
    provider: integration.provider,
    brandId: integration.brandId,
    hubId: integration.hubId,
    externalStoreId: integration.externalStoreId,
    externalStoreName: integration.externalStoreName,
    isActive: integration.isActive,
  })
  await IntegrationModel.findByIdAndDelete(params.id)

  return ok({ success: true })
}
