'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/auth-api'
import type { GitHubIntegrationStatus, GitHubRepository } from '@planflow/shared'

// Query key for GitHub integration
export const githubQueryKey = ['github', 'integration']
export const githubReposQueryKey = ['github', 'repos']

interface GitHubConfigResponse {
  configured: boolean
  scopes: string[]
}

interface GitHubIntegrationResponse {
  configured: boolean
  connected: boolean
  integration: GitHubIntegrationStatus | null
}

interface GitHubAuthorizationResponse {
  authorizationUrl: string
  state: string
  expiresIn: number
}

interface GitHubCallbackResponse {
  integration: GitHubIntegrationStatus
  message: string
}

interface GitHubRepoItem {
  id: number
  name: string
  fullName: string
  owner: string
  ownerAvatar: string | null
  description: string | null
  private: boolean
  htmlUrl: string
  defaultBranch: string
}

interface GitHubReposResponse {
  repositories: GitHubRepoItem[]
  page: number
  perPage: number
}

/**
 * Hook to get GitHub configuration status
 */
export function useGitHubConfig() {
  return useQuery({
    queryKey: ['github', 'config'],
    queryFn: async () => {
      const response = await authApi.get<{ success: boolean; data: GitHubConfigResponse }>(
        '/integrations/github/config'
      )
      return response.data
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

/**
 * Hook to get current GitHub integration status
 */
export function useGitHubIntegration() {
  return useQuery({
    queryKey: githubQueryKey,
    queryFn: async () => {
      const response = await authApi.get<{ success: boolean; data: GitHubIntegrationResponse }>(
        '/integrations/github'
      )
      return response.data
    },
  })
}

/**
 * Hook to start GitHub OAuth authorization flow
 */
export function useGitHubAuthorize() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const response = await authApi.post<{ success: boolean; data: GitHubAuthorizationResponse }>(
        '/integrations/github/authorize'
      )
      return response.data
    },
    onError: (error: Error) => {
      console.error('GitHub authorize error:', error)
    },
  })
}

/**
 * Hook to complete GitHub OAuth callback
 */
export function useGitHubCallback() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ code, state }: { code: string; state: string }) => {
      const response = await authApi.post<{ success: boolean; data: GitHubCallbackResponse }>(
        '/integrations/github/callback',
        { code, state }
      )
      return response.data
    },
    onSuccess: () => {
      // Invalidate GitHub integration query to refresh status
      queryClient.invalidateQueries({ queryKey: githubQueryKey })
    },
    onError: (error: Error) => {
      console.error('GitHub callback error:', error)
    },
  })
}

/**
 * Hook to disconnect GitHub integration
 */
export function useGitHubDisconnect() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const response = await authApi.post<{ success: boolean; data: { message: string } }>(
        '/integrations/github/disconnect'
      )
      return response.data
    },
    onSuccess: () => {
      // Invalidate GitHub integration query
      queryClient.invalidateQueries({ queryKey: githubQueryKey })
      // Also invalidate repos since we're disconnected
      queryClient.invalidateQueries({ queryKey: githubReposQueryKey })
    },
    onError: (error: Error) => {
      console.error('GitHub disconnect error:', error)
    },
  })
}

/**
 * Hook to refresh GitHub user info
 */
export function useGitHubRefresh() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const response = await authApi.post<{
        success: boolean
        data: { integration: GitHubIntegrationStatus }
      }>('/integrations/github/refresh')
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: githubQueryKey })
    },
    onError: (error: Error) => {
      console.error('GitHub refresh error:', error)
    },
  })
}

/**
 * Hook to fetch GitHub repositories
 */
export function useGitHubRepos(page = 1, perPage = 30, enabled = true) {
  return useQuery({
    queryKey: [...githubReposQueryKey, page, perPage],
    queryFn: async () => {
      const response = await authApi.get<{ success: boolean; data: GitHubReposResponse }>(
        `/integrations/github/repos?page=${page}&per_page=${perPage}`
      )
      return response.data
    },
    enabled,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

// ============================================
// GitHub Issues Hooks (T8.3)
// ============================================

export const githubIssuesQueryKey = ['github', 'issues']
export const taskGitHubLinkQueryKey = ['task', 'github-link']
export const taskBranchNameQueryKey = ['task', 'branch-name']

interface GitHubIssueItem {
  id: number
  number: number
  title: string
  state: 'open' | 'closed'
  htmlUrl: string
  createdAt: string
  updatedAt: string
  user: {
    login: string
    avatarUrl: string | null
  }
  labels: Array<{
    name: string
    color: string
  }>
}

interface GitHubIssueDetail extends GitHubIssueItem {
  body: string | null
  closedAt: string | null
  assignees: Array<{
    login: string
    avatarUrl: string | null
  }>
}

interface GitHubIssuesResponse {
  issues: GitHubIssueItem[]
  page: number
  perPage: number
  totalCount?: number
}

interface TaskGitHubLinkResponse {
  linked: boolean
  task: {
    id: string
    taskId: string
    name: string
  }
  githubLink: {
    issueNumber: number
    repository: string
    issueUrl: string
    issueTitle: string
    issueState: 'open' | 'closed'
    linkedAt: string
  } | null
}

interface LinkTaskResponse {
  task: {
    id: string
    taskId: string
    name: string
    githubIssueNumber: number
    githubRepository: string
    githubIssueUrl: string
    githubIssueTitle: string
    githubIssueState: string
    githubLinkedAt: string
  }
  githubIssue: {
    number: number
    title: string
    state: string
    htmlUrl: string
  }
}

/**
 * Hook to fetch GitHub issues from a repository
 */
export function useGitHubIssues(
  owner: string,
  repo: string,
  options: {
    state?: 'open' | 'closed' | 'all'
    page?: number
    perPage?: number
    search?: string
    enabled?: boolean
  } = {}
) {
  const { state = 'open', page = 1, perPage = 30, search, enabled = true } = options

  return useQuery({
    queryKey: [...githubIssuesQueryKey, owner, repo, state, page, perPage, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        state,
        page: String(page),
        per_page: String(perPage),
      })
      if (search) {
        params.set('search', search)
      }

      const response = await authApi.get<{ success: boolean; data: GitHubIssuesResponse }>(
        `/integrations/github/repos/${owner}/${repo}/issues?${params.toString()}`
      )
      return response.data
    },
    enabled: enabled && !!owner && !!repo,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

/**
 * Hook to fetch a single GitHub issue
 */
export function useGitHubIssue(owner: string, repo: string, issueNumber: number, enabled = true) {
  return useQuery({
    queryKey: [...githubIssuesQueryKey, owner, repo, issueNumber],
    queryFn: async () => {
      const response = await authApi.get<{ success: boolean; data: { issue: GitHubIssueDetail } }>(
        `/integrations/github/repos/${owner}/${repo}/issues/${issueNumber}`
      )
      return response.data.issue
    },
    enabled: enabled && !!owner && !!repo && issueNumber > 0,
  })
}

/**
 * Hook to get task's GitHub link status
 */
export function useTaskGitHubLink(projectId: string, taskId: string, enabled = true) {
  return useQuery({
    queryKey: [...taskGitHubLinkQueryKey, projectId, taskId],
    queryFn: async () => {
      const response = await authApi.get<{ success: boolean; data: TaskGitHubLinkResponse }>(
        `/projects/${projectId}/tasks/${taskId}/github-link`
      )
      return response.data
    },
    enabled: enabled && !!projectId && !!taskId,
  })
}

/**
 * Hook to link a task to an existing GitHub issue
 */
export function useLinkTaskToGitHub() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      taskId,
      issueNumber,
      repository,
    }: {
      projectId: string
      taskId: string
      issueNumber: number
      repository: string
    }) => {
      const response = await authApi.post<{ success: boolean; data: LinkTaskResponse }>(
        `/projects/${projectId}/tasks/${taskId}/link-github`,
        { issueNumber, repository }
      )
      return response.data
    },
    onSuccess: (_, variables) => {
      // Invalidate task GitHub link query
      queryClient.invalidateQueries({
        queryKey: [...taskGitHubLinkQueryKey, variables.projectId, variables.taskId],
      })
      // Invalidate tasks list to update UI
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.projectId] })
    },
    onError: (error: Error) => {
      console.error('Link task to GitHub error:', error)
    },
  })
}

/**
 * Hook to unlink a task from GitHub issue
 */
export function useUnlinkTaskFromGitHub() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, taskId }: { projectId: string; taskId: string }) => {
      const response = await authApi.delete<{
        success: boolean
        data: { task: { id: string; taskId: string; name: string }; message: string }
      }>(`/projects/${projectId}/tasks/${taskId}/link-github`)
      return response.data
    },
    onSuccess: (_, variables) => {
      // Invalidate task GitHub link query
      queryClient.invalidateQueries({
        queryKey: [...taskGitHubLinkQueryKey, variables.projectId, variables.taskId],
      })
      // Invalidate tasks list to update UI
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.projectId] })
    },
    onError: (error: Error) => {
      console.error('Unlink task from GitHub error:', error)
    },
  })
}

/**
 * Hook to create a new GitHub issue from a task
 */
export function useCreateGitHubIssueFromTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      taskId,
      repository,
      labels,
      assignees,
    }: {
      projectId: string
      taskId: string
      repository: string
      labels?: string[]
      assignees?: string[]
    }) => {
      const response = await authApi.post<{ success: boolean; data: LinkTaskResponse }>(
        `/projects/${projectId}/tasks/${taskId}/create-github-issue`,
        { repository, labels, assignees }
      )
      return response.data
    },
    onSuccess: (_, variables) => {
      // Invalidate task GitHub link query
      queryClient.invalidateQueries({
        queryKey: [...taskGitHubLinkQueryKey, variables.projectId, variables.taskId],
      })
      // Invalidate tasks list to update UI
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.projectId] })
    },
    onError: (error: Error) => {
      console.error('Create GitHub issue from task error:', error)
    },
  })
}

/**
 * Hook to sync task's GitHub issue state
 */
export function useSyncTaskGitHubIssue() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, taskId }: { projectId: string; taskId: string }) => {
      const response = await authApi.post<{
        success: boolean
        data: { task: Record<string, unknown>; synced: boolean }
      }>(`/projects/${projectId}/tasks/${taskId}/sync-github-issue`)
      return response.data
    },
    onSuccess: (_, variables) => {
      // Invalidate task GitHub link query
      queryClient.invalidateQueries({
        queryKey: [...taskGitHubLinkQueryKey, variables.projectId, variables.taskId],
      })
      // Invalidate tasks list to update UI
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.projectId] })
    },
    onError: (error: Error) => {
      console.error('Sync task GitHub issue error:', error)
    },
  })
}

// ============================================
// Branch Name Generation Hooks (T8.6)
// ============================================

export type BranchPrefix = 'feature' | 'fix' | 'hotfix' | 'chore' | 'docs' | 'refactor' | 'test'

interface BranchNameResponse {
  task: {
    id: string
    taskId: string
    name: string
  }
  branchName: string
  detectedPrefix: BranchPrefix
  variants: Record<BranchPrefix, string>
  gitCommand: string
}

/**
 * Hook to generate branch name for a task
 */
export function useTaskBranchName(
  projectId: string,
  taskId: string,
  options: {
    prefix?: BranchPrefix
    enabled?: boolean
  } = {}
) {
  const { prefix, enabled = true } = options

  return useQuery({
    queryKey: [...taskBranchNameQueryKey, projectId, taskId, prefix],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (prefix) {
        params.set('prefix', prefix)
      }
      const queryString = params.toString()
      const url = `/projects/${projectId}/tasks/${taskId}/branch-name${queryString ? `?${queryString}` : ''}`

      const response = await authApi.get<{ success: boolean; data: BranchNameResponse }>(url)
      return response.data
    },
    enabled: enabled && !!projectId && !!taskId,
    staleTime: 1000 * 60 * 5, // 5 minutes - branch names don't change often
  })
}

/**
 * Utility function to generate branch name client-side (for instant preview)
 * This mirrors the backend logic for immediate UI feedback
 */
export function generateBranchNameClient(
  taskId: string,
  taskName: string,
  prefix: BranchPrefix = 'feature'
): string {
  // Sanitize the task name
  const sanitizedName = taskName
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\-\.]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  let branchName = `${prefix}/${taskId}-${sanitizedName}`

  // Truncate if too long
  const maxLength = 60
  if (branchName.length > maxLength) {
    const prefixPart = `${prefix}/${taskId}-`
    const availableLength = maxLength - prefixPart.length
    const truncatedName = sanitizedName.substring(0, availableLength).replace(/-$/, '')
    branchName = `${prefixPart}${truncatedName}`
  }

  return branchName
}

/**
 * Detect branch prefix from task name (client-side version)
 */
export function detectBranchPrefixClient(taskName: string): BranchPrefix {
  const lowerName = taskName.toLowerCase()

  if (/fix|bug|issue|error|crash|broken/.test(lowerName)) return 'fix'
  if (/hotfix|urgent|critical|emergency/.test(lowerName)) return 'hotfix'
  if (/doc|readme|documentation/.test(lowerName)) return 'docs'
  if (/test|spec|coverage/.test(lowerName)) return 'test'
  if (/refactor|cleanup|clean up|restructure|reorganize/.test(lowerName)) return 'refactor'
  if (/chore|dependency|dependencies|upgrade|update version|config/.test(lowerName)) return 'chore'

  return 'feature'
}

// ============================================
// GitHub Pull Request Hooks (T8.4)
// ============================================

export const githubPullRequestsQueryKey = ['github', 'pull-requests']
export const taskGitHubPrLinkQueryKey = ['task', 'github-pr']

export type GitHubPrState = 'open' | 'closed' | 'merged'

interface GitHubPrItem {
  id: number
  number: number
  title: string
  state: GitHubPrState
  htmlUrl: string
  draft: boolean
  headBranch: string
  baseBranch: string
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  user: {
    login: string
    avatarUrl: string | null
  }
  labels: Array<{
    name: string
    color: string
  }>
}

interface GitHubPrDetail extends GitHubPrItem {
  body: string | null
  closedAt: string | null
  assignees: Array<{
    login: string
    avatarUrl: string | null
  }>
  requestedReviewers: Array<{
    login: string
    avatarUrl: string | null
  }>
}

interface GitHubPullRequestsResponse {
  pullRequests: GitHubPrItem[]
  page: number
  perPage: number
  totalCount?: number
}

interface TaskGitHubPrLinkResponse {
  linked: boolean
  task: {
    id: string
    taskId: string
    name: string
  }
  githubPr: {
    prNumber: number
    repository: string
    prUrl: string
    prTitle: string
    prState: GitHubPrState
    headBranch: string
    baseBranch: string
    linkedAt: string
  } | null
}

interface LinkTaskToPrResponse {
  task: {
    id: string
    taskId: string
    name: string
    githubPrNumber: number
    githubPrRepository: string
    githubPrUrl: string
    githubPrTitle: string
    githubPrState: string
    githubPrBranch: string
    githubPrBaseBranch: string
    githubPrLinkedAt: string
  }
  githubPr: {
    number: number
    title: string
    state: string
    htmlUrl: string
    headBranch: string
    baseBranch: string
    draft: boolean
  }
}

/**
 * Hook to fetch GitHub pull requests from a repository
 */
export function useGitHubPullRequests(
  owner: string,
  repo: string,
  options: {
    state?: 'open' | 'closed' | 'all'
    page?: number
    perPage?: number
    search?: string
    enabled?: boolean
  } = {}
) {
  const { state = 'open', page = 1, perPage = 30, search, enabled = true } = options

  return useQuery({
    queryKey: [...githubPullRequestsQueryKey, owner, repo, state, page, perPage, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        state,
        page: String(page),
        per_page: String(perPage),
      })
      if (search) {
        params.set('search', search)
      }

      const response = await authApi.get<{ success: boolean; data: GitHubPullRequestsResponse }>(
        `/integrations/github/repos/${owner}/${repo}/pulls?${params.toString()}`
      )
      return response.data
    },
    enabled: enabled && !!owner && !!repo,
    staleTime: 1000 * 60 * 2, // 2 minutes
  })
}

/**
 * Hook to fetch a single GitHub pull request
 */
export function useGitHubPullRequest(owner: string, repo: string, prNumber: number, enabled = true) {
  return useQuery({
    queryKey: [...githubPullRequestsQueryKey, owner, repo, prNumber],
    queryFn: async () => {
      const response = await authApi.get<{ success: boolean; data: { pullRequest: GitHubPrDetail } }>(
        `/integrations/github/repos/${owner}/${repo}/pulls/${prNumber}`
      )
      return response.data.pullRequest
    },
    enabled: enabled && !!owner && !!repo && prNumber > 0,
  })
}

/**
 * Hook to get task's GitHub PR link status
 */
export function useTaskGitHubPrLink(projectId: string, taskId: string, enabled = true) {
  return useQuery({
    queryKey: [...taskGitHubPrLinkQueryKey, projectId, taskId],
    queryFn: async () => {
      const response = await authApi.get<{ success: boolean; data: TaskGitHubPrLinkResponse }>(
        `/projects/${projectId}/tasks/${taskId}/github-pr`
      )
      return response.data
    },
    enabled: enabled && !!projectId && !!taskId,
  })
}

/**
 * Hook to link a task to a GitHub pull request
 */
export function useLinkTaskToGitHubPr() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      taskId,
      prNumber,
      repository,
    }: {
      projectId: string
      taskId: string
      prNumber: number
      repository: string
    }) => {
      const response = await authApi.post<{ success: boolean; data: LinkTaskToPrResponse }>(
        `/projects/${projectId}/tasks/${taskId}/link-github-pr`,
        { prNumber, repository }
      )
      return response.data
    },
    onSuccess: (_, variables) => {
      // Invalidate task GitHub PR link query
      queryClient.invalidateQueries({
        queryKey: [...taskGitHubPrLinkQueryKey, variables.projectId, variables.taskId],
      })
      // Invalidate tasks list to update UI
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.projectId] })
    },
    onError: (error: Error) => {
      console.error('Link task to GitHub PR error:', error)
    },
  })
}

/**
 * Hook to unlink a task from GitHub PR
 */
export function useUnlinkTaskFromGitHubPr() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, taskId }: { projectId: string; taskId: string }) => {
      const response = await authApi.delete<{
        success: boolean
        data: { task: { id: string; taskId: string; name: string }; message: string }
      }>(`/projects/${projectId}/tasks/${taskId}/link-github-pr`)
      return response.data
    },
    onSuccess: (_, variables) => {
      // Invalidate task GitHub PR link query
      queryClient.invalidateQueries({
        queryKey: [...taskGitHubPrLinkQueryKey, variables.projectId, variables.taskId],
      })
      // Invalidate tasks list to update UI
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.projectId] })
    },
    onError: (error: Error) => {
      console.error('Unlink task from GitHub PR error:', error)
    },
  })
}

/**
 * Hook to sync task's GitHub PR state
 */
export function useSyncTaskGitHubPr() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, taskId }: { projectId: string; taskId: string }) => {
      const response = await authApi.post<{
        success: boolean
        data: { task: Record<string, unknown>; synced: boolean; prState: GitHubPrState }
      }>(`/projects/${projectId}/tasks/${taskId}/sync-github-pr`)
      return response.data
    },
    onSuccess: (_, variables) => {
      // Invalidate task GitHub PR link query
      queryClient.invalidateQueries({
        queryKey: [...taskGitHubPrLinkQueryKey, variables.projectId, variables.taskId],
      })
      // Invalidate tasks list to update UI
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.projectId] })
    },
    onError: (error: Error) => {
      console.error('Sync task GitHub PR error:', error)
    },
  })
}

/**
 * Get a human-readable PR state label
 */
export function getPrStateLabel(state: GitHubPrState): string {
  switch (state) {
    case 'open':
      return 'Open'
    case 'closed':
      return 'Closed'
    case 'merged':
      return 'Merged'
    default:
      return state
  }
}

/**
 * Get a color class for PR state badges
 */
export function getPrStateColor(state: GitHubPrState): string {
  switch (state) {
    case 'open':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    case 'closed':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    case 'merged':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
  }
}

// ============================================
// Create GitHub PR from Task (T8.10)
// ============================================

interface CreateGitHubPrFromTaskResponse {
  task: {
    id: string
    taskId: string
    name: string
    githubPrNumber: number
    githubPrRepository: string
    githubPrUrl: string
    githubPrTitle: string
    githubPrState: string
    githubPrBranch: string
    githubPrBaseBranch: string
    githubPrLinkedAt: string
  }
  githubPr: {
    number: number
    title: string
    state: string
    htmlUrl: string
    headBranch: string
    baseBranch: string
    draft: boolean
  }
}

/**
 * Hook to create a new GitHub PR from a task
 */
export function useCreateGitHubPrFromTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      taskId,
      repository,
      title,
      body,
      head,
      base,
      draft,
    }: {
      projectId: string
      taskId: string
      repository: string
      title: string
      body?: string
      head: string
      base: string
      draft?: boolean
    }) => {
      const response = await authApi.post<{ success: boolean; data: CreateGitHubPrFromTaskResponse }>(
        `/projects/${projectId}/tasks/${taskId}/create-github-pr`,
        { repository, title, body, head, base, draft }
      )
      return response.data
    },
    onSuccess: (_, variables) => {
      // Invalidate task GitHub PR link query
      queryClient.invalidateQueries({
        queryKey: [...taskGitHubPrLinkQueryKey, variables.projectId, variables.taskId],
      })
      // Invalidate tasks list to update UI
      queryClient.invalidateQueries({ queryKey: ['tasks', variables.projectId] })
    },
    onError: (error: Error) => {
      console.error('Create GitHub PR from task error:', error)
    },
  })
}
