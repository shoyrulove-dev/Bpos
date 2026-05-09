async function run() {
  const csrfR = await fetch('https://bposbin.vercel.app/api/auth/csrf')
  const csrfCookies = (csrfR.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ')
  const { csrfToken } = await csrfR.json()
  console.log('CSRF token:', csrfToken?.slice(0,20), '| Cookie:', csrfCookies?.slice(0,60))

  const loginR = await fetch('https://bposbin.vercel.app/api/auth/callback/credentials', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': csrfCookies },
    body: new URLSearchParams({ csrfToken, email: 'admin@bpos.vn', password: '123456', redirect: 'false', callbackUrl: 'https://bposbin.vercel.app', json: 'true' }).toString(),
  })
  console.log('Login status:', loginR.status, loginR.statusText)
  const loginCookies = (loginR.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ')
  console.log('Login cookies:', loginCookies.slice(0,100))
  const allCookies = [csrfCookies, loginCookies].filter(Boolean).join('; ')

  // Test auth
  const meR = await fetch('https://bposbin.vercel.app/api/auth/session', {
    headers: { Cookie: allCookies }
  })
  const meD = await meR.json()
  console.log('Session:', JSON.stringify(meD).slice(0,200))

  // Get one integration raw
  const r = await fetch('https://bposbin.vercel.app/api/integrations/69fba900ea2efd407b2e93c6', {
    headers: { Cookie: allCookies }
  })
  console.log('Integration status:', r.status)
  const raw = await r.text()
  console.log('Integration raw:', raw.slice(0,400))
}
run().catch(e => console.error(e.message))
