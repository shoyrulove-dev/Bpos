import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import SyncLogModel from '@/models/SyncLog'
import { ok, err, requireAdmin } from '@/lib/api-helpers'
import { encrypt } from '@/lib/crypto'
import { ensureChannelForIntegration } from '@/lib/channel-sync'
import { getDefaultSessionRefreshMode } from '@/lib/session-refresh-mode'

const EXTERNAL_SCRAPER_STALE_MS = 15 * 60 * 1000
const EXTERNAL_SCRAPER_LOOKBACK_MS = 30 * 60 * 1000 // 30 phút (stale threshold là 15 phút)

type ScraperSyncStatus = 'success' | 'error' | 'pending' | 'starting' | 'logging-in'

function usesExternalOrderSync(integration: { provider?: string; loginMode?: string }) {
  return integration.loginMode === 'auto' && (integration.provider === 'grab' || integration.provider === 'be')
}

function getExpectedExternalSyncSource(provider?: string) {
  if (provider === 'grab') return 'browser-scraper'
  if (provider === 'be') return 'vps-be-scraper'
  return undefined
}

function extractIntegrationId(content: string) {
  return content.match(/\[integration:([^\]]+)\]/)?.[1]?.trim()
}

function extractExternalSyncSource(content: string) {
  return content.match(/\[(browser-scraper|vps-be-scraper|backfill-phones)\]\s*$/)?.[1]?.trim()
}

function extractScraperHeartbeatPhase(content: string) {
  return content.match(/\[phase:([^\]]+)\]/)?.[1]?.trim()
}

function extractScraperHeartbeatDetail(content: string) {
  return content.match(/\[detail:([^\]]+)\]/)?.[1]?.trim()
}

function mapHeartbeatPhase(phase?: string): { scraperSyncStatus: ScraperSyncStatus; scraperSyncMessage?: string } | null {
  if (!phase) return null

  switch (phase) {
    case 'starting':
      return { scraperSyncStatus: 'starting', scraperSyncMessage: 'Scraper đang khởi động' }
    case 'login-start':
      return { scraperSyncStatus: 'logging-in', scraperSyncMessage: 'Scraper đang đăng nhập' }
    case 'login-ok':
      return { scraperSyncStatus: 'logging-in', scraperSyncMessage: 'Đăng nhập xong, chờ sync đầu tiên' }
    case 'login-failed':
      return { scraperSyncStatus: 'error', scraperSyncMessage: 'Scraper đăng nhập lỗi' }
    default:
      return null
  }
}

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

  const typedIntegrations = integrations as Array<Record<string, unknown>>
  const externalTargets = typedIntegrations.filter((integration) =>
    usesExternalOrderSync({
      provider: String(integration.provider ?? ''),
      loginMode: String(integration.loginMode ?? ''),
    })
  )

  const latestExternalSyncById = new Map<string, {
    scraperSyncStatus: ScraperSyncStatus
    scraperLastSyncAt: Date | string
    scraperSyncSource: string
    scraperSyncMessage?: string
  }>()

  if (externalTargets.length) {
    const providerByIntegrationId = new Map(
      externalTargets.map((integration) => [String(integration._id ?? ''), String(integration.provider ?? '')])
    )

    const recentLogs = await SyncLogModel.find({
      type: 'order',
      source: { $in: ['grab', 'be'] },
      createdAt: { $gte: new Date(Date.now() - EXTERNAL_SCRAPER_LOOKBACK_MS) },
    })
      .sort({ createdAt: -1 })
      .limit(300)
      .select('content createdAt')
      .lean() as Array<{ content?: string; createdAt?: Date | string }>

    for (const log of recentLogs) {
      const content = String(log.content ?? '')
      const integrationId = extractIntegrationId(content)
      if (!integrationId || latestExternalSyncById.has(integrationId)) continue

      const provider = providerByIntegrationId.get(integrationId)
      const expectedSource = getExpectedExternalSyncSource(provider)
      const syncSource = extractExternalSyncSource(content)
      if (!provider || !expectedSource || syncSource !== expectedSource) continue

      const createdAt = log.createdAt ? new Date(log.createdAt) : null
      if (!createdAt || Number.isNaN(createdAt.getTime())) continue

      if (content.includes('[browser-push]')) {
        latestExternalSyncById.set(integrationId, {
          scraperSyncStatus: Date.now() - createdAt.getTime() <= EXTERNAL_SCRAPER_STALE_MS ? 'success' : 'error',
          scraperLastSyncAt: createdAt,
          scraperSyncSource: syncSource,
          scraperSyncMessage: Date.now() - createdAt.getTime() <= EXTERNAL_SCRAPER_STALE_MS ? 'Scraper đã push dữ liệu' : 'Scraper không push gần đây',
        })
        continue
      }

      if (!content.includes('[scraper-heartbeat]')) continue

      const phase = extractScraperHeartbeatPhase(content)
      const heartbeat = mapHeartbeatPhase(phase)
      if (!heartbeat) continue

      const detail = extractScraperHeartbeatDetail(content)
      const isStale = Date.now() - createdAt.getTime() > EXTERNAL_SCRAPER_STALE_MS

      latestExternalSyncById.set(integrationId, {
        scraperSyncStatus: isStale ? 'error' : heartbeat.scraperSyncStatus,
        scraperLastSyncAt: createdAt,
        scraperSyncSource: syncSource,
        scraperSyncMessage: isStale
          ? 'Heartbeat scraper đã cũ'
          : detail || heartbeat.scraperSyncMessage,
      })
    }
  }

  return ok(typedIntegrations.map((integration) => {
    if (!usesExternalOrderSync({ provider: String(integration.provider ?? ''), loginMode: String(integration.loginMode ?? '') })) {
      return integration
    }

    const integrationId = String(integration._id ?? '')
    const externalSync = latestExternalSyncById.get(integrationId)

    return {
      ...integration,
      appSyncStatus: integration.syncStatus,
      appLastSyncAt: integration.lastSyncAt,
      scraperSyncStatus: externalSync?.scraperSyncStatus ?? 'pending',
      scraperLastSyncAt: externalSync?.scraperLastSyncAt,
      scraperSyncSource: externalSync?.scraperSyncSource,
      scraperSyncMessage: externalSync?.scraperSyncMessage,
    }
  }))
}

export async function POST(req: NextRequest) {
  const { token, res } = await requireAdmin(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { provider, brandId, hubId, externalStoreId, externalStoreName, credentials, loginMode, loginUsername, loginPassword, sessionRefreshMode } = body
  if (!provider || !brandId) return err('Thiếu thông tin bắt buộc')
  const integDoc: Record<string, unknown> = {
    provider, brandId, hubId, externalStoreId, externalStoreName,
    credentials: credentials || {},
    createdBy: token!.id,
  }
  if (loginMode)    integDoc.loginMode    = loginMode
  if (loginUsername) integDoc.loginUsername = loginUsername
  if (loginPassword) integDoc.loginPassword = encrypt(String(loginPassword))
  if (loginMode === 'auto' || loginUsername || loginPassword) {
    integDoc.sessionRefreshMode = sessionRefreshMode || getDefaultSessionRefreshMode(provider)
  }
  const integration = await IntegrationModel.create(integDoc)
  await ensureChannelForIntegration({
    provider: integration.provider,
    brandId: integration.brandId,
    hubId: integration.hubId,
    externalStoreId: integration.externalStoreId,
    externalStoreName: integration.externalStoreName,
    isActive: integration.isActive,
  })
  return ok(integration, 201)
}
