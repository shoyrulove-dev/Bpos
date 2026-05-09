// check-all-integrations.js - Kiểm tra toàn bộ Grab + BE integrations
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

  const r = await fetch('https://bposbin.vercel.app/api/integrations', { headers: { Cookie: allCookies } })
  const integrations = await r.json()
  const list = Array.isArray(integrations) ? integrations : (integrations?.integrations || [])

  const grabBe = list.filter(i => i.provider === 'grab' || i.provider === 'be')
  console.log(`\nProvider | Account | LoginMode | SessionStatus | SyncStatus | SyncError | SessionExpires`)
  console.log('─'.repeat(120))
  for (const i of grabBe.sort((a,b) => a.provider.localeCompare(b.provider) || a.loginUsername.localeCompare(b.loginUsername))) {
    const exp = i.sessionExpiresAt ? new Date(i.sessionExpiresAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'N/A'
    const syncErr = (i.syncError || '').slice(0, 60)
    const sessErr = (i.sessionError || '').slice(0, 40)
    console.log(`${i.provider.padEnd(6)} | ${(i.loginUsername||'').padEnd(35)} | ${(i.loginMode||'').padEnd(9)} | ${(i.sessionStatus||'').padEnd(12)} | ${(i.syncStatus||'').padEnd(10)} | ${syncErr.padEnd(62)} | ${exp}`)
    if (sessErr) console.log(`       | ${''.padEnd(35)} | SessionErr: ${sessErr}`)
  }
  console.log()
}
run().catch(e => console.error(e.message))
