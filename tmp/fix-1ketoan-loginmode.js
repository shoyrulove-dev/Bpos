// fix-1ketoan-loginmode.js - Set loginMode về 'auto' để sync dùng session cookies
async function run() {
  // Login
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

  // 1ketoan@takogroup.com.vn Grab ID: 69fba901ea2efd407b2e93ca
  const id = '69fba901ea2efd407b2e93ca'
  
  console.log('Đang set loginMode: auto cho 1ketoan@takogroup.com.vn Grab...')
  const r = await fetch(`https://bposbin.vercel.app/api/integrations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Cookie': allCookies },
    body: JSON.stringify({ loginMode: 'auto' }),
  })
  const res = await r.json()
  if (res.loginMode === 'auto') {
    console.log('✅ loginMode đã set về auto')
  } else {
    console.log('❌ Lỗi:', JSON.stringify(res))
    return
  }

  // Kiểm tra lại status
  await new Promise(r => setTimeout(r, 2000))
  const checkR = await fetch('https://bposbin.vercel.app/api/integrations', { headers: { Cookie: allCookies } })
  const list = await checkR.json()
  const intg = (Array.isArray(list) ? list : list?.integrations || []).find(i => i._id === id)
  if (intg) {
    console.log(`\nStatus của 1ketoan Grab:`)
    console.log(`  loginMode: ${intg.loginMode}`)
    console.log(`  sessionStatus: ${intg.sessionStatus}`)
    console.log(`  syncStatus: ${intg.syncStatus}`)
    console.log(`  syncError: ${intg.syncError || '(none)'}`)
    console.log(`  sessionExpiresAt: ${intg.sessionExpiresAt ? new Date(intg.sessionExpiresAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'N/A'}`)
  }
}
run().catch(e => console.error(e.message))
