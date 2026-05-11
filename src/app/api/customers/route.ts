import { NextRequest } from 'next/server'
import { connectDB } from '@/lib/db'
import CustomerModel from '@/models/Customer'
import { ok, err, requireAuth } from '@/lib/api-helpers'
import { CHANNEL_SOURCE_LABEL } from '@/lib/utils'

function toCsvRow(fields: (string | number | undefined | null)[]) {
  return fields.map(f => {
    const v = f == null ? '' : String(f)
    return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v
  }).join(',')
}

export async function GET(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || ''
  const tier = searchParams.get('tier') || ''
  const brandId = searchParams.get('brandId') || ''
  const source = searchParams.get('source') || ''
  const exportCsv = searchParams.get('export') === 'csv'
  const andClauses: Record<string, unknown>[] = []
  if (q) andClauses.push({
    $or: [
      { name: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
    ],
  })
  if (tier) andClauses.push({ tier })
  if (brandId) andClauses.push({ brandId })
  if (source) andClauses.push({ $or: [{ source }, { sources: source }] })
  const filter: Record<string, unknown> = andClauses.length <= 1
    ? (andClauses[0] ?? {})
    : { $and: andClauses }
  const customers = await CustomerModel.find(filter)
    .sort({ lastOrderAt: -1, updatedAt: -1, createdAt: -1, totalSpend: -1 })
    .lean()

  if (exportCsv) {
    const header = toCsvRow(['Tên', 'Số điện thoại', 'Nguồn', 'Email', 'Hạng', 'Điểm tích lũy', 'Tổng chi tiêu', 'Số đơn', 'Đơn cuối'])
    const rows = customers.map(c => toCsvRow([
      c.name, c.phone,
      (Array.isArray(c.sources) && c.sources.length ? c.sources : c.source ? [c.source] : [])
        .map(value => CHANNEL_SOURCE_LABEL[value] ?? value)
        .join(', '),
      c.email,
      c.tier, c.points, c.totalSpend, c.orderCount,
      c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString('vi-VN') : '',
    ]))
    const csv = [header, ...rows].join('\r\n')
    return new Response('\uFEFF' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="khach-hang.csv"',
      },
    })
  }

  return ok(customers)
}

export async function POST(req: NextRequest) {
  const { res } = await requireAuth(req)
  if (res) return res
  await connectDB()
  const body = await req.json()
  const { phone, name, email, brandId, note, points, source } = body
  if (!phone || !name || !brandId) return err('Thiếu thông tin bắt buộc')
  const exists = await CustomerModel.findOne({ phone, brandId }).lean()
  if (exists) return err('Số điện thoại đã tồn tại')
  const customer = await CustomerModel.create({
    phone,
    name,
    email,
    brandId,
    note,
    points: points ?? 0,
    ...(source ? { source, sources: [source] } : {}),
  })
  return ok(customer, 201)
}
