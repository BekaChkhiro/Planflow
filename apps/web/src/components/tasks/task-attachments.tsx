'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { env } from '@/env'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Paperclip, Upload, Trash2, FileText, Loader2, ImageIcon } from 'lucide-react'

interface Attachment {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  isImage: boolean
  createdAt: string
  downloadUrl?: string
}

interface TaskAttachmentsProps {
  projectId: string
  /** Human task ID, e.g. "T1.3" */
  taskDisplayId: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function TaskAttachments({ projectId, taskDisplayId }: TaskAttachmentsProps) {
  const token = useAuthStore((s) => s.token)
  const [items, setItems] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const base = env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch(`${base}/projects/${projectId}/tasks/${taskDisplayId}/attachments`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json().catch(() => null)
      if (res.ok) setItems(json?.data?.attachments ?? [])
      else setError(json?.error || 'Failed to load attachments')
    } catch {
      setError('Failed to load attachments')
    } finally {
      setLoading(false)
    }
  }, [base, projectId, taskDisplayId, token])

  useEffect(() => {
    void load()
  }, [load])

  const upload = async (files: FileList | null) => {
    if (!files || !files.length || !token) return
    setUploading(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch(
          `${base}/projects/${projectId}/tasks/${taskDisplayId}/attachments`,
          { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
        )
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          setError(json?.error || 'Upload failed')
          break
        }
      }
      await load()
    } catch {
      setError('Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async (id: string) => {
    if (!token) return
    setItems((prev) => prev.filter((a) => a.id !== id))
    await fetch(`${base}/projects/${projectId}/attachments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {})
  }

  return (
    <section aria-labelledby="task-attachments-heading">
      <div className="mb-3 flex items-center justify-between">
        <h4 id="task-attachments-heading" className="flex items-center gap-1.5 text-sm font-medium">
          <Paperclip className="h-4 w-4" />
          Attachments
          {items.length > 0 && (
            <span className="text-muted-foreground font-normal">({items.length})</span>
          )}
        </h4>
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          <span className="ml-1.5">Add</span>
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void upload(e.target.files)}
        />
      </div>

      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No files yet. Add mockups, screenshots, or reference files — the agent can see images.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-md border p-2 text-sm"
            >
              {a.isImage && a.downloadUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.downloadUrl}
                  alt={a.filename}
                  className="h-12 w-12 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
                  {a.isImage ? (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={a.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate font-medium hover:underline"
                >
                  {a.filename}
                </a>
                <p className="text-xs text-muted-foreground">{formatSize(a.sizeBytes)}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void remove(a.id)}
                aria-label={`Delete ${a.filename}`}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
