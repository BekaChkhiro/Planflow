# PlanFlow WebSocket/Real-time API Reference

> Real-time communication API for collaborative features in PlanFlow

**Version:** 1.0.0
**WebSocket URL:** `wss://api.planflow.tools/ws` (Production) | `ws://localhost:3001/ws` (Development)

---

## Table of Contents

- [Overview](#overview)
- [Connection](#connection)
  - [WebSocket URL](#websocket-url)
  - [Authentication](#authentication)
  - [Connection Flow](#connection-flow)
  - [Keep-Alive](#keep-alive)
- [Message Format](#message-format)
- [Client Messages](#client-messages)
  - [ping](#ping)
  - [presence_update](#presence_update)
  - [working_on_start](#working_on_start)
  - [working_on_stop](#working_on_stop)
  - [comment_typing_start](#comment_typing_start)
  - [comment_typing_stop](#comment_typing_stop)
  - [task_lock](#task_lock)
  - [task_unlock](#task_unlock)
  - [task_lock_extend](#task_lock_extend)
- [Server Messages](#server-messages)
  - [System Messages](#system-messages)
  - [Presence Messages](#presence-messages)
  - [Working On Messages](#working-on-messages)
  - [Comment Messages](#comment-messages)
  - [Typing Messages](#typing-messages)
  - [Task Lock Messages](#task-lock-messages)
  - [Task Update Messages](#task-update-messages)
  - [Activity Messages](#activity-messages)
  - [Notification Messages](#notification-messages)
- [Data Types](#data-types)
- [Error Handling](#error-handling)
- [Client Implementation](#client-implementation)
- [Security](#security)

---

## Overview

PlanFlow's real-time API enables collaborative features including:

- **Presence System** - See who's online and what they're working on
- **Live Task Updates** - Instant task status changes across all clients
- **Typing Indicators** - See when teammates are writing comments
- **Task Locking** - Prevent conflicts when editing tasks
- **Real-time Notifications** - Instant delivery of mentions and assignments
- **Activity Feed** - Live project activity stream

The WebSocket connection is project-scoped - each connection is tied to a specific project and receives updates only for that project.

---

## Connection

### WebSocket URL

```
wss://api.planflow.tools/ws?projectId={projectId}
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectId` | UUID | Yes | The project to connect to |

### Authentication

Authentication uses the WebSocket subprotocol header for security (tokens are not exposed in URLs/logs).

**Subprotocol Format:**
```
access_token.{JWT_TOKEN}
```

**JavaScript Example:**
```javascript
const token = getAccessToken()
const projectId = 'your-project-uuid'

const ws = new WebSocket(
  `wss://api.planflow.tools/ws?projectId=${projectId}`,
  [`access_token.${token}`, 'planflow-v1']
)
```

**Why Subprotocol?**
- Tokens in URLs are logged by proxies, servers, and browsers
- Subprotocol headers are not typically logged
- Provides better security for sensitive JWT tokens

### Connection Flow

```
1. Client → Server: WebSocket upgrade request with subprotocol
2. Server validates:
   - JWT token validity
   - User has access to projectId
3. Server → Client: 'connected' message
4. Server → Client: 'presence_list' with current online users
5. Server → Client: 'locks_list' with current task locks
6. Server broadcasts: 'presence_joined' to other clients
```

**Successful Connection Response:**
```json
{
  "type": "connected",
  "projectId": "uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "userId": "user-uuid",
    "projectName": "My Project"
  }
}
```

### Keep-Alive

The server pings clients every **25 seconds**. Unresponsive clients are terminated.

**Client-Side Keep-Alive (Recommended):**
```javascript
// Send ping every 20 seconds (less than server's 25s)
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'ping' }))
  }
}, 20000)
```

**Server Response to Ping:**
```json
{
  "type": "pong",
  "timestamp": "2026-02-24T12:00:00.000Z"
}
```

---

## Message Format

### Client → Server Messages

```json
{
  "type": "message_type",
  "data": { ... },
  "timestamp": "2026-02-24T12:00:00.000Z"
}
```

- `type` (required): Message type identifier
- `data` (optional): Message payload
- `timestamp` (optional): ISO 8601 timestamp

### Server → Client Messages

```json
{
  "type": "message_type",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": { ... }
}
```

- `type`: Message type identifier
- `projectId`: Project this message relates to
- `timestamp`: Server timestamp (ISO 8601)
- `data`: Message payload

---

## Client Messages

Messages sent from client to server.

### ping

Keep-alive probe. Server responds with `pong`.

```json
{
  "type": "ping"
}
```

---

### presence_update

Update your presence status.

```json
{
  "type": "presence_update",
  "data": {
    "status": "online"
  }
}
```

**Status Values:**
| Status | Description |
|--------|-------------|
| `online` | Actively using the application |
| `idle` | Away but still connected |
| `away` | Stepped away for a longer period |

---

### working_on_start

Indicate you've started working on a task.

```json
{
  "type": "working_on_start",
  "taskId": "T2.1",
  "taskUuid": "task-uuid",
  "taskName": "Implement login API"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `taskId` | string | Yes | Human-readable task ID (e.g., "T2.1") |
| `taskUuid` | string | Yes | Task UUID from database |
| `taskName` | string | Yes | Task name for display |

---

### working_on_stop

Indicate you've stopped working on a task.

```json
{
  "type": "working_on_stop"
}
```

No payload required. Clears your "working on" status.

---

### comment_typing_start

Indicate you've started typing a comment on a task.

```json
{
  "type": "comment_typing_start",
  "taskId": "task-uuid",
  "taskDisplayId": "T2.1"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `taskId` | string | Yes | Task UUID |
| `taskDisplayId` | string | Yes | Human-readable task ID |

---

### comment_typing_stop

Indicate you've stopped typing a comment.

```json
{
  "type": "comment_typing_stop"
}
```

No payload required. Clears your typing indicator.

---

### task_lock

Request to lock a task for editing (prevents conflicts).

```json
{
  "type": "task_lock",
  "taskId": "T2.1",
  "taskUuid": "task-uuid",
  "taskName": "Implement login API"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `taskId` | string | Yes | Human-readable task ID |
| `taskUuid` | string | Yes | Task UUID |
| `taskName` | string | No | Task name (for display to others) |

**Server Response:** `task_lock_result`

---

### task_unlock

Release a task lock.

```json
{
  "type": "task_unlock",
  "taskId": "T2.1",
  "taskUuid": "task-uuid"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `taskId` | string | Yes | Human-readable task ID |
| `taskUuid` | string | No | Task UUID |

**Server Response:** `task_unlock_result`

---

### task_lock_extend

Extend your existing lock (resets expiration timer).

```json
{
  "type": "task_lock_extend",
  "taskId": "T2.1"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `taskId` | string | Yes | Human-readable task ID |

**Server Response:** `task_lock_extend_result`

---

## Server Messages

Messages sent from server to client(s).

### System Messages

#### connected

Sent immediately after successful connection.

```json
{
  "type": "connected",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "userId": "user-uuid",
    "projectName": "My Project"
  }
}
```

#### pong

Response to client `ping`.

```json
{
  "type": "pong",
  "timestamp": "2026-02-24T12:00:00.000Z"
}
```

---

### Presence Messages

#### presence_list

Sent on connection - list of all currently online users.

```json
{
  "type": "presence_list",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "users": [
      {
        "userId": "user-uuid",
        "email": "john@example.com",
        "name": "John Doe",
        "status": "online",
        "connectedAt": "2026-02-24T11:30:00.000Z",
        "lastActiveAt": "2026-02-24T12:00:00.000Z",
        "workingOn": {
          "taskId": "T2.1",
          "taskUuid": "task-uuid",
          "taskName": "Implement login API",
          "startedAt": "2026-02-24T11:45:00.000Z"
        }
      }
    ],
    "onlineCount": 3
  }
}
```

#### presence_joined

Broadcast when a user comes online (first connection).

```json
{
  "type": "presence_joined",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "user": {
      "userId": "user-uuid",
      "email": "jane@example.com",
      "name": "Jane Smith",
      "status": "online",
      "connectedAt": "2026-02-24T12:00:00.000Z",
      "lastActiveAt": "2026-02-24T12:00:00.000Z",
      "workingOn": null
    },
    "onlineCount": 4
  }
}
```

#### presence_left

Broadcast when a user goes offline (last connection closed).

```json
{
  "type": "presence_left",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "userId": "user-uuid",
    "onlineCount": 2
  }
}
```

#### presence_updated

Broadcast when a user's status changes.

```json
{
  "type": "presence_updated",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "userId": "user-uuid",
    "status": "idle",
    "lastActiveAt": "2026-02-24T12:00:00.000Z"
  }
}
```

---

### Working On Messages

#### working_on_changed

Broadcast when a user starts or stops working on a task.

**User started working:**
```json
{
  "type": "working_on_changed",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "userId": "user-uuid",
    "workingOn": {
      "taskId": "T2.1",
      "taskUuid": "task-uuid",
      "taskName": "Implement login API",
      "startedAt": "2026-02-24T12:00:00.000Z"
    }
  }
}
```

**User stopped working:**
```json
{
  "type": "working_on_changed",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "userId": "user-uuid",
    "workingOn": null
  }
}
```

---

### Comment Messages

#### comment_created

Broadcast when a new comment is created.

```json
{
  "type": "comment_created",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "comment": {
      "id": "comment-uuid",
      "taskId": "task-uuid",
      "taskDisplayId": "T2.1",
      "content": "Great progress on this!",
      "parentId": null,
      "mentions": ["user-uuid-1", "user-uuid-2"],
      "createdAt": "2026-02-24T12:00:00.000Z",
      "author": {
        "id": "user-uuid",
        "email": "john@example.com",
        "name": "John Doe"
      }
    }
  }
}
```

#### comment_updated

Broadcast when a comment is edited.

```json
{
  "type": "comment_updated",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "comment": {
      "id": "comment-uuid",
      "taskId": "task-uuid",
      "taskDisplayId": "T2.1",
      "content": "Updated comment content",
      "parentId": null,
      "mentions": [],
      "createdAt": "2026-02-24T11:00:00.000Z",
      "updatedAt": "2026-02-24T12:00:00.000Z",
      "author": {
        "id": "user-uuid",
        "email": "john@example.com",
        "name": "John Doe"
      }
    }
  }
}
```

#### comment_deleted

Broadcast when a comment is deleted.

```json
{
  "type": "comment_deleted",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "commentId": "comment-uuid",
    "taskId": "task-uuid",
    "taskDisplayId": "T2.1",
    "deletedBy": "user-uuid"
  }
}
```

---

### Typing Messages

#### comment_typing_start

Broadcast when a user starts typing a comment (excludes the sender).

```json
{
  "type": "comment_typing_start",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "typing": {
      "userId": "user-uuid",
      "email": "jane@example.com",
      "name": "Jane Smith",
      "taskId": "task-uuid",
      "taskDisplayId": "T2.1",
      "startedAt": "2026-02-24T12:00:00.000Z"
    }
  }
}
```

#### comment_typing_stop

Broadcast when a user stops typing.

```json
{
  "type": "comment_typing_stop",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "userId": "user-uuid",
    "taskId": "task-uuid",
    "taskDisplayId": "T2.1"
  }
}
```

---

### Task Lock Messages

#### locks_list

Sent on connection - list of all current task locks.

```json
{
  "type": "locks_list",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "locks": [
      {
        "taskId": "T2.1",
        "taskUuid": "task-uuid",
        "lockedBy": {
          "userId": "user-uuid",
          "email": "john@example.com",
          "name": "John Doe"
        },
        "lockedAt": "2026-02-24T11:55:00.000Z",
        "expiresAt": "2026-02-24T12:00:00.000Z"
      }
    ]
  }
}
```

#### task_lock_result

Response to `task_lock` request.

**Lock acquired successfully:**
```json
{
  "type": "task_lock_result",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "success": true,
    "lock": {
      "taskId": "T2.1",
      "taskUuid": "task-uuid",
      "lockedBy": {
        "userId": "your-user-uuid",
        "email": "you@example.com",
        "name": "Your Name"
      },
      "lockedAt": "2026-02-24T12:00:00.000Z",
      "expiresAt": "2026-02-24T12:05:00.000Z"
    },
    "isOwnLock": false,
    "taskName": "Implement login API"
  }
}
```

**Lock already held by you (extended):**
```json
{
  "type": "task_lock_result",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "success": true,
    "lock": { ... },
    "isOwnLock": true,
    "taskName": "Implement login API"
  }
}
```

**Lock held by another user:**
```json
{
  "type": "task_lock_result",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "success": false,
    "lock": {
      "taskId": "T2.1",
      "taskUuid": "task-uuid",
      "lockedBy": {
        "userId": "other-user-uuid",
        "email": "other@example.com",
        "name": "Other User"
      },
      "lockedAt": "2026-02-24T11:58:00.000Z",
      "expiresAt": "2026-02-24T12:03:00.000Z"
    }
  }
}
```

#### task_unlock_result

Response to `task_unlock` request.

```json
{
  "type": "task_unlock_result",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "success": true,
    "taskId": "T2.1"
  }
}
```

#### task_lock_extend_result

Response to `task_lock_extend` request.

```json
{
  "type": "task_lock_extend_result",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "success": true,
    "taskId": "T2.1"
  }
}
```

#### task_locked

Broadcast when a task is locked (excludes the locker).

```json
{
  "type": "task_locked",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "lock": {
      "taskId": "T2.1",
      "taskUuid": "task-uuid",
      "lockedBy": {
        "userId": "user-uuid",
        "email": "john@example.com",
        "name": "John Doe"
      },
      "lockedAt": "2026-02-24T12:00:00.000Z",
      "expiresAt": "2026-02-24T12:05:00.000Z"
    }
  }
}
```

#### task_unlocked

Broadcast when a task lock is released.

```json
{
  "type": "task_unlocked",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "taskId": "T2.1",
    "taskUuid": "task-uuid",
    "unlockedBy": "user-uuid"
  }
}
```

**Note:** `unlockedBy` is `null` for auto-released locks (user disconnect, expiration).

#### task_lock_extended

Broadcast when a lock is extended.

```json
{
  "type": "task_lock_extended",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "lock": {
      "taskId": "T2.1",
      "taskUuid": "task-uuid",
      "lockedBy": { ... },
      "lockedAt": "2026-02-24T12:00:00.000Z",
      "expiresAt": "2026-02-24T12:05:00.000Z"
    }
  }
}
```

---

### Task Update Messages

#### task_updated

Broadcast when a task is updated.

```json
{
  "type": "task_updated",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "task": {
      "id": "task-uuid",
      "taskId": "T2.1",
      "name": "Implement login API",
      "description": "Create JWT-based authentication",
      "status": "DONE",
      "complexity": "High",
      "estimatedHours": 8,
      "dependencies": ["T1.5"],
      "assigneeId": "user-uuid",
      "assignedBy": "manager-uuid",
      "assignedAt": "2026-02-23T10:00:00.000Z",
      "createdAt": "2026-02-20T09:00:00.000Z",
      "updatedAt": "2026-02-24T12:00:00.000Z"
    },
    "updatedBy": "user-uuid"
  }
}
```

#### tasks_reordered

Broadcast when tasks are reordered (drag-and-drop).

```json
{
  "type": "tasks_reordered",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "tasks": [
      { "taskId": "T2.1", "displayOrder": 1, "status": "IN_PROGRESS" },
      { "taskId": "T2.2", "displayOrder": 2, "status": "TODO" },
      { "taskId": "T2.3", "displayOrder": 3, "status": "TODO" }
    ],
    "updatedBy": "user-uuid"
  }
}
```

#### task_assigned

Broadcast when a task is assigned to a user.

```json
{
  "type": "task_assigned",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "task": { ... },
    "assignee": {
      "id": "assignee-uuid",
      "email": "assignee@example.com",
      "name": "Assignee Name"
    },
    "assignedBy": {
      "id": "assigner-uuid",
      "email": "manager@example.com",
      "name": "Manager Name"
    }
  }
}
```

#### task_unassigned

Broadcast when a task assignment is removed.

```json
{
  "type": "task_unassigned",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "task": { ... },
    "previousAssigneeId": "previous-assignee-uuid",
    "unassignedBy": "user-uuid"
  }
}
```

#### tasks_synced

Broadcast when tasks are synced from a plan update.

```json
{
  "type": "tasks_synced",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "tasksCount": 45,
    "completedCount": 32,
    "progress": 71
  }
}
```

#### project_updated

Broadcast when project metadata changes.

```json
{
  "type": "project_updated",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "updatedFields": {
      "name": "Updated Project Name",
      "description": "New description",
      "updatedAt": "2026-02-24T12:00:00.000Z"
    }
  }
}
```

---

### Activity Messages

#### activity_created

Broadcast when new activity is logged.

```json
{
  "type": "activity_created",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "activity": {
      "id": "activity-uuid",
      "action": "task_completed",
      "entityType": "task",
      "entityId": "task-uuid",
      "taskId": "task-uuid",
      "taskDisplayId": "T2.1",
      "metadata": {
        "previousStatus": "IN_PROGRESS",
        "newStatus": "DONE"
      },
      "description": "Completed task T2.1: Implement login API",
      "createdAt": "2026-02-24T12:00:00.000Z",
      "actor": {
        "id": "user-uuid",
        "email": "john@example.com",
        "name": "John Doe"
      }
    }
  }
}
```

**Common Activity Actions:**
| Action | Description |
|--------|-------------|
| `task_created` | New task added |
| `task_updated` | Task details changed |
| `task_completed` | Task marked as done |
| `task_assigned` | Task assigned to user |
| `task_unassigned` | Task assignment removed |
| `comment_created` | New comment added |
| `comment_deleted` | Comment removed |
| `member_joined` | New team member joined |
| `member_removed` | Team member removed |

---

### Notification Messages

#### notification_new

Sent to specific user(s) when they receive a notification.

```json
{
  "type": "notification_new",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "notification": {
      "id": "notification-uuid",
      "type": "mention",
      "title": "John mentioned you",
      "body": "in task T2.1: @jane can you review this?",
      "link": "/projects/project-uuid/tasks/task-uuid",
      "createdAt": "2026-02-24T12:00:00.000Z"
    }
  }
}
```

**Notification Types:**
| Type | Description |
|------|-------------|
| `mention` | User was @mentioned in a comment |
| `assignment` | Task was assigned to user |
| `comment` | Comment on a task user is watching |
| `status_change` | Task status changed |

#### notification_read

Sent to user's other devices for multi-device sync.

```json
{
  "type": "notification_read",
  "projectId": "project-uuid",
  "timestamp": "2026-02-24T12:00:00.000Z",
  "data": {
    "notificationIds": ["notif-uuid-1", "notif-uuid-2"]
  }
}
```

---

## Data Types

### UserPresence

```typescript
interface UserPresence {
  userId: string
  email: string
  name: string | null
  status: 'online' | 'idle' | 'away'
  connectedAt: string  // ISO 8601
  lastActiveAt: string // ISO 8601
  workingOn: WorkingOnData | null
}
```

### WorkingOnData

```typescript
interface WorkingOnData {
  taskId: string      // Human-readable (e.g., "T2.1")
  taskUuid: string    // Database UUID
  taskName: string
  startedAt: string   // ISO 8601
}
```

### TaskLockInfo

```typescript
interface TaskLockInfo {
  taskId: string      // Human-readable (e.g., "T2.1")
  taskUuid: string    // Database UUID
  lockedBy: {
    userId: string
    email: string
    name: string | null
  }
  lockedAt: string    // ISO 8601
  expiresAt: string   // ISO 8601
}
```

### CommentData

```typescript
interface CommentData {
  id: string
  taskId: string         // Database UUID
  taskDisplayId: string  // Human-readable (e.g., "T2.1")
  content: string
  parentId: string | null
  mentions: string[] | null
  createdAt: string      // ISO 8601
  updatedAt?: string     // ISO 8601
  author: {
    id: string
    email: string
    name: string | null
  }
}
```

### TaskData

```typescript
interface TaskData {
  id: string             // Database UUID
  taskId: string         // Human-readable (e.g., "T2.1")
  name: string
  description: string | null
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'
  complexity: 'Low' | 'Medium' | 'High' | null
  estimatedHours: number | null
  dependencies: string[] | null
  assigneeId: string | null
  assignedBy: string | null
  assignedAt: string | null  // ISO 8601
  createdAt: string          // ISO 8601
  updatedAt: string          // ISO 8601
}
```

---

## Error Handling

### Connection Errors

| Code | Reason | Description |
|------|--------|-------------|
| `4001` | Authentication failed | Invalid/expired token or missing projectId |
| `1000` | Normal closure | Clean disconnect |
| `1001` | Going away | Server shutting down |
| `1006` | Abnormal closure | Network error |

### Handling Disconnects

```javascript
ws.onclose = (event) => {
  if (event.code === 4001) {
    // Authentication error - refresh token and reconnect
    handleAuthError()
  } else {
    // Network error - attempt reconnect with backoff
    scheduleReconnect()
  }
}
```

### Reconnection Strategy

```javascript
let reconnectAttempt = 0
const maxReconnectDelay = 30000 // 30 seconds

function scheduleReconnect() {
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), maxReconnectDelay)
  reconnectAttempt++

  setTimeout(() => {
    connect()
  }, delay)
}

// Reset on successful connection
ws.onopen = () => {
  reconnectAttempt = 0
}
```

---

## Client Implementation

### Complete JavaScript Example

```javascript
class PlanFlowWebSocket {
  constructor(apiUrl, getToken, projectId) {
    this.apiUrl = apiUrl
    this.getToken = getToken
    this.projectId = projectId
    this.ws = null
    this.reconnectAttempt = 0
    this.handlers = new Map()
  }

  connect() {
    const token = this.getToken()
    const url = `${this.apiUrl}/ws?projectId=${this.projectId}`

    this.ws = new WebSocket(url, [
      `access_token.${token}`,
      'planflow-v1'
    ])

    this.ws.onopen = () => {
      console.log('WebSocket connected')
      this.reconnectAttempt = 0
      this.startPingInterval()
    }

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      this.handleMessage(message)
    }

    this.ws.onclose = (event) => {
      this.stopPingInterval()

      if (event.code === 4001) {
        this.emit('authError', event.reason)
      } else {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
  }

  handleMessage(message) {
    // Emit to specific handlers
    this.emit(message.type, message.data, message)

    // Also emit to 'message' for catch-all handling
    this.emit('message', message)
  }

  on(type, handler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, [])
    }
    this.handlers.get(type).push(handler)
  }

  off(type, handler) {
    const handlers = this.handlers.get(type)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) handlers.splice(index, 1)
    }
  }

  emit(type, ...args) {
    const handlers = this.handlers.get(type)
    if (handlers) {
      handlers.forEach(handler => handler(...args))
    }
  }

  send(type, data = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...data }))
    }
  }

  // Presence
  updatePresence(status) {
    this.send('presence_update', { data: { status } })
  }

  // Working On
  startWorkingOn(taskId, taskUuid, taskName) {
    this.send('working_on_start', { taskId, taskUuid, taskName })
  }

  stopWorkingOn() {
    this.send('working_on_stop')
  }

  // Typing
  startTyping(taskId, taskDisplayId) {
    this.send('comment_typing_start', { taskId, taskDisplayId })
  }

  stopTyping() {
    this.send('comment_typing_stop')
  }

  // Task Locking
  lockTask(taskId, taskUuid, taskName) {
    this.send('task_lock', { taskId, taskUuid, taskName })
  }

  unlockTask(taskId, taskUuid) {
    this.send('task_unlock', { taskId, taskUuid })
  }

  extendLock(taskId) {
    this.send('task_lock_extend', { taskId })
  }

  // Keep-alive
  startPingInterval() {
    this.pingInterval = setInterval(() => {
      this.send('ping')
    }, 20000)
  }

  stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  // Reconnection
  scheduleReconnect() {
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempt),
      30000
    )
    this.reconnectAttempt++

    console.log(`Reconnecting in ${delay}ms...`)
    setTimeout(() => this.connect(), delay)
  }

  disconnect() {
    this.stopPingInterval()
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
  }
}

// Usage
const ws = new PlanFlowWebSocket(
  'wss://api.planflow.tools',
  () => localStorage.getItem('accessToken'),
  'project-uuid'
)

ws.on('connected', (data) => {
  console.log('Connected to project:', data.projectName)
})

ws.on('presence_list', (data) => {
  console.log('Online users:', data.users)
})

ws.on('task_updated', (data) => {
  console.log('Task updated:', data.task.taskId, data.task.status)
})

ws.on('notification_new', (data) => {
  showToast(data.notification.title)
})

ws.connect()
```

---

## Security

### Token Handling

1. **Never expose tokens in URLs** - Use subprotocol header
2. **Short-lived access tokens** - 15 minute expiration
3. **Refresh before expiry** - Reconnect with new token before access token expires

### Project Access

- Users can only connect to projects they have access to
- Connection attempts to unauthorized projects fail with code `4001`
- All messages are scoped to the connected project

### Task Locking

- Locks expire after **5 minutes** to prevent stale locks
- Locks are automatically released on disconnect
- Locks are stored in Redis for persistence across server restarts

### Rate Limiting

WebSocket connections are subject to rate limiting:
- Connection attempts: 10 per minute per IP
- Messages: 100 per minute per connection

---

## Message Type Summary

### Client → Server

| Type | Purpose |
|------|---------|
| `ping` | Keep-alive |
| `presence_update` | Update status (online/idle/away) |
| `working_on_start` | Start working on task |
| `working_on_stop` | Stop working on task |
| `comment_typing_start` | Start typing comment |
| `comment_typing_stop` | Stop typing comment |
| `task_lock` | Request task lock |
| `task_unlock` | Release task lock |
| `task_lock_extend` | Extend lock duration |

### Server → Client

| Type | Purpose |
|------|---------|
| `connected` | Connection confirmed |
| `pong` | Keep-alive response |
| `presence_list` | Initial online users |
| `presence_joined` | User came online |
| `presence_left` | User went offline |
| `presence_updated` | User status changed |
| `working_on_changed` | User working on changed |
| `comment_created` | New comment |
| `comment_updated` | Comment edited |
| `comment_deleted` | Comment removed |
| `comment_typing_start` | User typing |
| `comment_typing_stop` | User stopped typing |
| `locks_list` | Initial task locks |
| `task_lock_result` | Lock request result |
| `task_unlock_result` | Unlock request result |
| `task_lock_extend_result` | Extend request result |
| `task_locked` | Task was locked |
| `task_unlocked` | Task was unlocked |
| `task_lock_extended` | Lock was extended |
| `task_updated` | Task changed |
| `tasks_reordered` | Tasks reordered |
| `task_assigned` | Task assigned |
| `task_unassigned` | Assignment removed |
| `tasks_synced` | Tasks synced from plan |
| `project_updated` | Project metadata changed |
| `activity_created` | New activity logged |
| `notification_new` | New notification |
| `notification_read` | Notifications marked read |

---

_Last Updated: 2026-02-24_
