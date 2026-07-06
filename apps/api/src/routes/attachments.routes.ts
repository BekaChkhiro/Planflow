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
