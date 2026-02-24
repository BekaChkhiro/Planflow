# Notifications API Reference

> Real-time notification system for PlanFlow - track mentions, assignments, comments, and more

**Version:** 0.0.1
**Base URL:** `https://api.planflow.tools` (Production) | `http://localhost:3001` (Development)

---

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Notification Types](#notification-types)
- [Endpoints](#endpoints)
  - [List Notifications](#get-notifications)
  - [Get Unread Count](#get-notificationsunread-count)
  - [Get Single Notification](#get-notificationsid)
  - [Mark as Read](#patch-notificationsidread)
  - [Mark Multiple as Read](#post-notificationsmark-read)
  - [Mark All as Read](#post-notificationsmark-all-read)
  - [Delete Notification](#delete-notificationsid)
  - [Delete All Notifications](#delete-notifications)
- [Push Notifications](#push-notifications)
  - [Get VAPID Key](#get-notificationspushvapid-public-key)
  - [Subscribe to Push](#post-notificationspushsubscribe)
  - [Unsubscribe from Push](#delete-notificationspushsubscribe)
  - [Send Test Push](#post-notificationspushtest)
- [Notification Preferences](#notification-preferences)
  - [Get Preferences](#get-notificationspreferences)
  - [Update Preferences](#patch-notificationspreferences)
- [Email Digest](#email-digest)
  - [Send Test Digest](#post-notificationsdigesttest)
  - [Get Digest History](#get-notificationsdigesthistory)
- [Schemas](#schemas)

---

## Overview

PlanFlow's notification system keeps users informed about activity across their projects and teams. Notifications are triggered by:

- **Mentions** - When someone @mentions you in a comment
- **Assignments** - When a task is assigned to you or unassigned
- **Comments** - New comments on tasks you're involved with
- **Status Changes** - When a task's status changes
- **Team Activity** - Invitations, member joins/leaves, role changes

Notifications can be delivered through:
- **In-app** - Real-time via WebSocket and API polling
- **Push** - Browser push notifications (Web Push API)
- **Email** - Immediate or digest (daily/weekly)

---

## Authentication

All notification endpoints (except VAPID public key) require authentication:

```bash
# Using JWT token
curl https://api.planflow.tools/notifications \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."

# Using API token
curl https://api.planflow.tools/notifications \
  -H "Authorization: Bearer pf_abc123..."
```

See the main [API Reference](./API_REFERENCE.md#authentication) for details on obtaining tokens.

---

## Notification Types

| Type | Description | Trigger |
|------|-------------|---------|
| `mention` | Someone @mentioned you | Comment with @username |
| `assignment` | Task assigned to you | Task assignee changed to you |
| `unassignment` | Task unassigned from you | Task assignee removed |
| `comment` | New comment on a task | Comment on your task |
| `comment_reply` | Reply to your comment | Reply in comment thread |
| `status_change` | Task status changed | Task moved to new status |
| `task_created` | New task created | Task added to project |
| `task_deleted` | Task deleted | Task removed from project |
| `invitation` | Team invitation received | Invited to organization |
| `member_joined` | New team member | Someone joined your team |
| `member_removed` | Team member left | Someone left/removed |
| `role_changed` | Your role changed | Role updated in organization |

---

## Endpoints

### GET /notifications

List notifications for the authenticated user with pagination and filtering.

**Authentication:** Required

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 50 | Items per page (1-100) |
| `offset` | integer | 0 | Number of items to skip |
| `unreadOnly` | boolean | false | Only return unread notifications |
| `type` | string | - | Filter by notification type |
| `projectId` | uuid | - | Filter by project |

**Success Response (200)**

```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "dd0e8400-e29b-41d4-a716-446655440000",
        "userId": "550e8400-e29b-41d4-a716-446655440000",
        "type": "mention",
        "title": "John Doe mentioned you",
        "body": "Hey @jane, can you review this task?",
        "link": "/projects/770e8400-e29b-41d4-a716-446655440000/tasks/T2.1",
        "projectId": "770e8400-e29b-41d4-a716-446655440000",
        "organizationId": "990e8400-e29b-41d4-a716-446655440000",
        "actorId": "550e8400-e29b-41d4-a716-446655440001",
        "taskId": "T2.1",
        "readAt": null,
        "createdAt": "2026-01-30T14:00:00.000Z",
        "actor": {
          "id": "550e8400-e29b-41d4-a716-446655440001",
          "email": "john@example.com",
          "name": "John Doe"
        }
      }
    ],
    "unreadCount": 5,
    "pagination": {
      "total": 25,
      "limit": 50,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

**Error Responses**
- `401` - Not authenticated

**Examples**

```bash
# Get all notifications
curl "https://api.planflow.tools/notifications" \
  -H "Authorization: Bearer pf_abc123..."

# Get unread only
curl "https://api.planflow.tools/notifications?unreadOnly=true" \
  -H "Authorization: Bearer pf_abc123..."

# Filter by type
curl "https://api.planflow.tools/notifications?type=mention" \
  -H "Authorization: Bearer pf_abc123..."

# Paginate
curl "https://api.planflow.tools/notifications?limit=10&offset=20" \
  -H "Authorization: Bearer pf_abc123..."

# Filter by project
curl "https://api.planflow.tools/notifications?projectId=770e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer pf_abc123..."
```

---

### GET /notifications/unread-count

Get the count of unread notifications. Useful for displaying badge counters.

**Authentication:** Required

**Success Response (200)**

```json
{
  "success": true,
  "data": {
    "unreadCount": 5
  }
}
```

**Error Responses**
- `401` - Not authenticated

**Example**

```bash
curl "https://api.planflow.tools/notifications/unread-count" \
  -H "Authorization: Bearer pf_abc123..."
```

---

### GET /notifications/{id}

Get a specific notification by ID.

**Authentication:** Required

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Notification ID |

**Success Response (200)**

```json
{
  "success": true,
  "data": {
    "notification": {
      "id": "dd0e8400-e29b-41d4-a716-446655440000",
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "type": "assignment",
      "title": "Task assigned to you",
      "body": "T2.1: Implement login API has been assigned to you",
      "link": "/projects/770e8400-e29b-41d4-a716-446655440000/tasks/T2.1",
      "projectId": "770e8400-e29b-41d4-a716-446655440000",
      "organizationId": "990e8400-e29b-41d4-a716-446655440000",
      "actorId": "550e8400-e29b-41d4-a716-446655440001",
      "taskId": "T2.1",
      "readAt": null,
      "createdAt": "2026-01-30T14:00:00.000Z",
      "actor": {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "email": "john@example.com",
        "name": "John Doe"
      }
    }
  }
}
```

**Error Responses**
- `400` - Invalid notification ID format
- `401` - Not authenticated
- `404` - Notification not found

**Example**

```bash
curl "https://api.planflow.tools/notifications/dd0e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer pf_abc123..."
```

---

### PATCH /notifications/{id}/read

Mark a single notification as read.

**Authentication:** Required

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Notification ID |

**Success Response (200)**

```json
{
  "success": true,
  "data": {
    "notification": {
      "id": "dd0e8400-e29b-41d4-a716-446655440000",
      "userId": "550e8400-e29b-41d4-a716-446655440000",
      "type": "mention",
      "title": "John Doe mentioned you",
      "body": "Hey @jane, can you review this task?",
      "link": "/projects/770e8400-e29b-41d4-a716-446655440000/tasks/T2.1",
      "readAt": "2026-01-30T15:00:00.000Z",
      "createdAt": "2026-01-30T14:00:00.000Z"
    }
  }
}
```

**Error Responses**
- `400` - Invalid notification ID format
- `401` - Not authenticated
- `404` - Notification not found

**Example**

```bash
curl -X PATCH "https://api.planflow.tools/notifications/dd0e8400-e29b-41d4-a716-446655440000/read" \
  -H "Authorization: Bearer pf_abc123..."
```

---

### POST /notifications/mark-read

Mark multiple notifications as read in a single request.

**Authentication:** Required

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `notificationIds` | array | Yes | Array of notification UUIDs (1-100 items) |

**Request**

```json
{
  "notificationIds": [
    "dd0e8400-e29b-41d4-a716-446655440000",
    "dd0e8400-e29b-41d4-a716-446655440001",
    "dd0e8400-e29b-41d4-a716-446655440002"
  ]
}
```

**Success Response (200)**

```json
{
  "success": true,
  "data": {
    "markedCount": 3
  }
}
```

**Error Responses**
- `400` - Invalid request (empty array, too many IDs, invalid UUIDs)
- `401` - Not authenticated

**Example**

```bash
curl -X POST "https://api.planflow.tools/notifications/mark-read" \
  -H "Authorization: Bearer pf_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "notificationIds": [
      "dd0e8400-e29b-41d4-a716-446655440000",
      "dd0e8400-e29b-41d4-a716-446655440001"
    ]
  }'
```

---

### POST /notifications/mark-all-read

Mark all notifications as read for the authenticated user.

**Authentication:** Required

**Success Response (200)**

```json
{
  "success": true,
  "data": {
    "markedCount": 15
  }
}
```

**Error Responses**
- `401` - Not authenticated

**Example**

```bash
curl -X POST "https://api.planflow.tools/notifications/mark-all-read" \
  -H "Authorization: Bearer pf_abc123..."
```

---

### DELETE /notifications/{id}

Delete a single notification.

**Authentication:** Required

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | uuid | Notification ID |

**Success Response (200)**

```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

**Error Responses**
- `400` - Invalid notification ID format
- `401` - Not authenticated
- `404` - Notification not found

**Example**

```bash
curl -X DELETE "https://api.planflow.tools/notifications/dd0e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer pf_abc123..."
```

---

### DELETE /notifications

Delete all notifications for the authenticated user.

**Authentication:** Required

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `readOnly` | boolean | false | If true, only delete read notifications |

**Success Response (200)**

```json
{
  "success": true,
  "data": {
    "deletedCount": 25
  }
}
```

**Error Responses**
- `401` - Not authenticated

**Examples**

```bash
# Delete all notifications
curl -X DELETE "https://api.planflow.tools/notifications" \
  -H "Authorization: Bearer pf_abc123..."

# Delete only read notifications
curl -X DELETE "https://api.planflow.tools/notifications?readOnly=true" \
  -H "Authorization: Bearer pf_abc123..."
```

---

## Push Notifications

Browser push notifications using the Web Push API.

### GET /notifications/push/vapid-public-key

Get the VAPID public key for push notification subscription.

**Authentication:** None required

**Success Response (200)**

```json
{
  "success": true,
  "data": {
    "publicKey": "BFI5..."
  }
}
```

**Error Responses**
- `503` - Push notifications not configured on server

**Example**

```bash
curl "https://api.planflow.tools/notifications/push/vapid-public-key"
```

**JavaScript Usage**

```javascript
// Get VAPID key and subscribe to push
const response = await fetch('/notifications/push/vapid-public-key');
const { data } = await response.json();

const registration = await navigator.serviceWorker.ready;
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: data.publicKey
});

// Send subscription to server
await fetch('/notifications/push/subscribe', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ subscription })
});
```

---

### POST /notifications/push/subscribe

Subscribe to push notifications.

**Authentication:** Required

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `subscription` | object | Yes | Web Push subscription object |
| `subscription.endpoint` | string | Yes | Push service endpoint URL |
| `subscription.keys.p256dh` | string | Yes | P-256 ECDH public key |
| `subscription.keys.auth` | string | Yes | Authentication secret |

**Request**

```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": {
      "p256dh": "BNcRdreALRFXTkOOUHK1...",
      "auth": "tBHItJI5svbpez7KI4..."
    }
  }
}
```

**Success Response (200)**

```json
{
  "success": true,
  "data": {
    "id": "ee0e8400-e29b-41d4-a716-446655440000",
    "createdAt": "2026-01-30T14:00:00.000Z"
  }
}
```

**Error Responses**
- `400` - Invalid subscription object (missing endpoint or keys)
- `401` - Not authenticated

**Example**

```bash
curl -X POST "https://api.planflow.tools/notifications/push/subscribe" \
  -H "Authorization: Bearer pf_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "subscription": {
      "endpoint": "https://fcm.googleapis.com/fcm/send/...",
      "keys": {
        "p256dh": "BNcRdreALRFXTkOOUHK1...",
        "auth": "tBHItJI5svbpez7KI4..."
      }
    }
  }'
```

---

### DELETE /notifications/push/subscribe

Unsubscribe from push notifications.

**Authentication:** Required

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `endpoint` | string | Yes | Push subscription endpoint to remove |

**Request**

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/..."
}
```

**Success Response (200)**

```json
{
  "success": true,
  "data": {
    "unsubscribed": true
  }
}
```

**Error Responses**
- `400` - Endpoint is required
- `401` - Not authenticated

**Example**

```bash
curl -X DELETE "https://api.planflow.tools/notifications/push/subscribe" \
  -H "Authorization: Bearer pf_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "https://fcm.googleapis.com/fcm/send/..."
  }'
```

---

### POST /notifications/push/test

Send a test push notification to verify setup.

**Authentication:** Required

**Success Response (200)**

```json
{
  "success": true,
  "data": {
    "sent": 1,
    "failed": 0,
    "message": "Test notification sent to 1 device(s)"
  }
}
```

**Error Responses**
- `401` - Not authenticated
- `503` - Push notifications not configured

**Example**

```bash
curl -X POST "https://api.planflow.tools/notifications/push/test" \
  -H "Authorization: Bearer pf_abc123..."
```

---

## Notification Preferences

Manage how and when you receive notifications.

### GET /notifications/preferences

Get current notification preferences.

**Authentication:** Required

**Success Response (200)**

```json
{
  "success": true,
  "data": {
    "pushEnabled": true,
    "pushMentions": true,
    "pushAssignments": true,
    "pushComments": true,
    "pushStatusChanges": false,
    "pushTaskCreated": false,
    "pushInvitations": true,
    "emailEnabled": true,
    "emailMentions": true,
    "emailAssignments": true,
    "emailDigest": true,
    "emailDigestFrequency": "daily",
    "emailDigestTime": "09:00",
    "emailDigestTimezone": "America/New_York",
    "lastDigestSentAt": "2026-01-30T09:00:00.000Z",
    "toastEnabled": true
  }
}
```

**Error Responses**
- `401` - Not authenticated

**Example**

```bash
curl "https://api.planflow.tools/notifications/preferences" \
  -H "Authorization: Bearer pf_abc123..."
```

---

### PATCH /notifications/preferences

Update notification preferences. All fields are optional - only include fields you want to change.

**Authentication:** Required

**Request Body**

| Field | Type | Description |
|-------|------|-------------|
| `pushEnabled` | boolean | Master toggle for push notifications |
| `pushMentions` | boolean | Push for @mentions |
| `pushAssignments` | boolean | Push for task assignments |
| `pushComments` | boolean | Push for new comments |
| `pushStatusChanges` | boolean | Push for task status changes |
| `pushTaskCreated` | boolean | Push for new tasks |
| `pushInvitations` | boolean | Push for team invitations |
| `emailEnabled` | boolean | Master toggle for email notifications |
| `emailMentions` | boolean | Email for @mentions |
| `emailAssignments` | boolean | Email for task assignments |
| `emailDigest` | boolean | Enable digest emails |
| `emailDigestFrequency` | string | `daily`, `weekly`, or `none` |
| `emailDigestTime` | string | Time in HH:MM format (24-hour) |
| `emailDigestTimezone` | string | IANA timezone (e.g., "America/New_York") |
| `toastEnabled` | boolean | In-app toast notifications |

**Request**

```json
{
  "pushEnabled": true,
  "pushMentions": true,
  "emailDigestFrequency": "weekly",
  "emailDigestTime": "08:00"
}
```

**Success Response (200)**

Returns the updated preferences (same format as GET).

**Error Responses**
- `400` - Invalid values (e.g., invalid frequency, invalid time format)
- `401` - Not authenticated

**Example**

```bash
curl -X PATCH "https://api.planflow.tools/notifications/preferences" \
  -H "Authorization: Bearer pf_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "emailDigestFrequency": "daily",
    "emailDigestTime": "09:00",
    "pushStatusChanges": true
  }'
```

---

## Email Digest

Digest emails summarize recent activity on a daily or weekly basis.

### POST /notifications/digest/test

Send a test digest email to verify setup.

**Authentication:** Required

**Success Response (200)**

```json
{
  "success": true,
  "data": {
    "messageId": "abc123...",
    "notificationCount": 12,
    "message": "Test digest email sent successfully"
  }
}
```

**Error Responses**
- `400` - No notifications in the last 24 hours
- `401` - Not authenticated
- `404` - User not found
- `503` - Email service not configured

**Example**

```bash
curl -X POST "https://api.planflow.tools/notifications/digest/test" \
  -H "Authorization: Bearer pf_abc123..."
```

---

### GET /notifications/digest/history

Get the history of digest emails sent.

**Authentication:** Required

**Query Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 10 | Number of records (max: 50) |

**Success Response (200)**

```json
{
  "success": true,
  "data": {
    "digests": [
      {
        "id": "ff0e8400-e29b-41d4-a716-446655440000",
        "frequency": "daily",
        "notificationCount": 12,
        "fromDate": "2026-01-29T09:00:00.000Z",
        "toDate": "2026-01-30T09:00:00.000Z",
        "sentAt": "2026-01-30T09:00:05.000Z",
        "status": "sent",
        "errorMessage": null
      },
      {
        "id": "ff0e8400-e29b-41d4-a716-446655440001",
        "frequency": "daily",
        "notificationCount": 8,
        "fromDate": "2026-01-28T09:00:00.000Z",
        "toDate": "2026-01-29T09:00:00.000Z",
        "sentAt": "2026-01-29T09:00:03.000Z",
        "status": "sent",
        "errorMessage": null
      }
    ]
  }
}
```

**Error Responses**
- `401` - Not authenticated

**Example**

```bash
curl "https://api.planflow.tools/notifications/digest/history?limit=10" \
  -H "Authorization: Bearer pf_abc123..."
```

---

## Schemas

### Notification

```typescript
interface Notification {
  id: string;              // UUID
  userId: string;          // UUID - recipient
  type: NotificationType;  // See Notification Types
  title: string;           // Human-readable title (max 255 chars)
  body?: string;           // Optional detailed body
  link?: string;           // Navigation URL (max 500 chars)
  projectId?: string;      // UUID - associated project
  organizationId?: string; // UUID - associated organization
  actorId?: string;        // UUID - user who triggered notification
  taskId?: string;         // Human-readable task ID (e.g., "T2.1")
  readAt?: string;         // ISO 8601 datetime (null = unread)
  createdAt: string;       // ISO 8601 datetime
  actor?: {                // Actor details (if actorId exists)
    id: string;
    email?: string;
    name?: string;
  };
}

type NotificationType =
  | 'mention'
  | 'assignment'
  | 'unassignment'
  | 'comment'
  | 'comment_reply'
  | 'status_change'
  | 'task_created'
  | 'task_deleted'
  | 'invitation'
  | 'member_joined'
  | 'member_removed'
  | 'role_changed';
```

### NotificationPreferences

```typescript
interface NotificationPreferences {
  // Push notification settings
  pushEnabled: boolean;        // Master toggle
  pushMentions: boolean;       // @mentions
  pushAssignments: boolean;    // Task assignments
  pushComments: boolean;       // New comments
  pushStatusChanges: boolean;  // Task status changes
  pushTaskCreated: boolean;    // New tasks
  pushInvitations: boolean;    // Team invitations

  // Email notification settings
  emailEnabled: boolean;       // Master toggle
  emailMentions: boolean;      // @mentions
  emailAssignments: boolean;   // Task assignments
  emailDigest: boolean;        // Digest emails
  emailDigestFrequency: 'daily' | 'weekly' | 'none';
  emailDigestTime: string;     // HH:MM format (24-hour)
  emailDigestTimezone: string; // IANA timezone

  // Other
  lastDigestSentAt?: string;   // ISO 8601 datetime
  toastEnabled: boolean;       // In-app toasts
}
```

### PushSubscription

```typescript
interface PushSubscription {
  id: string;              // UUID
  userId: string;          // UUID
  endpoint: string;        // Push service endpoint
  p256dh: string;          // Encryption key
  auth: string;            // Authentication secret
  userAgent?: string;      // Device identification
  isActive: boolean;       // Active status
  expiresAt?: string;      // ISO 8601 datetime
  createdAt: string;       // ISO 8601 datetime
  updatedAt: string;       // ISO 8601 datetime
}
```

### DigestHistory

```typescript
interface DigestHistory {
  id: string;                  // UUID
  frequency: 'daily' | 'weekly';
  notificationCount: number;   // Notifications included
  fromDate?: string;           // ISO 8601 datetime
  toDate?: string;             // ISO 8601 datetime
  sentAt: string;              // ISO 8601 datetime
  status: 'sent' | 'failed';
  errorMessage?: string;       // Error details if failed
}
```

---

## WebSocket Integration

Notifications are also delivered in real-time via WebSocket. See the [Real-time API](./API_REALTIME.md) documentation for:

- Connection setup
- `notification:new` event format
- Subscribing to notification channels

---

## Related Documentation

- [API Reference](./API_REFERENCE.md) - Core API endpoints
- [Real-time API](./API_REALTIME.md) - WebSocket events
- [User Guide](./USER_GUIDE.md) - Managing notifications in the dashboard

---

## Support

- **Documentation:** [docs.planflow.tools](https://docs.planflow.tools)
- **GitHub Issues:** [github.com/planflow/planflow/issues](https://github.com/planflow/planflow/issues)
- **Email:** support@planflow.tools
