// audit-cancelled-orders.js
// Đối chiếu từng order cancelled gần đây với rawPayload cancel signals theo từng account
// Usage: node tmp/audit-cancelled-orders.js [--days=7] [--source=grab|be]
// Sử dụng live API (bposbin.vercel.app)

const DAYS = Number((process.argv.find(a => a.startsWith('--days=')) || '--days=7').split('=')[1])
const SOURCE_FILTER = (process.argv.find(a => a.startsWith('--source=')) || '').split('=')[1] || null
const BASE = 'https://bposbin.vercel.app'

async function login() {
  const csrfR = await fetch(`${BASE}/api/auth/csrf`)
  const csrfCookies = (csrfR.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ')
  const { csrfToken } = await csrfR.json()
  const loginR = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: csrfCookies },
    body: new URLSearchParams({ csrfToken, email: 'admin@bpos.vn', password: '123456', redirect: 'false', callbackUrl: BASE, json: 'true' }).toString(),
  })
  const loginCookies = (loginR.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ')
  return [csrfCookies, loginCookies].filter(Boolean).join('; ')
}

// ---- helpers ----
function extractCancelSignals(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const signals = {}
  const fields = [
    'cancel_reason', 'cancelReason', 'cancel_time', 'cancelTime',
    'cancelled_at', 'cancelledAt', 'is_cancelled', 'isCancelled',
    'status_text', 'statusText', 'cancel_status', 'cancelStatus',
    'cancelCode', 'cancel_code', '_pageType', '_pageStage',
    'cancelBy', 'cancel_by', 'cancelNote', 'cancel_note',
    'refundStatus', 'refund_status',
    // Be-specific: status field determines cancel
    'status', 'order_status', 'sub_status', 'cancel_reason_code', 'delivery_status',
    // Grab-specific
    'state', 'orderState', 'cancellationReason',
  ]
  for (const f of fields) {
    if (raw[f] !== undefined && raw[f] !== null && raw[f] !== '') signals[f] = raw[f]
  }
  // Check nested
  if (raw.order && typeof raw.order === 'object') {
    for (const f of ['state', 'orderState', 'cancellationReason', 'cancelledAt', 'cancel_reason', 'cancel_status']) {
      if (raw.order[f] !== undefined && raw.order[f] !== null && raw.order[f] !== '') {
        signals[`order.${f}`] = raw.order[f]
      }
    }
  }
  if (raw.data && typeof raw.data === 'object') {
    for (const f of ['state', 'orderState', 'order_status', 'cancel_reason', 'cancel_status', 'sub_status']) {
      if (raw.data[f] !== undefined && raw.data[f] !== null && raw.data[f] !== '') {
        signals[`data.${f}`] = raw.data[f]
      }
    }
  }
  return signals
}

function formatDate(d) {
  if (!d) return 'N/A'
  return new Date(d).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
}

async function main() {
  console.log('Logging in...')
  const cookies = await login()

  // Fetch cancelled orders (up to 1000)
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000)
  let url = `${BASE}/api/orders?status=cancelled&limit=500`
  if (SOURCE_FILTER) url += `&source=${SOURCE_FILTER}`
  console.log(`Fetching cancelled orders (last ${DAYS} days)...`)
  const r = await fetch(url, { headers: { Cookie: cookies } })
  const data = await r.json()
  const allOrders = (data.orders || data.data || [])
  // Filter by date client-side
  const orders = allOrders.filter(o => {
    const d = new Date(o.updatedAt || o.placedAt || 0)
    return d >= since
  })

  console.log(`\n========== AUDIT CANCELLED ORDERS (last ${DAYS} days) ==========`)
  console.log(`Found ${orders.length} cancelled orders${SOURCE_FILTER ? ' [source: ' + SOURCE_FILTER + ']' : ''}`)
  console.log(`Since: ${formatDate(since)}\n`)

  if (orders.length === 0) {
    console.log('No cancelled orders found.')
    return
  }

  // Group by source + externalStoreId (account)
  const byAccount = {}
  for (const o of orders) {
    const key = `${o.source}|${o.externalStoreId || o.integrationId || 'unknown'}`
    if (!byAccount[key]) byAccount[key] = { source: o.source, storeId: o.externalStoreId, storeName: o.externalStoreName, integrationId: o.integrationId, orders: [] }
    byAccount[key].orders.push(o)
  }

  let ambiguousCount = 0
  let noSignalCount = 0

  for (const [key, acct] of Object.entries(byAccount)) {
    console.log(`\n${'─'.repeat(70)}`)
    console.log(`ACCOUNT: ${acct.source?.toUpperCase()} | Store: ${acct.storeName || acct.storeId || acct.integrationId}`)
    console.log(`  integrationId: ${acct.integrationId}   storeId: ${acct.storeId}`)
    console.log(`  Orders: ${acct.orders.length}`)
    console.log(`${'─'.repeat(70)}`)

    for (const o of acct.orders) {
      const signals = extractCancelSignals(o.rawPayload)
      const hasSignal = Object.keys(signals).length > 0
      const isAmbiguous = !hasSignal || (
        !signals.cancel_reason && !signals.cancelReason && !signals.cancellationReason &&
        !signals.cancel_status && !signals.cancelStatus && !signals.cancel_code &&
        !signals.cancelCode && !signals.cancelBy && !signals.state &&
        !signals.status && !signals.order_status
      )

      if (!hasSignal) noSignalCount++
      if (isAmbiguous) ambiguousCount++

      const flag = !hasSignal ? '[NO SIGNAL]' : isAmbiguous ? '[AMBIGUOUS]' : '[OK]'
      console.log(`\n  ${flag} ${o.shortId || o.externalOrderId}`)
      console.log(`    externalOrderId : ${o.externalOrderId}`)
      console.log(`    placedAt        : ${formatDate(o.placedAt)}`)
      console.log(`    updatedAt       : ${formatDate(o.updatedAt)}`)
      if (hasSignal) {
        console.log(`    Cancel signals  :`)
        for (const [k, v] of Object.entries(signals)) {
          console.log(`      ${k}: ${JSON.stringify(v)}`)
        }
      } else {
        console.log(`    Cancel signals  : (none found in rawPayload)`)
        // Show top-level keys of rawPayload for debugging
        if (o.rawPayload && typeof o.rawPayload === 'object') {
          const keys = Object.keys(o.rawPayload).slice(0, 10)
          console.log(`    rawPayload keys : ${keys.join(', ')}`)
        }
      }
    }
  }

  console.log(`\n${'='.repeat(70)}`)
  console.log(`SUMMARY`)
  console.log(`  Total cancelled (last ${DAYS}d)  : ${orders.length}`)
  console.log(`  Orders with NO cancel signal   : ${noSignalCount}`)
  console.log(`  Orders with AMBIGUOUS signals  : ${ambiguousCount}`)
  console.log(`  Orders with clear signals      : ${orders.length - noSignalCount}`)
  console.log(`  Accounts affected              : ${Object.keys(byAccount).length}`)
  console.log(`${'='.repeat(70)}\n`)

}

main().catch(e => { console.error(e); process.exit(1) })

