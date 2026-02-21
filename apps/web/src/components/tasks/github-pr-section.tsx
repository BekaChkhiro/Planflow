'use client'

import { useState, useMemo } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import {
  GitPullRequest,
  Link2,
  Unlink,
  ExternalLink,
  Search,
  RefreshCw,
  GitMerge,
  AlertCircle,
  GitBranch,
  CircleDot,
  XCircle,
  Plus,
  Loader2,
} from 'lucide-react'
import {
  useTaskGitHubPrLink,
  useGitHubRepos,
  useGitHubPullRequests,
  useLinkTaskToGitHubPr,
  useUnlinkTaskFromGitHubPr,
  useSyncTaskGitHubPr,
  useGitHubIntegration,
  useCreateGitHubPrFromTask,
  getPrStateLabel,
  getPrStateColor,
  generateBranchNameClient,
  detectBranchPrefixClient,
  type GitHubPrState,
  type BranchPrefix,
} from '@/hooks/use-github'
import { toast } from '@/hooks/use-toast'

interface GitHubPrSectionProps {
  projectId: string
  taskId: string // UUID
  taskDisplayId: string // e.g., "T1.1"
  taskName: string
  taskDescription?: string
}

export function GitHubPrSection({
  projectId,
  taskId,
  taskDisplayId,
  taskName,
  taskDescription,
}: GitHubPrSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'link' | 'create'>('link')

  // Link mode state
  const [selectedRepo, setSelectedRepo] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [prState, setPrState] = useState<'open' | 'closed' | 'all'>('open')

  // Create mode state
  const [createRepo, setCreateRepo] = useState<string>('')
  const [createTitle, setCreateTitle] = useState('')
  const [createBody, setCreateBody] = useState('')
  const [createBranch, setCreateBranch] = useState('')
  const [createBaseBranch, setCreateBaseBranch] = useState('')
  const [createDraft, setCreateDraft] = useState(false)
  const [branchPrefix, setBranchPrefix] = useState<BranchPrefix>('feature')

  // Check if GitHub is connected
  const { data: githubIntegration, isLoading: isLoadingIntegration } = useGitHubIntegration()

  // Get current PR link status
  const { data: linkData, isLoading: isLoadingLink } = useTaskGitHubPrLink(
    projectId,
    taskDisplayId,
    githubIntegration?.connected
  )

  // Get user's repos for selection
  const { data: reposData, isLoading: isLoadingRepos } = useGitHubRepos(
    1,
    100,
    isDialogOpen && githubIntegration?.connected
  )

  // Get PRs for selected repo (link mode)
  const [owner = '', repo = ''] = selectedRepo ? selectedRepo.split('/') : []
  const { data: prsData, isLoading: isLoadingPrs } = useGitHubPullRequests(owner, repo, {
    state: prState,
    search: searchQuery || undefined,
    enabled: !!selectedRepo && dialogMode === 'link',
  })

  // Mutations
  const linkMutation = useLinkTaskToGitHubPr()
  const unlinkMutation = useUnlinkTaskFromGitHubPr()
  const syncMutation = useSyncTaskGitHubPr()
  const createMutation = useCreateGitHubPrFromTask()

  const isLinked = linkData?.linked
  const githubPr = linkData?.githubPr

  // Auto-detect branch prefix when task name changes
  const detectedPrefix = useMemo(() => detectBranchPrefixClient(taskName), [taskName])

  // Generate branch name preview
  const branchNamePreview = useMemo(() => {
    return generateBranchNameClient(taskDisplayId, taskName, branchPrefix)
  }, [taskDisplayId, taskName, branchPrefix])

  // Get default branch for selected repo
  const selectedRepoData = reposData?.repositories.find(r => r.fullName === createRepo)
  const defaultBranch = selectedRepoData?.defaultBranch || 'main'

  // Reset create form when dialog opens
  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open)
    if (open) {
      setDialogMode('link')
      setSelectedRepo('')
      setSearchQuery('')
      setCreateRepo('')
      setBranchPrefix(detectedPrefix)
      setCreateTitle(`[${taskDisplayId}] ${taskName}`)
      setCreateBody(taskDescription || `This PR implements ${taskDisplayId}: ${taskName}`)
      setCreateBranch('')
      setCreateBaseBranch('')
      setCreateDraft(false)
    }
  }

  // Update branch name when repo is selected in create mode
  const handleCreateRepoChange = (value: string) => {
    setCreateRepo(value)
    setCreateBranch(branchNamePreview)
    const repoData = reposData?.repositories.find(r => r.fullName === value)
    setCreateBaseBranch(repoData?.defaultBranch || 'main')
  }

  // Update branch name when prefix changes
  const handlePrefixChange = (value: BranchPrefix) => {
    setBranchPrefix(value)
    const newBranchName = generateBranchNameClient(taskDisplayId, taskName, value)
    setCreateBranch(newBranchName)
  }

  const handleLinkPr = async (prNumber: number) => {
    if (!selectedRepo) return

    try {
      await linkMutation.mutateAsync({
        projectId,
        taskId: taskDisplayId,
        prNumber,
        repository: selectedRepo,
      })
      toast({ title: 'Success', description: 'Task linked to GitHub PR' })
      setIsDialogOpen(false)
      setSelectedRepo('')
      setSearchQuery('')
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to link task to GitHub PR', variant: 'destructive' })
    }
  }

  const handleCreatePr = async () => {
    if (!createRepo || !createTitle || !createBranch || !createBaseBranch) {
      toast({ title: 'Error', description: 'Please fill in all required fields', variant: 'destructive' })
      return
    }

    try {
      await createMutation.mutateAsync({
        projectId,
        taskId: taskDisplayId,
        repository: createRepo,
        title: createTitle,
        body: createBody,
        head: createBranch,
        base: createBaseBranch,
        draft: createDraft,
      })
      toast({ title: 'Success', description: 'GitHub PR created and linked to task' })
      setIsDialogOpen(false)
    } catch (error: any) {
      const message = error?.message || 'Failed to create GitHub PR'
      toast({ title: 'Error', description: message, variant: 'destructive' })
    }
  }

  const handleUnlink = async () => {
    try {
      await unlinkMutation.mutateAsync({
        projectId,
        taskId: taskDisplayId,
      })
      toast({ title: 'Success', description: 'Task unlinked from GitHub PR' })
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
      toast({ title: 'Success', description: 'GitHub PR synced' })
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to sync GitHub PR', variant: 'destructive' })
    }
  }

  // Get PR state icon
  const getPrStateIcon = (state: GitHubPrState) => {
    switch (state) {
      case 'open':
        return <CircleDot className="mr-1 h-2.5 w-2.5" />
      case 'closed':
        return <XCircle className="mr-1 h-2.5 w-2.5" />
      case 'merged':
        return <GitMerge className="mr-1 h-2.5 w-2.5" />
      default:
        return null
    }
  }

  // Loading state
  if (isLoadingIntegration || isLoadingLink) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <GitPullRequest className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Pull Request</span>
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
          <GitPullRequest className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Pull Request</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertCircle className="h-4 w-4" />
          <span>Connect GitHub in Settings to link PRs</span>
        </div>
      </div>
    )
  }

  // Linked state
  if (isLinked && githubPr) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitPullRequest className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Pull Request</span>
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
          href={githubPr.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
            <GitPullRequest className="h-3.5 w-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{githubPr.prTitle}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-muted-foreground font-mono">
                {githubPr.repository}#{githubPr.prNumber}
              </span>
              <Badge
                variant="outline"
                className={getPrStateColor(githubPr.prState as GitHubPrState)}
              >
                {getPrStateIcon(githubPr.prState as GitHubPrState)}
                {getPrStateLabel(githubPr.prState as GitHubPrState)}
              </Badge>
            </div>
            {githubPr.headBranch && (
              <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                <span className="font-mono">{githubPr.headBranch}</span>
                <span className="mx-1">→</span>
                <span className="font-mono">{githubPr.baseBranch}</span>
              </div>
            )}
          </div>
        </a>
      </div>
    )
  }

  // Not linked state
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <GitPullRequest className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Pull Request</span>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full">
            <GitPullRequest className="mr-2 h-4 w-4" />
            Link or Create PR
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pull Request</DialogTitle>
            <DialogDescription>
              Link <span className="font-mono">{taskDisplayId}</span> to an existing PR or create a new one.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={dialogMode} onValueChange={(v) => setDialogMode(v as 'link' | 'create')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="link" className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Link Existing
              </TabsTrigger>
              <TabsTrigger value="create" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Create New
              </TabsTrigger>
            </TabsList>

            {/* Link Existing PR Tab */}
            <TabsContent value="link" className="space-y-4 mt-4">
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
                            <GitPullRequest className="h-4 w-4" />
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

              {selectedRepo && (
                <>
                  {/* State Filter */}
                  <div className="space-y-2">
                    <Label>Filter by State</Label>
                    <Select value={prState} onValueChange={(v) => setPrState(v as 'open' | 'closed' | 'all')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">
                          <div className="flex items-center gap-2">
                            <CircleDot className="h-4 w-4 text-green-600" />
                            Open
                          </div>
                        </SelectItem>
                        <SelectItem value="closed">
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4 text-red-600" />
                            Closed
                          </div>
                        </SelectItem>
                        <SelectItem value="all">
                          <div className="flex items-center gap-2">
                            <GitPullRequest className="h-4 w-4" />
                            All
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Search Input */}
                  <div className="space-y-2">
                    <Label>Search PRs</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search pull requests..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  {/* PRs List */}
                  <div className="space-y-2">
                    <Label>Pull Requests</Label>
                    <ScrollArea className="h-[200px] rounded-md border">
                      {isLoadingPrs ? (
                        <div className="p-4 space-y-2">
                          <Skeleton className="h-12 w-full" />
                          <Skeleton className="h-12 w-full" />
                          <Skeleton className="h-12 w-full" />
                        </div>
                      ) : prsData?.pullRequests.length === 0 ? (
                        <div className="p-4 text-sm text-muted-foreground text-center">
                          No pull requests found
                        </div>
                      ) : (
                        <div className="p-2 space-y-1">
                          {prsData?.pullRequests.map((pr) => (
                            <button
                              key={pr.id}
                              onClick={() => handleLinkPr(pr.number)}
                              disabled={linkMutation.isPending}
                              className="w-full flex items-start gap-3 rounded-md p-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
                            >
                              <div className="mt-0.5 shrink-0">
                                {pr.state === 'open' && (
                                  <CircleDot className="h-4 w-4 text-green-600" />
                                )}
                                {pr.state === 'closed' && (
                                  <XCircle className="h-4 w-4 text-red-600" />
                                )}
                                {pr.state === 'merged' && (
                                  <GitMerge className="h-4 w-4 text-purple-600" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{pr.title}</span>
                                  {pr.draft && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                                      Draft
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>#{pr.number}</span>
                                  <span>by {pr.user.login}</span>
                                </div>
                                <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                                  <GitBranch className="h-3 w-3" />
                                  <span className="font-mono truncate">{pr.headBranch}</span>
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
            </TabsContent>

            {/* Create New PR Tab */}
            <TabsContent value="create" className="space-y-4 mt-4">
              {/* Repository Selector */}
              <div className="space-y-2">
                <Label>Repository *</Label>
                <Select value={createRepo} onValueChange={handleCreateRepoChange}>
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
                            <GitPullRequest className="h-4 w-4" />
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

              {createRepo && (
                <>
                  {/* Branch Configuration */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Branch Prefix</Label>
                      <Select value={branchPrefix} onValueChange={(v) => handlePrefixChange(v as BranchPrefix)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="feature">feature/</SelectItem>
                          <SelectItem value="fix">fix/</SelectItem>
                          <SelectItem value="hotfix">hotfix/</SelectItem>
                          <SelectItem value="chore">chore/</SelectItem>
                          <SelectItem value="docs">docs/</SelectItem>
                          <SelectItem value="refactor">refactor/</SelectItem>
                          <SelectItem value="test">test/</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Base Branch *</Label>
                      <Input
                        value={createBaseBranch}
                        onChange={(e) => setCreateBaseBranch(e.target.value)}
                        placeholder={defaultBranch}
                      />
                    </div>
                  </div>

                  {/* Head Branch */}
                  <div className="space-y-2">
                    <Label>Source Branch (head) *</Label>
                    <Input
                      value={createBranch}
                      onChange={(e) => setCreateBranch(e.target.value)}
                      placeholder={branchNamePreview}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      This branch must exist and have commits ahead of the base branch.
                    </p>
                  </div>

                  {/* PR Title */}
                  <div className="space-y-2">
                    <Label>PR Title *</Label>
                    <Input
                      value={createTitle}
                      onChange={(e) => setCreateTitle(e.target.value)}
                      placeholder={`[${taskDisplayId}] ${taskName}`}
                    />
                  </div>

                  {/* PR Body */}
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={createBody}
                      onChange={(e) => setCreateBody(e.target.value)}
                      placeholder="Describe the changes in this PR..."
                      rows={4}
                    />
                  </div>

                  {/* Draft Checkbox */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="draft"
                      checked={createDraft}
                      onCheckedChange={(checked) => setCreateDraft(checked as boolean)}
                    />
                    <label
                      htmlFor="draft"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Create as draft PR
                    </label>
                  </div>

                  {/* Create Button */}
                  <Button
                    onClick={handleCreatePr}
                    disabled={createMutation.isPending || !createRepo || !createTitle || !createBranch || !createBaseBranch}
                    className="w-full"
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating PR...
                      </>
                    ) : (
                      <>
                        <Plus className="mr-2 h-4 w-4" />
                        Create Pull Request
                      </>
                    )}
                  </Button>
                </>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  )
}
