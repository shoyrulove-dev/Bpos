async function run() {
  const csrfR = await fetch('https://bposbin.vercel.app/api/auth/csrf')
  const csrfCookies = (csrfR.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ')
  const { csrfToken } = await csrfR.json()

  const loginR = await fetch('https://bposbin.vercel.app/api/auth/callback/credentials', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': csrfCookies },
    body: new URLSearchParams({ csrfToken, email: 'admin@bpos.vn', password: '123456', redirect: 'false', callbackUrl: 'https://bposbin.vercel.app', json: 'true' }).toString(),
  })
  const loginCookies = (loginR.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ')
  const allCookies = [csrfCookies, loginCookies].filter(Boolean).join('; ')

  // Get all integrations
  const r = await fetch('https://bposbin.vercel.app/api/integrations?provider=grab', {
    headers: { Cookie: allCookies }
  })
  const d = await r.json()
  const integrations = d?.integrations || d || []
  const targetIds = ['69fba901ea2efd407b2e93cc', '69fba901ea2efd407b2e93ca', '69fba900ea2efd407b2e93c6']
  for (const integ of integrations) {
    if (targetIds.includes(String(integ._id))) {
      console.log(integ.username || integ.name, '|', integ.sessionStatus, '| expires:', integ.sessionExpiresAt?.slice(0,19) ?? 'N/A')
    }
  }
}
run().catch(e => console.error(e.message))
