/**
 * Record Change Helper (T20.5)
 *
 * Records a change entry to the Redis recent changes stream
 * and broadcasts it via WebSocket.
 *
 * Call this alongside activity log inserts in route handlers.
 */

import { getRecentChangesStore, type AddChangeInput, type RecentChangeEntry } from './redis.js'
import { broadcastRecentChange } from '../websocket/broadcast.js'
import { loggers } from './logger.js'

const log = loggers.recentChanges

export interface RecordChangeInput {
  projectId: string
  userId: string
  userEmail: string
  userName: string | null
  entityType: AddChangeInput['entityType']
  entityId: string
  action: AddChangeInput['action']
  summary: string
  metadata?: Record<string, unknown>
}

/**
 * Record a change to the recent changes stream and broadcast via WebSocket.
 * This is fire-and-forget — errors are logged but never thrown.
 */
export async function recordChange(input: RecordChangeInput): Promise<RecentChangeEntry | null> {
  try {
    const store = getRecentChangesStore()

    const entry = await store.addChange(input.projectId, {
      projectId: input.projectId,
      userId: input.userId,
      userEmail: input.userEmail,
      userName: input.userName,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      summary: input.summary,
      metadata: input.metadata,
    })

    // Broadcast via WebSocket to all connected project members
    broadcastRecentChange(input.projectId, {
      id: entry.id,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      summary: entry.summary,
      userId: entry.userId,
      userEmail: entry.userEmail,
      userName: entry.userName,
      metadata: entry.metadata,
      timestamp: entry.timestamp,
    })

    return entry
  } catch (error) {
    log.error({ error, projectId: input.projectId, entityId: input.entityId }, 'Failed to record change')
    return null
  }
}
