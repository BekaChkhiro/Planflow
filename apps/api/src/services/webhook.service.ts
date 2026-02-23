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
  type GitHubIssuesEvent,
  type GitHubPushEvent,
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

  // ============================================
  // Project-Specific GitHub Webhook Processing
  // ============================================

  /**
   * Process GitHub webhook for a specific project
   * This handles events with project-specific webhook secrets
   */
  async processGitHubWebhookForProject(
    rawBody: string,
    eventType: string,
    deliveryId: string,
    projectId: string
  ): Promise<WebhookProcessResult> {
    logger.info(`[GitHub Project Webhook] Event: ${eventType}, Project: ${projectId}, Delivery: ${deliveryId}`)

    // Handle different event types
    switch (eventType) {
      case 'pull_request':
        return this.handlePullRequestEventForProject(rawBody, projectId)

      case 'issues':
        return this.handleIssuesEventForProject(rawBody, projectId)

      case 'push':
        return this.handlePushEventForProject(rawBody, projectId)

      case 'ping':
        // GitHub sends a ping event when webhook is first created
        logger.info(`[GitHub Project Webhook] Ping received for project: ${projectId}`)
        return { success: true, message: 'Pong! Webhook is configured correctly.' }

      default:
        logger.debug(`[GitHub Project Webhook] Ignoring event type: ${eventType}`)
        return { success: true, message: 'Event ignored' }
    }
  }

  /**
   * Handle pull_request events for a project
   */
  private async handlePullRequestEventForProject(
    rawBody: string,
    projectId: string
  ): Promise<WebhookProcessResult> {
    const payload = JSON.parse(rawBody) as GitHubPullRequestEvent
    const pr = payload.pull_request
    const repo = payload.repository.full_name
    const prNumber = pr.number

    logger.info(`[GitHub Project Webhook] PR #${prNumber} ${payload.action} in ${repo}`)

    // Handle PR opened - try to auto-link tasks based on branch name
    if (payload.action === 'opened') {
      const branchName = pr.head.ref
      // Try to extract task ID from branch name (e.g., "feature/T1.2-implement-login")
      const taskIdMatch = branchName.match(/T(\d+)\.(\d+)/i)

      if (taskIdMatch) {
        const taskId = taskIdMatch[0].toUpperCase()
        await this.autoLinkPrToTask(taskId, pr, payload, projectId)
      }

      return { success: true, message: `PR #${prNumber} opened` }
    }

    // Handle PR merged - complete linked tasks
    if (payload.action === 'closed' && pr.merged) {
      // Find tasks linked to this PR in this project
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
            eq(schema.tasks.projectId, projectId),
            eq(schema.tasks.githubPrRepository, repo),
            eq(schema.tasks.githubPrNumber, prNumber)
          )
        )

      if (linkedTasks.length === 0) {
        logger.info(`[GitHub Project Webhook] No tasks linked to PR #${prNumber} in project ${projectId}`)
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
        message: `PR #${prNumber} merged - processed ${processedCount} task(s)`,
      }
    }

    // Handle PR reopened - reopen linked tasks
    if (payload.action === 'reopened') {
      const linkedTasks = await this.db
        .select({
          id: schema.tasks.id,
          taskId: schema.tasks.taskId,
          status: schema.tasks.status,
        })
        .from(schema.tasks)
        .where(
          and(
            eq(schema.tasks.projectId, projectId),
            eq(schema.tasks.githubPrRepository, repo),
            eq(schema.tasks.githubPrNumber, prNumber)
          )
        )

      for (const task of linkedTasks) {
        if (task.status === 'DONE') {
          await this.db
            .update(schema.tasks)
            .set({
              status: 'IN_PROGRESS',
              githubPrState: 'open',
              updatedAt: new Date(),
            })
            .where(eq(schema.tasks.id, task.id))

          logger.info(`[GitHub Project Webhook] Task ${task.taskId} reopened (PR reopened)`)
        }
      }

      return { success: true, message: `PR #${prNumber} reopened` }
    }

    return { success: true, message: `PR action ${payload.action} processed` }
  }

  /**
   * Handle issues events for a project
   */
  private async handleIssuesEventForProject(
    rawBody: string,
    projectId: string
  ): Promise<WebhookProcessResult> {
    const payload = JSON.parse(rawBody) as GitHubIssuesEvent
    const issue = payload.issue
    const repo = payload.repository.full_name
    const issueNumber = issue.number

    logger.info(`[GitHub Project Webhook] Issue #${issueNumber} ${payload.action} in ${repo}`)

    // Find tasks linked to this issue in this project
    const linkedTasks = await this.db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        status: schema.tasks.status,
      })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.projectId, projectId),
          eq(schema.tasks.githubRepository, repo),
          eq(schema.tasks.githubIssueNumber, issueNumber)
        )
      )

    if (linkedTasks.length === 0) {
      logger.debug(`[GitHub Project Webhook] No tasks linked to issue #${issueNumber}`)
      return { success: true, message: 'No linked tasks found' }
    }

    // Handle issue closed - complete linked tasks
    if (payload.action === 'closed') {
      let processedCount = 0
      for (const task of linkedTasks) {
        if (task.status !== 'DONE') {
          await this.db
            .update(schema.tasks)
            .set({
              status: 'DONE',
              githubIssueState: 'closed',
              updatedAt: new Date(),
            })
            .where(eq(schema.tasks.id, task.id))

          // Log activity
          await this.db.insert(schema.activityLog).values({
            action: 'task_status_changed',
            entityType: 'task',
            entityId: task.id,
            taskId: task.taskId,
            projectId,
            taskUuid: task.id,
            description: `Task completed via GitHub issue #${issueNumber} close`,
            metadata: {
              issueNumber,
              issueUrl: issue.html_url,
              repository: repo,
              closedBy: payload.sender.login,
            },
          })

          processedCount++
          logger.info(`[GitHub Project Webhook] Task ${task.taskId} -> DONE (issue closed)`)
        }
      }

      return {
        success: true,
        message: `Issue #${issueNumber} closed - completed ${processedCount} task(s)`,
      }
    }

    // Handle issue reopened - reopen linked tasks
    if (payload.action === 'reopened') {
      for (const task of linkedTasks) {
        if (task.status === 'DONE') {
          await this.db
            .update(schema.tasks)
            .set({
              status: 'TODO',
              githubIssueState: 'open',
              updatedAt: new Date(),
            })
            .where(eq(schema.tasks.id, task.id))

          logger.info(`[GitHub Project Webhook] Task ${task.taskId} -> TODO (issue reopened)`)
        }
      }

      return { success: true, message: `Issue #${issueNumber} reopened` }
    }

    // Handle issue edited - sync title/body to task
    if (payload.action === 'edited') {
      for (const task of linkedTasks) {
        await this.db
          .update(schema.tasks)
          .set({
            githubIssueTitle: issue.title,
            updatedAt: new Date(),
          })
          .where(eq(schema.tasks.id, task.id))
      }

      return { success: true, message: `Issue #${issueNumber} updated` }
    }

    return { success: true, message: `Issue action ${payload.action} processed` }
  }

  /**
   * Handle push events for a project
   * Tracks commits that mention task IDs
   */
  private async handlePushEventForProject(
    rawBody: string,
    projectId: string
  ): Promise<WebhookProcessResult> {
    const payload = JSON.parse(rawBody) as GitHubPushEvent

    // Only process pushes to default branch
    const defaultBranch = payload.repository.default_branch
    const pushedBranch = payload.ref.replace('refs/heads/', '')

    if (pushedBranch !== defaultBranch) {
      logger.debug(`[GitHub Project Webhook] Ignoring push to non-default branch: ${pushedBranch}`)
      return { success: true, message: 'Push to non-default branch ignored' }
    }

    const repo = payload.repository.full_name
    const commits = payload.commits || []

    logger.info(`[GitHub Project Webhook] Push to ${defaultBranch}: ${commits.length} commit(s)`)

    // Parse commits for task references
    let linkedCommits = 0
    for (const commit of commits) {
      // Look for task IDs in commit messages (e.g., "T1.2: Implement feature")
      const taskMatches = commit.message.match(/T(\d+)\.(\d+)/gi) || []

      for (const taskIdStr of taskMatches) {
        const taskId = taskIdStr.toUpperCase()

        // Find task in this project
        const [task] = await this.db
          .select({
            id: schema.tasks.id,
            taskId: schema.tasks.taskId,
            name: schema.tasks.name,
          })
          .from(schema.tasks)
          .where(
            and(
              eq(schema.tasks.projectId, projectId),
              eq(schema.tasks.taskId, taskId)
            )
          )

        if (task) {
          // Log the commit reference in activity
          await this.db.insert(schema.activityLog).values({
            action: 'github_commit_linked',
            entityType: 'task',
            entityId: task.id,
            taskId: task.taskId,
            projectId,
            taskUuid: task.id,
            description: `Commit pushed to ${defaultBranch}`,
            metadata: {
              commitSha: commit.id,
              commitMessage: commit.message.substring(0, 200),
              commitUrl: commit.url,
              repository: repo,
              author: commit.author.name,
              authorEmail: commit.author.email,
            },
          })

          linkedCommits++
          logger.debug(`[GitHub Project Webhook] Linked commit ${commit.id.substring(0, 7)} to task ${taskId}`)
        }
      }
    }

    return {
      success: true,
      message: `Push processed - ${linkedCommits} commit(s) linked to tasks`,
    }
  }

  /**
   * Auto-link a PR to a task based on branch name
   */
  private async autoLinkPrToTask(
    taskId: string,
    pr: GitHubPullRequestEvent['pull_request'],
    payload: GitHubPullRequestEvent,
    projectId: string
  ): Promise<void> {
    const repo = payload.repository.full_name

    // Find task in this project
    const [task] = await this.db
      .select({
        id: schema.tasks.id,
        taskId: schema.tasks.taskId,
        name: schema.tasks.name,
        githubPrNumber: schema.tasks.githubPrNumber,
      })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.projectId, projectId),
          eq(schema.tasks.taskId, taskId)
        )
      )

    if (!task) {
      logger.debug(`[GitHub Project Webhook] Task ${taskId} not found in project ${projectId}`)
      return
    }

    // Skip if task already has a PR linked
    if (task.githubPrNumber) {
      logger.debug(`[GitHub Project Webhook] Task ${taskId} already has a PR linked`)
      return
    }

    // Link the PR to the task
    await this.db
      .update(schema.tasks)
      .set({
        githubPrNumber: pr.number,
        githubPrRepository: repo,
        githubPrUrl: pr.html_url,
        githubPrTitle: pr.title,
        githubPrState: pr.state,
        githubPrBranch: pr.head.ref,
        githubPrBaseBranch: pr.base.ref,
        githubPrLinkedAt: new Date(),
        status: 'IN_PROGRESS',
        updatedAt: new Date(),
      })
      .where(eq(schema.tasks.id, task.id))

    // Log activity
    await this.db.insert(schema.activityLog).values({
      action: 'github_pr_auto_linked',
      entityType: 'task',
      entityId: task.id,
      taskId: task.taskId,
      projectId,
      taskUuid: task.id,
      description: `PR #${pr.number} auto-linked from branch ${pr.head.ref}`,
      metadata: {
        prNumber: pr.number,
        prUrl: pr.html_url,
        prTitle: pr.title,
        repository: repo,
        branch: pr.head.ref,
        autoLinked: true,
      },
    })

    logger.info(`[GitHub Project Webhook] Auto-linked PR #${pr.number} to task ${taskId}`)
  }
}

// Export singleton instance
export const webhookService = new WebhookService()
