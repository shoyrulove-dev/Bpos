import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import ChannelModel from '@/models/Channel'
import { ok, err, requireAuth, requireAdmin } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const brandId = searchParams.get('brandId') || ''
  const source = searchParams.get('source') || ''
  const filter: Record<string, unknown> = {}
  if (q) filter.$or = [{ name: { $regex: q, $options: 'i' } }]
  if (brandId) filter.brandId = brandId
  if (source) filter.source = source
  const channels = await ChannelModel.find(filter)
    .populate('brandId', 'name')
    .populate('hubId', 'name')
    .sort({ hubId: 1, name: 1, createdAt: -1 }).lean()
  return ok(channels)
}

export async function POST(req: NextRequest) {
  const { res } = await requireAdmin(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { name, source, brandId, hubId, externalStoreId, printerEnabled, printerReceiptEnabled, printerLabelEnabled } = body
  if (!name || !source || !brandId) return err('Thiếu thông tin bắt buộc')
  const channel = await ChannelModel.create({
    name,
    source,
    brandId,
    hubId,
    externalStoreId,
    printerEnabled: printerEnabled !== false,
    printerReceiptEnabled: printerReceiptEnabled !== false,
    printerLabelEnabled: printerLabelEnabled !== false,
    connectedAt: new Date(),
  })
  return ok(channel, 201)
}
