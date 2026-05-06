/**
 * AES-256-GCM encrypt/decrypt utility
 *
 * Env:
 *   ENCRYPTION_KEY  – 64 hex chars (32 bytes), generate with:
 *                     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY ?? ''
  if (hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 64 hex chars (32 bytes). Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Encrypts a UTF-8 string.
 * Output format: `<iv_hex>:<tag_hex>:<ciphertext_hex>`
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * Decrypts a string produced by `encrypt()`.
 */
export function decrypt(data: string): string {
  const parts = data.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted data format')
  const [ivHex, tagHex, encryptedHex] = parts
  const key = getKey()
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

/** Encrypt a JSON-serializable value. */
export function encryptJSON<T>(value: T): string {
  return encrypt(JSON.stringify(value))
}

/** Decrypt and parse a JSON value encrypted with `encryptJSON`. */
export function decryptJSON<T>(data: string): T {
  return JSON.parse(decrypt(data)) as T
}
