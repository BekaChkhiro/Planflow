/**
 * PlanFlow MCP Server - API Client
 *
 * HTTP client wrapper for communicating with the PlanFlow API.
 * Provides typed methods for all API endpoints with proper error handling.
 */

import type {
  ApiResponse,
  Project,
  Task,
  User,
  CreateProjectRequest,
  UpdateProjectRequest,
  UpdateTaskRequest,
  TaskStatus,
} from '@planflow/shared'
import { ApiError, AuthError } from './errors.js'
import { getApiToken, getApiUrl, isAuthenticated as checkConfigAuth } from './config.js'
import { logger } from './logger.js'

// ============================================================
// Response Types (matching actual API responses)
// ============================================================

interface AuthMeResponse {
  user: User
  authType: 'jwt' | 'api-token'
}

interface ProjectsListResponse {
  projects: Array<Omit<Project, 'userId'>>
}

interface ProjectResponse {
  project: Omit<Project, 'userId'>
}

interface ProjectPlanResponse {
  projectId: string
  projectName: string
  plan: string | null
  updatedAt: Date
}

interface TasksListResponse {
  projectId: string
  projectName: string
  tasks: Array<Omit<Task, 'projectId'>>
}

interface BulkUpdateTasksResponse {
  projectId: string
  projectName: string
  updatedCount: number
  tasks: Array<Omit<Task, 'projectId'>>
}

interface TokenVerifyResponse {
  user: {
    id: string
    email: string
    name: string
  }
  tokenName: string
}

interface MessageResponse {
  message: string
}

interface Notification {
  id: string
  userId: string
  type: 'comment' | 'status_change' | 'task_assigned' | 'task_blocked' | 'task_unblocked' | 'mention'
  message: string
  projectId: string | null
  projectName: string | null
  taskId: string | null
  taskName: string | null
  actorId: string | null
  actorName: string | null
  read: boolean
  createdAt: string
}

interface NotificationsListResponse {
  notifications: Notification[]
  unreadCount: number
  totalCount: number
}

interface NotificationResponse {
  notification: Notification
}

// ============================================================
// API Client Configuration
// ============================================================

const DEFAULT_TIMEOUT = 30000 // 30 seconds
const MAX_RETRIES = 3
const RETRY_DELAY = 1000 // 1 second base delay

/**
 * API Client for PlanFlow backend
 *
 * Provides typed methods for all API endpoints with:
 * - Automatic token loading from config
 * - Request timeout handling
 * - Retry logic for transient failures
 * - Proper error handling with typed errors
 */
export class ApiClient {
  private baseUrl: string
  private token: string | null
  private timeout: number

  constructor(options?: { timeout?: number }) {
    this.baseUrl = getApiUrl()
    this.token = null
    this.timeout = options?.timeout ?? DEFAULT_TIMEOUT
  }

  // ============================================================
  // Token Management
  // ============================================================

  /**
   * Set authentication token directly
   */
  setToken(token: string): void {
    this.token = token
    logger.debug('API token set')
  }

  /**
   * Clear the current token
   */
  clearToken(): void {
    this.token = null
    logger.debug('API token cleared')
  }

  /**
   * Load token from config file
   * @returns true if token was loaded successfully
   */
  loadToken(): boolean {
    try {
      this.token = getApiToken()
      logger.debug('API token loaded from config')
      return true
    } catch {
      this.token = null
      return false
    }
  }

  /**
   * Check if client has a token set
   */
  hasToken(): boolean {
    return this.token !== null
  }

  /**
   * Check if authenticated (has valid token in config)
   */
  isAuthenticated(): boolean {
    return checkConfigAuth()
  }

  /**
   * Get the current API base URL
   */
  getBaseUrl(): string {
    return this.baseUrl
  }

  // ============================================================
  // HTTP Request Methods
  // ============================================================

  /**
   * Make an authenticated HTTP request with retry logic
   */
  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown
      requireAuth?: boolean
      retries?: number
    }
  ): Promise<T> {
    const { body, requireAuth = true, retries = MAX_RETRIES } = options ?? {}

    // Check authentication if required
    if (requireAuth && !this.token) {
      throw new AuthError('Not authenticated. Please run planflow_login first.')
    }

    const url = `${this.baseUrl}${path}`
    logger.debug('API request', { method, url })

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), this.timeout)

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }

        if (this.token) {
          headers['Authorization'] = `Bearer ${this.token}`
        }

        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        // Parse response
        const data = (await response.json()) as ApiResponse<T>

        // Handle specific HTTP status codes
        if (response.status === 401) {
          throw new AuthError(
            data.error ?? 'Authentication failed. Your token may be invalid or expired.',
            { statusCode: 401 }
          )
        }

        if (response.status === 403) {
          throw new AuthError(
            data.error ?? 'Access denied. You do not have permission to perform this action.',
            { statusCode: 403 }
          )
        }

        if (response.status === 404) {
          throw new ApiError(data.error ?? 'Resource not found', 404)
        }

        if (response.status === 400) {
          throw new ApiError(data.error ?? 'Invalid request', 400, {
            details: (data as ApiResponse<T> & { details?: unknown }).details,
          })
        }

        if (response.status >= 500) {
          // Server errors are retryable
          throw new ApiError(
            data.error ?? `Server error (${response.status})`,
            response.status
          )
        }

        if (!response.ok) {
          throw new ApiError(
            data.error ?? `Request failed with status ${response.status}`,
            response.status
          )
        }

        // Check for success in response body
        if (!data.success) {
          throw new ApiError(data.error ?? 'Request failed')
        }

        if (data.data === undefined) {
          throw new ApiError('Empty response data')
        }

        logger.debug('API response success', { method, url, status: response.status })
        return data.data

      } catch (error) {
        lastError = error as Error

        // Don't retry on authentication errors
        if (error instanceof AuthError) {
          throw error
        }

        // Don't retry on client errors (4xx except 408, 429)
        if (error instanceof ApiError) {
          const status = error.statusCode
          if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
            throw error
          }
        }

        // Handle abort (timeout)
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new ApiError(`Request timeout after ${this.timeout}ms`, 408)
        }

        // Retry on transient errors
        if (attempt < retries) {
          const delay = RETRY_DELAY * Math.pow(2, attempt - 1) // Exponential backoff
          logger.debug('Retrying request', { attempt, delay, error: String(error) })
          await this.sleep(delay)
          continue
        }
      }
    }

    // All retries exhausted
    if (lastError instanceof ApiError || lastError instanceof AuthError) {
      throw lastError
    }

    throw new ApiError(
      `Network error: ${lastError?.message ?? 'Unknown error'}`,
      undefined,
      { originalError: String(lastError) }
    )
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // ============================================================
  // Auth Endpoints
  // ============================================================

  /**
   * Get current authenticated user info
   */
  async getCurrentUser(): Promise<AuthMeResponse> {
    return this.request<AuthMeResponse>('GET', '/auth/me')
  }

  /**
   * Verify an API token (can be used without authentication)
   */
  async verifyToken(token: string): Promise<TokenVerifyResponse> {
    return this.request<TokenVerifyResponse>('POST', '/api-tokens/verify', {
      body: { token },
      requireAuth: false,
    })
  }

  // ============================================================
  // Project Endpoints
  // ============================================================

  /**
   * List all projects for the authenticated user
   */
  async listProjects(): Promise<Array<Omit<Project, 'userId'>>> {
    const response = await this.request<ProjectsListResponse>('GET', '/projects')
    return response.projects
  }

  /**
   * Get a single project by ID
   */
  async getProject(id: string): Promise<Omit<Project, 'userId'>> {
    const response = await this.request<ProjectResponse>('GET', `/projects/${id}`)
    return response.project
  }

  /**
   * Create a new project
   */
  async createProject(data: CreateProjectRequest): Promise<Omit<Project, 'userId'>> {
    const response = await this.request<ProjectResponse>('POST', '/projects', {
      body: data,
    })
    return response.project
  }

  /**
   * Update an existing project
   */
  async updateProject(
    id: string,
    data: UpdateProjectRequest
  ): Promise<Omit<Project, 'userId'>> {
    const response = await this.request<ProjectResponse>('PUT', `/projects/${id}`, {
      body: data,
    })
    return response.project
  }

  /**
   * Delete a project
   */
  async deleteProject(id: string): Promise<void> {
    await this.request<MessageResponse>('DELETE', `/projects/${id}`)
  }

  /**
   * Get project plan content
   */
  async getProjectPlan(id: string): Promise<ProjectPlanResponse> {
    return this.request<ProjectPlanResponse>('GET', `/projects/${id}/plan`)
  }

  /**
   * Update project plan content
   */
  async updateProjectPlan(id: string, plan: string | null): Promise<ProjectPlanResponse> {
    return this.request<ProjectPlanResponse>('PUT', `/projects/${id}/plan`, {
      body: { plan },
    })
  }

  // ============================================================
  // Task Endpoints
  // ============================================================

  /**
   * List all tasks for a project
   */
  async listTasks(projectId: string): Promise<TasksListResponse> {
    return this.request<TasksListResponse>('GET', `/projects/${projectId}/tasks`)
  }

  /**
   * Update a single task by its task ID (e.g., "T1.1")
   * This is a convenience wrapper around bulkUpdateTasks
   */
  async updateTask(
    projectId: string,
    taskUuid: string,
    updates: UpdateTaskRequest
  ): Promise<Omit<Task, 'projectId'> | null> {
    const response = await this.bulkUpdateTasks(projectId, [
      { id: taskUuid, ...updates },
    ])
    return response.tasks[0] ?? null
  }

  /**
   * Update task status by task ID (e.g., "T1.1")
   * First fetches tasks to find the UUID, then updates
   */
  async updateTaskStatus(
    projectId: string,
    taskId: string,
    status: TaskStatus
  ): Promise<Omit<Task, 'projectId'> | null> {
    // Find the task by taskId
    const { tasks } = await this.listTasks(projectId)
    const task = tasks.find((t) => t.taskId === taskId)

    if (!task) {
      throw new ApiError(`Task ${taskId} not found in project`, 404)
    }

    return this.updateTask(projectId, task.id, { status })
  }

  /**
   * Bulk update multiple tasks
   */
  async bulkUpdateTasks(
    projectId: string,
    tasks: Array<{ id: string } & UpdateTaskRequest>
  ): Promise<BulkUpdateTasksResponse> {
    return this.request<BulkUpdateTasksResponse>('PUT', `/projects/${projectId}/tasks`, {
      body: { tasks },
    })
  }

  // ============================================================
  // Notification Endpoints
  // ============================================================

  /**
   * List notifications for the authenticated user
   */
  async listNotifications(options?: {
    projectId?: string
    unreadOnly?: boolean
    limit?: number
  }): Promise<NotificationsListResponse> {
    const params = new URLSearchParams()
    if (options?.projectId) params.append('projectId', options.projectId)
    if (options?.unreadOnly) params.append('unreadOnly', 'true')
    if (options?.limit) params.append('limit', String(options.limit))

    const query = params.toString()
    const path = `/notifications${query ? '?' + query : ''}`
    return this.request<NotificationsListResponse>('GET', path)
  }

  /**
   * Mark a notification as read
   */
  async markNotificationRead(notificationId: string): Promise<NotificationResponse> {
    return this.request<NotificationResponse>('PUT', `/notifications/${notificationId}/read`)
  }

  /**
   * Mark all notifications as read
   */
  async markAllNotificationsRead(projectId?: string): Promise<{ markedCount: number }> {
    const body = projectId ? { projectId } : undefined
    return this.request<{ markedCount: number }>('PUT', '/notifications/read-all', { body })
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  /**
   * Health check - verify API is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Get API information
   */
  async getApiInfo(): Promise<{ name: string; version: string; status: string }> {
    const response = await fetch(`${this.baseUrl}/`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      throw new ApiError('Failed to get API info', response.status)
    }

    return response.json() as Promise<{ name: string; version: string; status: string }>
  }
}

// ============================================================
// Singleton Management
// ============================================================

let apiClient: ApiClient | null = null

/**
 * Get the singleton API client instance
 * Automatically loads token from config on first access
 */
export function getApiClient(): ApiClient {
  if (!apiClient) {
    apiClient = new ApiClient()
    apiClient.loadToken()
  }
  return apiClient
}

/**
 * Reset the API client singleton
 * Useful for testing or when re-authenticating
 */
export function resetApiClient(): void {
  apiClient = null
}

/**
 * Create a new API client with custom options
 * Does not affect the singleton
 */
export function createApiClient(options?: { timeout?: number }): ApiClient {
  return new ApiClient(options)
}
