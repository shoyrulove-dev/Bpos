'use strict'
/**
 * Shopee Food Merchant Portal – direct API login (no browser needed)
 *
 * Login flow (reverse-engineered from merchant.shopeefood.vn JS bundle – BAmY module):
 * 1. POST https://gsso.deliverynow.vn/api/auth/prelogin  → { result:'success', reply: { salt, verify_code } }
 * 2. Hash password:
 *      sha1Hex = SHA1(password + salt).toHex()
 *      key     = SHA256(sha1Hex + verify_code)   (32-byte buffer)
 *      hash    = AES-256-CBC-PKCS7( password, key, iv=16×0 ).ciphertext.toHex()
 * 3. POST https://gsso.deliverynow.vn/api/auth/secure_login  → { result:'success', reply: { ... tokens ... } }
 *
 * Direct API is ~1-2s vs ~20s for browser automation.
 * Session TTL: unknown, assume 12 hours.
 */
const https = require('https')
const crypto = require('crypto')

const AUTH_ROOT = 'https://gsso.deliverynow.vn'
const SESSION_TTL = 12 * 3600  // 12 hours (conservative)

/**
 * Hash password using the algorithm extracted from merchant.shopeefood.vn BAmY module.
 * CryptoJS equivalent:
 *   key = SHA256( SHA1(password + salt).toString(Hex) + verify_code )
 *   ciphertext = AES.encrypt(password, key, { iv: 0x000...0, mode:CBC, padding:Pkcs7 }).ciphertext.toString(Hex)
 */
function hashPassword(password, salt, verifyCode) {
  // Step 1: SHA1(password + salt) as lowercase hex string
  const sha1Hex = crypto.createHash('sha1').update(password + salt, 'utf8').digest('hex')

  // Step 2: SHA256(sha1Hex + verify_code) as 32-byte key buffer
  const key = crypto.createHash('sha256').update(sha1Hex + verifyCode, 'utf8').digest()

  // Step 3: AES-256-CBC with PKCS7 padding (default in Node), IV = 16 zero bytes
  const iv = Buffer.alloc(16, 0)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
  return encrypted.toString('hex')
}

// Required headers extracted from JS bundle (ZsSw module, t.header() method)
// x-foody-client-type: CLIENT_WEB = 1
// x-foody-app-type: NOW_MERCHANT_APP = 1001
// x-foody-client-version: CLIENT_VERSION.API = "3.0.0"
// x-foody-api-version: 1 (constant)
const FOODY_HEADERS = {
  'x-foody-client-id': '0',
  'x-foody-client-type': '1',
  'x-foody-app-type': '1001',
  'x-foody-client-version': '3.0.0',
  'x-foody-api-version': '1',
  'x-foody-client-language': 'vi',
  'x-foody-access-token': '',
}

/**
 * POST JSON to a URL and return { status, body }.
 */
async function postJSON(url, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const u = new URL(url)
    const options = {
      hostname: u.hostname,
      path: u.pathname + (u.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Origin': 'https://merchant.shopeefood.vn',
        'Referer': 'https://merchant.shopeefood.vn/',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
        ...FOODY_HEADERS,
        ...extraHeaders,
      },
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        const setCookieHeader = res.headers['set-cookie'] ?? []
        try { resolve({ status: res.statusCode, body: JSON.parse(data), setCookieHeader }) }
        catch { resolve({ status: res.statusCode, body: data, setCookieHeader }) }
      })
    })
    req.on('error', reject)
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Request timeout')) })
    req.write(payload)
    req.end()
  })
}

/**
 * Parse Set-Cookie headers into an array of cookie objects.
 */
function parseCookies(setCookieHeaders) {
  return setCookieHeaders.map(header => {
    const parts = header.split(';').map(s => s.trim())
    const [nameVal, ...attrs] = parts
    const eqIdx = nameVal.indexOf('=')
    const name  = nameVal.substring(0, eqIdx).trim()
    const value = nameVal.substring(eqIdx + 1).trim()
    const attrsMap = {}
    attrs.forEach(a => {
      const [k, v] = a.split('=')
      attrsMap[k.trim().toLowerCase()] = v ? v.trim() : true
    })
    return {
      name,
      value,
      domain: attrsMap['domain'] || '.deliverynow.vn',
      path:   attrsMap['path']   || '/',
      httpOnly: !!attrsMap['httponly'],
      secure:   !!attrsMap['secure'],
    }
  })
}

/**
 * Main login function called by the automation service.
 * @param {{ username: string, password: string }} credentials
 * @returns {{ success: boolean, token?: string, cookies?: object[], sessionTtl?: number, raw?: object, error?: string }}
 */
async function loginShopee({ username, password }) {
  try {
    console.log('[shopee] Starting direct API login for account:', username)

    // ── Step 1: Prelogin ──────────────────────────────────────────────────────
    const preloginRes = await postJSON(`${AUTH_ROOT}/api/auth/prelogin`, { account: username })
    console.log('[shopee] Prelogin →', preloginRes.status, JSON.stringify(preloginRes.body).substring(0, 200))

    if (preloginRes.body?.result !== 'success') {
      const msg = preloginRes.body?.reply?.error_message
        ?? preloginRes.body?.result
        ?? `HTTP ${preloginRes.status}`
      return { success: false, error: `Shopee: prelogin failed – ${msg}` }
    }

    const { salt, verify_code } = preloginRes.body.reply ?? {}
    if (!salt || !verify_code) {
      return { success: false, error: 'Shopee: prelogin reply missing salt or verify_code' }
    }

    // ── Step 2: Hash password ─────────────────────────────────────────────────
    const hashedPassword = hashPassword(password, salt, verify_code)
    console.log('[shopee] Password hashed successfully')

    // ── Step 3: Secure login ──────────────────────────────────────────────────
    const loginRes = await postJSON(`${AUTH_ROOT}/api/auth/secure_login`, {
      account: username,
      password: hashedPassword,
    })
    console.log('[shopee] Secure login →', loginRes.status, JSON.stringify(loginRes.body).substring(0, 300))

    if (loginRes.body?.result !== 'success') {
      const msg = loginRes.body?.reply?.error_message
        ?? loginRes.body?.result
        ?? `HTTP ${loginRes.status}`
      return { success: false, error: `Shopee: login failed – ${msg}` }
    }

    const reply = loginRes.body.reply ?? {}
    console.log('[shopee] Login success. Reply keys:', Object.keys(reply).join(', '))

    // Extract token – try common field names
    const token = reply.access_token ?? reply.token ?? reply.session_token
      ?? reply.auth_token ?? reply.jwt ?? ''

    // Collect Set-Cookie header cookies
    const headerCookies = parseCookies(loginRes.setCookieHeader ?? [])

    // Also expose all reply fields as pseudo-cookies for the bpos app to store
    const replyCookies = Object.entries(reply)
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
      .map(([k, v]) => ({
        name:     k,
        value:    String(v),
        domain:   '.deliverynow.vn',
        path:     '/',
        httpOnly: false,
        secure:   true,
      }))

    const allCookies = [...headerCookies, ...replyCookies]

    return {
      success:    true,
      token,
      cookies:    allCookies,
      sessionTtl: SESSION_TTL,
      raw:        reply,
    }
  } catch (err) {
    console.error('[shopee] Unexpected error:', err)
    return { success: false, error: `Shopee: ${err.message}` }
  }
}

module.exports = { loginShopee }
