import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import OrderModel from '@/models/Order'
import { createWorkbookBuffer, getDownloadFilename } from '@/lib/excel'
import { buildOrderFilterFromSearchParams } from '@/lib/order-query'
import { requireAuth } from '@/lib/api-helpers'

type PopulatedRef = { _id?: { toString(): string } | string; name?: string } | string | null | undefined

function getRefName(value: PopulatedRef) {
  if (!value || typeof value === 'string') return ''
  return typeof value.name === 'string' ? value.name : ''
}

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res

  await connectDB()
  const { searchParams } = new URL(req.url)
  const filter = buildOrderFilterFromSearchParams(searchParams)

  const orders = await OrderModel.find(filter)
    .select('shortId externalOrderId customerName customerPhone source items subtotal discount total platformFee status placedAt cancelReason brandId hubId')
    .populate('brandId', 'name')
    .populate('hubId', 'name')
    .sort({ placedAt: -1 })
    .lean()

  const rows = orders.map((order: Record<string, unknown>) => ({
    'Mã đơn': String(order.shortId ?? ''),
    'Mã sàn': String(order.externalOrderId ?? ''),
    'Khách hàng': String(order.customerName ?? ''),
    'Số điện thoại': String(order.customerPhone ?? ''),
    'Nguồn': String(order.source ?? ''),
    'Thương hiệu': getRefName(order.brandId as PopulatedRef),
    'Điểm bán': getRefName(order.hubId as PopulatedRef),
    'Số món': Array.isArray(order.items) ? order.items.length : 0,
    'Danh sách món': Array.isArray(order.items) ? order.items.map((item) => String((item as { name?: string }).name ?? '')).join(', ') : '',
    'Tạm tính': Number(order.subtotal ?? 0),
    'Giảm giá': Number(order.discount ?? 0),
    'Phí nền tảng': Number(order.platformFee ?? 0),
    'Tổng tiền': Number(order.total ?? 0),
    'Trạng thái': String(order.status ?? ''),
    'Thời gian đặt': order.placedAt ? new Date(String(order.placedAt)).toLocaleString('vi-VN') : '',
    'Lý do hủy': String(order.cancelReason ?? ''),
  }))

  const buffer = createWorkbookBuffer([{ name: 'Orders', rows }])
  const filename = getDownloadFilename(`orders-${searchParams.get('fromDate') || 'all'}-${searchParams.get('toDate') || 'all'}`)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}