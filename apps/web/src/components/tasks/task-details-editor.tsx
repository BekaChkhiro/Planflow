'use client'

import { useState } from 'react'
import { env } from '@/env'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { MarkdownViewer } from '@/components/markdown-viewer'
import { Pencil, Loader2 } from 'lucide-react'

interface TaskDetailsEditorProps {
  projectId: string
  /** Human task ID, e.g. "T1.3" */
  taskDisplayId: string
  initialDetails?: string | null
}

/**
 * Full markdown spec for a task. Displays rendered markdown; toggles to a
 * textarea for editing and PATCHes `details` back to the API.
 */
export function TaskDetailsEditor({
  projectId,
  taskDisplayId,
  initialDetails,
}: TaskDetailsEditorProps) {
  const token = useAuthStore((s) => s.token)
  const [details, setDetails] = useState(initialDetails ?? '')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialDetails ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const base = env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')

  const save = async () => {
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`${base}/projects/${projectId}/tasks/${taskDisplayId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ details: draft }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(json?.error || 'Failed to save')
        return
      }
      setDetails(draft)
      setEditing(false)
    } catch {
      setError('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="task-details-heading">
      <div className="mb-2 flex items-center justify-between">
        <h4 id="task-details-heading" className="text-sm font-medium">
          Details
        </h4>
        {!editing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(details)
              setEditing(true)
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="ml-1.5">{details ? 'Edit' : 'Add'}</span>
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={12}
            placeholder="Full spec in markdown — requirements, acceptance criteria, implementation notes. The agent reads this as the task's complete context."
            className="w-full rounded-md border bg-background p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      ) : details ? (
        <MarkdownViewer content={details} className="text-sm" />
      ) : (
        <p className="text-sm text-muted-foreground">
          No detailed spec yet. Add one so the agent has the task&apos;s full context.
        </p>
      )}
    </section>
  )
}
