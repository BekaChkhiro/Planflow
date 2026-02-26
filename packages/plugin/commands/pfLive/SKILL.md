# /pfLive Command

Control live updates display settings for real-time task notifications in terminal.

## Usage

```
/pfLive [action] [options]
```

## Actions

| Action | Description |
|--------|-------------|
| `on` | Enable live updates display |
| `off` | Disable live updates display |
| `status` | Show current settings and connection status |
| `mode <mode>` | Set display mode (minimal/normal/verbose/silent) |
| `mute <user>` | Mute updates from a specific user |
| `unmute <user>` | Unmute a previously muted user |
| `focus <taskId>` | Only show updates for specific task |
| `unfocus` | Disable focus mode, show all updates |
| `history [count]` | Show recent update history (default: 10) |
| `clear` | Clear update history |

## Display Modes

- **minimal**: Single-line compact updates
- **normal**: Standard multi-line format with details (default)
- **verbose**: Full details including timestamps and metadata
- **silent**: Log only, no terminal output

## Examples

```bash
# Enable live updates
/pfLive on

# Set to minimal mode for less distraction
/pfLive mode minimal

# Mute a noisy teammate
/pfLive mute john@example.com

# Focus on a specific task
/pfLive focus T5.2

# View recent history
/pfLive history 20
```

## Implementation

```bash
#!/bin/bash
# Source the live handler
source "$(dirname "$0")/../../skills/live-updates/live-handler.sh"

# Get command arguments
ACTION="${1:-status}"
OPTION="$2"

# Load translations
LANG=$(jq -r '.language // "en"' ~/.plan-config.json 2>/dev/null || echo "en")
LOCALE_FILE="$(dirname "$0")/../../locales/${LANG}.json"

t() {
  local key="$1"
  shift
  local text=$(jq -r ".skills.liveUpdates.${key} // \"${key}\"" "$LOCALE_FILE" 2>/dev/null)

  # Replace placeholders
  while [[ $# -gt 0 ]]; do
    local placeholder="$1"
    local value="$2"
    text="${text//\{$placeholder\}/$value}"
    shift 2
  done

  echo "$text"
}

# Execute the command
case "$ACTION" in
  "on")
    pf_live "on"
    echo "$(t enabled)"
    ;;
  "off")
    pf_live "off"
    echo "$(t disabled)"
    ;;
  "status")
    show_live_status
    ;;
  "mode")
    if [[ -z "$OPTION" ]]; then
      echo "Usage: /pfLive mode <minimal|normal|verbose|silent>"
      exit 1
    fi
    pf_live "mode" "$OPTION"
    echo "$(t modeSet "mode" "$OPTION")"
    ;;
  "mute")
    if [[ -z "$OPTION" ]]; then
      echo "Usage: /pfLive mute <user_email>"
      exit 1
    fi
    pf_live "mute" "$OPTION"
    echo "$(t muted "user" "$OPTION")"
    ;;
  "unmute")
    if [[ -z "$OPTION" ]]; then
      echo "Usage: /pfLive unmute <user_email>"
      exit 1
    fi
    pf_live "unmute" "$OPTION"
    echo "$(t unmuted "user" "$OPTION")"
    ;;
  "focus")
    if [[ -z "$OPTION" ]]; then
      echo "Usage: /pfLive focus <task_id>"
      exit 1
    fi
    pf_live "focus" "$OPTION"
    echo "$(t focusEnabled "taskId" "$OPTION")"
    ;;
  "unfocus")
    pf_live "unfocus"
    echo "$(t focusDisabled)"
    ;;
  "history")
    show_history "${OPTION:-10}"
    ;;
  "clear")
    rm -f "$HISTORY_FILE"
    echo "History cleared"
    ;;
  *)
    echo "Unknown action: $ACTION"
    echo "Usage: /pfLive [on|off|status|mode|mute|unmute|focus|unfocus|history|clear]"
    exit 1
    ;;
esac
```

## Configuration

Settings are stored in `~/.planflow-live-updates.json`:

```json
{
  "enabled": true,
  "displayMode": "normal",
  "mutedUsers": [],
  "mutedTasks": [],
  "focusTask": null,
  "quietHours": {
    "enabled": false,
    "start": "22:00",
    "end": "08:00"
  },
  "sounds": false
}
```

## Event Types Displayed

| Event | Description |
|-------|-------------|
| `task_updated` | Task status changes (started, completed, blocked) |
| `assignment` | Task assignments and unassignments |
| `comment` | New comments on tasks |
| `presence` | Team member online/offline status |
| `notification` | System notifications |

## Integration

This command works with the WebSocket connection established by `/pfSyncPush` or `/pfSyncPull`. Live updates are received automatically when connected to a cloud project.

## See Also

- [Live Updates Skill](/skills/live-updates/SKILL.md)
- [WebSocket Skill](/skills/websocket/SKILL.md)
- [Presence Broadcast Skill](/skills/presence-broadcast/SKILL.md)
