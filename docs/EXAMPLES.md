# PlanFlow API Examples & Code Snippets

> Ready-to-use code examples for integrating with the PlanFlow API

**Version:** 1.0.0
**Last Updated:** 2026-02-25

---

## Table of Contents

- [Quick Start](#quick-start)
- [Authentication](#authentication)
  - [Register and Login](#register-and-login)
  - [Token Refresh Flow](#token-refresh-flow)
  - [API Token Management](#api-token-management)
- [Projects](#projects)
  - [CRUD Operations](#project-crud-operations)
  - [Plan Sync](#plan-sync)
- [Tasks](#tasks)
  - [List and Update Tasks](#list-and-update-tasks)
  - [Batch Updates](#batch-task-updates)
  - [Task Assignment](#task-assignment)
- [Organizations & Teams](#organizations--teams)
  - [Create and Manage Teams](#create-and-manage-teams)
  - [Invitations](#team-invitations)
  - [Activity Log](#activity-log)
- [Integrations](#integrations)
  - [GitHub OAuth](#github-integration)
  - [Slack Webhooks](#slack-integration)
  - [Discord Webhooks](#discord-integration)
- [Real-time WebSocket](#real-time-websocket)
  - [Connection Setup](#websocket-connection)
  - [Presence System](#presence-system)
  - [Task Locking](#task-locking)
- [Notifications](#notifications)
  - [Manage Notifications](#manage-notifications)
  - [Push Notifications](#push-notifications)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [Complete Examples](#complete-examples)

---

## Quick Start

### Environment Setup

```bash
# Base URLs
export PLANFLOW_API_URL="https://api.planflow.tools"  # Production
export PLANFLOW_API_URL="http://localhost:3001"       # Development

# Your API token (get from dashboard or via API)
export PLANFLOW_TOKEN="pf_your_api_token_here"
```

### First API Call

```bash
# Test connectivity
curl $PLANFLOW_API_URL/health

# Get your user info
curl $PLANFLOW_API_URL/auth/me \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"
```

---

## Authentication

### Register and Login

#### cURL

```bash
# Register a new user
curl -X POST $PLANFLOW_API_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "developer@example.com",
    "password": "SecurePassword123!",
    "name": "Developer Name"
  }'

# Login and get tokens
curl -X POST $PLANFLOW_API_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "developer@example.com",
    "password": "SecurePassword123!"
  }'
```

#### JavaScript/TypeScript

```typescript
const API_URL = 'https://api.planflow.tools';

interface AuthResponse {
  success: boolean;
  data: {
    user: { id: string; email: string; name: string };
    token: string;
    refreshToken: string;
    expiresIn: number;
  };
}

// Register
async function register(email: string, password: string, name: string) {
  const response = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name })
  });
  return response.json();
}

// Login
async function login(email: string, password: string): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  return response.json();
}

// Usage
const auth = await login('developer@example.com', 'SecurePassword123!');
const accessToken = auth.data.token;
const refreshToken = auth.data.refreshToken;
```

#### Python

```python
import requests

API_URL = "https://api.planflow.tools"

def login(email: str, password: str) -> dict:
    """Authenticate and get tokens."""
    response = requests.post(
        f"{API_URL}/auth/login",
        json={"email": email, "password": password}
    )
    response.raise_for_status()
    return response.json()

# Usage
auth = login("developer@example.com", "SecurePassword123!")
access_token = auth["data"]["token"]
refresh_token = auth["data"]["refreshToken"]
```

### Token Refresh Flow

Access tokens expire in 15 minutes. Implement automatic refresh:

#### JavaScript/TypeScript

```typescript
class PlanFlowClient {
  private accessToken: string;
  private refreshToken: string;
  private tokenExpiry: number;

  constructor(accessToken: string, refreshToken: string, expiresIn: number) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.tokenExpiry = Date.now() + expiresIn * 1000;
  }

  private async refreshAccessToken(): Promise<void> {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken })
    });

    if (!response.ok) {
      throw new Error('Token refresh failed - please login again');
    }

    const data = await response.json();
    this.accessToken = data.data.token;
    this.tokenExpiry = Date.now() + data.data.expiresIn * 1000;
  }

  async request(path: string, options: RequestInit = {}): Promise<Response> {
    // Refresh token if expiring in next 60 seconds
    if (Date.now() > this.tokenExpiry - 60000) {
      await this.refreshAccessToken();
    }

    return fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
  }
}

// Usage
const client = new PlanFlowClient(accessToken, refreshToken, 900);
const projects = await client.request('/projects').then(r => r.json());
```

### API Token Management

Create long-lived tokens for MCP/CLI integration:

#### cURL

```bash
# Create an API token (requires JWT auth)
curl -X POST $PLANFLOW_API_URL/api-tokens \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MCP Integration Token",
    "expiresInDays": 90
  }'

# List your tokens
curl $PLANFLOW_API_URL/api-tokens \
  -H "Authorization: Bearer $JWT_TOKEN"

# Revoke a token
curl -X DELETE $PLANFLOW_API_URL/api-tokens/TOKEN_ID \
  -H "Authorization: Bearer $JWT_TOKEN"

# Verify a token (useful for MCP server)
curl -X POST $PLANFLOW_API_URL/api-tokens/verify \
  -H "Content-Type: application/json" \
  -d '{"token": "pf_your_api_token"}'
```

---

## Projects

### Project CRUD Operations

#### cURL

```bash
# List all projects
curl $PLANFLOW_API_URL/projects \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"

# Create a new project
curl -X POST $PLANFLOW_API_URL/projects \
  -H "Authorization: Bearer $PLANFLOW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My New Project",
    "description": "A project description",
    "plan": "# Project Plan\n\n## Phase 1\n\n### Tasks\n\n| ID | Task | Status |\n|---|---|---|\n| T1.1 | Setup | TODO |"
  }'

# Update a project
curl -X PUT $PLANFLOW_API_URL/projects/PROJECT_ID \
  -H "Authorization: Bearer $PLANFLOW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Project Name",
    "description": "Updated description"
  }'

# Delete a project
curl -X DELETE $PLANFLOW_API_URL/projects/PROJECT_ID \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"
```

#### JavaScript/TypeScript

```typescript
interface Project {
  id: string;
  name: string;
  description?: string;
  plan?: string;
  createdAt: string;
  updatedAt: string;
}

class ProjectService {
  constructor(private client: PlanFlowClient) {}

  async list(): Promise<Project[]> {
    const response = await this.client.request('/projects');
    const data = await response.json();
    return data.data.projects;
  }

  async create(name: string, description?: string, plan?: string): Promise<Project> {
    const response = await this.client.request('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, description, plan })
    });
    const data = await response.json();
    return data.data.project;
  }

  async update(id: string, updates: Partial<Project>): Promise<Project> {
    const response = await this.client.request(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
    const data = await response.json();
    return data.data.project;
  }

  async delete(id: string): Promise<void> {
    await this.client.request(`/projects/${id}`, { method: 'DELETE' });
  }
}
```

### Plan Sync

Sync PROJECT_PLAN.md between local and cloud:

#### cURL

```bash
# Get project plan
curl $PLANFLOW_API_URL/projects/PROJECT_ID/plan \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"

# Update project plan (push local to cloud)
curl -X PUT $PLANFLOW_API_URL/projects/PROJECT_ID/plan \
  -H "Authorization: Bearer $PLANFLOW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plan": "# Updated Project Plan\n\n## Phase 1: Foundation\n\n..."
  }'
```

#### JavaScript/TypeScript - Full Sync Example

```typescript
import * as fs from 'fs';

async function syncPlanToCloud(client: PlanFlowClient, projectId: string) {
  // Read local plan
  const localPlan = fs.readFileSync('PROJECT_PLAN.md', 'utf-8');

  // Push to cloud
  const response = await client.request(`/projects/${projectId}/plan`, {
    method: 'PUT',
    body: JSON.stringify({ plan: localPlan })
  });

  if (!response.ok) {
    throw new Error('Failed to sync plan to cloud');
  }

  console.log('Plan synced to cloud successfully');
  return response.json();
}

async function syncPlanFromCloud(client: PlanFlowClient, projectId: string) {
  // Get cloud plan
  const response = await client.request(`/projects/${projectId}/plan`);
  const data = await response.json();

  // Write to local file
  fs.writeFileSync('PROJECT_PLAN.md', data.data.plan);

  console.log('Plan synced from cloud successfully');
  return data.data;
}
```

---

## Tasks

### List and Update Tasks

#### cURL

```bash
# Get all tasks for a project
curl $PLANFLOW_API_URL/projects/PROJECT_ID/tasks \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"

# Update a single task status
curl -X PATCH $PLANFLOW_API_URL/projects/PROJECT_ID/tasks/T1.1 \
  -H "Authorization: Bearer $PLANFLOW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "DONE"
  }'
```

#### JavaScript/TypeScript

```typescript
type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
type Complexity = 'Low' | 'Medium' | 'High';

interface Task {
  id: string;
  taskId: string;  // e.g., "T1.1"
  name: string;
  description?: string;
  status: TaskStatus;
  complexity?: Complexity;
  estimatedHours?: number;
  dependencies: string[];
  assigneeId?: string;
  createdAt: string;
  updatedAt: string;
}

class TaskService {
  constructor(private client: PlanFlowClient) {}

  async list(projectId: string): Promise<Task[]> {
    const response = await this.client.request(`/projects/${projectId}/tasks`);
    const data = await response.json();
    return data.data.tasks;
  }

  async updateStatus(projectId: string, taskId: string, status: TaskStatus): Promise<Task> {
    const response = await this.client.request(
      `/projects/${projectId}/tasks/${taskId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status })
      }
    );
    const data = await response.json();
    return data.data.task;
  }

  async getNextTask(projectId: string): Promise<Task | null> {
    const tasks = await this.list(projectId);

    // Find TODO tasks with all dependencies completed
    const completedTaskIds = new Set(
      tasks.filter(t => t.status === 'DONE').map(t => t.taskId)
    );

    const availableTasks = tasks.filter(task => {
      if (task.status !== 'TODO') return false;
      return task.dependencies.every(dep => completedTaskIds.has(dep));
    });

    // Return highest priority (lowest task ID number)
    return availableTasks.sort((a, b) =>
      a.taskId.localeCompare(b.taskId, undefined, { numeric: true })
    )[0] || null;
  }
}
```

### Batch Task Updates

Update multiple tasks in a single request:

#### cURL

```bash
curl -X PUT $PLANFLOW_API_URL/projects/PROJECT_ID/tasks \
  -H "Authorization: Bearer $PLANFLOW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {"id": "task-uuid-1", "status": "DONE"},
      {"id": "task-uuid-2", "status": "IN_PROGRESS"},
      {"id": "task-uuid-3", "status": "BLOCKED"}
    ]
  }'
```

#### JavaScript/TypeScript

```typescript
interface TaskUpdate {
  id: string;
  status?: TaskStatus;
  name?: string;
  description?: string;
  complexity?: Complexity;
  estimatedHours?: number;
  dependencies?: string[];
}

async function batchUpdateTasks(
  client: PlanFlowClient,
  projectId: string,
  updates: TaskUpdate[]
): Promise<Task[]> {
  const response = await client.request(`/projects/${projectId}/tasks`, {
    method: 'PUT',
    body: JSON.stringify({ tasks: updates })
  });

  const data = await response.json();
  return data.data.tasks;
}

// Example: Mark multiple tasks as done
await batchUpdateTasks(client, projectId, [
  { id: 'task-uuid-1', status: 'DONE' },
  { id: 'task-uuid-2', status: 'DONE' },
  { id: 'task-uuid-3', status: 'DONE' }
]);
```

### Task Assignment

#### cURL

```bash
# Assign a task to a user
curl -X POST $PLANFLOW_API_URL/projects/PROJECT_ID/tasks/T1.1/assign \
  -H "Authorization: Bearer $PLANFLOW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assigneeId": "user-uuid"
  }'

# Unassign a task
curl -X DELETE $PLANFLOW_API_URL/projects/PROJECT_ID/tasks/T1.1/assign \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"
```

---

## Organizations & Teams

### Create and Manage Teams

#### cURL

```bash
# Create an organization
curl -X POST $PLANFLOW_API_URL/organizations \
  -H "Authorization: Bearer $PLANFLOW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Team",
    "slug": "my-team",
    "description": "Our development team"
  }'

# List your organizations
curl $PLANFLOW_API_URL/organizations \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"

# Get organization details
curl $PLANFLOW_API_URL/organizations/ORG_ID \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"

# List team members
curl "$PLANFLOW_API_URL/organizations/ORG_ID/members?page=1&limit=20" \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"

# Update member role
curl -X PATCH $PLANFLOW_API_URL/organizations/ORG_ID/members/MEMBER_ID \
  -H "Authorization: Bearer $PLANFLOW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"role": "admin"}'

# Remove a member
curl -X DELETE $PLANFLOW_API_URL/organizations/ORG_ID/members/MEMBER_ID \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"
```

#### JavaScript/TypeScript

```typescript
type OrgRole = 'owner' | 'admin' | 'editor' | 'viewer';

interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  createdBy: string;
  role?: OrgRole;
}

interface Member {
  id: string;
  userId: string;
  role: OrgRole;
  userName: string;
  userEmail: string;
}

class OrganizationService {
  constructor(private client: PlanFlowClient) {}

  async create(name: string, slug?: string, description?: string): Promise<Organization> {
    const response = await this.client.request('/organizations', {
      method: 'POST',
      body: JSON.stringify({ name, slug, description })
    });
    return (await response.json()).data.organization;
  }

  async listMembers(orgId: string, page = 1, limit = 20): Promise<Member[]> {
    const response = await this.client.request(
      `/organizations/${orgId}/members?page=${page}&limit=${limit}`
    );
    return (await response.json()).data.members;
  }

  async updateMemberRole(orgId: string, memberId: string, role: OrgRole): Promise<Member> {
    const response = await this.client.request(
      `/organizations/${orgId}/members/${memberId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role })
      }
    );
    return (await response.json()).data.member;
  }
}
```

### Team Invitations

#### cURL

```bash
# Send an invitation
curl -X POST $PLANFLOW_API_URL/organizations/ORG_ID/invitations \
  -H "Authorization: Bearer $PLANFLOW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newmember@example.com",
    "role": "editor"
  }'

# List pending invitations
curl $PLANFLOW_API_URL/organizations/ORG_ID/invitations \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"

# Accept an invitation (as the invitee)
curl -X POST $PLANFLOW_API_URL/invitations/INVITATION_TOKEN/accept \
  -H "Authorization: Bearer $JWT_TOKEN"

# Revoke an invitation
curl -X DELETE $PLANFLOW_API_URL/organizations/ORG_ID/invitations/INVITATION_ID \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"
```

### Activity Log

#### cURL

```bash
# Get organization activity
curl "$PLANFLOW_API_URL/organizations/ORG_ID/activity?limit=50" \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"

# Filter by action type
curl "$PLANFLOW_API_URL/organizations/ORG_ID/activity?action=member_joined" \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"

# Filter by user
curl "$PLANFLOW_API_URL/organizations/ORG_ID/activity?actorId=USER_ID" \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"
```

---

## Integrations

### GitHub Integration

#### Step 1: Start OAuth Flow

```bash
# Get authorization URL
curl -X POST $PLANFLOW_API_URL/integrations/github/authorize \
  -H "Authorization: Bearer $JWT_TOKEN"
```

Response:
```json
{
  "success": true,
  "data": {
    "authorizationUrl": "https://github.com/login/oauth/authorize?...",
    "state": "abc123xyz"
  }
}
```

#### Step 2: Handle OAuth Callback

```javascript
// After user authorizes on GitHub, they're redirected with ?code=xxx&state=yyy

async function handleGitHubCallback(code: string, state: string) {
  const response = await client.request('/integrations/github/callback', {
    method: 'POST',
    body: JSON.stringify({ code, state })
  });

  const data = await response.json();
  console.log(`Connected as @${data.data.integration.githubUsername}`);
  return data.data.integration;
}
```

#### Working with GitHub Repositories

```bash
# List accessible repositories
curl "$PLANFLOW_API_URL/integrations/github/repos?page=1&per_page=30" \
  -H "Authorization: Bearer $JWT_TOKEN"

# List issues from a repository
curl "$PLANFLOW_API_URL/integrations/github/repos/owner/repo/issues?state=open" \
  -H "Authorization: Bearer $JWT_TOKEN"

# List pull requests
curl "$PLANFLOW_API_URL/integrations/github/repos/owner/repo/pulls?state=open" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Slack Integration

#### Configure Slack Webhook

```bash
# Add Slack webhook for organization
curl -X POST $PLANFLOW_API_URL/organizations/ORG_ID/integrations \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "slack",
    "name": "Engineering Slack",
    "webhookUrl": "https://hooks.slack.com/services/T.../B.../xxx",
    "config": {
      "channel": "#engineering",
      "username": "PlanFlow",
      "icon_emoji": ":clipboard:"
    },
    "enabledEvents": ["task_completed", "task_assigned", "mention"]
  }'

# Test the webhook
curl -X POST $PLANFLOW_API_URL/organizations/ORG_ID/integrations/INTEGRATION_ID/test \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Discord Integration

#### Configure Discord Webhook

```bash
# Add Discord webhook
curl -X POST $PLANFLOW_API_URL/organizations/ORG_ID/integrations \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "discord",
    "name": "Project Discord",
    "webhookUrl": "https://discord.com/api/webhooks/123456789/abcdef...",
    "config": {
      "username": "PlanFlow",
      "useEmbeds": true
    },
    "enabledEvents": ["task_completed", "comment_created"]
  }'
```

---

## Real-time WebSocket

### WebSocket Connection

#### JavaScript/TypeScript - Complete Implementation

```typescript
class PlanFlowWebSocket {
  private ws: WebSocket | null = null;
  private projectId: string;
  private getToken: () => string;
  private handlers: Map<string, Function[]> = new Map();
  private reconnectAttempt = 0;
  private pingInterval: NodeJS.Timer | null = null;

  constructor(projectId: string, getToken: () => string) {
    this.projectId = projectId;
    this.getToken = getToken;
  }

  connect(): void {
    const token = this.getToken();
    const url = `wss://api.planflow.tools/ws?projectId=${this.projectId}`;

    // Use subprotocol for secure token transmission
    this.ws = new WebSocket(url, [
      `access_token.${token}`,
      'planflow-v1'
    ]);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempt = 0;
      this.startPing();
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.emit(message.type, message.data, message);
    };

    this.ws.onclose = (event) => {
      this.stopPing();
      if (event.code === 4001) {
        // Authentication error
        this.emit('authError', event.reason);
      } else {
        // Reconnect with exponential backoff
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  // Event handling
  on(type: string, handler: Function): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  off(type: string, handler: Function): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) handlers.splice(index, 1);
    }
  }

  private emit(type: string, ...args: any[]): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.forEach(handler => handler(...args));
    }
  }

  // Send message
  send(type: string, data: object = {}): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...data }));
    }
  }

  // Presence methods
  updatePresence(status: 'online' | 'idle' | 'away'): void {
    this.send('presence_update', { data: { status } });
  }

  startWorkingOn(taskId: string, taskUuid: string, taskName: string): void {
    this.send('working_on_start', { taskId, taskUuid, taskName });
  }

  stopWorkingOn(): void {
    this.send('working_on_stop');
  }

  // Typing indicators
  startTyping(taskId: string, taskDisplayId: string): void {
    this.send('comment_typing_start', { taskId, taskDisplayId });
  }

  stopTyping(): void {
    this.send('comment_typing_stop');
  }

  // Task locking
  lockTask(taskId: string, taskUuid: string, taskName?: string): void {
    this.send('task_lock', { taskId, taskUuid, taskName });
  }

  unlockTask(taskId: string, taskUuid?: string): void {
    this.send('task_unlock', { taskId, taskUuid });
  }

  // Keep-alive
  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send('ping');
    }, 20000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // Reconnection
  private scheduleReconnect(): void {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30000);
    this.reconnectAttempt++;
    console.log(`Reconnecting in ${delay}ms...`);
    setTimeout(() => this.connect(), delay);
  }

  disconnect(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
  }
}

// Usage
const ws = new PlanFlowWebSocket('project-uuid', () => accessToken);

ws.on('connected', (data) => {
  console.log('Connected to:', data.projectName);
});

ws.on('presence_list', (data) => {
  console.log('Online users:', data.users.length);
});

ws.on('task_updated', (data) => {
  console.log(`Task ${data.task.taskId} updated to ${data.task.status}`);
});

ws.on('notification_new', (data) => {
  showNotificationToast(data.notification.title);
});

ws.connect();
```

### Presence System

```typescript
// Track who's online and what they're working on
ws.on('presence_list', (data) => {
  data.users.forEach(user => {
    console.log(`${user.name} - ${user.status}`);
    if (user.workingOn) {
      console.log(`  Working on: ${user.workingOn.taskId} - ${user.workingOn.taskName}`);
    }
  });
});

ws.on('presence_joined', (data) => {
  console.log(`${data.user.name} came online`);
});

ws.on('presence_left', (data) => {
  console.log(`User ${data.userId} went offline`);
});

ws.on('working_on_changed', (data) => {
  if (data.workingOn) {
    console.log(`User started working on ${data.workingOn.taskName}`);
  } else {
    console.log('User stopped working on their task');
  }
});

// Indicate what you're working on
ws.startWorkingOn('T2.1', 'task-uuid', 'Implement login API');

// Clear when done
ws.stopWorkingOn();
```

### Task Locking

```typescript
// Prevent conflicts when editing tasks
ws.on('task_lock_result', (data) => {
  if (data.success) {
    console.log(`Lock acquired on ${data.lock.taskId}`);
    // Enable editing UI
  } else {
    console.log(`Task is locked by ${data.lock.lockedBy.name}`);
    // Show read-only UI
  }
});

ws.on('task_locked', (data) => {
  console.log(`${data.lock.lockedBy.name} is editing ${data.lock.taskId}`);
});

ws.on('task_unlocked', (data) => {
  console.log(`Task ${data.taskId} is now available for editing`);
});

// Request a lock before editing
ws.lockTask('T2.1', 'task-uuid', 'Implement login API');

// Release when done editing
ws.unlockTask('T2.1');
```

---

## Notifications

### Manage Notifications

#### cURL

```bash
# List notifications
curl "$PLANFLOW_API_URL/notifications?limit=50" \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"

# Get unread only
curl "$PLANFLOW_API_URL/notifications?unreadOnly=true" \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"

# Get unread count
curl "$PLANFLOW_API_URL/notifications/unread-count" \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"

# Mark as read
curl -X PATCH "$PLANFLOW_API_URL/notifications/NOTIFICATION_ID/read" \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"

# Mark multiple as read
curl -X POST "$PLANFLOW_API_URL/notifications/mark-read" \
  -H "Authorization: Bearer $PLANFLOW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notificationIds": ["id1", "id2", "id3"]
  }'

# Mark all as read
curl -X POST "$PLANFLOW_API_URL/notifications/mark-all-read" \
  -H "Authorization: Bearer $PLANFLOW_TOKEN"
```

#### JavaScript/TypeScript

```typescript
interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  readAt?: string;
  createdAt: string;
  actor?: { id: string; name: string; email: string };
}

class NotificationService {
  constructor(private client: PlanFlowClient) {}

  async list(options: { unreadOnly?: boolean; limit?: number } = {}): Promise<Notification[]> {
    const params = new URLSearchParams();
    if (options.unreadOnly) params.set('unreadOnly', 'true');
    if (options.limit) params.set('limit', String(options.limit));

    const response = await this.client.request(`/notifications?${params}`);
    return (await response.json()).data.notifications;
  }

  async getUnreadCount(): Promise<number> {
    const response = await this.client.request('/notifications/unread-count');
    return (await response.json()).data.unreadCount;
  }

  async markAsRead(notificationId: string): Promise<void> {
    await this.client.request(`/notifications/${notificationId}/read`, {
      method: 'PATCH'
    });
  }

  async markAllAsRead(): Promise<number> {
    const response = await this.client.request('/notifications/mark-all-read', {
      method: 'POST'
    });
    return (await response.json()).data.markedCount;
  }
}
```

### Push Notifications

```typescript
// Subscribe to browser push notifications
async function subscribeToPush(client: PlanFlowClient): Promise<void> {
  // Get VAPID public key
  const keyResponse = await fetch(
    `${API_URL}/notifications/push/vapid-public-key`
  );
  const { data: { publicKey } } = await keyResponse.json();

  // Subscribe via service worker
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: publicKey
  });

  // Send subscription to server
  await client.request('/notifications/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ subscription })
  });

  console.log('Push notifications enabled');
}

// Unsubscribe
async function unsubscribeFromPush(
  client: PlanFlowClient,
  endpoint: string
): Promise<void> {
  await client.request('/notifications/push/subscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint })
  });
}
```

---

## Error Handling

### Handling API Errors

```typescript
interface ApiError {
  success: false;
  error: string;
  details?: Record<string, string[]>;
}

async function handleApiRequest<T>(
  request: () => Promise<Response>
): Promise<T> {
  const response = await request();
  const data = await response.json();

  if (!response.ok) {
    const error = data as ApiError;

    switch (response.status) {
      case 400:
        // Validation error
        console.error('Validation failed:', error.details);
        throw new ValidationError(error.error, error.details);

      case 401:
        // Authentication error - might need to refresh token
        throw new AuthenticationError(error.error);

      case 403:
        // Permission denied
        throw new PermissionError(error.error);

      case 404:
        // Resource not found
        throw new NotFoundError(error.error);

      case 429:
        // Rate limited
        const retryAfter = response.headers.get('Retry-After');
        throw new RateLimitError(error.error, parseInt(retryAfter || '60'));

      default:
        throw new ApiError(error.error, response.status);
    }
  }

  return data as T;
}

// Custom error classes
class ValidationError extends Error {
  constructor(message: string, public details?: Record<string, string[]>) {
    super(message);
    this.name = 'ValidationError';
  }
}

class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

class RateLimitError extends Error {
  constructor(message: string, public retryAfter: number) {
    super(message);
    this.name = 'RateLimitError';
  }
}
```

---

## Rate Limiting

### Handle Rate Limits

```typescript
class RateLimitedClient {
  private requestQueue: Array<() => Promise<void>> = [];
  private processing = false;
  private retryAfter = 0;

  async request(url: string, options: RequestInit): Promise<Response> {
    // Wait if rate limited
    if (this.retryAfter > 0) {
      await new Promise(resolve => setTimeout(resolve, this.retryAfter * 1000));
      this.retryAfter = 0;
    }

    const response = await fetch(url, options);

    if (response.status === 429) {
      this.retryAfter = parseInt(response.headers.get('Retry-After') || '60');
      console.warn(`Rate limited. Retrying after ${this.retryAfter}s`);

      // Retry after delay
      await new Promise(resolve => setTimeout(resolve, this.retryAfter * 1000));
      this.retryAfter = 0;
      return this.request(url, options);
    }

    // Track remaining requests
    const remaining = response.headers.get('X-RateLimit-Remaining');
    if (remaining && parseInt(remaining) < 10) {
      console.warn(`Rate limit warning: ${remaining} requests remaining`);
    }

    return response;
  }
}
```

---

## Complete Examples

### Full MCP Integration Script

```typescript
/**
 * Complete PlanFlow MCP Integration
 * Demonstrates authentication, project sync, and task management
 */

import * as fs from 'fs';
import * as path from 'path';

const API_URL = process.env.PLANFLOW_API_URL || 'https://api.planflow.tools';

interface Config {
  apiToken?: string;
  projectId?: string;
  lastSyncedAt?: string;
}

class PlanFlowMCP {
  private config: Config;
  private configPath: string;

  constructor(workingDir: string) {
    this.configPath = path.join(workingDir, '.plan-config.json');
    this.config = this.loadConfig();
  }

  private loadConfig(): Config {
    try {
      return JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    } catch {
      return {};
    }
  }

  private saveConfig(): void {
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  private async request(path: string, options: RequestInit = {}): Promise<any> {
    if (!this.config.apiToken) {
      throw new Error('Not authenticated. Run login first.');
    }

    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.config.apiToken}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  // Authentication
  async verifyToken(token: string): Promise<{ user: any }> {
    const response = await fetch(`${API_URL}/api-tokens/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    this.config.apiToken = token;
    this.saveConfig();

    return data.data;
  }

  // Projects
  async listProjects(): Promise<any[]> {
    const data = await this.request('/projects');
    return data.data.projects;
  }

  async linkProject(projectId: string): Promise<void> {
    // Verify project exists and user has access
    await this.request(`/projects/${projectId}`);

    this.config.projectId = projectId;
    this.saveConfig();
  }

  // Sync
  async syncPush(): Promise<void> {
    if (!this.config.projectId) {
      throw new Error('No project linked. Run link first.');
    }

    const planPath = 'PROJECT_PLAN.md';
    if (!fs.existsSync(planPath)) {
      throw new Error('PROJECT_PLAN.md not found');
    }

    const plan = fs.readFileSync(planPath, 'utf-8');

    await this.request(`/projects/${this.config.projectId}/plan`, {
      method: 'PUT',
      body: JSON.stringify({ plan })
    });

    this.config.lastSyncedAt = new Date().toISOString();
    this.saveConfig();
  }

  async syncPull(): Promise<void> {
    if (!this.config.projectId) {
      throw new Error('No project linked. Run link first.');
    }

    const data = await this.request(`/projects/${this.config.projectId}/plan`);

    fs.writeFileSync('PROJECT_PLAN.md', data.data.plan);

    this.config.lastSyncedAt = new Date().toISOString();
    this.saveConfig();
  }

  // Tasks
  async updateTaskStatus(taskId: string, status: string): Promise<void> {
    if (!this.config.projectId) {
      throw new Error('No project linked');
    }

    await this.request(`/projects/${this.config.projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  }

  async getNextTask(): Promise<any> {
    if (!this.config.projectId) {
      throw new Error('No project linked');
    }

    const data = await this.request(`/projects/${this.config.projectId}/tasks`);
    const tasks = data.data.tasks;

    // Find available tasks
    const completedIds = new Set(
      tasks.filter((t: any) => t.status === 'DONE').map((t: any) => t.taskId)
    );

    const available = tasks.filter((task: any) => {
      if (task.status !== 'TODO') return false;
      return (task.dependencies || []).every((dep: string) => completedIds.has(dep));
    });

    return available[0] || null;
  }

  // Notifications
  async getNotifications(): Promise<any[]> {
    const data = await this.request('/notifications?limit=10&unreadOnly=true');
    return data.data.notifications;
  }
}

// CLI Usage Example
async function main() {
  const mcp = new PlanFlowMCP(process.cwd());

  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'login':
      const { user } = await mcp.verifyToken(args[0]);
      console.log(`Logged in as ${user.name} (${user.email})`);
      break;

    case 'projects':
      const projects = await mcp.listProjects();
      projects.forEach(p => console.log(`${p.id}: ${p.name}`));
      break;

    case 'link':
      await mcp.linkProject(args[0]);
      console.log('Project linked');
      break;

    case 'push':
      await mcp.syncPush();
      console.log('Plan pushed to cloud');
      break;

    case 'pull':
      await mcp.syncPull();
      console.log('Plan pulled from cloud');
      break;

    case 'update':
      await mcp.updateTaskStatus(args[0], args[1]);
      console.log(`Task ${args[0]} updated to ${args[1]}`);
      break;

    case 'next':
      const task = await mcp.getNextTask();
      if (task) {
        console.log(`Next: ${task.taskId} - ${task.name}`);
      } else {
        console.log('No tasks available');
      }
      break;

    default:
      console.log('Commands: login, projects, link, push, pull, update, next');
  }
}

main().catch(console.error);
```

---

## Related Documentation

- [API Reference](./API_REFERENCE.md) - Complete endpoint documentation
- [Integrations API](./API_INTEGRATIONS.md) - GitHub, Slack, Discord
- [Real-time API](./API_REALTIME.md) - WebSocket events
- [Notifications API](./API_NOTIFICATIONS.md) - Notification system
- [MCP Installation](./MCP_INSTALLATION.md) - MCP server setup
- [Plugin Commands](./PLUGIN_COMMANDS.md) - CLI command reference

---

## Support

- **Documentation:** [docs.planflow.tools](https://docs.planflow.tools)
- **GitHub Issues:** [github.com/planflow/planflow/issues](https://github.com/planflow/planflow/issues)
- **Email:** support@planflow.tools

---

*Last Updated: 2026-02-25*
