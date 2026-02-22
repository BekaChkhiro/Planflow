import type { WebSocket } from 'ws'

// ============================================
// Presence Types (T5.9)
// ============================================

export type PresenceStatus = 'online' | 'idle' | 'away'

export interface WorkingOnData {
  taskId: string
  taskUuid: string
  taskName: string
  startedAt: string
}

export interface TypingIndicatorData {
  userId: string
  email: string
  name: string | null
  taskId: string           // Task UUID
  taskDisplayId: string    // e.g., "T1.1"
  startedAt: string        // ISO timestamp
}

export interface UserPresence {
  userId: string
  email: string
  name: string | null
  status: PresenceStatus
  connectedAt: string
  lastActiveAt: string
  workingOn: WorkingOnData | null
}

// ============================================
// Client Types
// ============================================

export interface Client {
  ws: WebSocket
  userId: string
  projectId: string
  connectedAt: Date
  // Presence data (T5.9)
  email: string
  name: string | null
  status: PresenceStatus
  lastActiveAt: Date
  // Working on data (T6.1)
  workingOnTaskId: string | null      // e.g., "T1.1"
  workingOnTaskUuid: string | null    // UUID for API calls
  workingOnTaskName: string | null    // Task name for display
  workingOnStartedAt: Date | null     // When they started
  // Typing indicator data (T6.5)
  typingOnTaskId: string | null       // Task UUID user is typing on
  typingOnTaskDisplayId: string | null // e.g., "T1.1"
  typingStartedAt: Date | null        // When they started typing
}

// ============================================
// WebSocket Message Types
// ============================================

export interface WebSocketMessage {
  type: string
  projectId: string
  timestamp: string
  data?: Record<string, unknown>
}

// ============================================
// Task Lock Types (T6.6)
// ============================================

export interface TaskLock {
  taskId: string          // Human-readable ID (e.g., "T1.1")
  taskUuid: string        // Database UUID
  userId: string
  userEmail: string
  userName: string | null
  lockedAt: Date
  expiresAt: Date
}

export interface TaskLockInfo {
  taskId: string
  taskUuid: string
  lockedBy: {
    userId: string
    email: string
    name: string | null
  }
  lockedAt: string
  expiresAt: string
}

// ============================================
// Connection Store Type
// ============================================

export type ConnectionStore = Map<string, Set<Client>>
