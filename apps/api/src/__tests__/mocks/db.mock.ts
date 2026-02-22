/**
 * Database Mock Utilities
 * Provides mock implementations for database operations
 */

import { vi } from 'vitest'

// Mock data factories
export const createMockUser = (overrides: Partial<MockUser> = {}): MockUser => ({
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  passwordHash: '$2b$12$mockHashedPassword',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
})

export const createMockProject = (overrides: Partial<MockProject> = {}): MockProject => ({
  id: 'project-123',
  name: 'Test Project',
  description: 'Test description',
  ownerId: 'user-123',
  organizationId: null,
  planContent: '# Test Plan',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
})

export const createMockApiToken = (overrides: Partial<MockApiToken> = {}): MockApiToken => ({
  id: 'token-123',
  userId: 'user-123',
  name: 'Test Token',
  tokenHash: 'mock-hash',
  lastUsedAt: null,
  expiresAt: null,
  isRevoked: false,
  createdAt: new Date('2024-01-01'),
  ...overrides,
})

export const createMockRefreshToken = (overrides: Partial<MockRefreshToken> = {}): MockRefreshToken => ({
  id: 'refresh-123',
  userId: 'user-123',
  tokenHash: 'mock-refresh-hash',
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  isRevoked: false,
  createdAt: new Date('2024-01-01'),
  ...overrides,
})

export const createMockSubscription = (overrides: Partial<MockSubscription> = {}): MockSubscription => ({
  id: 'sub-123',
  userId: 'user-123',
  tier: 'free',
  status: 'active',
  lemonSqueezyCustomerId: null,
  lemonSqueezySubscriptionId: null,
  currentPeriodEnd: null,
  canceledAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
})

// Types
export interface MockUser {
  id: string
  email: string
  name: string | null
  passwordHash: string
  createdAt: Date
  updatedAt: Date
}

export interface MockProject {
  id: string
  name: string
  description: string | null
  ownerId: string
  organizationId: string | null
  planContent: string | null
  createdAt: Date
  updatedAt: Date
}

export interface MockApiToken {
  id: string
  userId: string
  name: string
  tokenHash: string
  lastUsedAt: Date | null
  expiresAt: Date | null
  isRevoked: boolean
  createdAt: Date
}

export interface MockRefreshToken {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  isRevoked: boolean
  createdAt: Date
}

export interface MockSubscription {
  id: string
  userId: string
  tier: string
  status: string
  lemonSqueezyCustomerId: string | null
  lemonSqueezySubscriptionId: string | null
  currentPeriodEnd: Date | null
  canceledAt: Date | null
  createdAt: Date
  updatedAt: Date
}

// Database mock builder
export interface MockDbQueryResult<T> {
  data: T[]
}

export function createMockDbClient() {
  const mockSelect = vi.fn()
  const mockFrom = vi.fn()
  const mockWhere = vi.fn()
  const mockLimit = vi.fn()
  const mockOrderBy = vi.fn()
  const mockInsert = vi.fn()
  const mockValues = vi.fn()
  const mockReturning = vi.fn()
  const mockUpdate = vi.fn()
  const mockSet = vi.fn()
  const mockDelete = vi.fn()

  // Chain configuration helpers
  let mockReturnData: unknown[] = []

  const configureReturn = (data: unknown[]) => {
    mockReturnData = data
    mockLimit.mockResolvedValue(data)
    mockReturning.mockResolvedValue(data)
    mockOrderBy.mockResolvedValue(data)
    mockWhere.mockReturnValue({
      limit: mockLimit,
      orderBy: mockOrderBy,
      returning: mockReturning,
    })
  }

  // Reset helper
  const reset = () => {
    mockReturnData = []
    vi.clearAllMocks()
    setupChaining()
  }

  // Setup method chaining
  const setupChaining = () => {
    mockSelect.mockReturnValue({ from: mockFrom })
    mockFrom.mockReturnValue({ where: mockWhere, orderBy: mockOrderBy, limit: mockLimit })
    mockWhere.mockReturnValue({ limit: mockLimit, orderBy: mockOrderBy, returning: mockReturning })
    mockLimit.mockResolvedValue([])
    mockOrderBy.mockResolvedValue([])
    mockReturning.mockResolvedValue([])

    mockInsert.mockReturnValue({ values: mockValues })
    mockValues.mockReturnValue({ returning: mockReturning })

    mockUpdate.mockReturnValue({ set: mockSet })
    mockSet.mockReturnValue({ where: mockWhere })

    mockDelete.mockReturnValue({ where: mockWhere })
  }

  setupChaining()

  return {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    // Internal mocks for assertions
    _mocks: {
      select: mockSelect,
      from: mockFrom,
      where: mockWhere,
      limit: mockLimit,
      orderBy: mockOrderBy,
      insert: mockInsert,
      values: mockValues,
      returning: mockReturning,
      update: mockUpdate,
      set: mockSet,
      delete: mockDelete,
    },
    // Helpers
    configureReturn,
    reset,
  }
}

export type MockDbClient = ReturnType<typeof createMockDbClient>
