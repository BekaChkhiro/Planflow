/**
 * Email Digest Service
 *
 * Handles sending daily and weekly email digests to users
 * summarizing their notifications and project activity.
 */

import cron from 'node-cron'
import { getDbClient, schema } from '../db/index.js'
import { eq, and, gte, lt, desc, inArray } from 'drizzle-orm'
import { sendDigestEmail, isEmailServiceConfigured } from './email.js'

// ============================================
// Types
// ============================================

export interface DigestNotification {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  projectId: string | null
  projectName?: string
  taskId: string | null
  actorName?: string
  createdAt: Date
}

export interface UserDigestData {
  userId: string
  email: string
  name: string
  frequency: string
  timezone: string
  notifications: DigestNotification[]
}

export interface DigestStats {
  totalUsers: number
  successCount: number
  failureCount: number
  skippedCount: number
}

// ============================================
// Digest Service Functions
// ============================================

/**
 * Get users who should receive a digest at the current hour
 */
export async function getUsersForDigest(
  frequency: 'daily' | 'weekly',
  currentHour: number
): Promise<UserDigestData[]> {
  // For weekly digest, only send on Monday (day 1)
  if (frequency === 'weekly') {
    const today = new Date()
    if (today.getUTCDay() !== 1) {
      return []
    }
  }

  const db = getDbClient()
  const hourStr = currentHour.toString().padStart(2, '0') + ':00'

  // Find users with digest enabled at this hour
  const usersWithDigest = await db
    .select({
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      frequency: schema.notificationPreferences.emailDigestFrequency,
      timezone: schema.notificationPreferences.emailDigestTimezone,
      lastDigestSentAt: schema.notificationPreferences.lastDigestSentAt,
    })
    .from(schema.users)
    .innerJoin(
      schema.notificationPreferences,
      eq(schema.users.id, schema.notificationPreferences.userId)
    )
    .where(
      and(
        eq(schema.notificationPreferences.emailDigest, true),
        eq(schema.notificationPreferences.emailDigestFrequency, frequency),
        eq(schema.notificationPreferences.emailDigestTime, hourStr)
      )
    )

  // For each user, fetch their notifications since last digest
  const results: UserDigestData[] = []

  for (const user of usersWithDigest) {
    // Calculate the time range for notifications
    const toDate = new Date()
    let fromDate: Date

    if (user.lastDigestSentAt) {
      fromDate = user.lastDigestSentAt
    } else {
      // If never sent, get last 24h for daily, last 7 days for weekly
      fromDate = new Date()
      if (frequency === 'daily') {
        fromDate.setHours(fromDate.getHours() - 24)
      } else {
        fromDate.setDate(fromDate.getDate() - 7)
      }
    }

    // Fetch notifications in the time range
    const userNotifications = await db
      .select({
        id: schema.notifications.id,
        type: schema.notifications.type,
        title: schema.notifications.title,
        body: schema.notifications.body,
        link: schema.notifications.link,
        projectId: schema.notifications.projectId,
        taskId: schema.notifications.taskId,
        createdAt: schema.notifications.createdAt,
      })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.userId, user.userId),
          gte(schema.notifications.createdAt, fromDate),
          lt(schema.notifications.createdAt, toDate)
        )
      )
      .orderBy(desc(schema.notifications.createdAt))
      .limit(50) // Limit to avoid huge digests

    // Skip users with no notifications
    if (userNotifications.length === 0) {
      continue
    }

    // Get project names for notifications
    const projectIds = [
      ...new Set(
        userNotifications
          .map((n) => n.projectId)
          .filter((id): id is string => id !== null)
      ),
    ]

    let projectMap: Record<string, string> = {}
    if (projectIds.length > 0) {
      const projectsData = await db
        .select({ id: schema.projects.id, name: schema.projects.name })
        .from(schema.projects)
        .where(inArray(schema.projects.id, projectIds))

      projectMap = Object.fromEntries(
        projectsData.map((p: { id: string; name: string }) => [p.id, p.name])
      )
    }

    results.push({
      userId: user.userId,
      email: user.email,
      name: user.name,
      frequency: user.frequency,
      timezone: user.timezone,
      notifications: userNotifications.map((n: typeof userNotifications[number]) => ({
        ...n,
        projectName: n.projectId ? projectMap[n.projectId] : undefined,
      })),
    })
  }

  return results
}

/**
 * Send digest email to a user and log the result
 */
export async function sendUserDigest(userData: UserDigestData): Promise<boolean> {
  const db = getDbClient()
  const fromDate = new Date()
  if (userData.frequency === 'daily') {
    fromDate.setHours(fromDate.getHours() - 24)
  } else {
    fromDate.setDate(fromDate.getDate() - 7)
  }

  try {
    const result = await sendDigestEmail({
      to: userData.email,
      userName: userData.name,
      frequency: userData.frequency as 'daily' | 'weekly',
      notifications: userData.notifications,
    })

    // Log the digest send
    await db.insert(schema.digestSendLog).values({
      userId: userData.userId,
      frequency: userData.frequency,
      notificationCount: userData.notifications.length,
      fromDate,
      toDate: new Date(),
      status: result.success ? 'sent' : 'failed',
      errorMessage: result.error,
    })

    // Update last digest sent time
    if (result.success) {
      await db
        .update(schema.notificationPreferences)
        .set({ lastDigestSentAt: new Date() })
        .where(eq(schema.notificationPreferences.userId, userData.userId))
    }

    return result.success
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`Failed to send digest to ${userData.email}:`, errorMessage)

    // Log the failure
    await db.insert(schema.digestSendLog).values({
      userId: userData.userId,
      frequency: userData.frequency,
      notificationCount: userData.notifications.length,
      fromDate,
      toDate: new Date(),
      status: 'failed',
      errorMessage,
    })

    return false
  }
}

/**
 * Process all digests for a given frequency
 */
export async function processDigests(frequency: 'daily' | 'weekly'): Promise<DigestStats> {
  const stats: DigestStats = {
    totalUsers: 0,
    successCount: 0,
    failureCount: 0,
    skippedCount: 0,
  }

  if (!isEmailServiceConfigured()) {
    console.log(`[Digest] Email service not configured, skipping ${frequency} digest`)
    return stats
  }

  const currentHour = new Date().getUTCHours()
  console.log(`[Digest] Processing ${frequency} digests for hour ${currentHour}:00 UTC`)

  const users = await getUsersForDigest(frequency, currentHour)
  stats.totalUsers = users.length

  console.log(`[Digest] Found ${users.length} users for ${frequency} digest`)

  for (const userData of users) {
    const success = await sendUserDigest(userData)
    if (success) {
      stats.successCount++
    } else {
      stats.failureCount++
    }
  }

  console.log(
    `[Digest] ${frequency} digest complete: ${stats.successCount} sent, ${stats.failureCount} failed`
  )

  return stats
}

// ============================================
// Scheduler
// ============================================

let dailyCronJob: cron.ScheduledTask | null = null
let weeklyCronJob: cron.ScheduledTask | null = null

/**
 * Start the digest scheduler
 * Runs every hour to check if any users need digests
 */
export function startDigestScheduler(): void {
  // Run daily digest check every hour at minute 0
  // This checks for users whose digest time matches the current hour
  dailyCronJob = cron.schedule('0 * * * *', async () => {
    console.log('[Digest Scheduler] Running daily digest check...')
    try {
      await processDigests('daily')
    } catch (error) {
      console.error('[Digest Scheduler] Error processing daily digests:', error)
    }
  })

  // Run weekly digest check every hour at minute 5
  // Only actually sends on Mondays (checked inside processDigests)
  weeklyCronJob = cron.schedule('5 * * * *', async () => {
    console.log('[Digest Scheduler] Running weekly digest check...')
    try {
      await processDigests('weekly')
    } catch (error) {
      console.error('[Digest Scheduler] Error processing weekly digests:', error)
    }
  })

  console.log('[Digest Scheduler] Started - checking for digests every hour')
}

/**
 * Stop the digest scheduler
 */
export function stopDigestScheduler(): void {
  if (dailyCronJob) {
    dailyCronJob.stop()
    dailyCronJob = null
  }
  if (weeklyCronJob) {
    weeklyCronJob.stop()
    weeklyCronJob = null
  }
  console.log('[Digest Scheduler] Stopped')
}

/**
 * Manually trigger a digest for testing
 */
export async function triggerDigestManually(
  frequency: 'daily' | 'weekly'
): Promise<DigestStats> {
  console.log(`[Digest] Manually triggered ${frequency} digest`)
  return processDigests(frequency)
}
