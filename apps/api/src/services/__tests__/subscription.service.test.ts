/**
 * Subscription Service Unit Tests
 * Tests for subscription and billing business logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database module
vi.mock('../../db/index.js', () => ({
  getDbClient: vi.fn(),
  schema: {
    subscriptions: {
      id: 'id',
      userId: 'userId',
      tier: 'tier',
      status: 'status',
      lemonSqueezyCustomerId: 'lemonSqueezyCustomerId',
      lemonSqueezySubscriptionId: 'lemonSqueezySubscriptionId',
      currentPeriodStart: 'currentPeriodStart',
      currentPeriodEnd: 'currentPeriodEnd',
      canceledAt: 'canceledAt',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    users: {
      id: 'id',
      email: 'email',
    },
  },
}))

// Mock LemonSqueezy functions
vi.mock('../../lib/lemonsqueezy.js', () => ({
  createCheckoutUrl: vi.fn(() => Promise.resolve('https://checkout.lemonsqueezy.com/mock')),
  createCustomerPortalUrl: vi.fn(() => 'https://app.lemonsqueezy.com/my-orders/mock'),
  getVariantIdForTier: vi.fn((tier: string) => {
    const variants: Record<string, string> = {
      pro: 'variant-pro',
      team: 'variant-team',
    }
    return variants[tier] || null
  }),
  getTierFromVariantId: vi.fn((variantId: string) => {
    const tiers: Record<string, string> = {
      'variant-pro': 'pro',
      'variant-team': 'team',
    }
    return tiers[variantId] || null
  }),
  mapLemonSqueezyStatus: vi.fn((status: string) => {
    const statusMap: Record<string, string> = {
      active: 'active',
      cancelled: 'canceled',
      on_trial: 'trialing',
      past_due: 'past_due',
      paused: 'past_due',
      expired: 'canceled',
    }
    return statusMap[status] || 'active'
  }),
}))

import { getDbClient } from '../../db/index.js'
import { SubscriptionService } from '../subscription.service.js'
import {
  NotFoundError,
  ServiceError,
} from '../errors.js'

describe('SubscriptionService', () => {
  let subscriptionService: SubscriptionService
  let mockDb: ReturnType<typeof createMockDb>

  function createMockDb() {
    const mockSelect = vi.fn()
    const mockFrom = vi.fn()
    const mockWhere = vi.fn()
    const mockLimit = vi.fn()
    const mockInsert = vi.fn()
    const mockValues = vi.fn()
    const mockReturning = vi.fn()
    const mockUpdate = vi.fn()
    const mockSet = vi.fn()
    const mockOnConflictDoUpdate = vi.fn()

    // Set up chaining
    mockSelect.mockReturnValue({ from: mockFrom })
    mockFrom.mockReturnValue({ where: mockWhere, limit: mockLimit })
    mockWhere.mockReturnValue({ limit: mockLimit, returning: mockReturning })
    mockLimit.mockResolvedValue([])
    mockReturning.mockResolvedValue([])
    mockInsert.mockReturnValue({ values: mockValues })
    mockValues.mockReturnValue({ returning: mockReturning, onConflictDoUpdate: mockOnConflictDoUpdate })
    mockOnConflictDoUpdate.mockResolvedValue([])
    mockUpdate.mockReturnValue({ set: mockSet })
    mockSet.mockReturnValue({ where: mockWhere })

    return {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      _mocks: {
        select: mockSelect,
        from: mockFrom,
        where: mockWhere,
        limit: mockLimit,
        insert: mockInsert,
        values: mockValues,
        returning: mockReturning,
        update: mockUpdate,
        set: mockSet,
        onConflictDoUpdate: mockOnConflictDoUpdate,
      },
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb = createMockDb()
    vi.mocked(getDbClient).mockReturnValue(mockDb as never)
    subscriptionService = new SubscriptionService()
  })

  describe('getCurrentSubscription', () => {
    it('should return existing subscription', async () => {
      const mockSubscription = {
        id: 'sub-123',
        userId: 'user-123',
        tier: 'pro',
        status: 'active',
        lemonSqueezyCustomerId: 'ls-customer-123',
        lemonSqueezySubscriptionId: 'ls-sub-123',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        canceledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.limit.mockResolvedValueOnce([mockSubscription])

      const result = await subscriptionService.getCurrentSubscription('user-123')

      expect(result.id).toBe('sub-123')
      expect(result.tier).toBe('pro')
      expect(result.status).toBe('active')
    })

    it('should create free tier subscription if none exists', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([]) // No existing subscription
      const mockNewSubscription = {
        id: 'sub-new',
        userId: 'user-123',
        tier: 'free',
        status: 'active',
        lemonSqueezyCustomerId: null,
        lemonSqueezySubscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        canceledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.returning.mockResolvedValueOnce([mockNewSubscription])

      const result = await subscriptionService.getCurrentSubscription('user-123')

      expect(result.tier).toBe('free')
      expect(result.status).toBe('active')
      expect(mockDb.insert).toHaveBeenCalled()
    })

    it('should throw ServiceError if subscription creation fails', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([])
      mockDb._mocks.returning.mockResolvedValueOnce([])

      await expect(subscriptionService.getCurrentSubscription('user-123'))
        .rejects.toThrow(ServiceError)
    })
  })

  describe('createCheckout', () => {
    it('should create checkout URL for pro tier', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([{ email: 'test@example.com' }])

      const result = await subscriptionService.createCheckout('user-123', {
        tier: 'pro',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })

      expect(result).toBe('https://checkout.lemonsqueezy.com/mock')
    })

    it('should create checkout URL for team tier', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([{ email: 'test@example.com' }])

      const result = await subscriptionService.createCheckout('user-123', {
        tier: 'team',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })

      expect(result).toBe('https://checkout.lemonsqueezy.com/mock')
    })

    it('should throw NotFoundError if user not found', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([])

      await expect(subscriptionService.createCheckout('nonexistent', {
        tier: 'pro',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
      })).rejects.toThrow(NotFoundError)
    })
  })

  describe('createPortalUrl', () => {
    it('should create portal URL for existing customer', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([{
        lemonSqueezyCustomerId: 'ls-customer-123',
      }])

      const result = await subscriptionService.createPortalUrl('user-123')

      expect(result).toBe('https://app.lemonsqueezy.com/my-orders/mock')
    })

    it('should throw NotFoundError if no billing account', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([])

      await expect(subscriptionService.createPortalUrl('user-123'))
        .rejects.toThrow(NotFoundError)
    })

    it('should throw NotFoundError if customer ID is null', async () => {
      mockDb._mocks.limit.mockResolvedValueOnce([{
        lemonSqueezyCustomerId: null,
      }])

      await expect(subscriptionService.createPortalUrl('user-123'))
        .rejects.toThrow(NotFoundError)
    })
  })

  describe('handleSubscriptionCreatedOrUpdated', () => {
    it('should update subscription on webhook', async () => {
      await subscriptionService.handleSubscriptionCreatedOrUpdated({
        userId: 'user-123',
        variantId: 'variant-pro',
        status: 'active',
        customerId: 'ls-customer-123',
        subscriptionId: 'ls-sub-123',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })

      expect(mockDb.insert).toHaveBeenCalled()
      expect(mockDb._mocks.onConflictDoUpdate).toHaveBeenCalled()
    })

    it('should throw ServiceError if userId missing', async () => {
      await expect(subscriptionService.handleSubscriptionCreatedOrUpdated({
        userId: '',
        variantId: 'variant-pro',
      })).rejects.toThrow(ServiceError)
    })

    it('should throw ServiceError if variant ID unknown', async () => {
      await expect(subscriptionService.handleSubscriptionCreatedOrUpdated({
        userId: 'user-123',
        variantId: 'unknown-variant',
      })).rejects.toThrow(ServiceError)
    })
  })

  describe('handleSubscriptionCancelled', () => {
    it('should update subscription to canceled status', async () => {
      await subscriptionService.handleSubscriptionCancelled('user-123', new Date())

      expect(mockDb.update).toHaveBeenCalled()
      expect(mockDb._mocks.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'canceled',
        })
      )
    })
  })

  describe('handleSubscriptionResumed', () => {
    it('should update subscription to active status', async () => {
      await subscriptionService.handleSubscriptionResumed('user-123', 'active')

      expect(mockDb.update).toHaveBeenCalled()
      expect(mockDb._mocks.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
          canceledAt: null,
        })
      )
    })
  })

  describe('handlePaymentSuccess', () => {
    it('should update subscription to active with new period', async () => {
      const renewsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

      await subscriptionService.handlePaymentSuccess('user-123', renewsAt)

      expect(mockDb.update).toHaveBeenCalled()
      expect(mockDb._mocks.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
          currentPeriodEnd: renewsAt,
        })
      )
    })
  })

  describe('handlePaymentFailed', () => {
    it('should update subscription to past_due status', async () => {
      await subscriptionService.handlePaymentFailed('user-123')

      expect(mockDb.update).toHaveBeenCalled()
      expect(mockDb._mocks.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'past_due',
        })
      )
    })
  })

  describe('handleOrderRefunded', () => {
    it('should downgrade to free tier', async () => {
      await subscriptionService.handleOrderRefunded('user-123')

      expect(mockDb.update).toHaveBeenCalled()
      expect(mockDb._mocks.set).toHaveBeenCalledWith(
        expect.objectContaining({
          tier: 'free',
          status: 'canceled',
        })
      )
    })
  })

  describe('handleSubscriptionExpired', () => {
    it('should downgrade to free tier on expiration', async () => {
      await subscriptionService.handleSubscriptionExpired('user-123')

      expect(mockDb.update).toHaveBeenCalled()
      expect(mockDb._mocks.set).toHaveBeenCalledWith(
        expect.objectContaining({
          tier: 'free',
          status: 'canceled',
        })
      )
    })
  })

  describe('hasPaidSubscription', () => {
    it('should return true for active pro subscription', async () => {
      const mockSubscription = {
        id: 'sub-123',
        userId: 'user-123',
        tier: 'pro',
        status: 'active',
        lemonSqueezyCustomerId: null,
        lemonSqueezySubscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        canceledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.limit.mockResolvedValueOnce([mockSubscription])

      const result = await subscriptionService.hasPaidSubscription('user-123')

      expect(result).toBe(true)
    })

    it('should return false for free tier', async () => {
      const mockSubscription = {
        id: 'sub-123',
        userId: 'user-123',
        tier: 'free',
        status: 'active',
        lemonSqueezyCustomerId: null,
        lemonSqueezySubscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        canceledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.limit.mockResolvedValueOnce([mockSubscription])

      const result = await subscriptionService.hasPaidSubscription('user-123')

      expect(result).toBe(false)
    })

    it('should return false for canceled paid subscription', async () => {
      const mockSubscription = {
        id: 'sub-123',
        userId: 'user-123',
        tier: 'pro',
        status: 'canceled',
        lemonSqueezyCustomerId: null,
        lemonSqueezySubscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        canceledAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.limit.mockResolvedValueOnce([mockSubscription])

      const result = await subscriptionService.hasPaidSubscription('user-123')

      expect(result).toBe(false)
    })
  })

  describe('getSubscriptionTier', () => {
    it('should return the subscription tier', async () => {
      const mockSubscription = {
        id: 'sub-123',
        userId: 'user-123',
        tier: 'team',
        status: 'active',
        lemonSqueezyCustomerId: null,
        lemonSqueezySubscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        canceledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.limit.mockResolvedValueOnce([mockSubscription])

      const result = await subscriptionService.getSubscriptionTier('user-123')

      expect(result).toBe('team')
    })
  })

  describe('hasFeatureAccess', () => {
    it('should return true for features available in tier', async () => {
      const mockSubscription = {
        id: 'sub-123',
        userId: 'user-123',
        tier: 'pro',
        status: 'active',
        lemonSqueezyCustomerId: null,
        lemonSqueezySubscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        canceledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.limit.mockResolvedValueOnce([mockSubscription])

      const result = await subscriptionService.hasFeatureAccess('user-123', 'github_integration')

      expect(result).toBe(true)
    })

    it('should return false for features not in tier', async () => {
      const mockSubscription = {
        id: 'sub-123',
        userId: 'user-123',
        tier: 'free',
        status: 'active',
        lemonSqueezyCustomerId: null,
        lemonSqueezySubscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        canceledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.limit.mockResolvedValueOnce([mockSubscription])

      const result = await subscriptionService.hasFeatureAccess('user-123', 'github_integration')

      expect(result).toBe(false)
    })

    it('should return true for basic features in free tier', async () => {
      const mockSubscription = {
        id: 'sub-123',
        userId: 'user-123',
        tier: 'free',
        status: 'active',
        lemonSqueezyCustomerId: null,
        lemonSqueezySubscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        canceledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.limit.mockResolvedValueOnce([mockSubscription])

      const result = await subscriptionService.hasFeatureAccess('user-123', 'basic_projects')

      expect(result).toBe(true)
    })

    it('should return true for team features in team tier', async () => {
      const mockSubscription = {
        id: 'sub-123',
        userId: 'user-123',
        tier: 'team',
        status: 'active',
        lemonSqueezyCustomerId: null,
        lemonSqueezySubscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        canceledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.limit.mockResolvedValueOnce([mockSubscription])

      const result = await subscriptionService.hasFeatureAccess('user-123', 'team_management')

      expect(result).toBe(true)
    })

    it('should return true for enterprise features in enterprise tier', async () => {
      const mockSubscription = {
        id: 'sub-123',
        userId: 'user-123',
        tier: 'enterprise',
        status: 'active',
        lemonSqueezyCustomerId: null,
        lemonSqueezySubscriptionId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        canceledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      mockDb._mocks.limit.mockResolvedValueOnce([mockSubscription])

      const result = await subscriptionService.hasFeatureAccess('user-123', 'self_hosted')

      expect(result).toBe(true)
    })
  })
})
