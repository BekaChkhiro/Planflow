'use client'

import { useState } from 'react'
import { FileText, RefreshCw, Cloud, CloudOff, CheckCircle2, Clock, Terminal, Copy, Check } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { MarkdownViewer } from '@/components/markdown-viewer'
import { usePullPlan, getSyncStatus } from '@/hooks/use-sync'
import { cn } from '@/lib/utils'

interface PlanTabProps {
  plan: string | null | undefined
  projectId: string
  projectName: string
  updatedAt: string | null
}

export function PlanTab({ plan, projectId, projectName, updatedAt }: PlanTabProps) {
  const pullPlan = usePullPlan()
  const syncStatus = getSyncStatus(updatedAt)
  const [copied, setCopied] = useState(false)

  const handleRefresh = () => {
    pullPlan.mutate(projectId)
  }

  const handleCopyCommand = async () => {
    const command = `/pfSyncPush`
    await navigator.clipboard.writeText(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!plan) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="rounded-full bg-muted p-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-foreground">No plan content</h3>
          <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
            This project doesn&apos;t have a plan yet. Sync your PROJECT_PLAN.md from the terminal.
          </p>

          {/* Terminal Sync Instructions */}
          <div className="mt-6 w-full max-w-md">
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Terminal className="h-4 w-4" />
                Sync from Terminal
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Use Claude Code to sync your local PROJECT_PLAN.md:
              </p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-background px-3 py-2 text-xs font-mono">
                    /pfCloudLink {projectName.toLowerCase().replace(/\s+/g, '-')}
                  </code>
                  <span className="text-xs text-muted-foreground">Link project</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-background px-3 py-2 text-xs font-mono">
                    /pfSyncPush
                  </code>
                  <span className="text-xs text-muted-foreground">Push to cloud</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">Project Plan</CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <span>Synced from PROJECT_PLAN.md</span>
              <SyncStatusBadge status={syncStatus} />
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* Copy sync command */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyCommand}
                    className="gap-2"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Terminal className="h-4 w-4" />
                        CLI
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Copy /pfSyncPush command</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Refresh button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={pullPlan.isPending}
                    className="gap-2"
                  >
                    <RefreshCw className={cn("h-4 w-4", pullPlan.isPending && "animate-spin")} />
                    Refresh
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Refresh plan from cloud</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <MarkdownViewer content={plan} />
      </CardContent>
    </Card>
  )
}

// Sync status badge component
function SyncStatusBadge({ status }: { status: ReturnType<typeof getSyncStatus> }) {
  if (!status.lastSyncedAt) {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <CloudOff className="h-3 w-3" />
        Not synced
      </Badge>
    )
  }

  if (status.isStale) {
    return (
      <Badge variant="secondary" className="gap-1 text-xs">
        <Clock className="h-3 w-3" />
        {status.syncAge}
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="gap-1 text-xs text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
      <CheckCircle2 className="h-3 w-3" />
      {status.syncAge}
    </Badge>
  )
}

// Loading skeleton for code splitting
export function PlanTabSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-4 w-48 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="h-4 animate-pulse rounded bg-muted"
              style={{ width: `${Math.random() * 40 + 60}%` }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
