import { connectDB } from '../lib/db'
import { runOrderRepair } from '../lib/order-repair'

function parseArgs() {
  const args = process.argv.slice(2)
  const providersArg = args.find((arg) => arg.startsWith('--providers='))?.split('=')[1]
  const daysArg = args.find((arg) => arg.startsWith('--days='))?.split('=')[1]

  return {
    providers: (providersArg ? providersArg.split(',') : ['be', 'grab']).map((value) => value.trim()).filter(Boolean),
    days: Math.max(1, Math.min(90, Number(daysArg ?? 30) || 30)),
  }
}

async function main() {
  const { providers, days } = parseArgs()
  await connectDB()

  console.log(`[repair-orders] start providers=${providers.join(',')} days=${days}`)
  const result = await runOrderRepair({ providers, days })
  console.log('[repair-orders] result', JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error('[repair-orders] failed', error)
  process.exit(1)
})