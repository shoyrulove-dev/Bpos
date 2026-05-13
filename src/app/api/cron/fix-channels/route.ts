/**
 * POST /api/cron/fix-channels
 */
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import ChannelModel from '@/models/Channel'
import IntegrationModel from '@/models/Integration'
import UserModel from '@/models/User'
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

  const result: Record<string, unknown> = {}

  try {
    await connectDB()

    // ── 1. Delete duplicate channels ──────────────────────────────────────────
    const deleteIds = CHANNEL_IDS_TO_DELETE.map(id => new mongoose.Types.ObjectId(id))
    const deleteResult = await ChannelModel.deleteMany({ _id: { $in: deleteIds } })
    result.channelsDeleted = deleteResult.deletedCount

    // ── 2. Find an admin user to use as createdBy ────────────────────────────
    const adminUser = await UserModel.findOne({ role: 'admin' }).lean()
    const createdById = adminUser?._id ?? new mongoose.Types.ObjectId()
    result.adminUserId = String(createdById)

    // ── 3. Create new integrations for 1ketoan ────────────────────────────────
    const created: string[] = []
    const skipped: string[] = []

    for (const acc of NEW_GRAB_INTEGRATIONS) {
      const existing = await IntegrationModel.findOne({
        provider: 'grab',
        externalStoreId: acc.storeId,
      }).lean()

      if (existing) {
        skipped.push(acc.storeId)
        await ensureChannelForIntegration({
          provider: 'grab',
          brandId: new mongoose.Types.ObjectId(acc.brandId),
          hubId: new mongoose.Types.ObjectId(acc.hubId),
          externalStoreId: acc.storeId,
          externalStoreName: acc.storeName,
          isActive: true,
        })
        continue
      }

      const encryptedPw = encrypt(acc.password)
      const integration = await IntegrationModel.create({
        provider:            'grab',
        brandId:             new mongoose.Types.ObjectId(acc.brandId),
        hubId:               new mongoose.Types.ObjectId(acc.hubId),
        externalStoreId:     acc.storeId,
        externalStoreName:   acc.storeName,
        loginMode:           'auto',
        loginUsername:       acc.username,
        loginPassword:       encryptedPw,
        sessionRefreshMode:  'auto',
        credentials:         new Map(),
        isActive:            true,
        createdBy:           createdById,
      })

      await ensureChannelForIntegration({
        provider: 'grab',
        brandId: new mongoose.Types.ObjectId(acc.brandId),
        hubId: new mongoose.Types.ObjectId(acc.hubId),
        externalStoreId: acc.storeId,
        externalStoreName: acc.storeName,
        isActive: true,
      })

      created.push(`${acc.storeId} → ${String(integration._id)}`)
    }

    result.integrationsCreated = created
    result.integrationsSkipped = skipped
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error ? e.stack : undefined
    result.error = msg
    result.stack = stack?.split('\n').slice(0, 5).join(' | ')
  }

  return NextResponse.json({ ok: true, ...result })
}
