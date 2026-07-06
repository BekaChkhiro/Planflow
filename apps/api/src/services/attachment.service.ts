import { and, eq } from 'drizzle-orm'
import { getDbClient, schema } from '../db/index.js'
import { putObject, deleteObject, presignDownload, getObjectBytes, isR2Configured } from '../lib/r2.js'

export interface AttachmentMeta {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  isImage: boolean
  createdAt: Date
  downloadUrl?: string
}

function toMeta(row: typeof schema.taskAttachments.$inferSelect, downloadUrl?: string): AttachmentMeta {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    isImage: row.mimeType.startsWith('image/'),
    createdAt: row.createdAt,
    downloadUrl,
  }
}

export async function createAttachment(params: {
  projectId: string
  taskId: string
  filename: string
  mimeType: string
  bytes: Buffer
  userId?: string
}): Promise<AttachmentMeta> {
  if (!isR2Configured) throw new Error('File storage (R2) is not configured on the server.')
  const db = getDbClient()
  const id = crypto.randomUUID()
  const key = `attachments/${params.projectId}/${params.taskId}/${id}-${params.filename}`
  await putObject(key, params.bytes, params.mimeType)
  const [row] = await db
    .insert(schema.taskAttachments)
    .values({
      id,
      projectId: params.projectId,
      taskId: params.taskId,
      filename: params.filename,
      mimeType: params.mimeType,
      sizeBytes: params.bytes.length,
      storageKey: key,
      createdBy: params.userId ?? null,
    })
    .returning()
  return toMeta(row!)
}

export async function listAttachments(
  projectId: string,
  taskId: string,
  withUrls = true
): Promise<AttachmentMeta[]> {
  const rows = await getDbClient()
    .select()
    .from(schema.taskAttachments)
    .where(and(eq(schema.taskAttachments.projectId, projectId), eq(schema.taskAttachments.taskId, taskId)))
  const out: AttachmentMeta[] = []
  for (const row of rows) {
    let url: string | undefined
    if (withUrls && isR2Configured) {
      url = await presignDownload(row.storageKey).catch(() => undefined)
    }
    out.push(toMeta(row, url))
  }
  return out
}

export async function getAttachmentRow(id: string) {
  const [row] = await getDbClient()
    .select()
    .from(schema.taskAttachments)
    .where(eq(schema.taskAttachments.id, id))
    .limit(1)
  return row ?? null
}

export async function downloadUrl(id: string): Promise<string | null> {
  const row = await getAttachmentRow(id)
  if (!row || !isR2Configured) return null
  return presignDownload(row.storageKey)
}

export async function deleteAttachment(id: string): Promise<void> {
  const row = await getAttachmentRow(id)
  if (!row) return
  if (isR2Configured) await deleteObject(row.storageKey).catch(() => {})
  await getDbClient().delete(schema.taskAttachments).where(eq(schema.taskAttachments.id, id))
}

/** Fetches an attachment's raw bytes (used by the MCP to return image blocks). */
export async function attachmentBytes(id: string): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const row = await getAttachmentRow(id)
  if (!row || !isR2Configured) return null
  const bytes = await getObjectBytes(row.storageKey).catch(() => null)
  if (!bytes) return null
  return { bytes, mimeType: row.mimeType }
}
