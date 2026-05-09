'use strict'

const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')
const { createCipheriv, randomBytes } = require('crypto')

function readEnvFile(filePath) {
  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => !line.trim().startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index), line.slice(index + 1)]
      })
  )
}

function encryptWithKey(plaintext, encryptionKey) {
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'hex'), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

async function main() {
  const env = readEnvFile(path.join(process.cwd(), '.env.local'))
  const shouldApply = process.argv.includes('--apply')
  const targets = [
    {
      loginUsername: 'dmx.nexdor.bdt',
      password: 'Nexdor@123',
      externalStoreId: '5-C2EWWAD3ECCWNX',
    },
    {
      loginUsername: 'ooo.tech.ds33',
      password: 'Nexdor@123',
      externalStoreId: '5-C63FDBAKC7MVRX',
    },
  ]

  await mongoose.connect(env.MONGODB_URI)
  const integrations = mongoose.connection.collection('integrations')

  const current = await integrations.find({
    provider: 'grab',
    loginUsername: { $in: targets.map((target) => target.loginUsername) },
  }).project({
    _id: 1,
    provider: 1,
    loginUsername: 1,
    loginPassword: 1,
    externalStoreId: 1,
    externalStoreName: 1,
    sessionStatus: 1,
    syncStatus: 1,
    updatedAt: 1,
  }).toArray()

  console.log(JSON.stringify({ shouldApply, current }, null, 2))

  if (!shouldApply) {
    await mongoose.disconnect()
    return
  }

  const now = new Date()
  for (const target of targets) {
    await integrations.updateOne(
      { provider: 'grab', loginUsername: target.loginUsername },
      {
        $set: {
          loginPassword: encryptWithKey(target.password, env.ENCRYPTION_KEY),
          externalStoreId: target.externalStoreId,
          sessionStatus: 'expired',
          updatedAt: now,
        },
        $unset: {
          sessionData: 1,
          sessionCapturedAt: 1,
          sessionExpiresAt: 1,
          sessionError: 1,
          syncError: 1,
        },
      }
    )
  }

  const updated = await integrations.find({
    provider: 'grab',
    loginUsername: { $in: targets.map((target) => target.loginUsername) },
  }).project({
    _id: 1,
    loginUsername: 1,
    externalStoreId: 1,
    sessionStatus: 1,
    updatedAt: 1,
  }).toArray()

  console.log(JSON.stringify({ updated }, null, 2))
  await mongoose.disconnect()
}

main().catch(async (error) => {
  console.error(error)
  try {
    await mongoose.disconnect()
  } catch (_err) {
  }
  process.exit(1)
})