/**
 * Test Utilities for MCP Tool Integration Tests
 *
 * Provides mock factories, fixtures, and helper functions for testing.
 */

import { vi } from 'vitest'
import type { ApiClient } from '../api-client.js'

// ============================================================
// Type Definitions for Mock Data
// ============================================================

export interface MockUser {
  id: string
  email: string
  name: string
}

export interface MockProject {
  id: string
  name: string
  description: string | null
  plan: string | null
  createdAt: Date
  updatedAt: Date
}

export interface MockTask {
  id: string
  taskId: string
  name: string
  description: string | null
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
  complexity: 'Low' | 'Medium' | 'High'
  estimatedHours: number | null
  dependencies: string[]
  order: number
  createdAt: Date
  updatedAt: Date
}

export interface MockNotification {
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

// ============================================================
// Test Fixtures
// ============================================================

export const fixtures = {
  user: (): MockUser => ({
    id: '550e8400-e29b-41d4-a716-446655440000',
    email: 'test@example.com',
    name: 'Test User',
  }),

  project: (overrides?: Partial<MockProject>): MockProject => ({
    id: '660e8400-e29b-41d4-a716-446655440001',
    name: 'Test Project',
    description: 'A test project description',
    plan: '# Test Plan\n\n## Phase 1\n\n- [ ] Task 1',
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-20T15:30:00Z'),
    ...overrides,
  }),

  task: (overrides?: Partial<MockTask>): MockTask => ({
    id: '770e8400-e29b-41d4-a716-446655440002',
    taskId: 'T1.1',
    name: 'Setup project structure',
    description: 'Initialize the project with basic folder structure',
    status: 'TODO',
    complexity: 'Low',
    estimatedHours: 2,
    dependencies: [],
    order: 1,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  }),

  notification: (overrides?: Partial<MockNotification>): MockNotification => ({
    id: '880e8400-e29b-41d4-a716-446655440003',
    userId: '550e8400-e29b-41d4-a716-446655440000',
    type: 'status_change',
    message: 'Task T1.1 was marked as DONE',
    projectId: '660e8400-e29b-41d4-a716-446655440001',
    projectName: 'Test Project',
    taskId: 'T1.1',
    taskName: 'Setup project structure',
    actorId: '550e8400-e29b-41d4-a716-446655440000',
    actorName: 'Test User',
    read: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  }),

  tokenVerifyResponse: () => ({
    user: fixtures.user(),
    tokenName: 'Test Token',
  }),
}

// ============================================================
// Mock API Client Factory
// ============================================================

export interface MockApiClientOptions {
  isAuthenticated?: boolean
  user?: MockUser
  projects?: MockProject[]
  tasks?: MockTask[]
  notifications?: MockNotification[]
  plan?: string | null
  shouldThrow?: {
    method: string
    error: Error
  }
}

export function createMockApiClient(options: MockApiClientOptions = {}): Partial<ApiClient> {
  const {
    isAuthenticated = true,
    user = fixtures.user(),
    projects = [fixtures.project()],
    tasks = [fixtures.task()],
    notifications = [fixtures.notification()],
    plan = '# Test Plan',
    shouldThrow,
  } = options

  const throwIfConfigured = (method: string) => {
    if (shouldThrow && shouldThrow.method === method) {
      throw shouldThrow.error
    }
  }

  return {
    setToken: vi.fn(),
    clearToken: vi.fn(),
    loadToken: vi.fn().mockReturnValue(isAuthenticated),
    hasToken: vi.fn().mockReturnValue(isAuthenticated),
    isAuthenticated: vi.fn().mockReturnValue(isAuthenticated),
    getBaseUrl: vi.fn().mockReturnValue('https://api.planflow.tools'),

    getCurrentUser: vi.fn().mockImplementation(async () => {
      throwIfConfigured('getCurrentUser')
      return { user, authType: 'api-token' as const }
    }),

    verifyToken: vi.fn().mockImplementation(async (token: string) => {
      throwIfConfigured('verifyToken')
      if (token === 'invalid-token') {
        const { AuthError } = await import('../errors.js')
        throw new AuthError('Invalid token')
      }
      return { user, tokenName: 'Test Token' }
    }),

    listProjects: vi.fn().mockImplementation(async () => {
      throwIfConfigured('listProjects')
      return projects
    }),

    getProject: vi.fn().mockImplementation(async (id: string) => {
      throwIfConfigured('getProject')
      const project = projects.find((p) => p.id === id)
      if (!project) {
        const { ApiError } = await import('../errors.js')
        throw new ApiError('Project not found', 404)
      }
      return project
    }),

    createProject: vi.fn().mockImplementation(async (data: { name: string; description?: string }) => {
      throwIfConfigured('createProject')
      return fixtures.project({
        id: '990e8400-e29b-41d4-a716-446655440004',
        name: data.name,
        description: data.description ?? null,
      })
    }),

    updateProject: vi.fn().mockImplementation(async (id: string, data: Partial<MockProject>) => {
      throwIfConfigured('updateProject')
      const project = projects.find((p) => p.id === id)
      if (!project) {
        const { ApiError } = await import('../errors.js')
        throw new ApiError('Project not found', 404)
      }
      return { ...project, ...data }
    }),

    deleteProject: vi.fn().mockImplementation(async (id: string) => {
      throwIfConfigured('deleteProject')
      const project = projects.find((p) => p.id === id)
      if (!project) {
        const { ApiError } = await import('../errors.js')
        throw new ApiError('Project not found', 404)
      }
    }),

    getProjectPlan: vi.fn().mockImplementation(async (id: string) => {
      throwIfConfigured('getProjectPlan')
      const project = projects.find((p) => p.id === id)
      if (!project) {
        const { ApiError } = await import('../errors.js')
        throw new ApiError('Project not found', 404)
      }
      return {
        projectId: id,
        projectName: project.name,
        plan: plan,
        updatedAt: new Date(),
      }
    }),

    updateProjectPlan: vi.fn().mockImplementation(async (id: string, newPlan: string) => {
      throwIfConfigured('updateProjectPlan')
      const project = projects.find((p) => p.id === id)
      if (!project) {
        const { ApiError } = await import('../errors.js')
        throw new ApiError('Project not found', 404)
      }
      return {
        projectId: id,
        projectName: project.name,
        plan: newPlan,
        updatedAt: new Date(),
      }
    }),

    listTasks: vi.fn().mockImplementation(async (projectId: string) => {
      throwIfConfigured('listTasks')
      const project = projects.find((p) => p.id === projectId)
      if (!project) {
        const { ApiError } = await import('../errors.js')
        throw new ApiError('Project not found', 404)
      }
      return {
        projectId,
        projectName: project.name,
        tasks,
      }
    }),

    updateTask: vi.fn().mockImplementation(async (projectId: string, taskUuid: string, updates: Partial<MockTask>) => {
      throwIfConfigured('updateTask')
      const task = tasks.find((t) => t.id === taskUuid)
      if (!task) {
        return null
      }
      return { ...task, ...updates }
    }),

    updateTaskStatus: vi.fn().mockImplementation(async (projectId: string, taskId: string, status: MockTask['status']) => {
      throwIfConfigured('updateTaskStatus')
      const task = tasks.find((t) => t.taskId === taskId)
      if (!task) {
        const { ApiError } = await import('../errors.js')
        throw new ApiError(`Task ${taskId} not found in project`, 404)
      }
      return { ...task, status }
    }),

    bulkUpdateTasks: vi.fn().mockImplementation(async (projectId: string, taskUpdates: Array<{ id: string } & Partial<MockTask>>) => {
      throwIfConfigured('bulkUpdateTasks')
      const updatedTasks = taskUpdates.map((update) => {
        const task = tasks.find((t) => t.id === update.id)
        return task ? { ...task, ...update } : null
      }).filter(Boolean)
      return {
        projectId,
        projectName: 'Test Project',
        updatedCount: updatedTasks.length,
        tasks: updatedTasks,
      }
    }),

    listNotifications: vi.fn().mockImplementation(async (options?: { projectId?: string; unreadOnly?: boolean; limit?: number }) => {
      throwIfConfigured('listNotifications')
      let filtered = [...notifications]
      if (options?.projectId) {
        filtered = filtered.filter((n) => n.projectId === options.projectId)
      }
      if (options?.unreadOnly) {
        filtered = filtered.filter((n) => !n.read)
      }
      if (options?.limit) {
        filtered = filtered.slice(0, options.limit)
      }
      return {
        notifications: filtered,
        unreadCount: filtered.filter((n) => !n.read).length,
        totalCount: notifications.length,
      }
    }),

    markNotificationRead: vi.fn().mockImplementation(async (notificationId: string) => {
      throwIfConfigured('markNotificationRead')
      const notification = notifications.find((n) => n.id === notificationId)
      if (!notification) {
        const { ApiError } = await import('../errors.js')
        throw new ApiError('Notification not found', 404)
      }
      return { notification: { ...notification, read: true } }
    }),

    markAllNotificationsRead: vi.fn().mockImplementation(async (projectId?: string) => {
      throwIfConfigured('markAllNotificationsRead')
      const filtered = projectId
        ? notifications.filter((n) => n.projectId === projectId && !n.read)
        : notifications.filter((n) => !n.read)
      return { markedCount: filtered.length }
    }),

    healthCheck: vi.fn().mockResolvedValue(true),
    getApiInfo: vi.fn().mockResolvedValue({ name: 'PlanFlow API', version: '1.0.0', status: 'healthy' }),
  }
}

// ============================================================
// Mock Config Functions
// ============================================================

export function createMockConfig(options: { isAuthenticated?: boolean; user?: MockUser } = {}) {
  const { isAuthenticated = true, user = fixtures.user() } = options

  return {
    loadConfig: vi.fn().mockReturnValue({
      apiToken: isAuthenticated ? 'mock-token-12345' : undefined,
      apiUrl: 'https://api.planflow.tools',
      userId: isAuthenticated ? user.id : undefined,
      userEmail: isAuthenticated ? user.email : undefined,
    }),
    saveConfig: vi.fn().mockImplementation((config) => config),
    clearCredentials: vi.fn(),
    isAuthenticated: vi.fn().mockReturnValue(isAuthenticated),
    getApiToken: vi.fn().mockImplementation(() => {
      if (!isAuthenticated) {
        throw new Error('Not authenticated')
      }
      return 'mock-token-12345'
    }),
    getApiUrl: vi.fn().mockReturnValue('https://api.planflow.tools'),
  }
}

// ============================================================
// Result Helpers
// ============================================================

/**
 * Extract text content from a tool result
 */
export function getResultText(result: { content: Array<{ type: string; text?: string }> }): string {
  const textContent = result.content.find((c) => c.type === 'text')
  return textContent?.text ?? ''
}

/**
 * Check if result is an error
 */
export function isErrorResult(result: { isError?: boolean }): boolean {
  return result.isError === true
}

/**
 * Assert result is successful
 */
export function assertSuccess(result: { isError?: boolean; content: Array<{ type: string; text?: string }> }): string {
  if (isErrorResult(result)) {
    throw new Error(`Expected success but got error: ${getResultText(result)}`)
  }
  return getResultText(result)
}

/**
 * Assert result is an error
 */
export function assertError(result: { isError?: boolean; content: Array<{ type: string; text?: string }> }): string {
  if (!isErrorResult(result)) {
    throw new Error(`Expected error but got success: ${getResultText(result)}`)
  }
  return getResultText(result)
}
