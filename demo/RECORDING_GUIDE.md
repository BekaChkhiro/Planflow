# PlanFlow Demo Recording Guide

> Step-by-step instructions for creating professional demo videos and GIFs

---

## Required Tools

### Screen Recording

| Tool | Platform | Best For | Free Tier |
|------|----------|----------|-----------|
| **OBS Studio** | All | Full control, streaming | Yes (FOSS) |
| **ScreenFlow** | macOS | Polished editing | No ($169) |
| **Loom** | All | Quick recordings | 25 videos |
| **CleanShot X** | macOS | GIFs, annotations | No ($29) |
| **Kap** | macOS | Simple GIFs | Yes (FOSS) |
| **ShareX** | Windows | GIFs, screenshots | Yes (FOSS) |

**Recommended:** OBS Studio (recording) + Kap (GIFs) for free workflow

### Terminal Setup

| Tool | Purpose |
|------|---------|
| **iTerm2** (macOS) | Better terminal with recording features |
| **Windows Terminal** | Modern Windows terminal |
| **asciinema** | Terminal session recording (text-based) |
| **terminalizer** | Terminal GIF generator |
| **vhs** | Terminal GIF from scripts |

### Video Editing

| Tool | Platform | Best For |
|------|----------|----------|
| **DaVinci Resolve** | All | Professional editing (free) |
| **iMovie** | macOS | Simple edits |
| **Kdenlive** | Linux | Open source editing |
| **CapCut** | All | Quick social clips |

### GIF Optimization

| Tool | Purpose |
|------|---------|
| **gifski** | High-quality GIF encoding |
| **gifsicle** | GIF optimization/compression |
| **ezgif.com** | Online GIF tools |

---

## Environment Setup

### 1. Terminal Configuration

```bash
# Install a good monospace font
brew install --cask font-jetbrains-mono
# or
brew install --cask font-fira-code
```

**iTerm2 Settings:**
- Font: JetBrains Mono, 14pt
- Theme: Dracula, One Dark, or Tokyo Night
- Columns: 120
- Rows: 30
- Disable scrollbar
- Disable title bar (for clean look)

**Color scheme (Dracula-inspired):**
```
Background: #282a36
Foreground: #f8f8f2
Green: #50fa7b
Purple: #bd93f9
Cyan: #8be9fd
Yellow: #f1fa8c
Red: #ff5555
```

### 2. Shell Prompt

Use a minimal prompt for demos:

```bash
# Add to ~/.zshrc or ~/.bashrc
export PS1="\$ "
# or with color
export PS1="\[\e[32m\]\$\[\e[0m\] "
```

### 3. Clean Environment

```bash
# Clear terminal history
history -c
clear

# Hide desktop icons (macOS)
defaults write com.apple.finder CreateDesktop false
killall Finder

# Restore after recording
defaults write com.apple.finder CreateDesktop true
killall Finder
```

### 4. Browser Setup

- Use a clean browser profile (no bookmarks bar, minimal extensions)
- Set zoom to 110-125%
- Use dark mode if matching terminal theme
- Close all other tabs

---

## Recording Settings

### Video Quality

| Setting | Value |
|---------|-------|
| Resolution | 1920x1080 (1080p) or 2560x1440 (1440p) |
| Frame Rate | 30 FPS (smooth) or 60 FPS (buttery) |
| Format | MP4 (H.264) for compatibility |
| Bitrate | 8-15 Mbps for 1080p |

### Audio (if voiceover)

| Setting | Value |
|---------|-------|
| Sample Rate | 48 kHz |
| Bit Depth | 16-bit |
| Format | AAC or WAV |
| Noise Gate | Enabled |

### GIF Quality

| Setting | Value |
|---------|-------|
| Resolution | 800x500 or 1200x750 |
| Frame Rate | 15-20 FPS |
| Colors | 256 (optimized palette) |
| Duration | 5-30 seconds max |
| File Size | Under 5MB for web |

---

## Recording Workflow

### Pre-Recording Checklist

- [ ] Close unnecessary apps (Slack, email, etc.)
- [ ] Enable Do Not Disturb
- [ ] Check microphone levels (if voiceover)
- [ ] Clear terminal history
- [ ] Open script/storyboard for reference
- [ ] Set screen recording area
- [ ] Do a 10-second test recording
- [ ] Check disk space

### Hero GIF Recording (20-30 seconds)

1. **Setup**
   ```bash
   # Open terminal at correct size
   # Clear screen
   clear
   ```

2. **Record Scene 1: Task Query (0-10s)**
   - Type: `claude` (press Enter)
   - Wait for prompt
   - Type: "What's my next task?"
   - Wait for MCP response animation
   - Hold on result for 2 seconds

3. **Record Scene 2: Task Update (10-20s)**
   - Type: "Mark T3.2 as done"
   - Wait for update confirmation
   - Show progress bar animation
   - Hold on success message for 2 seconds

4. **Post-process**
   ```bash
   # Convert to GIF using gifski
   gifski --fps 15 --width 800 -o hero.gif recording.mp4

   # Optimize size
   gifsicle -O3 --lossy=80 hero.gif -o hero-optimized.gif
   ```

### Full Demo Recording (2-3 minutes)

1. **Preparation**
   - Review DEMO_SCRIPT.md
   - Practice the flow 2-3 times
   - Set up split-screen layout (terminal + browser)

2. **Recording Order**
   - Record terminal scenes first
   - Record browser scenes second
   - Record transitions last
   - Record voiceover separately (easier to edit)

3. **Terminal Recording Tips**
   - Use keyboard macros for consistent typing speed
   - Pause 1-2 seconds after each command
   - Let responses "settle" before moving on
   - Use `sleep 2` between commands if scripting

4. **Browser Recording Tips**
   - Use smooth scroll (not jumpy clicks)
   - Highlight elements with cursor
   - Wait for page loads to complete
   - Use tab key to show interactive elements

---

## Using asciinema + vhs for Terminal GIFs

### asciinema (record real sessions)

```bash
# Install
brew install asciinema

# Record
asciinema rec demo.cast

# Play back
asciinema play demo.cast

# Convert to GIF
# Use agg (asciinema gif generator)
cargo install agg
agg demo.cast demo.gif
```

### vhs (scripted terminal recordings)

```bash
# Install
brew install vhs

# Create script
cat > demo.tape << 'EOF'
Output demo.gif
Set FontSize 14
Set Width 1200
Set Height 600
Set Theme "Dracula"

Type "claude"
Enter
Sleep 1s

Type "What's my next task?"
Enter
Sleep 2s

# Simulate response (you'll need to fake this)
Type "# Calling planflow_task_next..."
Sleep 500ms

# Continue with demo...
EOF

# Generate GIF
vhs demo.tape
```

---

## Post-Production

### Video Editing Workflow

1. **Import footage** into DaVinci Resolve / iMovie
2. **Trim** dead space and mistakes
3. **Add transitions** (simple crossfades, 0.3-0.5s)
4. **Add text overlays** for key points
5. **Add background music** (low volume, 10-15%)
6. **Color grade** for consistency
7. **Export** in multiple formats

### Export Settings

**For YouTube/Website:**
- Format: MP4 (H.264)
- Resolution: 1080p or 1440p
- Bitrate: 10-15 Mbps
- Audio: AAC 192kbps

**For Twitter/Social:**
- Format: MP4
- Resolution: 1280x720
- Duration: Under 2:20
- File size: Under 512MB

**For GIF (Hero):**
- Resolution: 800x500
- FPS: 15-20
- Colors: 256
- Loop: Infinite
- Size: Under 5MB

### Recommended Background Music

Free sources:
- [YouTube Audio Library](https://studio.youtube.com/channel/audio)
- [Pixabay Music](https://pixabay.com/music/)
- [Mixkit](https://mixkit.co/free-stock-music/)

Style: Lo-fi, ambient, or light electronic (non-distracting)

---

## File Organization

```
demo/
├── DEMO_SCRIPT.md           # This storyboard
├── TERMINAL_SESSION.md      # Copy-paste terminal content
├── RECORDING_GUIDE.md       # This file
├── hero-animation.svg       # Animated SVG placeholder
├── raw/                     # Raw recordings
│   ├── terminal-scene1.mov
│   ├── terminal-scene2.mov
│   └── browser-scenes.mov
├── edited/                  # Edited versions
│   ├── full-demo-v1.mp4
│   └── full-demo-final.mp4
├── exports/                 # Final exports
│   ├── hero.gif             # Landing page GIF
│   ├── hero.mp4             # Landing page video (fallback)
│   ├── full-demo.mp4        # Full 2-3 min demo
│   ├── twitter-clip.mp4     # Social media clip
│   └── thumbnail.png        # Video thumbnail
└── assets/                  # Supporting files
    ├── music/
    ├── fonts/
    └── logos/
```

---

## Quick Commands Reference

### Screen Recording (macOS)

```bash
# Start recording with ffmpeg
ffmpeg -f avfoundation -framerate 30 -i "1:0" -c:v libx264 -preset ultrafast output.mp4

# Record specific window (need window ID)
# Use OBS or native screen recording instead
```

### GIF Conversion

```bash
# MP4 to GIF with ffmpeg + gifski
ffmpeg -i input.mp4 -vf "fps=15,scale=800:-1" -c:v pam -f image2pipe - | \
  gifski -o output.gif --fps 15 --width 800 -

# Optimize existing GIF
gifsicle -O3 --lossy=80 input.gif -o output.gif

# Quick GIF from video (lower quality but fast)
ffmpeg -i input.mp4 -vf "fps=15,scale=800:-1:flags=lanczos" -c:v gif output.gif
```

### Thumbnail Generation

```bash
# Extract frame from video
ffmpeg -i video.mp4 -ss 00:00:05 -vframes 1 thumbnail.png

# Create social media card
convert thumbnail.png -resize 1200x630 -gravity center -extent 1200x630 social-card.png
```

---

## Troubleshooting

### Common Issues

**GIF too large:**
- Reduce frame rate to 10-12 FPS
- Reduce resolution
- Shorten duration
- Use lossy compression: `gifsicle --lossy=100`

**Terminal text blurry:**
- Record at 2x resolution, scale down in post
- Use sharp scaling algorithm (Lanczos)
- Ensure font anti-aliasing is consistent

**Choppy playback:**
- Record at constant frame rate
- Check CPU usage during recording
- Use hardware encoding if available

**Audio sync issues:**
- Record audio separately
- Use audio waveform to sync in editor
- Ensure consistent sample rate

---

## Distribution Checklist

- [ ] Hero GIF uploaded to CDN/hosting
- [ ] Full demo on YouTube (unlisted or public)
- [ ] Embed code added to landing page
- [ ] Twitter clip posted with hashtags
- [ ] LinkedIn post with video
- [ ] Product Hunt media uploaded
- [ ] README updated with demo links

---

## Resources

- [OBS Studio Guide](https://obsproject.com/wiki/)
- [vhs Documentation](https://github.com/charmbracelet/vhs)
- [asciinema Documentation](https://asciinema.org/docs)
- [gifski](https://gif.ski/)
- [DaVinci Resolve Tutorials](https://www.blackmagicdesign.com/products/davinciresolve/training)
