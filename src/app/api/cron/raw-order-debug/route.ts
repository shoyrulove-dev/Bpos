import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import SyncLogModel from '@/models/SyncLog'

const CRON_SECRET = process.env.CRON_SECRET

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readSection(content: string, key: string) {
  const match = content.match(new RegExp(`\\[${key}:([^\\]]*)\\]`))
  return match?.[1]?.trim() || undefined
}

function splitIds(value: string | undefined) {
  if (!value || value === '-') return []
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function parseCounts(content: string) {
  const match = content.match(/\[raw:(\d+) normalized:(\d+) active:(\d+) history:(\d+)\]/)
  if (!match) return null

  return {
    raw: Number(match[1]),
    normalized: Number(match[2]),
    active: Number(match[3]),
    history: Number(match[4]),
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const secretParam = req.nextUrl.searchParams.get('secret')

  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && secretParam !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const provider = (req.nextUrl.searchParams.get('provider') ?? 'grab').trim() || 'grab'
  const integrationId = (req.nextUrl.searchParams.get('integrationId') ?? '').trim()
  const needle = (req.nextUrl.searchParams.get('needle') ?? '').trim()
  const limit = Math.max(1, Math.min(20, Number(req.nextUrl.searchParams.get('limit') ?? 10) || 10))

  await connectDB()

  const docs = await SyncLogModel.find({ type: 'order', source: provider })
    .sort({ createdAt: -1 })
    .limit(Math.max(limit * 10, 20))
    .select('status content source brandId createdAt updatedAt')
    .lean() as Array<{
      _id: unknown
      status?: string
      content?: string
      source?: string
      brandId?: unknown
      createdAt?: Date | string
      updatedAt?: Date | string
    }>

  const filtered = docs.filter((doc) => {
    const content = String(doc.content ?? '')
    if (integrationId && !new RegExp(`\\[integration:${escapeRegex(integrationId)}\\]`).test(content)) {
      return false
    }

    if (needle && !content.toLowerCase().includes(needle.toLowerCase())) {
      return false
    }

    return true
  }).slice(0, limit)

  return NextResponse.json({
    ok: true,
    provider,
    integrationId,
    needle,
    count: filtered.length,
    entries: filtered.map((doc) => {
      const content = String(doc.content ?? '')
      return {
        id: String(doc._id ?? ''),
        status: doc.status ?? 'pending',
        source: doc.source ?? provider,
        brandId: doc.brandId ? String(doc.brandId) : undefined,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        integration: readSection(content, 'integration'),
        store: readSection(content, 'store'),
        counts: parseCounts(content),
        rawDebugIds: splitIds(readSection(content, 'rawDebugIds')),
        rawOrderIds: splitIds(readSection(content, 'rawOrderIds')),
        normalizedIds: splitIds(readSection(content, 'normalizedIds')),
        content,
      }
    }),
  })
}