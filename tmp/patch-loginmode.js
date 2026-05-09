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

  // PATCH loginMode: 'api' for 1ketoan@takogroup.com.vn
  const r = await fetch('https://bposbin.vercel.app/api/integrations/69fba901ea2efd407b2e93ca', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Cookie': allCookies },
    body: JSON.stringify({ loginMode: 'api' }),
  })
  console.log('PATCH status:', r.status)
  const d = await r.json().catch(() => null)
  console.log('loginMode now:', d?.loginMode)
  console.log('sessionStatus:', d?.sessionStatus)
}
run().catch(e => console.error(e.message))
