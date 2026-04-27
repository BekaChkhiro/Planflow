# PlanFlow Connection Status

Show the current WebSocket connection status with detailed information about connectivity, team presence, and real-time features.

## Usage

```bash
/pfConnectionStatus
```

No arguments required.

## Process

### Step 0: Load User Language & Translations

**CRITICAL: Execute this step FIRST, before any output!**

Load user's language preference and translations.

**Pseudo-code:**
```javascript
function getMergedConfig() {
  let globalConfig = {}
  let localConfig = {}

  const globalPath = expandPath("~/.config/claude/plan-plugin-config.json")
  if (fileExists(globalPath)) {
    try { globalConfig = JSON.parse(readFile(globalPath)) } catch (e) {}
  }

  if (fileExists("./.plan-config.json")) {
    try { localConfig = JSON.parse(readFile("./.plan-config.json")) } catch (e) {}
  }

  return {
    ...globalConfig,
    ...localConfig,
    cloud: {
      ...(globalConfig.cloud || {}),
      ...(localConfig.cloud || {})
    }
  }
}

const config = getMergedConfig()
const language = config.language || "en"
const cloudConfig = config.cloud || {}
const t = JSON.parse(readFile(`../locales/${language}.json`))
```

### Step 1: Check Authentication

Verify user is authenticated before showing connection status.

**Pseudo-code:**
```javascript
const isAuthenticated = !!cloudConfig.apiToken
const isLinked = !!cloudConfig.projectId

if (!isAuthenticated) {
  console.log(t.commands.whoami.notLoggedIn)
  console.log(t.commands.whoami.loginHint)
  return
}

if (!isLinked) {
  console.log(t.commands.sync.notLinked)
  return
}
```

### Step 2: Read WebSocket State

Read the current connection state from the state file.

**Bash Implementation:**
```bash
STATE_FILE="${HOME}/.planflow-ws-state.json"

if [ -f "$STATE_FILE" ]; then
  STATE=$(jq -r '.state // "disconnected"' "$STATE_FILE")
  CONNECTED_AT=$(jq -r '.connectedAt // null' "$STATE_FILE")
  LAST_PING=$(jq -r '.lastPing // null' "$STATE_FILE")
  LAST_PONG=$(jq -r '.lastPong // null' "$STATE_FILE")
  RETRY_COUNT=$(jq -r '.retryCount // 0' "$STATE_FILE")
  PRESENCE_TASK=$(jq -r '.presence.taskId // null' "$STATE_FILE")
  PRESENCE_NAME=$(jq -r '.presence.taskName // null' "$STATE_FILE")
  FALLBACK=$(jq -r '.fallback // false' "$STATE_FILE")
else
  STATE="disconnected"
  CONNECTED_AT="null"
  RETRY_COUNT="0"
  FALLBACK="false"
fi
```

### Step 3: Fetch Team Online Status (Optional)

If connected, fetch how many team members are online.

**Bash Implementation:**
```bash
API_URL="https://api.planflow.tools"
TOKEN="$API_TOKEN"
PROJECT_ID="$PROJECT_ID"

TEAM_ONLINE=0

if [ "$STATE" = "connected" ] || [ "$STATE" = "polling" ]; then
  RESPONSE=$(curl -s --connect-timeout 3 --max-time 5 \
    -X GET \
    -H "Accept: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    "${API_URL}/projects/${PROJECT_ID}/presence" 2>/dev/null)

  if [ $? -eq 0 ]; then
    TEAM_ONLINE=$(echo "$RESPONSE" | jq -r '.data.online // 0' 2>/dev/null || echo "0")
  fi
fi
```

### Step 4: Display Connection Status

Show a detailed status card with all connection information.

**Output Format:**

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔌 Connection Status                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Real-time Connection ──────────────────────────────────────────────────  │
│                                                                              │
│  Status:        🟢 Connected to PlanFlow                                     │
│  Connected:     15 minutes ago                                               │
│  Last Ping:     5 seconds ago                                                │
│  Team Online:   3 members                                                    │
│                                                                              │
│  ── Your Presence ─────────────────────────────────────────────────────────  │
│                                                                              │
│  Status:        Working on T12.4                                             │
│  Since:         10 minutes ago                                               │
│                                                                              │
│  ── Connection Details ────────────────────────────────────────────────────  │
│                                                                              │
│  Mode:          WebSocket (real-time)                                        │
│  Server:        wss://api.planflow.tools/ws                                  │
│  Project:       Plan Flow Plugin                                             │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Real-time features active:                                               │
│     • Task updates broadcast to team                                         │
│     • Presence status visible to teammates                                   │
│     • Instant notifications                                                  │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

**State-Specific Displays:**

#### Connected State (🟢)
```
Status:        🟢 Connected to PlanFlow
Connected:     {time_ago}
Last Ping:     {time_ago}
Team Online:   {count} members
```

#### Connecting State (🟡)
```
Status:        🟡 Connecting to real-time server...

⏳ Please wait...
```

#### Reconnecting State (🟡)
```
Status:        🟡 Reconnecting (attempt {n}/{max})...

Connection was lost. Attempting to reconnect...
```

#### Polling State (🟡)
```
Status:        🟡 Polling mode (WebSocket unavailable)
Last Poll:     {time_ago}
Poll Interval: 30 seconds

⚠️ Limited real-time features
   WebSocket tools not installed.

💡 For full real-time support, install websocat:
   macOS:  brew install websocat
   Linux:  cargo install websocat
```

#### Failed State (🔴)
```
Status:        🔴 Connection failed

Unable to connect after {n} attempts.
Last Error:    {error_message}

💡 To reconnect:
   /pfReconnect

💡 Check your network connection and try again.
```

#### Disconnected/Offline State (⚪)
```
Status:        ⚪ Offline

Not connected to real-time server.

💡 Real-time features are disabled:
   • Task updates won't be broadcast
   • You won't see team activity live
   • Changes will sync on next command

💡 To connect:
   Run any cloud command to auto-connect
```

### Step 5: Show Offline Queue (if applicable)

If there are queued messages, show them.

**Bash Implementation:**
```bash
QUEUE_FILE="${HOME}/.planflow-offline-queue.json"

if [ -f "$QUEUE_FILE" ]; then
  QUEUE_COUNT=$(jq -r '.messages | length' "$QUEUE_FILE" 2>/dev/null || echo "0")

  if [ "$QUEUE_COUNT" -gt 0 ]; then
    echo ""
    echo "📤 Offline Queue: $QUEUE_COUNT messages pending"
    echo "   These will be sent when connection is restored."
  fi
fi
```

## Translation Keys

Use these translation keys from `locales/{language}.json`:

```javascript
// Status display
t.skills.websocket.connected           // "Connected to PlanFlow"
t.skills.websocket.connecting          // "Connecting to real-time server..."
t.skills.websocket.reconnecting        // "Reconnecting (attempt {count}/{max})..."
t.skills.websocket.disconnected        // "Offline"
t.skills.websocket.failed              // "Connection failed"
t.skills.websocket.polling             // "Polling mode (WebSocket unavailable)"

// Status with emoji
t.skills.websocket.status.online       // "🟢 Online"
t.skills.websocket.status.connecting   // "🟡 Connecting"
t.skills.websocket.status.reconnecting // "🟡 Reconnecting"
t.skills.websocket.status.polling      // "🟡 Polling"
t.skills.websocket.status.offline      // "⚪ Offline"
t.skills.websocket.status.failed       // "🔴 Failed"

// Presence
t.skills.websocket.workingOn           // "Working on {taskId}"
t.skills.websocket.idle                // "Idle"

// Team
t.skills.websocket.teamOnline          // "{count} team members online"

// Hints
t.skills.websocket.reconnectHint       // "Run /pfReconnect to retry connection."
t.skills.websocket.offlineMode         // "Offline — changes will sync when connected"
t.skills.websocket.installWebsocat     // "For real-time features, install websocat:"
t.skills.websocket.installMac          // "brew install websocat"
t.skills.websocket.installLinux        // "cargo install websocat"
t.skills.websocket.pollingFallback     // "Using polling fallback (30s interval)"

// Queue
t.skills.websocket.queuedMessages      // "{count} messages queued"
```

## Time Formatting

Format timestamps as relative time:

```javascript
function formatTimeAgo(timestamp) {
  if (!timestamp || timestamp === "null") return "Never"

  const now = new Date()
  const then = new Date(timestamp)
  const seconds = Math.floor((now - then) / 1000)

  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`
  return `${Math.floor(seconds / 86400)} days ago`
}
```

## Error Handling

### Network Error
```
⚠️ Could not fetch connection details.
   Using cached state information.
```

### State File Missing
```
ℹ️ No connection history found.
   Real-time features haven't been used yet.

💡 Run any cloud command to establish connection.
```

## Complete Example Output

### Example 1: Connected with Presence

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔌 Connection Status                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Real-time Connection ──────────────────────────────────────────────────  │
│                                                                              │
│  Status:        🟢 Connected to PlanFlow                                     │
│  Connected:     15 min ago                                                   │
│  Last Ping:     5 sec ago                                                    │
│  Team Online:   3 members                                                    │
│                                                                              │
│  ── Your Presence ─────────────────────────────────────────────────────────  │
│                                                                              │
│  Working on:    T12.4 - Add connection status indicator                      │
│  Since:         10 min ago                                                   │
│                                                                              │
│  ── Connection Details ────────────────────────────────────────────────────  │
│                                                                              │
│  Mode:          WebSocket (real-time)                                        │
│  Server:        wss://api.planflow.tools/ws                                  │
│  Project:       Plan Flow Plugin                                             │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 Real-time features active:                                               │
│     • Task updates broadcast to team                                         │
│     • Presence status visible to teammates                                   │
│     • Instant notifications                                                  │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Example 2: Offline with Queue

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔌 Connection Status                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Real-time Connection ──────────────────────────────────────────────────  │
│                                                                              │
│  Status:        ⚪ Offline                                                   │
│  Last Online:   2 hours ago                                                  │
│                                                                              │
│  ── Offline Queue ─────────────────────────────────────────────────────────  │
│                                                                              │
│  📤 3 messages queued                                                        │
│     These will be sent when connection is restored.                          │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  💡 To reconnect:                                                            │
│     Run any cloud command to auto-connect                                    │
│                                                                              │
│  ⚠️ While offline:                                                           │
│     • Task updates won't be broadcast                                        │
│     • You won't see team activity live                                       │
│     • Changes are queued for sync                                            │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

### Example 3: Polling Fallback

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  🔌 Connection Status                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ── Real-time Connection ──────────────────────────────────────────────────  │
│                                                                              │
│  Status:        🟡 Polling mode                                              │
│  Last Poll:     10 sec ago                                                   │
│  Poll Interval: 30 seconds                                                   │
│  Team Online:   2 members                                                    │
│                                                                              │
│  ── Connection Details ────────────────────────────────────────────────────  │
│                                                                              │
│  Mode:          HTTP Polling (fallback)                                      │
│  Server:        https://api.planflow.tools                                   │
│  Project:       Plan Flow Plugin                                             │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ⚠️ Limited real-time features                                               │
│     WebSocket tools not installed.                                           │
│                                                                              │
│  💡 For full real-time support, install websocat:                            │
│     macOS:  brew install websocat                                            │
│     Linux:  cargo install websocat                                           │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## Related Commands

- `/pfReconnect` - Force reconnection to WebSocket
- `/pfWhoami` - Show current user info (includes basic connection status)
- `/team` - Show team members (includes online status)
- `/pfNotifications` - View notifications (requires connection for real-time)

## Notes

- Connection status is read from local state file (no API call required)
- Team online count requires a quick API call (optional, fails gracefully)
- State file is updated by WebSocket background process
- Polling mode is fallback when WebSocket tools unavailable
