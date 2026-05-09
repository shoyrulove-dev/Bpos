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
  const integrations = d?.integrations || []
  for (const integ of integrations) {
    if (integ.provider !== 'grab') continue
    if (integ.loginUsername?.includes('ketoan@takogroup')) {
      console.log('Found:', integ._id, integ.loginUsername)
      console.log('Status:', integ.sessionStatus)
      console.log('Error:', integ.sessionError)
      console.log('ExpiresAt:', integ.sessionExpiresAt)
    }
  }
}
run().catch(e => console.error(e.message))
