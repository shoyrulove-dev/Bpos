import { resolveDateRange } from '@/lib/date-range'

export type OrderFilterParams = {
  q?: string
  status?: string
  source?: string
  brandId?: string
  fromDate?: string
  toDate?: string
}

export function buildOrderFilter(params: OrderFilterParams) {
  const filter: Record<string, unknown> = {}

  if (params.q) {
    filter.$or = [
      { shortId: { $regex: params.q, $options: 'i' } },
      { externalOrderId: { $regex: params.q, $options: 'i' } },
      { 'rawPayload.displayID': { $regex: params.q, $options: 'i' } },
      { 'rawPayload.shortOrderID': { $regex: params.q, $options: 'i' } },
      { 'rawPayload.shortOrderId': { $regex: params.q, $options: 'i' } },
      { customerName: { $regex: params.q, $options: 'i' } },
      { customerPhone: { $regex: params.q, $options: 'i' } },
    ]
  }

  if (params.status) {
    const statuses = params.status.split(',').map((status) => status.trim()).filter(Boolean)
    filter.status = statuses.length === 1 ? statuses[0] : { $in: statuses }
  }

  if (params.source) filter.source = params.source
  if (params.brandId) filter.brandId = params.brandId

  const { from, to } = resolveDateRange(params, { defaultDays: null })
  if (from || to) {
    filter.placedAt = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    }
  }

  return filter
}

export function buildOrderFilterFromSearchParams(searchParams: URLSearchParams) {
  return buildOrderFilter({
    q: searchParams.get('q') || '',
    status: searchParams.get('status') || '',
    source: searchParams.get('source') || '',
    brandId: searchParams.get('brandId') || '',
    fromDate: searchParams.get('fromDate') || '',
    toDate: searchParams.get('toDate') || '',
  })
}
