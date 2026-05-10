import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import DriverModel from '@/models/Driver'
import { ok, requireAuth } from '@/lib/api-helpers'

function toCsvRow(fields: (string | number | undefined | null)[]) {
  return fields.map(f => {
    const v = f == null ? '' : String(f)
    return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v
  }).join(',')
}

const PLATFORM_LABELS: Record<string, string> = {
  grab: 'Grab', be: 'Be', shopee: 'ShopeeFood', xanh_sm: 'Xanh SM', internal: 'Nội bộ',
}

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const platform = searchParams.get('platform') || ''
  const exportCsv = searchParams.get('export') === 'csv'
  const filter: Record<string, unknown> = {}
  if (q) filter.$or = [
    { name: { $regex: q, $options: 'i' } },
    { phone: { $regex: q, $options: 'i' } },
  ]
  if (platform) filter.platform = platform
  const drivers = await DriverModel.find(filter).sort({ lastSeenAt: -1 }).lean()

  if (exportCsv) {
    const header = toCsvRow(['Tên tài xế', 'Số điện thoại', 'Sàn', 'Số lần gặp', 'Lần gần nhất'])
    const rows = drivers.map(d => toCsvRow([
      d.name, d.phone,
      PLATFORM_LABELS[d.platform] ?? d.platform,
      d.visitCount ?? 0,
      d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleDateString('vi-VN') : '',
    ]))
    const csv = [header, ...rows].join('\r\n')
    return new Response('\uFEFF' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="tai-xe.csv"',
      },
    })
  }

  return ok(drivers)
}
