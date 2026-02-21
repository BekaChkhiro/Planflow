'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Skeleton } from '@/components/ui/skeleton'
import {
  GitBranch,
  Copy,
  Check,
  Terminal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import {
  useTaskBranchName,
  generateBranchNameClient,
  detectBranchPrefixClient,
  type BranchPrefix,
} from '@/hooks/use-github'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

interface BranchNameSectionProps {
  projectId: string
  taskId: string // UUID
  taskDisplayId: string // e.g., "T1.1"
  taskName: string
  className?: string
  compact?: boolean
}

const BRANCH_PREFIXES: { value: BranchPrefix; label: string; description: string }[] = [
  { value: 'feature', label: 'feature', description: 'New feature or enhancement' },
  { value: 'fix', label: 'fix', description: 'Bug fix' },
  { value: 'hotfix', label: 'hotfix', description: 'Urgent production fix' },
  { value: 'chore', label: 'chore', description: 'Maintenance or config changes' },
  { value: 'docs', label: 'docs', description: 'Documentation updates' },
  { value: 'refactor', label: 'refactor', description: 'Code restructuring' },
  { value: 'test', label: 'test', description: 'Test additions or fixes' },
]

export function BranchNameSection({
  projectId,
  taskId,
  taskDisplayId,
  taskName,
  className,
  compact = false,
}: BranchNameSectionProps) {
  // Use client-side generation for instant preview
  const detectedPrefix = detectBranchPrefixClient(taskName)
  const [selectedPrefix, setSelectedPrefix] = useState<BranchPrefix>(detectedPrefix)
  const [copiedBranch, setCopiedBranch] = useState(false)
  const [copiedCommand, setCopiedCommand] = useState(false)
  const [isExpanded, setIsExpanded] = useState(!compact)

  // Generate branch name client-side for instant feedback
  const branchName = generateBranchNameClient(taskDisplayId, taskName, selectedPrefix)
  const gitCommand = `git checkout -b ${branchName}`

  // Optionally fetch from API for variants (not strictly necessary for basic use)
  const { data: apiData, isLoading } = useTaskBranchName(projectId, taskDisplayId, {
    enabled: isExpanded && !compact, // Only fetch when expanded
  })

  const copyToClipboard = useCallback(async (text: string, type: 'branch' | 'command') => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'branch') {
        setCopiedBranch(true)
        setTimeout(() => setCopiedBranch(false), 2000)
      } else {
        setCopiedCommand(true)
        setTimeout(() => setCopiedCommand(false), 2000)
      }
      toast({
        title: 'Copied!',
        description: type === 'branch' ? 'Branch name copied to clipboard' : 'Git command copied to clipboard',
      })
    } catch (error) {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy to clipboard',
        variant: 'destructive',
      })
    }
  }, [])

  // Compact mode: just show a button that copies the branch name
  if (compact && !isExpanded) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn('gap-2', className)}
              onClick={() => copyToClipboard(branchName, 'branch')}
            >
              <GitBranch className="h-4 w-4" />
              {copiedBranch ? (
                <>
                  <Check className="h-3 w-3 text-green-500" />
                  Copied!
                </>
              ) : (
                <>Copy Branch Name</>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="font-mono text-xs">{branchName}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Branch Name</span>
          {detectedPrefix !== 'feature' && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              Auto: {detectedPrefix}
            </Badge>
          )}
        </div>
        {compact && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      {/* Branch Name Display */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
        {/* Prefix Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Prefix:</span>
          <Select
            value={selectedPrefix}
            onValueChange={(value) => setSelectedPrefix(value as BranchPrefix)}
          >
            <SelectTrigger className="h-7 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRANCH_PREFIXES.map((prefix) => (
                <SelectItem key={prefix.value} value={prefix.value}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{prefix.label}/</span>
                    {prefix.value === detectedPrefix && (
                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                        suggested
                      </Badge>
                    )}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Branch Name */}
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded bg-background px-2 py-1.5 text-xs font-mono break-all">
            {branchName}
          </code>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => copyToClipboard(branchName, 'branch')}
                >
                  {copiedBranch ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy branch name</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Git Command */}
        <div className="flex items-center gap-2 pt-1 border-t">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <code className="flex-1 text-[11px] font-mono text-muted-foreground truncate">
            {gitCommand}
          </code>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => copyToClipboard(gitCommand, 'command')}
                >
                  {copiedCommand ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy git command</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={() => copyToClipboard(branchName, 'branch')}
        >
          <Copy className="mr-1.5 h-3 w-3" />
          Copy Branch
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-xs"
          onClick={() => copyToClipboard(gitCommand, 'command')}
        >
          <Terminal className="mr-1.5 h-3 w-3" />
          Copy Command
        </Button>
      </div>
    </div>
  )
}

/**
 * Inline branch name display - minimal version for task cards
 */
export function BranchNameInline({
  taskDisplayId,
  taskName,
  className,
}: {
  taskDisplayId: string
  taskName: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const detectedPrefix = detectBranchPrefixClient(taskName)
  const branchName = generateBranchNameClient(taskDisplayId, taskName, detectedPrefix)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(branchName)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Silently fail
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleCopy}
            className={cn(
              'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs',
              'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground',
              'transition-colors cursor-pointer',
              className
            )}
          >
            <GitBranch className="h-3 w-3" />
            <span className="font-mono truncate max-w-[120px]">{branchName}</span>
            {copied && <Check className="h-3 w-3 text-green-500" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">Click to copy branch name</p>
          <p className="font-mono text-[10px] text-muted-foreground mt-1">{branchName}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
