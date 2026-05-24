import { connectDB } from '../lib/db'
import OrderModel from '@/models/Order'

const MOJIBAKE_PATTERN = /(?:Ã[\x80-\xFF]|Â[\x80-\xFF]|Ä[\x80-\xFF]|Å[\x80-\xFF]|Æ[\x80-\xFF]|Ð[\x80-\xFF]|â[€“”‘’–—]|œ|ž|™|¢|£|¤|¥|¦|§|¨|©|ª|«|¬|®|¯|°|±|²|³|´|µ|¶|·|¸|º|»|¼|½|¾|¿)/
const REPLACEMENT_CHAR_PATTERN = /\uFFFD/

function findMojibakeValues(value: unknown, path: string[] = [], hits: Array<{ path: string; value: string }> = []) {
  if (typeof value === 'string') {
    if (MOJIBAKE_PATTERN.test(value) || REPLACEMENT_CHAR_PATTERN.test(value)) {
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
  const limit = Math.max(1, Math.min(5000, Number(limitArg ?? '1000') || 1000))
  const providers = providersArg ? providersArg.split(',').map((value) => value.trim()).filter(Boolean) : []
  return { limit, providers }
}

async function main() {
  const { limit, providers } = parseArgs()
  await connectDB()

  const query: Record<string, unknown> = {}
  if (providers.length) query.source = { $in: providers }

  console.log(`[scan-vietnamese] scanning up to ${limit} orders${providers.length ? ` for sources: ${providers.join(', ')}` : ''}`)
  const orders = await OrderModel.find(query)
    .select('shortId externalOrderId customerName customerPhone status rawPayload note items deliveryInfo driverInfo')
    .limit(limit)
    .lean()

  const results: Array<{ orderId: string; shortId?: string; externalOrderId?: string; paths: Array<{ path: string; value: string }> }> = []

  for (const order of orders) {
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
}

main().catch((error) => {
  console.error('[scan-vietnamese] failed', error)
  process.exit(1)
})
