// probe-gf265-dmx.js
// Tìm order GF-265 (DMX account, Grab) trong DB via live API
// Usage: node tmp/probe-gf265-dmx.js

const BASE = 'https://bposbin.vercel.app'

function formatDate(d) {
  if (!d) return 'N/A'
  return new Date(d).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
}

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

async function main() {
  console.log('Logging in...')
  const cookies = await login()

  // 1. Fetch all Grab integrations
  console.log('\n=== Grab Integrations ===')
  const intR = await fetch(`${BASE}/api/integrations`, { headers: { Cookie: cookies } })
  const intData = await intR.json()
  const integrations = (intData.integrations || intData.data || intData || [])
  const grabInts = Array.isArray(integrations) ? integrations.filter(i => i.provider === 'grab') : []
  for (const g of grabInts) {
    console.log(`  ${g._id} | ${g.loginUsername || g.username || ''} | ${g.externalStoreName || g.name || ''} | storeId: ${g.externalStoreId || ''} | active: ${g.isActive}`)
  }
  const dmx = grabInts.find(g => (g.loginUsername || g.username || g.externalStoreName || '').toLowerCase().includes('dmx'))
  if (dmx) console.log(`  => DMX found: ${dmx._id} | ${dmx.loginUsername}`)
  else console.log('  => DMX not found by "dmx" keyword in integration list')

  // 2. Search GF-265 by shortId via orders API
  console.log('\n=== Search: GF-265 by shortId ===')
  const oR = await fetch(`${BASE}/api/orders?q=GF-265&limit=20`, { headers: { Cookie: cookies } })
  const oData = await oR.json()
  const allOrders = oData.orders || oData.data || []
  const gf265 = allOrders.find(o => o.shortId === 'GF-265')
  if (gf265) {
    console.log('  FOUND:')
    console.log(`    shortId        : ${gf265.shortId}`)
    console.log(`    externalOrderId: ${gf265.externalOrderId}`)
    console.log(`    orderStatus    : ${gf265.orderStatus}`)
    console.log(`    integrationId  : ${gf265.integrationId}`)
    console.log(`    placedAt       : ${formatDate(gf265.placedAt)}`)
    console.log(`    updatedAt      : ${formatDate(gf265.updatedAt)}`)
  } else {
    console.log(`  NOT FOUND in API response (q=GF-265, got ${allOrders.length} results)`)
    console.log(`  Results returned: ${allOrders.map(o => o.shortId).join(', ') || 'none'}`)
  }

  // 3. Search around 265 range
  console.log('\n=== Orders around GF-263 to GF-267 range ===')
  const rangeR = await fetch(`${BASE}/api/orders?source=grab&limit=500`, { headers: { Cookie: cookies } })
  const rangeData = await rangeR.json()
  const rangeOrders = (rangeData.orders || rangeData.data || [])
  const nearby = rangeOrders.filter(o => ['GF-263','GF-264','GF-265','GF-266','GF-267'].includes(o.shortId))
  if (nearby.length === 0) {
    console.log('  None of GF-263..GF-267 found in first 500 grab orders')
  }
  for (const o of nearby) {
    console.log(`  ${o.shortId} | ${o.externalOrderId} | ${o.orderStatus} | integId: ${o.integrationId} | placed: ${formatDate(o.placedAt)}`)
  }

  // 4. Summary of Grab orders by account
  console.log('\n=== Grab orders by account (count from 500 fetched) ===')
  const byAccount = {}
  for (const o of rangeOrders) {
    const k = o.integrationId || 'unknown'
    if (!byAccount[k]) byAccount[k] = { count: 0, cancelled: 0 }
    byAccount[k].count++
    if (o.orderStatus === 'cancelled') byAccount[k].cancelled++
  }
  for (const [iid, s] of Object.entries(byAccount)) {
    const g = grabInts.find(x => x._id === iid)
    const label = g ? (g.loginUsername || g.externalStoreName) : iid
    console.log(`  ${label}: total=${s.count}, cancelled=${s.cancelled}`)
  }

  console.log('\nDone.')
}

main().catch(e => { console.error(e); process.exit(1) })
