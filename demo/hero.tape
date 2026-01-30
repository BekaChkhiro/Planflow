# VHS Tape - PlanFlow Hero GIF
# Run with: vhs hero.tape
# Install: brew install vhs

# Output settings
Output hero.gif
Set FontSize 16
Set FontFamily "JetBrains Mono"
Set Width 900
Set Height 550
Set Theme "Dracula"
Set Padding 20
Set TypingSpeed 50ms
Set Shell "bash"

# Frame 1: Initial prompt
Hide
Type "export PS1='$ '"
Enter
Show
Sleep 500ms

# Start Claude
Type "claude"
Enter
Sleep 1500ms

# Show Claude banner (simulated)
Type@0 "╭─────────────────────────────────────────────────────────────╮"
Enter
Type@0 "│  Claude Code                                                │"
Enter
Type@0 "│  AI pair programmer for your terminal                       │"
Enter
Type@0 "╰─────────────────────────────────────────────────────────────╯"
Enter
Enter
Sleep 500ms

# User query
Type@0 "You > "
Sleep 200ms
Type "What's my next task?"
Enter
Sleep 1000ms

# Claude response
Type@0 "Claude > Checking your PlanFlow projects..."
Enter
Sleep 500ms
Enter
Type@0 "┌─ planflow_task_next ─────────────────────────────────────────┐"
Enter
Type@0 "│ Analyzing tasks... Calculating priorities...                 │"
Enter
Type@0 "└──────────────────────────────────────────────────────────────┘"
Enter
Sleep 1000ms
Enter

# Task recommendation
Type@0 "🎯 Recommended Next Task"
Enter
Type@0 "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Enter
Enter
Type@0 "  T3.2: Implement OAuth providers"
Enter
Enter
Type@0 "  📊 Complexity: Medium"
Enter
Type@0 "  ✅ Dependencies: All satisfied"
Enter
Type@0 "  🔓 Unlocks: 4 tasks"
Enter
Enter
Sleep 1500ms

# Progress bar
Type@0 "  Progress: 🟩🟩🟩🟩🟩🟩⬜⬜⬜⬜ 56%"
Enter
Enter
Sleep 1000ms

# Ready prompt
Type@0 "Ready to start? Say 'start T3.2'"
Enter
Enter
Sleep 500ms

# User starts task
Type@0 "You > "
Sleep 200ms
Type "Start T3.2"
Enter
Sleep 800ms

# Confirmation
Enter
Type@0 "✅ Task T3.2 status: TODO → IN_PROGRESS 🔄"
Enter
Enter
Type@0 "Good luck! Let me know when you're done."
Enter
Sleep 2000ms

# Final tagline
Enter
Enter
Type@0 "─────────────────────────────────────────────"
Enter
Type@0 "  PlanFlow - Never leave your terminal 🚀"
Enter
Type@0 "─────────────────────────────────────────────"
Enter
Sleep 3000ms
