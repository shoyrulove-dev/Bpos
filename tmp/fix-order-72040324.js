// fix-order-72040324.js - Tìm và fix order 72040324 từ BE sang cancelled
async function run() {
  const csrfR = await fetch('https://bposbin.vercel.app/api/auth/csrf')
  const csrfCookies = (csrfR.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ')
  const { csrfToken } = await csrfR.json()
  const loginR = await fetch('https://bposbin.vercel.app/api/auth/callback/credentials', {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': csrfCookies },
    body: new URLSearchParams({ csrfToken, email: 'admin@bpos.vn', password: '123456', redirect: 'false', callbackUrl: 'https://bposbin.vercel.app', json: 'true' }).toString(),
  })
  const loginCookies = (loginR.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ')
  const allCookies = [csrfCookies, loginCookies].filter(Boolean).join('; ')

  // Search for order 72040324
  console.log('Tìm order 72040324...')
  const r = await fetch('https://bposbin.vercel.app/api/orders?q=72040324&limit=10', { headers: { Cookie: allCookies } })
  const data = await r.json()
  const orders = data.orders || []
  console.log(`Tìm thấy ${orders.length} order(s)`)
  
  for (const o of orders) {
    const extId = o.externalOrderId || ''
    if (extId.includes('72040324') || (o.shortId && o.shortId.includes('72040324'))) {
      console.log(`\nOrder: ${o._id}`)
      console.log(`  shortId: ${o.shortId}`)
      console.log(`  externalOrderId: ${o.externalOrderId}`)
      console.log(`  source: ${o.source}`)
      console.log(`  status: ${o.status}`)
      console.log(`  total: ${o.total}`)
      console.log(`  placedAt: ${new Date(o.placedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`)
      
      if (o.status !== 'cancelled') {
        console.log(`\n  → Đang cập nhật status sang cancelled...`)
        const patchR = await fetch(`https://bposbin.vercel.app/api/orders/${o._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Cookie': allCookies },
          body: JSON.stringify({ status: 'cancelled', cancelledAt: new Date(), cancelReason: 'Hủy bởi Be Food platform' }),
        })
        if (patchR.ok) {
          console.log('  ✅ Đã cập nhật sang cancelled')
        } else {
          const errText = await patchR.text()
          console.log(`  ❌ Lỗi: ${patchR.status} ${errText.slice(0, 200)}`)
        }
      } else {
        console.log('  ✅ Order đã cancelled rồi')
      }
    }
  }
  
  if (!orders.some(o => (o.externalOrderId || '').includes('72040324'))) {
    console.log('\nKhông tìm thấy order có externalOrderId chứa 72040324')
    console.log('Tất cả orders tìm được:')
    orders.forEach(o => console.log(`  ${o._id} | ${o.externalOrderId} | ${o.status}`))
  }
}
run().catch(e => console.error(e.message))
