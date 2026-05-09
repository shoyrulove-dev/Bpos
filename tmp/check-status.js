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

  const accounts = [
    { id: '69fba901ea2efd407b2e93cc', name: 'ooo.tech.ds33' },
    { id: '69fba901ea2efd407b2e93ca', name: '1ketoan@takogroup' },
    { id: '69fba900ea2efd407b2e93c6', name: 'dmx.nexdor.bdt' },
  ]
  for (const { id, name } of accounts) {
    const r = await fetch('https://bposbin.vercel.app/api/integrations/' + id, {
      headers: { Cookie: allCookies }
    })
    const d = await r.json().catch(() => null)
    const integ = d?.integration || d
    console.log(name, '|', integ?.sessionStatus, '| expires:', integ?.sessionExpiresAt?.slice(0, 19) ?? 'N/A', '| cookies:', integ?.sessionData ? '(encrypted)' : 'none')
  }
}
run().catch(e => console.error(e.message))
