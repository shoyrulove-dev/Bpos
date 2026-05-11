import { connectDB } from '../lib/db'
import { runOrderRepair } from '../lib/order-repair'

function parseArgs() {
  const args = process.argv.slice(2)
  const providersArg = args.find((arg) => arg.startsWith('--providers='))?.split('=')[1]
  const daysArg = args.find((arg) => arg.startsWith('--days='))?.split('=')[1]
  const orderIdsArg = args.find((arg) => arg.startsWith('--orderIds='))?.split('=')[1]
  const shortIdsArg = args.find((arg) => arg.startsWith('--shortIds='))?.split('=')[1]
  const storeIdsArg = args.find((arg) => arg.startsWith('--storeIds='))?.split('=')[1]
  const driverPhoneArg = args.find((arg) => arg.startsWith('--driverPhone='))?.split('=')[1]
  const historicalArg = args.find((arg) => arg.startsWith('--historical='))?.split('=')[1]

  return {
    providers: (providersArg ? providersArg.split(',') : ['be', 'grab']).map((value) => value.trim()).filter(Boolean),
    days: Math.max(1, Math.min(90, Number(daysArg ?? 30) || 30)),
    includeHistorical: historicalArg !== 'false',
    externalOrderIds: (orderIdsArg ? orderIdsArg.split(',') : []).map((value) => value.trim()).filter(Boolean),
    shortIds: (shortIdsArg ? shortIdsArg.split(',') : []).map((value) => value.trim()).filter(Boolean),
    externalStoreIds: (storeIdsArg ? storeIdsArg.split(',') : []).map((value) => value.trim()).filter(Boolean),
    driverPhone: (driverPhoneArg ?? '').trim(),
  }
}

async function main() {
  const { providers, days, includeHistorical, externalOrderIds, shortIds, externalStoreIds, driverPhone } = parseArgs()
  await connectDB()

  console.log(`[repair-orders] start providers=${providers.join(',')} days=${days} historical=${includeHistorical} orderIds=${externalOrderIds.length} shortIds=${shortIds.length} storeIds=${externalStoreIds.length}`)
  const result = await runOrderRepair({ providers, days, includeHistorical, externalOrderIds, shortIds, externalStoreIds, driverPhone })
  console.log('[repair-orders] result', JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error('[repair-orders] failed', error)
  process.exit(1)
})