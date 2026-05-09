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

  const r = await fetch('https://bposbin.vercel.app/api/integrations?provider=grab', { headers: { Cookie: allCookies } })
  const d = await r.json()
  // API returns array directly
  const integrations = Array.isArray(d) ? d : (d?.integrations || [])
  const targets = ['ooo.tech.ds33', '1ketoan@takogroup.com.vn', 'dmx.nexdor.bdt']
  console.log(`Total Grab integrations: ${integrations.length}`)
  console.log('---')
  for (const integ of integrations) {
    if (!targets.some(t => integ.loginUsername === t)) continue
    console.log(`Account: ${integ.loginUsername}`)
    console.log(`  _id:        ${integ._id}`)
    console.log(`  status:     ${integ.sessionStatus}`)
    console.log(`  expiresAt:  ${integ.sessionExpiresAt}`)
    console.log(`  error:      ${integ.sessionError || 'none'}`)
    console.log()
  }
}
run().catch(e => console.error(e.message))
