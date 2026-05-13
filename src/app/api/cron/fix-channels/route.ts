/**
 * POST /api/cron/fix-channels
 *
 * One-time maintenance endpoint:
 * 1. Delete duplicate channels for storeIds that have >1 channel doc
 * 2. Create integrations + auto-create channels for 2 new 1ketoan Grab stores
 *
 * Auth: Bearer <CRON_SECRET>
 * Run once then this endpoint can be removed.
 */
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import ChannelModel from '@/models/Channel'
import IntegrationModel from '@/models/Integration'
import { encrypt } from '@/lib/crypto'
import { ensureChannelForIntegration } from '@/lib/channel-sync'
import mongoose from 'mongoose'

const CRON_SECRET = process.env.CRON_SECRET

// Channels to delete (old duplicates — keep the newer one with correct hubId)
const CHANNEL_IDS_TO_DELETE = [
  '69fce17099275b11bf559402', // old "3B" BDT for 5-C6LZTU3UG3CVCE (created 07/05, outdated)
  '69fba912ea2efd407b2e93d8', // old "TAKO Corp" for 5-C6VEA3A2TNK2L2 (created 06/05, no hubId)
]

// New integrations to create for 1ketoan@takogroup.com.vn
const NEW_GRAB_INTEGRATIONS = [
  {
    username:    '1ketoan@takogroup.com.vn',
    password:    'Bdt2026@',
    storeId:     '5-C73WNZCKANCXTN',
    storeName:   '3B - Food & Drink - Đường số 3',
    brandId:     '69fefc50113d0a93aeedf33e', // 3B Food & Drink
    hubId:       '69fb4e4d28deecc201cc77d4', // 30B hub (same as existing 1ketoan store)
  },
  {
    username:    '1ketoan@takogroup.com.vn',
    password:    'Bdt2026@',
    storeId:     '5-C73WNZCXAT4UC2',
    storeName:   '3B - Food & Drink (chi nhánh mới)',
    brandId:     '69fefc50113d0a93aeedf33e', // 3B Food & Drink
    hubId:       '69fb4e4d28deecc201cc77d4', // 30B hub
  },
]

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await connectDB()

  const result: Record<string, unknown> = {}

  // ── 1. Delete duplicate channels ──────────────────────────────────────────
  const deleteIds = CHANNEL_IDS_TO_DELETE.map(id => new mongoose.Types.ObjectId(id))
  const deleteResult = await ChannelModel.deleteMany({ _id: { $in: deleteIds } })
  result.channelsDeleted = deleteResult.deletedCount

  // ── 2. Create new integrations for 1ketoan ────────────────────────────────
  const created: string[] = []
  const skipped: string[] = []

  for (const acc of NEW_GRAB_INTEGRATIONS) {
    // Skip if integration already exists for this storeId
    const existing = await IntegrationModel.findOne({
      provider: 'grab',
      externalStoreId: acc.storeId,
    }).lean()

    if (existing) {
      skipped.push(acc.storeId)
      // Still ensure channel exists
      await ensureChannelForIntegration({
        provider: 'grab',
        brandId: acc.brandId,
        hubId: acc.hubId,
        externalStoreId: acc.storeId,
        externalStoreName: acc.storeName,
        isActive: true,
      })
      continue
    }

    const integration = await IntegrationModel.create({
      provider:            'grab',
      brandId:             acc.brandId,
      hubId:               acc.hubId,
      externalStoreId:     acc.storeId,
      externalStoreName:   acc.storeName,
      loginMode:           'auto',
      loginUsername:       acc.username,
      loginPassword:       encrypt(acc.password),
      sessionRefreshMode:  'auto',
      credentials:         {},
      isActive:            true,
    })

    await ensureChannelForIntegration({
      provider: 'grab',
      brandId: acc.brandId,
      hubId: acc.hubId,
      externalStoreId: acc.storeId,
      externalStoreName: acc.storeName,
      isActive: true,
    })

    created.push(`${acc.storeId} → ${String(integration._id)}`)
  }

  result.integrationsCreated = created
  result.integrationsSkipped = skipped

  return NextResponse.json({ ok: true, ...result })
}
