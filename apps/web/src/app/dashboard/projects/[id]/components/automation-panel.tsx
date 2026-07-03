'use client'

import { useCallback, useEffect, useState } from 'react'
import { Play, Pause, Square, Loader2, Settings2, Rocket, ExternalLink } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

interface PipelineState {
  status: string
  currentTaskId?: string | null
  message?: string | null
}
interface RoutineCfg {
  fireUrl: string
  hasToken: boolean
}

const statusColor: Record<string, string> = {
  running: 'text-blue-500',
  paused: 'text-amber-500',
  completed: 'text-green-500',
  error: 'text-red-500',
}

export function AutomationPanel({ projectId }: { projectId: string }) {
  const token = useAuthStore((s) => s.token)
  const [pipeline, setPipeline] = useState<PipelineState | null>(null)
  const [config, setConfig] = useState<RoutineCfg | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [fireUrl, setFireUrl] = useState('')
  const [tok, setTok] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const opt = token ? { token } : undefined

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      const p = await api.get<{ data: PipelineState | null }>(`/projects/${projectId}/pipeline`, { token })
      setPipeline(p.data)
    } catch {
      /* ignore transient poll errors */
    }
  }, [projectId, token])

  useEffect(() => {
    if (!token) return
    api
      .get<{ data: RoutineCfg | null }>(`/projects/${projectId}/routine-config`, { token })
      .then((r) => setConfig(r.data))
      .catch(() => {})
    refresh()
    const t = setInterval(refresh, 8000)
    return () => clearInterval(t)
  }, [projectId, token, refresh])

  async function saveConfig() {
    setBusy(true)
    setError(null)
    try {
      const r = await api.put<{ data: RoutineCfg }>(
        `/projects/${projectId}/routine-config`,
        { fireUrl, token: tok },
        opt
      )
      setConfig(r.data)
      setShowSetup(false)
      setTok('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  async function start() {
    if (!config) {
      setShowSetup(true)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await api.post<{ data: PipelineState }>(`/projects/${projectId}/pipeline/start`, {}, opt)
      setPipeline(r.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start')
    } finally {
      setBusy(false)
    }
  }

  async function control(action: 'pause' | 'resume') {
    try {
      const r = await api.post<{ data: PipelineState }>(`/projects/${projectId}/pipeline/${action}`, {}, opt)
      setPipeline(r.data)
    } catch {
      /* ignore */
    }
  }

  async function stop() {
    await api.delete(`/projects/${projectId}/pipeline`, opt).catch(() => {})
    setPipeline(null)
  }

  const active = pipeline && (pipeline.status === 'running' || pipeline.status === 'paused')
  const terminal = pipeline && (pipeline.status === 'completed' || pipeline.status === 'error')

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {active && pipeline?.status === 'running' ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Rocket className="h-5 w-5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {active || terminal ? (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span>Pipeline · </span>
                <span className={statusColor[pipeline!.status] ?? ''}>
                  {pipeline!.status.charAt(0).toUpperCase() + pipeline!.status.slice(1)}
                </span>
                {pipeline?.currentTaskId && (
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary">
                    {pipeline.currentTaskId}
                  </span>
                )}
              </div>
              {pipeline?.message && (
                <p className="truncate text-xs text-muted-foreground">{pipeline.message}</p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">Auto-run all tasks in sequence</p>
              <p className="text-xs text-muted-foreground">
                Runs on the PlanFlow server — continues even if you close your browser or laptop.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {active ? (
            <>
              {pipeline?.status === 'running' ? (
                <Button size="sm" variant="outline" onClick={() => control('pause')}>
                  <Pause className="mr-1 h-3.5 w-3.5" /> Pause
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => control('resume')}>
                  <Play className="mr-1 h-3.5 w-3.5" /> Resume
                </Button>
              )}
              <Button size="sm" variant="destructive" onClick={stop}>
                <Square className="mr-1 h-3.5 w-3.5" /> Stop
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => setShowSetup((v) => !v)}>
                <Settings2 className="h-4 w-4" />
              </Button>
              <Button size="sm" onClick={start} disabled={busy}>
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                Start pipeline
              </Button>
            </>
          )}
        </div>
      </div>

      {showSetup && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Routine /fire URL</label>
            <Input
              value={fireUrl}
              onChange={(e) => setFireUrl(e.target.value)}
              placeholder="https://api.anthropic.com/v1/claude_code/routines/trig_…/fire"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Bearer token</label>
            <Input
              type="password"
              value={tok}
              onChange={(e) => setTok(e.target.value)}
              placeholder={config?.hasToken ? '•••••••• (saved — enter to replace)' : 'sk-ant-oat01-…'}
              className="font-mono text-xs"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Create the routine with an API trigger at{' '}
            <a
              href="https://claude.ai/code/routines"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              claude.ai/code/routines <ExternalLink className="h-3 w-3" />
            </a>
            , then paste its /fire URL and token here.
          </p>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowSetup(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={saveConfig}
              disabled={busy || !fireUrl.includes('/fire') || !tok}
            >
              {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      )}
      {!showSetup && error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </Card>
  )
}
