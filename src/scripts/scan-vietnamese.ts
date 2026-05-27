import { connectDB } from '../lib/db'
import OrderModel from '@/models/Order'
import { repairVietnameseText } from '@/lib/text-normalizer'
import mongoose from 'mongoose'

const MOJIBAKE_PATTERN = /(?:Ã[\x80-\xFF]|Â[\x80-\xFF]|Ä[\x80-\xFF]|Å[\x80-\xFF]|Æ[\x80-\xFF]|Ð[\x80-\xFF]|â[€“”‘’–—]|œ|ž|™|¢|£|¤|¥|¦|§|¨|©|ª|«|¬|®|¯|°|±|²|³|´|µ|¶|·|¸|º|»|¼|½|¾|¿)/
const REPLACEMENT_CHAR_PATTERN = /\uFFFD/

function findMojibakeValues(value: unknown, path: string[] = [], hits: Array<{ path: string; value: string }> = []) {
  if (typeof value === 'string') {
    const repaired = repairVietnameseText(value)
    if (REPLACEMENT_CHAR_PATTERN.test(value) || repaired !== value) {
      hits.push({ path: path.join('.'), value })
    }
    return hits
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => findMojibakeValues(item, [...path, String(index)], hits))
    return hits
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => findMojibakeValues(entry, [...path, key], hits))
  }

  return hits
}

function parseArgs() {
  const args = process.argv.slice(2)
  const providersArg = args.find((arg) => arg.startsWith('--providers='))?.split('=')[1]
  const limitArg = args.find((arg) => arg.startsWith('--limit='))?.split('=')[1]
  const daysArg = args.find((arg) => arg.startsWith('--days='))?.split('=')[1]
  const limit = Math.max(1, Math.min(2000, Number(limitArg ?? '200') || 200))
  const days = Math.max(0, Math.min(365, Number(daysArg ?? '30') || 30))
  const providers = providersArg ? providersArg.split(',').map((value) => value.trim()).filter(Boolean) : []
  return { limit, providers, days }
}

async function main() {
  try {
    const { limit, providers, days } = parseArgs()
    await connectDB()

    const query: Record<string, unknown> = {}
    if (providers.length) query.source = { $in: providers }
    if (days > 0) {
      const fromDate = new Date()
      fromDate.setDate(fromDate.getDate() - days)
      query.placedAt = { $gte: fromDate }
    }

    console.log(`[scan-vietnamese] scanning up to ${limit} recent orders${providers.length ? ` for sources: ${providers.join(', ')}` : ''}${days > 0 ? ` within ${days} days` : ''}`)
    const cursor = OrderModel.find(query)
      .select('shortId externalOrderId customerName customerPhone status rawPayload note items deliveryInfo driverInfo')
      .sort({ placedAt: -1 })
      .limit(limit)
      .lean()
    const results: Array<{ orderId: string; shortId?: string; externalOrderId?: string; paths: Array<{ path: string; value: string }> }> = []
    let scanned = 0

    for await (const order of cursor.cursor({ batchSize: 50 })) {
      scanned += 1
      const hits = findMojibakeValues(order)
      if (hits.length) {
        results.push({
          orderId: String(order._id ?? ''),
          shortId: order.shortId as string | undefined,
          externalOrderId: order.externalOrderId as string | undefined,
          paths: hits,
        })
      }
    }

    console.log(`[scan-vietnamese] scanned ${scanned} orders`)
    console.log(`[scan-vietnamese] found ${results.length} orders containing mojibake or replacement characters`)
    if (!results.length) return

    results.slice(0, 20).forEach((result, index) => {
      console.log(`\n[${index + 1}] orderId=${result.orderId} shortId=${result.shortId ?? '-'} externalOrderId=${result.externalOrderId ?? '-'} `)
      result.paths.slice(0, 20).forEach((hit) => {
        console.log(`  - ${hit.path}: ${JSON.stringify(hit.value)}`)
      })
    })

    if (results.length > 20) {
      console.log(`\n...and ${results.length - 20} more orders with issues.`)
    }
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => undefined)
    }
  }
}

main().catch((error) => {
  console.error('[scan-vietnamese] failed', error)
  process.exit(1)
})
