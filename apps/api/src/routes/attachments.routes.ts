import { Hono } from 'hono'
import { auth, getAuth } from '../middleware/auth.js'
import {
  createAttachment,
  listAttachments,
  downloadUrl,
  deleteAttachment,
} from '../services/attachment.service.js'
import { isR2Configured } from '../lib/r2.js'

export const attachmentsRoutes = new Hono()

const MAX_BYTES = 25 * 1024 * 1024 // 25 MB

/** Blocks localhost / private / link-local hosts to avoid SSRF on URL fetches. */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h === '::1' || h === '0.0.0.0') return true
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true // IPv6 ULA / link-local
  return false
}

// Upload a file/image to a task.
attachmentsRoutes.post('/:id/tasks/:taskId/attachments', auth, async (c) => {
  if (!isR2Configured) {
    return c.json({ success: false, error: 'File storage is not configured on the server.' }, 503)
  }
  const projectId = c.req.param('id')
  const taskId = c.req.param('taskId')
  const userId = getAuth(c).user.id

  let file: File | undefined
  try {
    const body = await c.req.parseBody()
    const f = body['file']
    if (f instanceof File) file = f
  } catch {
    /* fall through */
  }
  if (!file) return c.json({ success: false, error: 'No file provided (field "file").' }, 400)

  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.length > MAX_BYTES) {
    return c.json({ success: false, error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB).` }, 413)
  }

  try {
    const meta = await createAttachment({
      projectId,
      taskId,
      filename: file.name || 'file',
      mimeType: file.type || 'application/octet-stream',
      bytes,
      userId,
    })
    return c.json({ success: true, data: meta })
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Upload failed' }, 500)
  }
})

// Programmatic upload from a URL or base64 (used by the MCP). JSON body:
//   { url } — the server fetches the bytes, or
//   { dataBase64, filename, mimeType } — inline bytes.
attachmentsRoutes.post('/:id/tasks/:taskId/attachments/remote', auth, async (c) => {
  if (!isR2Configured) {
    return c.json({ success: false, error: 'File storage is not configured on the server.' }, 503)
  }
  const projectId = c.req.param('id')
  const taskId = c.req.param('taskId')
  const userId = getAuth(c).user.id

  const body = await c.req.json<{
    url?: string
    dataBase64?: string
    filename?: string
    mimeType?: string
  }>().catch(() => ({}) as Record<string, string>)

  let bytes: Buffer
  let filename = body.filename
  let mimeType = body.mimeType

  try {
    if (body.url) {
      const url = new URL(body.url)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return c.json({ success: false, error: 'Only http(s) URLs are allowed.' }, 400)
      }
      if (isBlockedHost(url.hostname)) {
        return c.json({ success: false, error: 'That host is not allowed.' }, 400)
      }
      const resp = await fetch(url.toString())
      if (!resp.ok) {
        return c.json({ success: false, error: `Fetch failed: HTTP ${resp.status}` }, 400)
      }
      bytes = Buffer.from(await resp.arrayBuffer())
      mimeType = mimeType || resp.headers.get('content-type')?.split(';')[0] || 'application/octet-stream'
      filename = filename || decodeURIComponent(url.pathname.split('/').pop() || '') || 'file'
    } else if (body.dataBase64) {
      bytes = Buffer.from(body.dataBase64.replace(/^data:[^;]+;base64,/, ''), 'base64')
      filename = filename || 'file'
      mimeType = mimeType || 'application/octet-stream'
    } else {
      return c.json({ success: false, error: 'Provide either "url" or "dataBase64".' }, 400)
    }
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Invalid source' }, 400)
  }

  if (bytes.length === 0) return c.json({ success: false, error: 'Empty file.' }, 400)
  if (bytes.length > MAX_BYTES) {
    return c.json({ success: false, error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB).` }, 413)
  }

  try {
    const meta = await createAttachment({ projectId, taskId, filename, mimeType, bytes, userId })
    return c.json({ success: true, data: meta })
  } catch (e) {
    return c.json({ success: false, error: e instanceof Error ? e.message : 'Upload failed' }, 500)
  }
})

// List a task's attachments (with short-lived download URLs).
attachmentsRoutes.get('/:id/tasks/:taskId/attachments', auth, async (c) => {
  const items = await listAttachments(c.req.param('id'), c.req.param('taskId'))
  return c.json({ success: true, data: { attachments: items } })
})

// Redirect to a presigned download URL for an attachment.
attachmentsRoutes.get('/:id/attachments/:attId/download', auth, async (c) => {
  const url = await downloadUrl(c.req.param('attId'))
  if (!url) return c.json({ success: false, error: 'Not found' }, 404)
  return c.redirect(url)
})

attachmentsRoutes.delete('/:id/attachments/:attId', auth, async (c) => {
  await deleteAttachment(c.req.param('attId'))
  return c.json({ success: true })
})
