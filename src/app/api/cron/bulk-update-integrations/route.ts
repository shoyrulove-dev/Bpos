import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { requireAdmin } from '@/lib/api-helpers'
import { encrypt } from '@/lib/crypto'
import { getDefaultSessionRefreshMode } from '@/lib/session-refresh-mode'

const CRON_SECRET = process.env.CRON_SECRET

type BulkIntegrationRow = {
  provider?: string
  loginUsername?: string
  loginPassword?: string
  externalStoreId?: string
  externalStoreName?: string
  loginMode?: 'api' | 'auto'
  sessionRefreshMode?: 'auto' | 'browser'
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function findIntegration(row: BulkIntegrationRow) {
  const provider = normalizeText(row.provider)
  const loginUsername = normalizeText(row.loginUsername)
  const externalStoreId = normalizeText(row.externalStoreId)

  if (!provider) return null

  if (loginUsername) {
    const match = await IntegrationModel.findOne({ provider, loginUsername })
    if (match) return match
  }

  if (externalStoreId) {
    const match = await IntegrationModel.findOne({ provider, externalStoreId })
    if (match) return match
  }

  return null
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secretParam = req.nextUrl.searchParams.get('secret')
  const secretAuthorized = Boolean(
    CRON_SECRET && (authHeader === `Bearer ${CRON_SECRET}` || secretParam === CRON_SECRET)
  )

  if (!secretAuthorized) {
    const { res } = await requireAdmin(req)
    if (res) return res
  }

  const body = await req.json() as {
    rows?: BulkIntegrationRow[]
    defaultSessionRefreshMode?: 'auto' | 'browser'
  }

  const rows = Array.isArray(body.rows) ? body.rows : []
  if (!rows.length) {
    return NextResponse.json({ error: 'Thiếu rows để cập nhật' }, { status: 400 })
  }

  await connectDB()

  const results: Array<Record<string, unknown>> = []
  let updated = 0
  let skipped = 0

  for (const row of rows) {
    const provider = normalizeText(row.provider)
    const loginUsername = normalizeText(row.loginUsername)
    const loginPassword = normalizeText(row.loginPassword)
    const externalStoreId = normalizeText(row.externalStoreId)
    const externalStoreName = normalizeText(row.externalStoreName)

    if (!provider || (!loginUsername && !externalStoreId)) {
      skipped += 1
      results.push({ provider, loginUsername, externalStoreId, ok: false, reason: 'Thiếu provider hoặc khoá match' })
      continue
    }

    const integration = await findIntegration(row)
    if (!integration) {
      skipped += 1
      results.push({ provider, loginUsername, externalStoreId, ok: false, reason: 'Không tìm thấy integration' })
      continue
    }

    const nextLoginMode = row.loginMode ?? 'auto'
    const nextSessionRefreshMode = row.sessionRefreshMode ?? body.defaultSessionRefreshMode ?? getDefaultSessionRefreshMode(provider)

    const set: Record<string, unknown> = {
      loginMode: nextLoginMode,
      sessionRefreshMode: nextSessionRefreshMode,
    }
    const unset: Record<string, 1> = {}

    if (loginUsername) set.loginUsername = loginUsername
    if (loginPassword) {
      set.loginPassword = encrypt(loginPassword)
      set.sessionStatus = 'expired'
      set.sessionFailureCount = 0
      unset.sessionData = 1
      unset.sessionCapturedAt = 1
      unset.sessionExpiresAt = 1
      unset.sessionError = 1
      unset.syncError = 1
    }
    if (externalStoreId) set.externalStoreId = externalStoreId
    if (externalStoreName) set.externalStoreName = externalStoreName

    await IntegrationModel.updateOne(
      { _id: integration._id },
      {
        $set: set,
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
      }
    )
    updated += 1
    results.push({
      ok: true,
      id: String(integration._id),
      provider,
      loginUsername,
      externalStoreId,
      sessionRefreshMode: nextSessionRefreshMode,
    })
  }

  return NextResponse.json({
    ok: true,
    total: rows.length,
    updated,
    skipped,
    results,
  })
}