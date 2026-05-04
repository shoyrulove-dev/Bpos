import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import IntegrationModel from '@/models/Integration'
import OrderModel from '@/models/Order'
import SyncLogModel from '@/models/SyncLog'
import { ok, err, requireAdmin } from '@/lib/api-helpers'
import { getAdapter } from '@/integrations/registry'
import { generateId } from '@/lib/utils'
import type { NormalizedOrder } from '@/types'

/**
 * POST /api/integrations/[id]/sync
 * Fetch orders from provider and upsert them into the Order collection.
 * Idempotent: running twice for the same orders produces no duplicates.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { res } = await requireAdmin(req)
  if (res) return res

  await connectDB()

  const raw = await IntegrationModel.findById(params.id).select('+credentials').lean()
  if (!raw || Array.isArray(raw)) return err('Không tìm thấy tích hợp', 404)

  const intg = raw as unknown as {
    _id: string
    provider: string
    brandId: string
    hubId?: string
    externalStoreId?: string
    credentials?: unknown
    isActive: boolean
  }

  if (!intg.isActive) return err('Tích hợp đang bị tắt', 400)

  const adapter = getAdapter(intg.provider)
  if (!adapter) return err(`Không hỗ trợ provider: ${intg.provider}`, 400)

  const rawCreds = intg.credentials as unknown
  const credObj: Record<string, string> =
    rawCreds instanceof Map
      ? Object.fromEntries((rawCreds as Map<string, string>).entries())
      : typeof rawCreds === 'object' && rawCreds !== null
      ? (rawCreds as Record<string, string>)
      : {}

  const startedAt = Date.now()
  let upserted = 0
  let updated = 0
  let errors: string[] = []

  try {
    await IntegrationModel.findByIdAndUpdate(params.id, { syncStatus: 'syncing' })

    const orders: NormalizedOrder[] = await adapter.fetchOrders({
      ...credObj,
      storeId: credObj.storeId ?? intg.externalStoreId,
      shopId:  credObj.shopId  ?? intg.externalStoreId,
    })

    for (const normalized of orders) {
      try {
        if (!normalized.externalOrderId) continue

        const filter = {
          source:          normalized.source,
          externalOrderId: normalized.externalOrderId,
        }

        const update = {
          $setOnInsert: {
            shortId:  generateId(),
            placedAt: normalized.placedAt ? new Date(normalized.placedAt) : new Date(),
            brandId:  intg.brandId,
            hubId:    intg.hubId,
          },
          $set: {
            status:       normalized.orderStatus,
            customerName: normalized.customerName || 'Khách hàng',
            customerPhone: normalized.customerPhone,
            items:         normalized.items,
            subtotal:      normalized.subtotal,
            discount:      normalized.discount,
            total:         normalized.total,
            deliveryInfo:  normalized.deliveryInfo,
            driverInfo:    normalized.driverInfo,
            rawPayload:    normalized.rawPayload,
          },
        }

        const result = await OrderModel.findOneAndUpdate(filter, update, {
          upsert: true,
          new:    true,
          includeResultMetadata: true,
        })

        // lastErrorObject.updatedExisting = false means a new doc was inserted
        if (result?.lastErrorObject?.updatedExisting === false) {
          upserted++
        } else {
          updated++
        }
      } catch (orderErr) {
        errors.push(`${normalized.externalOrderId}: ${orderErr instanceof Error ? orderErr.message : String(orderErr)}`)
      }
    }

    const durationMs = Date.now() - startedAt
    const status = errors.length === 0 ? 'success' : 'error'

    await IntegrationModel.findByIdAndUpdate(params.id, {
      syncStatus: status,
      lastSyncAt: new Date(),
      ...(status === 'error' ? { syncError: errors.slice(0, 3).join('; ') } : { $unset: { syncError: '' } }),
    })

    await SyncLogModel.create({
      type:    'order',
      status:  errors.length === 0 ? 'success' : 'failed',
      content: `[${intg.provider}] Sync xong: +${upserted} mới, ${updated} cập nhật, ${errors.length} lỗi (${durationMs}ms)`,
      source:  intg.provider,
      brandId: intg.brandId,
    })

    return ok({
      ok:        true,
      upserted,
      updated,
      errors:    errors.slice(0, 10),
      durationMs,
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Lỗi không xác định'

    await IntegrationModel.findByIdAndUpdate(params.id, {
      syncStatus: 'error',
      syncError:  errMsg,
    })

    await SyncLogModel.create({
      type:    'order',
      status:  'failed',
      content: `[${intg.provider}] Sync thất bại: ${errMsg}`,
      source:  intg.provider,
      brandId: intg.brandId,
    })

    return err(`Sync thất bại: ${errMsg}`, 502)
  }
}
