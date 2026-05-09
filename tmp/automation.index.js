'use strict'
require('dotenv').config()
const express = require('express')
const { loginWithProvider } = require('./platforms')

const app  = express()
app.use(express.json({ limit: '2mb' }))

const AUTH_TOKEN = process.env.AUTH_TOKEN || ''
const PORT       = parseInt(process.env.PORT || '3001', 10)
const SMS_OTP_PROVIDERS = new Set(['shopee', 'xanh_sm'])

app.use((req, _res, next) => {
  console.log('[' + new Date().toISOString() + '] ' + req.method + ' ' + req.path)
  next()
})

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'bpos-automation', ts: new Date().toISOString() })
})

app.use((req, res, next) => {
  if (!AUTH_TOKEN) return next()
  const raw  = req.headers.authorization || String(req.query.token || '')
  const auth = raw.startsWith('Bearer ') ? raw.slice(7) : raw
  if (auth !== AUTH_TOKEN) return res.status(401).json({ error: 'Unauthorized' })
  next()
})

app.post('/api/login', async (req, res) => {
  const {
    provider,
    username,
    password,
    otp,
    sessionKey,
    preferredStoreId,
    preferredStoreName,
    includeOrders,
  } = req.body || {}
  if (!provider || !username) {
    return res.status(400).json({ error: 'Missing required: provider, username' })
  }
  if (!sessionKey && !password && !SMS_OTP_PROVIDERS.has(provider)) {
    return res.status(400).json({ error: 'Missing password (required on first call)' })
  }
  try {
    const result = await loginWithProvider(provider, {
      username,
      password,
      otp,
      sessionKey,
      preferredStoreId,
      preferredStoreName,
      includeOrders,
    })
    res.json(result)
  } catch (err) {
    console.error('[auto-login error]', err)
    res.status(500).json({ success: false, error: err.message || 'Internal error' })
  }
})

app.listen(PORT, '0.0.0.0', () => {
  console.log('[bpos-automation] Running on port ' + PORT)
})