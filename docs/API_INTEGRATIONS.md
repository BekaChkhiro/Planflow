# PlanFlow Integrations API Reference

> Documentation for external integrations - GitHub, Slack, and Discord

**Version:** 1.0.0
**Base URL:** `https://api.planflow.tools` (Production) | `http://localhost:3001` (Development)

---

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [GitHub Integration](#github-integration)
  - [OAuth Flow](#github-oauth-flow)
  - [Repositories](#github-repositories)
  - [Issues](#github-issues)
  - [Pull Requests](#github-pull-requests)
- [Slack Integration](#slack-integration)
  - [Configure Webhook](#configure-slack-webhook)
  - [Update Settings](#update-slack-settings)
  - [Test Webhook](#test-slack-webhook)
  - [Disconnect](#disconnect-slack)
- [Discord Integration](#discord-integration)
  - [Configure Webhook](#configure-discord-webhook)
  - [Update Settings](#update-discord-settings)
  - [Test Webhook](#test-discord-webhook)
  - [Disconnect](#disconnect-discord)
- [Organization Integrations](#organization-integrations)
  - [Create Integration](#create-integration)
  - [List Integrations](#list-integrations)
  - [Get Integration](#get-integration)
  - [Update Integration](#update-integration)
  - [Delete Integration](#delete-integration)
  - [Test Integration](#test-integration)
- [Incoming Webhooks](#incoming-webhooks)
  - [GitHub Webhooks](#github-webhooks)
- [Events Reference](#events-reference)
- [Schemas](#schemas)

---

## Overview

PlanFlow supports three external integrations:

| Integration | Type | Purpose |
|-------------|------|---------|
| **GitHub** | OAuth | Connect repositories, sync issues/PRs, auto-update tasks |
| **Slack** | Webhook | Send notifications to Slack channels |
| **Discord** | Webhook | Send notifications to Discord channels |

### Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PlanFlow Integrations                            │
└─────────────────────────────────────────────────────────────────────┘

  GitHub (OAuth)                Slack (Webhook)           Discord (Webhook)
       │                              │                         │
       │ OAuth 2.0                    │ Outgoing                │ Outgoing
       ▼                              ▼                         ▼
┌─────────────────┐          ┌─────────────────┐        ┌─────────────────┐
│  GitHub API     │          │  Slack API      │        │  Discord API    │
│  - Repos        │          │  - Messages     │        │  - Messages     │
│  - Issues       │          │  - Attachments  │        │  - Embeds       │
│  - PRs          │          │                 │        │                 │
│  - Webhooks     │          │                 │        │                 │
└─────────────────┘          └─────────────────┘        └─────────────────┘
       │
       │ Incoming Webhooks
       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     PlanFlow API                                     │
│  POST /webhooks/github/project/:projectId                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Authentication

All integration endpoints require JWT authentication unless otherwise specified.

```bash
# Include in all requests
Authorization: Bearer <jwt_token>
```

For organization-scoped endpoints, the user must be a member of the organization. Create/Update/Delete operations require `owner` or `admin` role.

---

## GitHub Integration

GitHub integration uses OAuth 2.0 to connect user accounts and access repository data.

### Required OAuth Scopes

| Scope | Purpose |
|-------|---------|
| `repo` | Full control of private repositories |
| `user:email` | Access user email addresses |
| `read:user` | Read user profile data |
| `admin:repo_hook` | Manage repository webhooks |

---

### GitHub OAuth Flow

#### Step 1: Get Authorization URL

Start the OAuth flow by requesting an authorization URL.

```http
POST /integrations/github/authorize
Authorization: Bearer <jwt_token>
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "authorizationUrl": "https://github.com/login/oauth/authorize?client_id=...&redirect_uri=...&scope=repo%20user:email%20read:user%20admin:repo_hook&state=...",
    "state": "abc123xyz",
    "expiresIn": 600
  }
}
```

**Usage:**
1. Redirect user to `authorizationUrl`
2. Store `state` for verification
3. State expires in 10 minutes

---

#### Step 2: Handle OAuth Callback

After user authorizes, GitHub redirects with a code. Exchange it for tokens.

```http
POST /integrations/github/callback
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "code": "github_authorization_code",
  "state": "abc123xyz"
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "integration": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "githubId": "12345678",
      "githubUsername": "octocat",
      "githubEmail": "octocat@github.com",
      "githubAvatarUrl": "https://avatars.githubusercontent.com/u/12345678",
      "githubName": "The Octocat",
      "grantedScopes": ["repo", "user:email", "read:user", "admin:repo_hook"],
      "isConnected": true,
      "lastSyncAt": "2026-02-24T10:30:00.000Z",
      "createdAt": "2026-02-24T10:30:00.000Z",
      "updatedAt": "2026-02-24T10:30:00.000Z"
    },
    "message": "Successfully connected to GitHub as @octocat"
  }
}
```

**Errors:**
- `400` - Invalid or expired state token
- `400` - GitHub authorization failed

---

#### Get GitHub Status

Check current GitHub connection status.

```http
GET /integrations/github
Authorization: Bearer <jwt_token>
```

**Response (200) - Connected**
```json
{
  "success": true,
  "data": {
    "isConnected": true,
    "integration": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "githubId": "12345678",
      "githubUsername": "octocat",
      "githubEmail": "octocat@github.com",
      "githubAvatarUrl": "https://avatars.githubusercontent.com/u/12345678",
      "githubName": "The Octocat",
      "grantedScopes": ["repo", "user:email", "read:user", "admin:repo_hook"],
      "lastSyncAt": "2026-02-24T10:30:00.000Z"
    }
  }
}
```

**Response (200) - Not Connected**
```json
{
  "success": true,
  "data": {
    "isConnected": false,
    "integration": null
  }
}
```

---

#### Disconnect GitHub

```http
POST /integrations/github/disconnect
Authorization: Bearer <jwt_token>
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "message": "GitHub integration disconnected"
  }
}
```

---

#### Refresh GitHub Info

Sync latest user info from GitHub.

```http
POST /integrations/github/refresh
Authorization: Bearer <jwt_token>
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "integration": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "githubUsername": "octocat",
      "githubEmail": "octocat@github.com",
      "githubAvatarUrl": "https://avatars.githubusercontent.com/u/12345678",
      "githubName": "The Octocat",
      "lastSyncAt": "2026-02-24T12:00:00.000Z"
    }
  }
}
```

---

### GitHub Repositories

#### List Repositories

Get repositories accessible to the authenticated GitHub user.

```http
GET /integrations/github/repos
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `per_page` | integer | 30 | Items per page (max: 100) |

**Response (200)**
```json
{
  "success": true,
  "data": {
    "repositories": [
      {
        "id": 123456789,
        "name": "my-project",
        "fullName": "octocat/my-project",
        "owner": "octocat",
        "ownerAvatar": "https://avatars.githubusercontent.com/u/12345678",
        "description": "A cool project",
        "private": false,
        "htmlUrl": "https://github.com/octocat/my-project",
        "defaultBranch": "main"
      },
      {
        "id": 987654321,
        "name": "private-repo",
        "fullName": "octocat/private-repo",
        "owner": "octocat",
        "ownerAvatar": "https://avatars.githubusercontent.com/u/12345678",
        "description": "A private repository",
        "private": true,
        "htmlUrl": "https://github.com/octocat/private-repo",
        "defaultBranch": "main"
      }
    ],
    "page": 1,
    "perPage": 30
  }
}
```

---

### GitHub Issues

#### List Issues

Get issues from a repository.

```http
GET /integrations/github/repos/:owner/:repo/issues
Authorization: Bearer <jwt_token>
```

**Path Parameters:**
| Parameter | Description |
|-----------|-------------|
| `owner` | Repository owner (username or organization) |
| `repo` | Repository name |

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `state` | string | `open` | Filter by state: `open`, `closed`, `all` |
| `page` | integer | 1 | Page number |
| `per_page` | integer | 30 | Items per page (max: 100) |
| `search` | string | - | Search query for issues |

**Response (200)**
```json
{
  "success": true,
  "data": {
    "issues": [
      {
        "id": 1234567890,
        "number": 42,
        "title": "Bug: Login button not working",
        "body": "When clicking the login button, nothing happens...",
        "state": "open",
        "htmlUrl": "https://github.com/octocat/my-project/issues/42",
        "createdAt": "2026-02-20T10:00:00.000Z",
        "updatedAt": "2026-02-24T08:30:00.000Z",
        "closedAt": null,
        "user": {
          "login": "contributor",
          "avatarUrl": "https://avatars.githubusercontent.com/u/11111111"
        },
        "labels": [
          {
            "name": "bug",
            "color": "d73a4a"
          },
          {
            "name": "priority: high",
            "color": "ff0000"
          }
        ],
        "assignees": [
          {
            "login": "octocat",
            "avatarUrl": "https://avatars.githubusercontent.com/u/12345678"
          }
        ]
      }
    ],
    "page": 1,
    "perPage": 30
  }
}
```

---

#### Get Single Issue

```http
GET /integrations/github/repos/:owner/:repo/issues/:issueNumber
Authorization: Bearer <jwt_token>
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "issue": {
      "id": 1234567890,
      "number": 42,
      "title": "Bug: Login button not working",
      "body": "When clicking the login button, nothing happens...",
      "state": "open",
      "htmlUrl": "https://github.com/octocat/my-project/issues/42",
      "createdAt": "2026-02-20T10:00:00.000Z",
      "updatedAt": "2026-02-24T08:30:00.000Z",
      "closedAt": null,
      "user": {
        "login": "contributor",
        "avatarUrl": "https://avatars.githubusercontent.com/u/11111111"
      },
      "labels": [
        {
          "name": "bug",
          "color": "d73a4a"
        }
      ],
      "assignees": [
        {
          "login": "octocat",
          "avatarUrl": "https://avatars.githubusercontent.com/u/12345678"
        }
      ]
    }
  }
}
```

---

### GitHub Pull Requests

#### List Pull Requests

Get pull requests from a repository.

```http
GET /integrations/github/repos/:owner/:repo/pulls
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `state` | string | `open` | Filter by state: `open`, `closed`, `all` |
| `page` | integer | 1 | Page number |
| `per_page` | integer | 30 | Items per page (max: 100) |
| `search` | string | - | Search query for PRs |

**Response (200)**
```json
{
  "success": true,
  "data": {
    "pullRequests": [
      {
        "id": 9876543210,
        "number": 15,
        "title": "feat: Add user authentication",
        "body": "This PR implements user authentication with JWT...",
        "state": "open",
        "htmlUrl": "https://github.com/octocat/my-project/pull/15",
        "draft": false,
        "headBranch": "feature/T1.1-user-auth",
        "baseBranch": "main",
        "createdAt": "2026-02-22T14:00:00.000Z",
        "updatedAt": "2026-02-24T09:15:00.000Z",
        "closedAt": null,
        "mergedAt": null,
        "user": {
          "login": "octocat",
          "avatarUrl": "https://avatars.githubusercontent.com/u/12345678"
        },
        "labels": [
          {
            "name": "enhancement",
            "color": "a2eeef"
          }
        ],
        "assignees": [],
        "requestedReviewers": [
          {
            "login": "reviewer",
            "avatarUrl": "https://avatars.githubusercontent.com/u/22222222"
          }
        ]
      }
    ],
    "page": 1,
    "perPage": 30
  }
}
```

---

#### Get Single Pull Request

```http
GET /integrations/github/repos/:owner/:repo/pulls/:prNumber
Authorization: Bearer <jwt_token>
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "pullRequest": {
      "id": 9876543210,
      "number": 15,
      "title": "feat: Add user authentication",
      "body": "This PR implements user authentication with JWT...",
      "state": "open",
      "htmlUrl": "https://github.com/octocat/my-project/pull/15",
      "draft": false,
      "headBranch": "feature/T1.1-user-auth",
      "baseBranch": "main",
      "createdAt": "2026-02-22T14:00:00.000Z",
      "updatedAt": "2026-02-24T09:15:00.000Z",
      "closedAt": null,
      "mergedAt": null,
      "user": {
        "login": "octocat",
        "avatarUrl": "https://avatars.githubusercontent.com/u/12345678"
      },
      "labels": [],
      "assignees": [],
      "requestedReviewers": []
    }
  }
}
```

---

## Slack Integration

Slack integration uses webhooks to send notifications to Slack channels.

### Configure Slack Webhook

```http
POST /integrations/slack/webhook
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "webhookUrl": "https://hooks.slack.com/services/TXXXXXXXX/BXXXXXXXX/your-webhook-token",
  "channel": "#engineering",
  "username": "PlanFlow",
  "iconEmoji": ":clipboard:"
}
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `webhookUrl` | string | Yes | Slack incoming webhook URL |
| `channel` | string | No | Target channel (e.g., `#general`) |
| `username` | string | No | Bot display name (default: `PlanFlow`) |
| `iconEmoji` | string | No | Bot emoji (e.g., `:clipboard:`) |
| `iconUrl` | string | No | Bot avatar URL (alternative to emoji) |

**Webhook URL Format:**
```
https://hooks.slack.com/services/{TEAM_ID}/{BOT_ID}/{TOKEN}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "integration": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "provider": "slack",
      "active": true,
      "config": {
        "channel": "#engineering",
        "username": "PlanFlow",
        "icon_emoji": ":clipboard:"
      },
      "createdAt": "2026-02-24T10:00:00.000Z"
    },
    "message": "Slack webhook configured successfully"
  }
}
```

---

### Update Slack Settings

```http
PATCH /integrations/slack/:id
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "channel": "#dev-updates",
  "username": "PlanFlow Bot",
  "enabledEvents": ["task_completed", "task_assigned"]
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "integration": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "provider": "slack",
      "active": true,
      "config": {
        "channel": "#dev-updates",
        "username": "PlanFlow Bot",
        "icon_emoji": ":clipboard:"
      },
      "enabledEvents": ["task_completed", "task_assigned"],
      "updatedAt": "2026-02-24T11:00:00.000Z"
    }
  }
}
```

---

### Test Slack Webhook

Send a test message to verify the webhook is working.

```http
POST /integrations/slack/:id/test
Authorization: Bearer <jwt_token>
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "message": "Test message sent successfully",
    "deliveredAt": "2026-02-24T10:30:00.000Z"
  }
}
```

**Response (400) - Webhook Failed**
```json
{
  "success": false,
  "error": "Failed to send test message",
  "details": {
    "statusCode": 404,
    "response": "channel_not_found"
  }
}
```

---

### Disconnect Slack

```http
DELETE /integrations/slack
Authorization: Bearer <jwt_token>
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "message": "Slack integration disconnected"
  }
}
```

---

## Discord Integration

Discord integration uses webhooks to send notifications to Discord channels.

### Configure Discord Webhook

```http
POST /integrations/discord/webhook
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "webhookUrl": "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz",
  "username": "PlanFlow",
  "avatarUrl": "https://example.com/planflow-avatar.png"
}
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `webhookUrl` | string | Yes | Discord webhook URL |
| `username` | string | No | Bot display name (default: `PlanFlow`) |
| `avatarUrl` | string | No | Bot avatar URL |
| `useEmbeds` | boolean | No | Use rich embeds (default: `true`) |

**Webhook URL Formats:**
```
https://discord.com/api/webhooks/{webhook.id}/{webhook.token}
https://discordapp.com/api/webhooks/{webhook.id}/{webhook.token}
```

**Response (201)**
```json
{
  "success": true,
  "data": {
    "integration": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "provider": "discord",
      "active": true,
      "config": {
        "username": "PlanFlow",
        "avatar_url": "https://example.com/planflow-avatar.png",
        "useEmbeds": true
      },
      "createdAt": "2026-02-24T10:00:00.000Z"
    },
    "message": "Discord webhook configured successfully"
  }
}
```

---

### Update Discord Settings

```http
PATCH /integrations/discord/:id
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "username": "PlanFlow Notifications",
  "enabledEvents": ["task_completed", "mention"]
}
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "integration": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "provider": "discord",
      "active": true,
      "config": {
        "username": "PlanFlow Notifications",
        "useEmbeds": true
      },
      "enabledEvents": ["task_completed", "mention"],
      "updatedAt": "2026-02-24T11:00:00.000Z"
    }
  }
}
```

---

### Test Discord Webhook

```http
POST /integrations/discord/:id/test
Authorization: Bearer <jwt_token>
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "message": "Test message sent successfully",
    "deliveredAt": "2026-02-24T10:30:00.000Z"
  }
}
```

---

### Disconnect Discord

```http
DELETE /integrations/discord
Authorization: Bearer <jwt_token>
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "message": "Discord integration disconnected"
  }
}
```

---

## Organization Integrations

Organization-scoped integrations allow teams to configure shared Slack/Discord webhooks.

### Create Integration

Create a new integration for an organization.

```http
POST /organizations/:organizationId/integrations
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "provider": "slack",
  "name": "Engineering Notifications",
  "webhookUrl": "https://hooks.slack.com/services/TXXXXXXXX/BXXXXXXXX/your-webhook-token",
  "projectId": "550e8400-e29b-41d4-a716-446655440001",
  "config": {
    "channel": "#engineering",
    "username": "PlanFlow",
    "icon_emoji": ":clipboard:",
    "includeLinks": true,
    "mentionUsers": false
  },
  "enabledEvents": [
    "task_status_changed",
    "task_assigned",
    "task_completed",
    "comment_created",
    "mention"
  ]
}
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | string | Yes | `slack` or `discord` |
| `name` | string | Yes | Display name (1-100 chars) |
| `webhookUrl` | string | Yes | Webhook URL |
| `projectId` | string | No | Limit to specific project |
| `config` | object | No | Provider-specific config |
| `enabledEvents` | string[] | No | Events to trigger notifications |

**Required Role:** `owner` or `admin`

**Response (201)**
```json
{
  "success": true,
  "data": {
    "integration": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "organizationId": "org-uuid",
      "projectId": "project-uuid",
      "provider": "slack",
      "name": "Engineering Notifications",
      "webhookUrl": "https://hooks.slack.com/...",
      "config": {
        "channel": "#engineering",
        "username": "PlanFlow",
        "icon_emoji": ":clipboard:",
        "includeLinks": true,
        "mentionUsers": false
      },
      "enabledEvents": [
        "task_status_changed",
        "task_assigned",
        "task_completed",
        "comment_created",
        "mention"
      ],
      "active": true,
      "createdBy": "user-uuid",
      "createdAt": "2026-02-24T10:00:00.000Z",
      "updatedAt": "2026-02-24T10:00:00.000Z"
    }
  }
}
```

---

### List Integrations

Get all integrations for an organization.

```http
GET /organizations/:organizationId/integrations
Authorization: Bearer <jwt_token>
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "integrations": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "organizationId": "org-uuid",
        "projectId": null,
        "provider": "slack",
        "name": "Engineering Notifications",
        "active": true,
        "enabledEvents": ["task_completed", "task_assigned"],
        "lastDeliveryAt": "2026-02-24T09:45:00.000Z",
        "lastDeliveryStatus": "success",
        "createdAt": "2026-02-20T10:00:00.000Z"
      },
      {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "organizationId": "org-uuid",
        "projectId": "project-uuid",
        "provider": "discord",
        "name": "Project Alerts",
        "active": true,
        "enabledEvents": ["mention", "task_status_changed"],
        "lastDeliveryAt": "2026-02-24T08:30:00.000Z",
        "lastDeliveryStatus": "success",
        "createdAt": "2026-02-22T14:00:00.000Z"
      }
    ]
  }
}
```

---

### Get Integration

Get a specific integration with webhook delivery history.

```http
GET /organizations/:organizationId/integrations/:integrationId
Authorization: Bearer <jwt_token>
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "integration": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "organizationId": "org-uuid",
      "projectId": null,
      "provider": "slack",
      "name": "Engineering Notifications",
      "webhookUrl": "https://hooks.slack.com/...",
      "config": {
        "channel": "#engineering",
        "username": "PlanFlow"
      },
      "enabledEvents": ["task_completed", "task_assigned"],
      "active": true,
      "lastDeliveryAt": "2026-02-24T09:45:00.000Z",
      "lastDeliveryStatus": "success",
      "createdBy": "user-uuid",
      "createdAt": "2026-02-20T10:00:00.000Z",
      "updatedAt": "2026-02-24T09:00:00.000Z"
    },
    "recentDeliveries": [
      {
        "id": "delivery-uuid-1",
        "eventType": "task_completed",
        "success": true,
        "statusCode": "200",
        "deliveredAt": "2026-02-24T09:45:00.000Z",
        "durationMs": "234"
      },
      {
        "id": "delivery-uuid-2",
        "eventType": "task_assigned",
        "success": true,
        "statusCode": "200",
        "deliveredAt": "2026-02-24T08:30:00.000Z",
        "durationMs": "189"
      }
    ]
  }
}
```

---

### Update Integration

```http
PATCH /organizations/:organizationId/integrations/:integrationId
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Dev Team Slack",
  "webhookUrl": "https://hooks.slack.com/services/NEW/WEBHOOK/URL",
  "config": {
    "channel": "#dev-updates"
  },
  "enabledEvents": ["task_completed"],
  "active": false
}
```

**Required Role:** `owner` or `admin`

**Response (200)**
```json
{
  "success": true,
  "data": {
    "integration": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Dev Team Slack",
      "active": false,
      "config": {
        "channel": "#dev-updates"
      },
      "enabledEvents": ["task_completed"],
      "updatedAt": "2026-02-24T11:00:00.000Z"
    }
  }
}
```

---

### Delete Integration

```http
DELETE /organizations/:organizationId/integrations/:integrationId
Authorization: Bearer <jwt_token>
```

**Required Role:** `owner` or `admin`

**Response (200)**
```json
{
  "success": true,
  "data": {
    "message": "Integration deleted successfully"
  }
}
```

---

### Test Integration

Send a test message to verify the integration is working.

```http
POST /organizations/:organizationId/integrations/:integrationId/test
Authorization: Bearer <jwt_token>
```

**Response (200)**
```json
{
  "success": true,
  "data": {
    "message": "Test message sent successfully",
    "deliveredAt": "2026-02-24T10:30:00.000Z",
    "statusCode": "200",
    "durationMs": "245"
  }
}
```

---

## Incoming Webhooks

PlanFlow receives webhooks from external services to trigger actions.

### GitHub Webhooks

GitHub can send webhooks to PlanFlow to auto-update task status when PRs are merged.

#### Webhook Endpoint

```
POST /webhooks/github/project/:projectId
```

**Path Parameters:**
| Parameter | Description |
|-----------|-------------|
| `projectId` | PlanFlow project UUID |

#### Signature Verification

GitHub signs webhooks using HMAC-SHA256. PlanFlow verifies the signature using the project's webhook secret.

**Headers Required:**
| Header | Description |
|--------|-------------|
| `x-hub-signature-256` | HMAC-SHA256 signature: `sha256=<hex_digest>` |
| `x-github-event` | Event type: `pull_request`, `issues`, `push` |
| `x-github-delivery` | Unique delivery ID |

**Signature Calculation:**
```
signature = "sha256=" + HMAC-SHA256(webhook_secret, raw_request_body).hexdigest()
```

#### Supported Events

| Event | Action | PlanFlow Behavior |
|-------|--------|-------------------|
| `pull_request` | `closed` + `merged=true` | Task → DONE if PR title/body contains task ID |
| `pull_request` | `opened` | Link PR to task if mentioned |
| `issues` | `closed` | Task → DONE if issue linked |
| `issues` | `opened` | Link issue to task if mentioned |

#### PR Merge Auto-Complete

When a PR is merged, PlanFlow looks for task IDs in:
1. PR title (e.g., "feat: T1.1 - Add login")
2. PR body (e.g., "Closes T1.1")
3. Branch name (e.g., `feature/T1.1-login`)

**Task ID Patterns Recognized:**
- `T1.1`, `T2.3`, `T15.14` (standard format)
- `Closes T1.1`, `Fixes T2.3` (GitHub keywords)
- `Related to T1.1`, `Part of T2.3`

**Response (200)**
```json
{
  "success": true,
  "data": {
    "received": true,
    "event": "pull_request",
    "action": "closed",
    "tasksUpdated": ["T1.1"]
  }
}
```

**Response (401) - Invalid Signature**
```json
{
  "success": false,
  "error": "Invalid webhook signature"
}
```

---

## Events Reference

Events that can trigger Slack/Discord notifications.

### Task Events

| Event | Description | Payload Includes |
|-------|-------------|------------------|
| `task_created` | New task created | Task details, creator |
| `task_updated` | Task details changed | Task details, changes, editor |
| `task_status_changed` | Status changed | Task, old status, new status |
| `task_assigned` | Task assigned to user | Task, assignee, assigner |
| `task_unassigned` | Assignment removed | Task, previous assignee |
| `task_completed` | Task marked as DONE | Task, completer |

### Comment Events

| Event | Description | Payload Includes |
|-------|-------------|------------------|
| `comment_created` | New comment added | Comment, task, author |
| `comment_reply` | Reply to comment | Comment, parent, author |

### Team Events

| Event | Description | Payload Includes |
|-------|-------------|------------------|
| `mention` | User @mentioned | Mention context, mentioner |
| `member_joined` | New member joined | Member, organization |
| `member_removed` | Member removed | Member, organization |

### Project Events

| Event | Description | Payload Includes |
|-------|-------------|------------------|
| `plan_updated` | Plan content changed | Project, editor |

---

## Schemas

### Integration Object

```typescript
interface Integration {
  id: string;                    // UUID
  organizationId: string;        // UUID
  projectId: string | null;      // UUID, optional project scope
  provider: "slack" | "discord"; // Integration provider
  name: string;                  // Display name
  webhookUrl: string;            // Webhook URL
  config: object;                // Provider-specific config
  enabledEvents: string[];       // Events to trigger on
  active: boolean;               // Is integration enabled
  createdBy: string;             // User UUID who created
  createdAt: string;             // ISO 8601 timestamp
  updatedAt: string;             // ISO 8601 timestamp
  lastDeliveryAt: string | null; // Last webhook delivery
  lastDeliveryStatus: "success" | "failed" | null;
  lastDeliveryError: string | null;
}
```

### GitHub Integration Object

```typescript
interface GitHubIntegration {
  id: string;                    // UUID
  userId: string;                // User UUID
  githubId: string;              // GitHub user ID
  githubUsername: string;        // GitHub username
  githubEmail: string | null;    // GitHub email
  githubAvatarUrl: string | null;// GitHub avatar
  githubName: string | null;     // GitHub display name
  grantedScopes: string[];       // OAuth scopes granted
  isConnected: boolean;          // Connection status
  disconnectedAt: string | null; // When disconnected
  lastSyncAt: string | null;     // Last profile sync
  createdAt: string;             // ISO 8601 timestamp
  updatedAt: string;             // ISO 8601 timestamp
}
```

### Webhook Delivery Object

```typescript
interface WebhookDelivery {
  id: string;                    // UUID
  integrationId: string;         // Integration UUID
  eventType: string;             // Event that triggered this
  payload: object;               // Webhook payload sent
  statusCode: string;            // HTTP status code
  responseBody: string | null;   // Response from webhook
  error: string | null;          // Error message if failed
  success: boolean;              // Delivery success status
  deliveredAt: string;           // ISO 8601 timestamp
  durationMs: string;            // Request duration in ms
}
```

### Slack Config Object

```typescript
interface SlackConfig {
  channel?: string;              // Target channel (e.g., #general)
  username?: string;             // Bot username (default: PlanFlow)
  icon_emoji?: string;           // Bot emoji (e.g., :clipboard:)
  icon_url?: string;             // Bot avatar URL
  includeLinks?: boolean;        // Include task links (default: true)
  mentionUsers?: boolean;        // @mention users in notifications
}
```

### Discord Config Object

```typescript
interface DiscordConfig {
  username?: string;             // Bot username (default: PlanFlow)
  avatar_url?: string;           // Bot avatar URL
  useEmbeds?: boolean;           // Use rich embeds (default: true)
}
```

---

## Example: Complete Integration Setup

### 1. Connect GitHub

```bash
# Get authorization URL
curl -X POST https://api.planflow.tools/integrations/github/authorize \
  -H "Authorization: Bearer <jwt_token>"

# Response contains authorizationUrl - redirect user there
# After user authorizes, GitHub redirects with ?code=xxx&state=yyy

# Complete OAuth
curl -X POST https://api.planflow.tools/integrations/github/callback \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"code": "github_code", "state": "state_from_step1"}'
```

### 2. Set Up Slack Notifications

```bash
# Configure organization Slack webhook
curl -X POST https://api.planflow.tools/organizations/org-uuid/integrations \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "slack",
    "name": "Dev Team Slack",
    "webhookUrl": "https://hooks.slack.com/services/T.../B.../xxx",
    "config": {
      "channel": "#dev-updates",
      "username": "PlanFlow"
    },
    "enabledEvents": ["task_completed", "task_assigned", "mention"]
  }'

# Test the webhook
curl -X POST https://api.planflow.tools/organizations/org-uuid/integrations/integration-uuid/test \
  -H "Authorization: Bearer <jwt_token>"
```

### 3. Configure GitHub Webhook

In your GitHub repository settings:

1. Go to **Settings** → **Webhooks** → **Add webhook**
2. **Payload URL:** `https://api.planflow.tools/webhooks/github/project/<project-uuid>`
3. **Content type:** `application/json`
4. **Secret:** Your project's webhook secret
5. **Events:** Select "Pull requests" and "Issues"

Now when PRs mentioning task IDs are merged, tasks will automatically be marked as DONE.

---

*Last updated: 2026-02-25*
