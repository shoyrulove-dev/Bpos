import { NextRequest } from 'next/server'
import { requireAdmin, ok, err } from '@/lib/api-helpers'
import { getAdapter } from '@/integrations/registry'

export async function POST(req: NextRequest) {
  const { res } = await requireAdmin(req)
  if (res) return res

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return err('Body JSON không hợp lệ') }

  const { provider, credentials } = body as {
    provider?: string
    credentials?: Record<string, string>
  }

  if (!provider) return err('Thiếu provider')
  if (!credentials || typeof credentials !== 'object') return err('Thiếu credentials')

  const adapter = getAdapter(provider)
  if (!adapter) return err(`Không hỗ trợ provider: ${provider}`, 400)

  try {
    const creds: Record<string, string> = credentials
    const orders = await adapter.fetchOrders({
      ...creds,
      storeId: creds.storeId ?? creds.externalStoreId,
      shopId:  creds.shopId  ?? creds.storeId,
    })
    return ok({
      ok:      true,
      message: `Kết nối ${provider} thành công`,
      count:   orders.length,
      sample:  orders.slice(0, 3),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Lỗi không xác định'
    return err(`Kết nối thất bại: ${msg}`, 502)
  }
}
