/**
 * GitHub OAuth Utilities
 *
 * Handles GitHub OAuth flow and API interactions
 */
import crypto from 'crypto'

// GitHub OAuth configuration
const GITHUB_CLIENT_ID = process.env['GITHUB_CLIENT_ID'] || ''
const GITHUB_CLIENT_SECRET = process.env['GITHUB_CLIENT_SECRET'] || ''
const GITHUB_REDIRECT_URI = process.env['GITHUB_REDIRECT_URI'] || ''
const GITHUB_WEBHOOK_SECRET = process.env['GITHUB_WEBHOOK_SECRET'] || ''

// ============================================
// GitHub Webhook Signature Verification (T8.5)
// ============================================

/**
 * Check if GitHub webhook secret is configured
 */
export function isGitHubWebhookConfigured(): boolean {
  return !!GITHUB_WEBHOOK_SECRET
}

/**
 * Verify GitHub webhook signature
 * GitHub uses HMAC SHA-256 with the webhook secret
 *
 * @param payload - The raw request body as a string
 * @param signature - The X-Hub-Signature-256 header value
 * @returns true if signature is valid
 */
export function verifyGitHubWebhookSignature(payload: string, signature: string): boolean {
  if (!GITHUB_WEBHOOK_SECRET) {
    console.error('[GitHub Webhook] GITHUB_WEBHOOK_SECRET not configured')
    return false
  }

  if (!signature) {
    return false
  }

  // GitHub sends signature as "sha256=<signature>"
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', GITHUB_WEBHOOK_SECRET)
    .update(payload, 'utf8')
    .digest('hex')

  // Use timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  } catch {
    // If buffers have different lengths, timingSafeEqual throws
    return false
  }
}

/**
 * GitHub Pull Request Webhook Event payload type
 */
export interface GitHubPullRequestEvent {
  action: 'opened' | 'closed' | 'reopened' | 'edited' | 'synchronize' | 'converted_to_draft' | 'ready_for_review' | string
  number: number
  pull_request: {
    id: number
    number: number
    title: string
    body: string | null
    state: 'open' | 'closed'
    merged: boolean
    merged_at: string | null
    html_url: string
    user: {
      login: string
      avatar_url: string | null
    }
    head: {
      ref: string // Branch name
      sha: string
    }
    base: {
      ref: string // Target branch
    }
  }
  repository: {
    id: number
    name: string
    full_name: string // Format: "owner/repo"
    owner: {
      login: string
    }
  }
  sender: {
    login: string
    avatar_url: string | null
  }
}

// GitHub OAuth scopes
// - repo: Full control of private repositories (needed for issues, PRs)
// - user:email: Access user email addresses
// - read:user: Read user profile data
export const GITHUB_SCOPES = ['repo', 'user:email', 'read:user']

/**
 * Check if GitHub OAuth is configured
 */
export function isGitHubConfigured(): boolean {
  return !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET && GITHUB_REDIRECT_URI)
}

/**
 * Get GitHub OAuth configuration info (without secrets)
 */
export function getGitHubConfig() {
  return {
    clientId: GITHUB_CLIENT_ID,
    redirectUri: GITHUB_REDIRECT_URI,
    scopes: GITHUB_SCOPES,
    configured: isGitHubConfigured(),
  }
}

/**
 * Generate a secure random state token for CSRF protection
 */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Build the GitHub OAuth authorization URL
 */
export function buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_REDIRECT_URI,
    scope: GITHUB_SCOPES.join(' '),
    state,
    allow_signup: 'true',
  })

  return `https://github.com/login/oauth/authorize?${params.toString()}`
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  code: string
): Promise<{ accessToken: string; scope: string; tokenType: string } | null> {
  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_REDIRECT_URI,
      }),
    })

    if (!response.ok) {
      console.error('GitHub token exchange failed:', response.status, response.statusText)
      return null
    }

    const data = (await response.json()) as {
      access_token?: string
      scope?: string
      token_type?: string
      error?: string
      error_description?: string
    }

    if (data.error) {
      console.error('GitHub OAuth error:', data.error, data.error_description)
      return null
    }

    if (!data.access_token) {
      console.error('No access token in GitHub response')
      return null
    }

    return {
      accessToken: data.access_token,
      scope: data.scope || '',
      tokenType: data.token_type || 'bearer',
    }
  } catch (error) {
    console.error('Error exchanging GitHub code for token:', error)
    return null
  }
}

/**
 * Fetch GitHub user info using access token
 */
export interface GitHubUser {
  id: number
  login: string
  name: string | null
  email: string | null
  avatar_url: string | null
}

export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser | null> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    if (!response.ok) {
      console.error('Failed to fetch GitHub user:', response.status, response.statusText)
      return null
    }

    const data = (await response.json()) as GitHubUser

    return {
      id: data.id,
      login: data.login,
      name: data.name,
      email: data.email,
      avatar_url: data.avatar_url,
    }
  } catch (error) {
    console.error('Error fetching GitHub user:', error)
    return null
  }
}

/**
 * Fetch GitHub user's primary email (if user profile doesn't expose it)
 */
export async function fetchGitHubEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch('https://api.github.com/user/emails', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    if (!response.ok) {
      console.error('Failed to fetch GitHub emails:', response.status, response.statusText)
      return null
    }

    const emails = (await response.json()) as Array<{
      email: string
      primary: boolean
      verified: boolean
    }>

    // Find primary verified email
    const primary = emails.find((e) => e.primary && e.verified)
    if (primary) {
      return primary.email
    }

    // Fall back to any verified email
    const verified = emails.find((e) => e.verified)
    if (verified) {
      return verified.email
    }

    // Fall back to first email
    const firstEmail = emails[0]
    if (firstEmail) {
      return firstEmail.email
    }

    return null
  } catch (error) {
    console.error('Error fetching GitHub emails:', error)
    return null
  }
}

/**
 * Fetch user's repositories
 */
export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  owner: {
    login: string
    avatar_url: string | null
  }
  description: string | null
  private: boolean
  html_url: string
  default_branch: string
}

export async function fetchGitHubRepositories(
  accessToken: string,
  page = 1,
  perPage = 30
): Promise<GitHubRepo[]> {
  try {
    const response = await fetch(
      `https://api.github.com/user/repos?sort=updated&per_page=${perPage}&page=${page}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    )

    if (!response.ok) {
      console.error('Failed to fetch GitHub repos:', response.status, response.statusText)
      return []
    }

    return (await response.json()) as GitHubRepo[]
  } catch (error) {
    console.error('Error fetching GitHub repos:', error)
    return []
  }
}

/**
 * Check if access token is still valid
 */
export async function validateAccessToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    return response.ok
  } catch {
    return false
  }
}

/**
 * Revoke an access token (delete the OAuth authorization)
 * Note: This requires the token to still be valid
 */
export async function revokeAccessToken(accessToken: string): Promise<boolean> {
  try {
    // GitHub doesn't have a standard revocation endpoint for OAuth tokens
    // The user needs to revoke access from their GitHub settings
    // We can only delete it from our database
    return true
  } catch (error) {
    console.error('Error revoking GitHub token:', error)
    return false
  }
}

// ============================================
// GitHub Issues API (T8.3)
// ============================================

/**
 * GitHub Issue type
 */
export interface GitHubIssue {
  id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  html_url: string
  created_at: string
  updated_at: string
  closed_at: string | null
  user: {
    login: string
    avatar_url: string | null
  }
  labels: Array<{
    id: number
    name: string
    color: string
  }>
  assignees: Array<{
    login: string
    avatar_url: string | null
  }>
}

/**
 * Fetch a specific GitHub issue
 */
export async function fetchGitHubIssue(
  accessToken: string,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<GitHubIssue | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    )

    if (!response.ok) {
      console.error('Failed to fetch GitHub issue:', response.status, response.statusText)
      return null
    }

    return (await response.json()) as GitHubIssue
  } catch (error) {
    console.error('Error fetching GitHub issue:', error)
    return null
  }
}

/**
 * List issues in a repository
 */
export async function listGitHubIssues(
  accessToken: string,
  owner: string,
  repo: string,
  options: {
    state?: 'open' | 'closed' | 'all'
    page?: number
    perPage?: number
    labels?: string
    sort?: 'created' | 'updated' | 'comments'
    direction?: 'asc' | 'desc'
  } = {}
): Promise<GitHubIssue[]> {
  try {
    const params = new URLSearchParams({
      state: options.state || 'open',
      per_page: String(options.perPage || 30),
      page: String(options.page || 1),
      sort: options.sort || 'updated',
      direction: options.direction || 'desc',
    })

    if (options.labels) {
      params.set('labels', options.labels)
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues?${params.toString()}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    )

    if (!response.ok) {
      console.error('Failed to list GitHub issues:', response.status, response.statusText)
      return []
    }

    // Filter out pull requests (GitHub API returns PRs as issues too)
    const issues = (await response.json()) as Array<GitHubIssue & { pull_request?: unknown }>
    return issues.filter((issue) => !issue.pull_request)
  } catch (error) {
    console.error('Error listing GitHub issues:', error)
    return []
  }
}

/**
 * Search issues in a repository
 */
export async function searchGitHubIssues(
  accessToken: string,
  owner: string,
  repo: string,
  query: string,
  options: {
    state?: 'open' | 'closed'
    page?: number
    perPage?: number
  } = {}
): Promise<{ items: GitHubIssue[]; totalCount: number }> {
  try {
    // Build the search query
    let searchQuery = `repo:${owner}/${repo} is:issue ${query}`
    if (options.state) {
      searchQuery += ` state:${options.state}`
    }

    const params = new URLSearchParams({
      q: searchQuery,
      per_page: String(options.perPage || 20),
      page: String(options.page || 1),
      sort: 'updated',
      order: 'desc',
    })

    const response = await fetch(
      `https://api.github.com/search/issues?${params.toString()}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    )

    if (!response.ok) {
      console.error('Failed to search GitHub issues:', response.status, response.statusText)
      return { items: [], totalCount: 0 }
    }

    const data = (await response.json()) as {
      total_count: number
      items: GitHubIssue[]
    }

    return {
      items: data.items,
      totalCount: data.total_count,
    }
  } catch (error) {
    console.error('Error searching GitHub issues:', error)
    return { items: [], totalCount: 0 }
  }
}

/**
 * Create a new GitHub issue
 */
export async function createGitHubIssue(
  accessToken: string,
  owner: string,
  repo: string,
  issue: {
    title: string
    body?: string
    labels?: string[]
    assignees?: string[]
  }
): Promise<GitHubIssue | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          title: issue.title,
          body: issue.body,
          labels: issue.labels,
          assignees: issue.assignees,
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to create GitHub issue:', response.status, errorText)
      return null
    }

    return (await response.json()) as GitHubIssue
  } catch (error) {
    console.error('Error creating GitHub issue:', error)
    return null
  }
}

// ============================================
// Branch Name Generation (T8.6)
// ============================================

/**
 * Branch name prefix types
 */
export type BranchPrefix = 'feature' | 'fix' | 'hotfix' | 'chore' | 'docs' | 'refactor' | 'test'

/**
 * Generate a Git branch name from a task
 *
 * @param taskId - The task ID (e.g., "T2.1")
 * @param taskName - The task name/title
 * @param options - Configuration options
 * @returns A valid Git branch name
 *
 * @example
 * generateBranchName("T2.1", "Implement user login")
 * // Returns: "feature/T2.1-implement-user-login"
 *
 * generateBranchName("T3.5", "Fix authentication bug", { prefix: "fix" })
 * // Returns: "fix/T3.5-fix-authentication-bug"
 */
export function generateBranchName(
  taskId: string,
  taskName: string,
  options: {
    prefix?: BranchPrefix
    maxLength?: number
    includeTaskId?: boolean
  } = {}
): string {
  const { prefix = 'feature', maxLength = 60, includeTaskId = true } = options

  // Sanitize the task name:
  // 1. Convert to lowercase
  // 2. Replace spaces and underscores with dashes
  // 3. Remove any characters that aren't alphanumeric, dashes, or dots
  // 4. Replace multiple consecutive dashes with a single dash
  // 5. Remove leading/trailing dashes
  let sanitizedName = taskName
    .toLowerCase()
    .replace(/[\s_]+/g, '-') // Replace spaces and underscores with dashes
    .replace(/[^a-z0-9\-\.]/g, '') // Remove invalid characters
    .replace(/-+/g, '-') // Replace multiple dashes with single dash
    .replace(/^-|-$/g, '') // Remove leading/trailing dashes

  // Build the branch name
  let branchName: string
  if (includeTaskId) {
    branchName = `${prefix}/${taskId}-${sanitizedName}`
  } else {
    branchName = `${prefix}/${sanitizedName}`
  }

  // Truncate if too long (preserve the prefix and task ID)
  if (branchName.length > maxLength) {
    const prefixPart = includeTaskId ? `${prefix}/${taskId}-` : `${prefix}/`
    const availableLength = maxLength - prefixPart.length
    sanitizedName = sanitizedName.substring(0, availableLength).replace(/-$/, '')
    branchName = `${prefixPart}${sanitizedName}`
  }

  return branchName
}

/**
 * Detect the appropriate branch prefix based on task name keywords
 *
 * @param taskName - The task name to analyze
 * @returns The suggested branch prefix
 */
export function detectBranchPrefix(taskName: string): BranchPrefix {
  const lowerName = taskName.toLowerCase()

  // Check for fix/bug related keywords
  if (
    lowerName.includes('fix') ||
    lowerName.includes('bug') ||
    lowerName.includes('issue') ||
    lowerName.includes('error') ||
    lowerName.includes('crash') ||
    lowerName.includes('broken')
  ) {
    return 'fix'
  }

  // Check for hotfix keywords (urgent fixes)
  if (
    lowerName.includes('hotfix') ||
    lowerName.includes('urgent') ||
    lowerName.includes('critical') ||
    lowerName.includes('emergency')
  ) {
    return 'hotfix'
  }

  // Check for documentation keywords
  if (
    lowerName.includes('doc') ||
    lowerName.includes('readme') ||
    lowerName.includes('documentation')
  ) {
    return 'docs'
  }

  // Check for test keywords
  if (
    lowerName.includes('test') ||
    lowerName.includes('spec') ||
    lowerName.includes('coverage')
  ) {
    return 'test'
  }

  // Check for refactor keywords
  if (
    lowerName.includes('refactor') ||
    lowerName.includes('cleanup') ||
    lowerName.includes('clean up') ||
    lowerName.includes('restructure') ||
    lowerName.includes('reorganize')
  ) {
    return 'refactor'
  }

  // Check for chore keywords
  if (
    lowerName.includes('chore') ||
    lowerName.includes('dependency') ||
    lowerName.includes('dependencies') ||
    lowerName.includes('upgrade') ||
    lowerName.includes('update version') ||
    lowerName.includes('config')
  ) {
    return 'chore'
  }

  // Default to feature
  return 'feature'
}

/**
 * Generate branch name with auto-detected prefix
 */
export function generateBranchNameAuto(
  taskId: string,
  taskName: string,
  options: {
    maxLength?: number
    includeTaskId?: boolean
  } = {}
): { branchName: string; detectedPrefix: BranchPrefix } {
  const detectedPrefix = detectBranchPrefix(taskName)
  const branchName = generateBranchName(taskId, taskName, {
    ...options,
    prefix: detectedPrefix,
  })
  return { branchName, detectedPrefix }
}

// ============================================
// GitHub Pull Requests API (T8.4)
// ============================================

/**
 * GitHub Pull Request type
 */
export interface GitHubPullRequest {
  id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  merged: boolean
  merged_at: string | null
  html_url: string
  created_at: string
  updated_at: string
  closed_at: string | null
  draft: boolean
  user: {
    login: string
    avatar_url: string | null
  }
  head: {
    ref: string // Branch name
    sha: string
    repo: {
      full_name: string
    } | null
  }
  base: {
    ref: string // Target branch (e.g., "main")
    sha: string
    repo: {
      full_name: string
    } | null
  }
  labels: Array<{
    id: number
    name: string
    color: string
  }>
  assignees: Array<{
    login: string
    avatar_url: string | null
  }>
  requested_reviewers: Array<{
    login: string
    avatar_url: string | null
  }>
  // Computed state: "open" | "closed" | "merged"
  mergedState?: 'open' | 'closed' | 'merged'
}

/**
 * Get the combined PR state (open, closed, or merged)
 */
export function getPrState(pr: GitHubPullRequest): 'open' | 'closed' | 'merged' {
  if (pr.merged) {
    return 'merged'
  }
  return pr.state
}

/**
 * Fetch a specific GitHub Pull Request
 */
export async function fetchGitHubPullRequest(
  accessToken: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<GitHubPullRequest | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    )

    if (!response.ok) {
      console.error('Failed to fetch GitHub PR:', response.status, response.statusText)
      return null
    }

    const pr = (await response.json()) as GitHubPullRequest
    // Add computed mergedState
    pr.mergedState = getPrState(pr)
    return pr
  } catch (error) {
    console.error('Error fetching GitHub PR:', error)
    return null
  }
}

/**
 * List pull requests in a repository
 */
export async function listGitHubPullRequests(
  accessToken: string,
  owner: string,
  repo: string,
  options: {
    state?: 'open' | 'closed' | 'all'
    page?: number
    perPage?: number
    sort?: 'created' | 'updated' | 'popularity' | 'long-running'
    direction?: 'asc' | 'desc'
    head?: string // Filter by head branch (format: "user:ref-name")
    base?: string // Filter by base branch
  } = {}
): Promise<GitHubPullRequest[]> {
  try {
    const params = new URLSearchParams({
      state: options.state || 'open',
      per_page: String(options.perPage || 30),
      page: String(options.page || 1),
      sort: options.sort || 'updated',
      direction: options.direction || 'desc',
    })

    if (options.head) {
      params.set('head', options.head)
    }
    if (options.base) {
      params.set('base', options.base)
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls?${params.toString()}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    )

    if (!response.ok) {
      console.error('Failed to list GitHub PRs:', response.status, response.statusText)
      return []
    }

    const prs = (await response.json()) as GitHubPullRequest[]
    // Add computed mergedState to each PR
    return prs.map((pr) => ({
      ...pr,
      mergedState: getPrState(pr),
    }))
  } catch (error) {
    console.error('Error listing GitHub PRs:', error)
    return []
  }
}

/**
 * Search pull requests in a repository
 */
export async function searchGitHubPullRequests(
  accessToken: string,
  owner: string,
  repo: string,
  query: string,
  options: {
    state?: 'open' | 'closed' | 'merged'
    page?: number
    perPage?: number
  } = {}
): Promise<{ items: GitHubPullRequest[]; totalCount: number }> {
  try {
    // Build the search query
    let searchQuery = `repo:${owner}/${repo} is:pr ${query}`
    if (options.state) {
      if (options.state === 'merged') {
        searchQuery += ' is:merged'
      } else {
        searchQuery += ` state:${options.state}`
      }
    }

    const params = new URLSearchParams({
      q: searchQuery,
      per_page: String(options.perPage || 20),
      page: String(options.page || 1),
      sort: 'updated',
      order: 'desc',
    })

    const response = await fetch(
      `https://api.github.com/search/issues?${params.toString()}`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    )

    if (!response.ok) {
      console.error('Failed to search GitHub PRs:', response.status, response.statusText)
      return { items: [], totalCount: 0 }
    }

    const data = (await response.json()) as {
      total_count: number
      items: Array<GitHubPullRequest & { pull_request?: { url: string } }>
    }

    // Filter to only PRs (search API returns both issues and PRs)
    // and add mergedState
    const prs = data.items
      .filter((item) => item.pull_request)
      .map((pr) => ({
        ...pr,
        mergedState: getPrState(pr),
      }))

    return {
      items: prs,
      totalCount: data.total_count,
    }
  } catch (error) {
    console.error('Error searching GitHub PRs:', error)
    return { items: [], totalCount: 0 }
  }
}

/**
 * Create a new GitHub Pull Request
 */
export async function createGitHubPullRequest(
  accessToken: string,
  owner: string,
  repo: string,
  pr: {
    title: string
    body?: string
    head: string // Branch name to merge from
    base: string // Branch name to merge into (e.g., "main")
    draft?: boolean
  }
): Promise<GitHubPullRequest | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          title: pr.title,
          body: pr.body,
          head: pr.head,
          base: pr.base,
          draft: pr.draft || false,
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to create GitHub PR:', response.status, errorText)
      return null
    }

    const createdPr = (await response.json()) as GitHubPullRequest
    createdPr.mergedState = getPrState(createdPr)
    return createdPr
  } catch (error) {
    console.error('Error creating GitHub PR:', error)
    return null
  }
}

/**
 * Update a GitHub Pull Request
 */
export async function updateGitHubPullRequest(
  accessToken: string,
  owner: string,
  repo: string,
  prNumber: number,
  updates: {
    title?: string
    body?: string
    state?: 'open' | 'closed'
    base?: string
  }
): Promise<GitHubPullRequest | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`,
      {
        method: 'PATCH',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify(updates),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to update GitHub PR:', response.status, errorText)
      return null
    }

    const pr = (await response.json()) as GitHubPullRequest
    pr.mergedState = getPrState(pr)
    return pr
  } catch (error) {
    console.error('Error updating GitHub PR:', error)
    return null
  }
}

/**
 * Find a PR by branch name
 * Useful for auto-linking when user creates a PR from a task branch
 */
export async function findGitHubPullRequestByBranch(
  accessToken: string,
  owner: string,
  repo: string,
  branchName: string,
  options: {
    state?: 'open' | 'closed' | 'all'
  } = {}
): Promise<GitHubPullRequest | null> {
  try {
    const prs = await listGitHubPullRequests(accessToken, owner, repo, {
      state: options.state || 'all',
      head: `${owner}:${branchName}`,
      perPage: 1,
    })

    return prs[0] ?? null
  } catch (error) {
    console.error('Error finding GitHub PR by branch:', error)
    return null
  }
}

/**
 * Update a GitHub issue (e.g., close it when task is done)
 */
export async function updateGitHubIssue(
  accessToken: string,
  owner: string,
  repo: string,
  issueNumber: number,
  updates: {
    title?: string
    body?: string
    state?: 'open' | 'closed'
    labels?: string[]
    assignees?: string[]
  }
): Promise<GitHubIssue | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      {
        method: 'PATCH',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify(updates),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to update GitHub issue:', response.status, errorText)
      return null
    }

    return (await response.json()) as GitHubIssue
  } catch (error) {
    console.error('Error updating GitHub issue:', error)
    return null
  }
}
