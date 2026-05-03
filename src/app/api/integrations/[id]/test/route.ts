import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import { ok, err, requireAdmin } from '@/lib/api-helpers'
import { getAdapter } from '@/integrations/registry'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAdmin(req)
  if (res) return res

  await connectDB()
  const raw = await IntegrationModel.findById(params.id).select('+credentials').lean()
  if (!raw || Array.isArray(raw)) return err('Không tìm thấy tích hợp', 404)
  const intg = raw as unknown as { _id: string; provider: string; externalStoreId?: string; credentials?: unknown }

  const adapter = getAdapter(intg.provider)
  if (!adapter) return err(`Không hỗ trợ provider: ${intg.provider}`, 400)

  try {
    // Convert Mongoose Map → plain object
    const rawCreds = intg.credentials as unknown
    const credObj: Record<string, string> =
      rawCreds instanceof Map
        ? Object.fromEntries(rawCreds.entries())
        : typeof rawCreds === 'object' && rawCreds !== null
        ? (rawCreds as Record<string, string>)
        : {}

    const orders = await adapter.fetchOrders({
      ...credObj,
      storeId: credObj.storeId ?? intg.externalStoreId,
      shopId:  credObj.shopId  ?? intg.externalStoreId,
    })

    // Update sync status
    await IntegrationModel.findByIdAndUpdate(params.id, {
      syncStatus: 'success',
      lastSyncAt: new Date(),
      $unset: { syncError: '' },
    })

    return ok({
      ok:      true,
      message: 'Kết nối thành công',
      count:   orders.length,
      orders:  orders.slice(0, 5),
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Lỗi không xác định'
    await IntegrationModel.findByIdAndUpdate(params.id, {
      syncStatus: 'error',
      syncError:  errMsg,
    })
    return err(`Kết nối thất bại: ${errMsg}`, 502)
  }
}
