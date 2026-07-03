import crypto from 'node:crypto'

/**
 * AES-256-GCM encryption for secrets at rest (e.g. the routine token stored with
 * a pipeline). The key is derived from JWT_SECRET so no extra config is needed.
 */
const key = crypto
  .createHash('sha256')
  .update(process.env['JWT_SECRET'] || 'planflow-dev-secret-change-me')
  .digest() // 32 bytes

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decryptSecret(payload: string): string {
  const data = Buffer.from(payload, 'base64')
  const iv = data.subarray(0, 12)
  const tag = data.subarray(12, 28)
  const enc = data.subarray(28)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
