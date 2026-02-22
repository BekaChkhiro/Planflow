/**
 * Subscription Service
 * Handles subscription management, billing, and LemonSqueezy integration
 */

import { eq } from 'drizzle-orm'
import { getDbClient, schema } from '../db/index.js'
import {
  createCheckoutUrl,
  createCustomerPortalUrl,
  getVariantIdForTier,
  getTierFromVariantId,
  mapLemonSqueezyStatus,
} from '../lib/lemonsqueezy.js'
import {
  NotFoundError,
  ServiceError,
} from './errors.js'

// Types
export interface Subscription {
  id: string
  userId: string
  tier: string
  status: string
  lemonSqueezyCustomerId: string | null
  lemonSqueezySubscriptionId: string | null
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  canceledAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateCheckoutInput {
  tier: 'pro' | 'team'
  successUrl: string
  cancelUrl: string
}

export interface SubscriptionWebhookData {
  userId: string
  variantId?: string
  status?: string
  customerId?: string
  subscriptionId?: string
  currentPeriodStart?: Date
  currentPeriodEnd?: Date
  canceledAt?: Date | null
}

/**
 * SubscriptionService - Handles subscription and billing operations
 */
export class SubscriptionService {
  private db = getDbClient()

  /**
   * Get current subscription for a user (creates free tier if none exists)
   */
  async getCurrentSubscription(userId: string): Promise<Subscription> {
    // Try to find existing subscription
    let [subscription] = await this.db
      .select({
        id: schema.subscriptions.id,
        userId: schema.subscriptions.userId,
        tier: schema.subscriptions.tier,
        status: schema.subscriptions.status,
        lemonSqueezyCustomerId: schema.subscriptions.lemonSqueezyCustomerId,
        lemonSqueezySubscriptionId: schema.subscriptions.lemonSqueezySubscriptionId,
        currentPeriodStart: schema.subscriptions.currentPeriodStart,
        currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
        canceledAt: schema.subscriptions.canceledAt,
        createdAt: schema.subscriptions.createdAt,
        updatedAt: schema.subscriptions.updatedAt,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId))
      .limit(1)

    // If no subscription exists, create a free tier one
    if (!subscription) {
      ;[subscription] = await this.db
        .insert(schema.subscriptions)
        .values({
          userId,
          tier: 'free',
          status: 'active',
        })
        .returning({
          id: schema.subscriptions.id,
          userId: schema.subscriptions.userId,
          tier: schema.subscriptions.tier,
          status: schema.subscriptions.status,
          lemonSqueezyCustomerId: schema.subscriptions.lemonSqueezyCustomerId,
          lemonSqueezySubscriptionId: schema.subscriptions.lemonSqueezySubscriptionId,
          currentPeriodStart: schema.subscriptions.currentPeriodStart,
          currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
          canceledAt: schema.subscriptions.canceledAt,
          createdAt: schema.subscriptions.createdAt,
          updatedAt: schema.subscriptions.updatedAt,
        })

      if (!subscription) {
        throw new ServiceError('Failed to create subscription', 'SUBSCRIPTION_CREATION_FAILED', 500)
      }
    }

    return subscription
  }

  /**
   * Create a checkout URL for upgrading subscription
   */
  async createCheckout(userId: string, input: CreateCheckoutInput): Promise<string> {
    const { tier, successUrl, cancelUrl } = input

    // Get user email
    const [userData] = await this.db
      .select({ email: schema.users.email })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)

    if (!userData) {
      throw new NotFoundError('User', userId)
    }

    // Get variant ID for the tier
    const variantId = getVariantIdForTier(tier)

    // Create checkout URL
    const checkoutUrl = await createCheckoutUrl({
      variantId,
      userId,
      userEmail: userData.email,
      successUrl,
      cancelUrl,
    })

    return checkoutUrl
  }

  /**
   * Create customer portal URL for managing subscription
   */
  async createPortalUrl(userId: string): Promise<string> {
    // Get user's subscription to find LemonSqueezy customer ID
    const [subscription] = await this.db
      .select({
        lemonSqueezyCustomerId: schema.subscriptions.lemonSqueezyCustomerId,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId))
      .limit(1)

    if (!subscription?.lemonSqueezyCustomerId) {
      throw new NotFoundError('Billing account')
    }

    // Create customer portal URL
    return createCustomerPortalUrl(subscription.lemonSqueezyCustomerId)
  }

  /**
   * Handle subscription created or updated webhook
   */
  async handleSubscriptionCreatedOrUpdated(data: SubscriptionWebhookData): Promise<void> {
    const { userId, variantId, status, customerId, subscriptionId, currentPeriodStart, currentPeriodEnd } = data

    if (!userId) {
      throw new ServiceError('Missing user_id in webhook data', 'WEBHOOK_INVALID_DATA', 400)
    }

    // Map variant to tier
    const tier = variantId ? getTierFromVariantId(variantId) : null
    if (!tier) {
      throw new ServiceError(`Unknown variant ID: ${variantId}`, 'WEBHOOK_INVALID_VARIANT', 400)
    }

    // Map status
    const mappedStatus = mapLemonSqueezyStatus(status || 'active')

    // Upsert subscription
    await this.db
      .insert(schema.subscriptions)
      .values({
        userId,
        tier,
        status: mappedStatus,
        lemonSqueezyCustomerId: customerId ?? null,
        lemonSqueezySubscriptionId: subscriptionId ?? null,
        currentPeriodStart: currentPeriodStart ?? new Date(),
        currentPeriodEnd: currentPeriodEnd ?? null,
      })
      .onConflictDoUpdate({
        target: schema.subscriptions.userId,
        set: {
          tier,
          status: mappedStatus,
          lemonSqueezyCustomerId: customerId ?? null,
          lemonSqueezySubscriptionId: subscriptionId ?? null,
          currentPeriodStart: currentPeriodStart ?? new Date(),
          currentPeriodEnd: currentPeriodEnd ?? null,
          updatedAt: new Date(),
        },
      })
  }

  /**
   * Handle subscription cancelled webhook
   */
  async handleSubscriptionCancelled(userId: string, endsAt?: Date | null): Promise<void> {
    await this.db
      .update(schema.subscriptions)
      .set({
        status: 'canceled',
        canceledAt: new Date(),
        currentPeriodEnd: endsAt ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.userId, userId))
  }

  /**
   * Handle subscription resumed webhook
   */
  async handleSubscriptionResumed(userId: string, status?: string): Promise<void> {
    const mappedStatus = mapLemonSqueezyStatus(status || 'active')

    await this.db
      .update(schema.subscriptions)
      .set({
        status: mappedStatus,
        canceledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.userId, userId))
  }

  /**
   * Handle subscription paused webhook
   */
  async handleSubscriptionPaused(userId: string): Promise<void> {
    await this.db
      .update(schema.subscriptions)
      .set({
        status: 'past_due',
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.userId, userId))
  }

  /**
   * Handle successful payment webhook
   */
  async handlePaymentSuccess(userId: string, renewsAt?: Date | null): Promise<void> {
    await this.db
      .update(schema.subscriptions)
      .set({
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: renewsAt ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.userId, userId))
  }

  /**
   * Handle failed payment webhook
   */
  async handlePaymentFailed(userId: string): Promise<void> {
    await this.db
      .update(schema.subscriptions)
      .set({
        status: 'past_due',
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.userId, userId))
  }

  /**
   * Handle order refunded webhook (full refund)
   */
  async handleOrderRefunded(userId: string): Promise<void> {
    await this.db
      .update(schema.subscriptions)
      .set({
        tier: 'free',
        status: 'canceled',
        canceledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.userId, userId))
  }

  /**
   * Handle subscription expired webhook
   */
  async handleSubscriptionExpired(userId: string): Promise<void> {
    await this.db
      .update(schema.subscriptions)
      .set({
        tier: 'free',
        status: 'canceled',
        canceledAt: new Date(),
        currentPeriodEnd: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.userId, userId))
  }

  /**
   * Check if user has a paid subscription
   */
  async hasPaidSubscription(userId: string): Promise<boolean> {
    const subscription = await this.getCurrentSubscription(userId)
    return subscription.tier !== 'free' && subscription.status === 'active'
  }

  /**
   * Get subscription tier
   */
  async getSubscriptionTier(userId: string): Promise<string> {
    const subscription = await this.getCurrentSubscription(userId)
    return subscription.tier
  }

  /**
   * Check if subscription has specific feature access
   */
  async hasFeatureAccess(userId: string, feature: string): Promise<boolean> {
    const subscription = await this.getCurrentSubscription(userId)

    // Define feature access by tier
    const featuresByTier: Record<string, string[]> = {
      free: ['basic_projects', 'local_plans'],
      pro: ['basic_projects', 'local_plans', 'cloud_sync', 'github_integration', 'unlimited_projects'],
      team: ['basic_projects', 'local_plans', 'cloud_sync', 'github_integration', 'unlimited_projects', 'team_management', 'roles', 'code_review', 'sprints'],
      enterprise: ['basic_projects', 'local_plans', 'cloud_sync', 'github_integration', 'unlimited_projects', 'team_management', 'roles', 'code_review', 'sprints', 'self_hosted', 'sla', 'custom_integrations'],
    }

    const allowedFeatures = featuresByTier[subscription.tier] ?? featuresByTier['free'] ?? []
    return allowedFeatures.includes(feature)
  }
}

// Export singleton instance
export const subscriptionService = new SubscriptionService()
