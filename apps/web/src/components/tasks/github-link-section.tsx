'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Github,
  Link2,
  Unlink,
  Plus,
  ExternalLink,
  Search,
  RefreshCw,
  CheckCircle2,
  Circle,
  AlertCircle,
} from 'lucide-react'
import {
  useTaskGitHubLink,
  useGitHubRepos,
  useGitHubIssues,
  useLinkTaskToGitHub,
  useUnlinkTaskFromGitHub,
  useCreateGitHubIssueFromTask,
  useSyncTaskGitHubIssue,
  useGitHubIntegration,
} from '@/hooks/use-github'
import { toast } from '@/hooks/use-toast'
import { BranchNameSection } from './branch-name-section'

interface GitHubLinkSectionProps {
  projectId: string
  taskId: string // UUID
  taskDisplayId: string // e.g., "T1.1"
  taskName: string
}

export function GitHubLinkSection({
  projectId,
  taskId,
  taskDisplayId,
  taskName,
}: GitHubLinkSectionProps) {
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [mode, setMode] = useState<'link' | 'create'>('link')

  // Check if GitHub is connected
  const { data: githubIntegration, isLoading: isLoadingIntegration } = useGitHubIntegration()

  // Get current link status
  const { data: linkData, isLoading: isLoadingLink } = useTaskGitHubLink(
    projectId,
    taskDisplayId,
    githubIntegration?.connected
  )

  // Get user's repos for selection
  const { data: reposData, isLoading: isLoadingRepos } = useGitHubRepos(
    1,
    100,
    isLinkDialogOpen && githubIntegration?.connected
  )

  // Get issues for selected repo
  const [owner = '', repo = ''] = selectedRepo ? selectedRepo.split('/') : []
  const { data: issuesData, isLoading: isLoadingIssues } = useGitHubIssues(owner, repo, {
    state: 'open',
    search: searchQuery || undefined,
    enabled: !!selectedRepo,
  })

  // Mutations
  const linkMutation = useLinkTaskToGitHub()
  const unlinkMutation = useUnlinkTaskFromGitHub()
  const createIssueMutation = useCreateGitHubIssueFromTask()
  const syncMutation = useSyncTaskGitHubIssue()

  const isLinked = linkData?.linked
  const githubLink = linkData?.githubLink

  const handleLinkIssue = async (issueNumber: number) => {
    if (!selectedRepo) return

    try {
      await linkMutation.mutateAsync({
        projectId,
        taskId: taskDisplayId,
        issueNumber,
        repository: selectedRepo,
      })
      toast({ title: 'Success', description: 'Task linked to GitHub issue' })
      setIsLinkDialogOpen(false)
      setSelectedRepo('')
      setSearchQuery('')
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to link task to GitHub issue', variant: 'destructive' })
    }
  }

  const handleCreateAndLink = async () => {
    if (!selectedRepo) return

    try {
      await createIssueMutation.mutateAsync({
        projectId,
        taskId: taskDisplayId,
        repository: selectedRepo,
      })
      toast({ title: 'Success', description: 'GitHub issue created and linked' })
      setIsLinkDialogOpen(false)
      setSelectedRepo('')
      setMode('link')
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to create GitHub issue', variant: 'destructive' })
    }
  }

  const handleUnlink = async () => {
    try {
      await unlinkMutation.mutateAsync({
        projectId,
        taskId: taskDisplayId,
      })
      toast({ title: 'Success', description: 'Task unlinked from GitHub issue' })
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to unlink task', variant: 'destructive' })
    }
  }

  const handleSync = async () => {
    try {
      await syncMutation.mutateAsync({
        projectId,
        taskId: taskDisplayId,
      })
      toast({ title: 'Success', description: 'GitHub issue synced' })
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to sync GitHub issue', variant: 'destructive' })
    }
  }

  // Loading state
  if (isLoadingIntegration || isLoadingLink) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Github className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">GitHub</span>
        </div>
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  // Not connected to GitHub
  if (!githubIntegration?.connected) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Github className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">GitHub</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span>Connect GitHub in Settings to link issues</span>
        </div>
      </div>
    )
  }

  // Linked state
  if (isLinked && githubLink) {
    return (
      <div className="space-y-4">
        {/* GitHub Issue Link */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Github className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">GitHub Issue</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleSync}
                disabled={syncMutation.isPending}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={handleUnlink}
                disabled={unlinkMutation.isPending}
              >
                <Unlink className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <a
            href={githubLink.issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
              <Github className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{githubLink.issueTitle}</span>
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-muted-foreground font-mono">
                  {githubLink.repository}#{githubLink.issueNumber}
                </span>
                <Badge
                  variant="outline"
                  className={
                    githubLink.issueState === 'open'
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-purple-50 text-purple-700 border-purple-200'
                  }
                >
                  {githubLink.issueState === 'open' ? (
                    <Circle className="mr-1 h-2 w-2 fill-current" />
                  ) : (
                    <CheckCircle2 className="mr-1 h-2 w-2" />
                  )}
                  {githubLink.issueState}
                </Badge>
              </div>
            </div>
          </a>
        </div>

        {/* Branch Name Section (T8.6) */}
        <BranchNameSection
          projectId={projectId}
          taskId={taskId}
          taskDisplayId={taskDisplayId}
          taskName={taskName}
        />
      </div>
    )
  }

  // Not linked state
  return (
    <div className="space-y-4">
      {/* GitHub Issue Link */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Github className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">GitHub</span>
        </div>

        <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full">
            <Link2 className="mr-2 h-4 w-4" />
            Link to GitHub Issue
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link to GitHub Issue</DialogTitle>
            <DialogDescription>
              Link <span className="font-mono">{taskDisplayId}</span> to a GitHub issue or create a
              new one.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Mode Toggle */}
            <div className="flex gap-2">
              <Button
                variant={mode === 'link' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('link')}
                className="flex-1"
              >
                <Link2 className="mr-2 h-4 w-4" />
                Link Existing
              </Button>
              <Button
                variant={mode === 'create' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode('create')}
                className="flex-1"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create New
              </Button>
            </div>

            {/* Repository Selector */}
            <div className="space-y-2">
              <Label>Repository</Label>
              <Select value={selectedRepo} onValueChange={setSelectedRepo}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a repository" />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingRepos ? (
                    <div className="p-2 text-sm text-muted-foreground">Loading...</div>
                  ) : reposData?.repositories.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">No repositories found</div>
                  ) : (
                    reposData?.repositories.map((repo) => (
                      <SelectItem key={repo.id} value={repo.fullName}>
                        <div className="flex items-center gap-2">
                          <Github className="h-4 w-4" />
                          <span>{repo.fullName}</span>
                          {repo.private && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0">
                              Private
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Link Existing Mode */}
            {mode === 'link' && selectedRepo && (
              <>
                {/* Search Input */}
                <div className="space-y-2">
                  <Label>Search Issues</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search issues..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* Issues List */}
                <div className="space-y-2">
                  <Label>Open Issues</Label>
                  <ScrollArea className="h-[200px] rounded-md border">
                    {isLoadingIssues ? (
                      <div className="p-4 space-y-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                      </div>
                    ) : issuesData?.issues.length === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground text-center">
                        No open issues found
                      </div>
                    ) : (
                      <div className="p-2 space-y-1">
                        {issuesData?.issues.map((issue) => (
                          <button
                            key={issue.id}
                            onClick={() => handleLinkIssue(issue.number)}
                            disabled={linkMutation.isPending}
                            className="w-full flex items-start gap-3 rounded-md p-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
                          >
                            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-green-600 fill-green-600" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{issue.title}</div>
                              <div className="text-xs text-muted-foreground">
                                #{issue.number} opened by {issue.user.login}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </>
            )}

            {/* Create New Mode */}
            {mode === 'create' && selectedRepo && (
              <div className="space-y-4">
                <div className="rounded-md border p-3 bg-muted/30">
                  <div className="text-sm font-medium">
                    [{taskDisplayId}] {taskName}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Will be created in {selectedRepo}
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={handleCreateAndLink}
                  disabled={createIssueMutation.isPending}
                >
                  {createIssueMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Issue
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      </div>

      {/* Branch Name Section (T8.6) */}
      <BranchNameSection
        projectId={projectId}
        taskId={taskId}
        taskDisplayId={taskDisplayId}
        taskName={taskName}
      />
    </div>
  )
}
