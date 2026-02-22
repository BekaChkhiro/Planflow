/**
 * Webhook Service
 * Handles webhook processing for LemonSqueezy and GitHub integrations
 */

import { and, eq } from 'drizzle-orm'
import crypto from 'crypto'
import { getDbClient, schema, withTransaction } from '../db/index.js'
import {
  verifyWebhookSignature,
  getTierFromVariantId,
  mapLemonSqueezyStatus,
} from '../lib/lemonsqueezy.js'
import {
  isGitHubWebhookConfigured,
  verifyGitHubWebhookSignature,
  type GitHubPullRequestEvent,
} from '../lib/github.js'
import {
  broadcastTaskUpdated,
  sendNotificationToUser,
} from '../websocket/index.js'
import { subscriptionService } from './subscription.service.js'
import { notificationService } from './notification.service.js'
import {
  AuthenticationError,
  ServiceError,
} from './errors.js'
import { logger } from '../lib/logger.js'

// Types
export interface LemonSqueezyWebhookPayload {
  meta?: {
    event_name?: string
    event_id?: string
    custom_data?: {
      user_id?: string
    }
  }
  data?: {
    id?: string
    attributes?: {
      status?: string
      variant_id?: number | string
      customer_id?: number | string
      created_at?: string
      renews_at?: string
      ends_at?: string
      refunded_amount?: number
      total?: number
      first_subscription_item?: {
        custom_data?: {
          user_id?: string
        }
      }
      first_order_item?: {
        custom_data?: {
          user_id?: string
        }
      }
    }
  }
}

export interface WebhookProcessResult {
  success: boolean
  event?: string
  message?: string
  error?: string
}

/**
 * WebhookService - Handles webhook processing for external services
 */
export class WebhookService {
  private db = getDbClient()

  // ============================================
  // LemonSqueezy Webhook Processing
  // ============================================

  /**
   * Process LemonSqueezy webhook
   */
  async processLemonSqueezyWebhook(
    rawBody: string,
    signature: string
  ): Promise<WebhookProcessResult> {
    // Verify webhook signature
    if (!verifyWebhookSignature(rawBody, signature)) {
      throw new AuthenticationError('Invalid webhook signature')
    }

    const payload: LemonSqueezyWebhookPayload = JSON.parse(rawBody)
    const eventName = payload.meta?.event_name
    const eventId = payload.meta?.event_id

    logger.info(`[LemonSqueezy Webhook] Event received: ${eventName} (ID: ${eventId})`)

    // Extract user ID from various locations in webhook payload
    const userId = this.extractUserId(payload)

    // Handle different event types
    switch (eventName) {
      case 'subscription_created':
      case 'subscription_updated':
        await this.handleSubscriptionCreatedOrUpdated(payload, userId)
        break

      case 'subscription_cancelled':
        if (userId) {
          const endsAt = payload.data?.attributes?.ends_at
            ? new Date(payload.data.attributes.ends_at)
            : null
          await subscriptionService.handleSubscriptionCancelled(userId, endsAt)
          logger.info(`[LemonSqueezy Webhook] subscription_cancelled: User ${userId}`)
        }
        break

      case 'subscription_resumed':
        if (userId) {
          const status = payload.data?.attributes?.status
          await subscriptionService.handleSubscriptionResumed(userId, status)
          logger.info(`[LemonSqueezy Webhook] subscription_resumed: User ${userId}`)
        }
        break

      case 'subscription_paused':
        if (userId) {
          await subscriptionService.handleSubscriptionPaused(userId)
          logger.info(`[LemonSqueezy Webhook] subscription_paused: User ${userId}`)
        }
        break

      case 'subscription_payment_success':
        if (userId) {
          const renewsAt = payload.data?.attributes?.renews_at
            ? new Date(payload.data.attributes.renews_at)
            : null
          await subscriptionService.handlePaymentSuccess(userId, renewsAt)
          logger.info(`[LemonSqueezy Webhook] subscription_payment_success: User ${userId}`)
        }
        break

      case 'subscription_payment_failed':
        if (userId) {
          await subscriptionService.handlePaymentFailed(userId)
          logger.info(`[LemonSqueezy Webhook] subscription_payment_failed: User ${userId} -> past_due`)
        }
        break

      case 'order_refunded':
        if (userId) {
          const refundedAmount = payload.data?.attributes?.refunded_amount || 0
          const totalAmount = payload.data?.attributes?.total || 0

          // If full refund, downgrade to free tier
          if (refundedAmount >= totalAmount) {
            await subscriptionService.handleOrderRefunded(userId)
            logger.info(`[LemonSqueezy Webhook] order_refunded: User ${userId} downgraded to free`)
          }
        }
        break

      case 'subscription_expired':
        if (userId) {
          await subscriptionService.handleSubscriptionExpired(userId)
          logger.info(`[LemonSqueezy Webhook] subscription_expired: User ${userId} downgraded to free`)
        }
        break

      default:
        logger.debug(`[LemonSqueezy Webhook] Unhandled event type: ${eventName}`)
    }

    return { success: true, event: eventName }
  }

  /**
   * Handle subscription created or updated event
   */
  private async handleSubscriptionCreatedOrUpdated(
    payload: LemonSqueezyWebhookPayload,
    userId: string | null
  ): Promise<void> {
    if (!userId) {
      throw new ServiceError(
        'Missing user_id in custom_data',
        'WEBHOOK_MISSING_USER_ID',
        400
      )
    }

    const subscriptionData = payload.data?.attributes
    const variantId = subscriptionData?.variant_id?.toString()
    const tier = variantId ? getTierFromVariantId(variantId) : null

    if (!tier) {
      throw new ServiceError(
        `Unknown variant ID: ${variantId}`,
        'WEBHOOK_UNKNOWN_VARIANT',
        400
      )
    }

    // Map status
    const status = mapLemonSqueezyStatus(subscriptionData?.status || 'active')

    // Parse dates
    const currentPeriodStart = subscriptionData?.created_at
      ? new Date(subscriptionData.created_at)
      : new Date()
    const currentPeriodEnd = subscriptionData?.renews_at
      ? new Date(subscriptionData.renews_at)
      : subscriptionData?.ends_at
        ? new Date(subscriptionData.ends_at)
        : null

    await subscriptionService.handleSubscriptionCreatedOrUpdated({
      userId,
      variantId,
      status,
      customerId: subscriptionData?.customer_id?.toString(),
      subscriptionId: payload.data?.id?.toString(),
      currentPeriodStart,
      currentPeriodEnd: currentPeriodEnd ?? undefined,
    })

    logger.info(`[LemonSqueezy Webhook] subscription_created/updated: User ${userId} -> ${tier} (${status})`)
  }

  /**
   * Extract user ID from webhook payload
   */
  private extractUserId(payload: LemonSqueezyWebhookPayload): string | null {
    // Try meta.custom_data first (most common)
    if (payload.meta?.custom_data?.user_id) {
      return payload.meta.custom_data.user_id
    }

    // Try subscription item custom data
    const subscriptionData = payload.data?.attributes
    if (subscriptionData?.first_subscription_item?.custom_data?.user_id) {
      return subscriptionData.first_subscription_item.custom_data.user_id
    }

    // Try order custom data for order events
    if (subscriptionData?.first_order_item?.custom_data?.user_id) {
      return subscriptionData.first_order_item.custom_data.user_id
    }

    return null
  }

  // ============================================
  // GitHub Webhook Processing
  // ============================================

  /**
   * Process GitHub webhook
   */
  async processGitHubWebhook(
    rawBody: string,
    signature: string,
    eventType: string,
    deliveryId: string
  ): Promise<WebhookProcessResult> {
    // Check if GitHub webhook is configured
    if (!isGitHubWebhookConfigured()) {
      throw new ServiceError(
        'GitHub webhook not configured',
        'GITHUB_WEBHOOK_NOT_CONFIGURED',
        500
      )
    }

    logger.info(`[GitHub Webhook] Event: ${eventType}, Delivery: ${deliveryId}`)

    // Verify webhook signature
    if (!verifyGitHubWebhookSignature(rawBody, signature)) {
      throw new AuthenticationError('Invalid GitHub webhook signature')
    }

    // Only handle pull_request events
    if (eventType !== 'pull_request') {
      logger.debug(`[GitHub Webhook] Ignoring event type: ${eventType}`)
      return { success: true, message: 'Event ignored' }
    }

    const payload = JSON.parse(rawBody) as GitHubPullRequestEvent

    // Only process when PR is closed AND merged
    if (payload.action !== 'closed' || !payload.pull_request.merged) {
      logger.debug(`[GitHub Webhook] Ignoring PR action: ${payload.action}`)
      return { success: true, message: 'PR not merged, ignored' }
    }

    const pr = payload.pull_request
    const repo = payload.repository.full_name
    const prNumber = pr.number

    logger.info(`[GitHub Webhook] PR #${prNumber} merged in ${repo}`)

    // Find tasks linked to this PR
    const linkedTasks = await this.db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        status: schema.tasks.status,
        projectId: schema.tasks.projectId,
        githubPrLinkedBy: schema.tasks.githubPrLinkedBy,
      })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.githubPrRepository, repo),
          eq(schema.tasks.githubPrNumber, prNumber)
        )
      )

    if (linkedTasks.length === 0) {
      logger.info(`[GitHub Webhook] No tasks linked to PR #${prNumber}`)
      return { success: true, message: 'No linked tasks found' }
    }

    // Process each linked task
    let processedCount = 0
    for (const task of linkedTasks) {
      if (task.status === 'DONE') continue

      const processed = await this.processGitHubPRMerge(task, pr, payload, prNumber, repo)
      if (processed) {
        processedCount++
      }
    }

    return {
      success: true,
      message: `Processed ${processedCount} task(s)`,
    }
  }

  /**
   * Process a single task for GitHub PR merge
   */
  private async processGitHubPRMerge(
    task: {
      id: string
      taskId: string
      name: string
      status: string
      projectId: string
      githubPrLinkedBy: string | null
    },
    pr: GitHubPullRequestEvent['pull_request'],
    payload: GitHubPullRequestEvent,
    prNumber: number,
    repo: string
  ): Promise<boolean> {
    // Get project info
    const [project] = await this.db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        userId: schema.projects.userId,
      })
      .from(schema.projects)
      .where(eq(schema.projects.id, task.projectId))

    if (!project) return false

    // Update task via transaction
    const updatedTask = await withTransaction(async (tx) => {
      const [updated] = await tx
        .update(schema.tasks)
        .set({
          status: 'DONE',
          githubPrState: 'merged',
          updatedAt: new Date(),
        })
        .where(eq(schema.tasks.id, task.id))
        .returning()

      // Update project timestamp
      await tx
        .update(schema.projects)
        .set({ updatedAt: new Date() })
        .where(eq(schema.projects.id, task.projectId))

      // Log activity
      await tx.insert(schema.activityLog).values({
        action: 'task_status_changed',
        entityType: 'task',
        entityId: task.id,
        taskId: task.taskId,
        actorId: task.githubPrLinkedBy || project.userId,
        projectId: project.id,
        taskUuid: task.id,
        description: `Task completed via PR #${prNumber} merge`,
        metadata: {
          prNumber,
          prUrl: pr.html_url,
          repository: repo,
          mergedBy: payload.sender.login,
        },
      })

      return updated
    }).catch((err) => {
      logger.error(`[GitHub Webhook] Transaction failed:`, err)
      return null
    })

    if (!updatedTask) return false

    logger.info(`[GitHub Webhook] Task ${task.taskId} -> DONE`)

    // Broadcast update
    broadcastTaskUpdated(task.projectId, updatedTask, {
      id: 'github-webhook',
      email: `${payload.sender.login}@github.com`,
      name: payload.sender.login,
    })

    // Notify assignee
    if (updatedTask.assigneeId) {
      const notification = {
        id: crypto.randomUUID(),
        type: 'status_change' as const,
        title: `Task ${task.taskId} Completed`,
        body: `Your task was completed via PR #${prNumber} merge`,
        link: `/dashboard/projects/${project.id}?task=${task.taskId}`,
        read: false,
        createdAt: new Date().toISOString(),
      }

      // Create notification in database
      await notificationService.createNotification({
        userId: updatedTask.assigneeId,
        type: 'status_change' as const,
        title: notification.title,
        body: notification.body,
        link: notification.link,
        projectId: project.id,
        taskId: task.taskId,
      }).catch(() => {})

      // Send real-time notification
      sendNotificationToUser(project.id, updatedTask.assigneeId, notification)
    }

    return true
  }

  // ============================================
  // Signature Verification Utilities
  // ============================================

  /**
   * Verify LemonSqueezy webhook signature
   */
  verifyLemonSqueezySignature(rawBody: string, signature: string): boolean {
    return verifyWebhookSignature(rawBody, signature)
  }

  /**
   * Verify GitHub webhook signature
   */
  verifyGitHubSignature(rawBody: string, signature: string): boolean {
    return verifyGitHubWebhookSignature(rawBody, signature)
  }

  /**
   * Check if GitHub webhook is configured
   */
  isGitHubWebhookConfigured(): boolean {
    return isGitHubWebhookConfigured()
  }
}

// Export singleton instance
export const webhookService = new WebhookService()
