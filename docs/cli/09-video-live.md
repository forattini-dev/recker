# Video Download & Live Recording

Download videos and record live streams from 38+ platforms directly from your terminal.

## Quick Start

```bash
# Get video info (default action)
rek video https://youtube.com/watch?v=dQw4w9WgXcQ

# Using shortcuts (no full URL needed!)
rek video @youtube/dQw4w9WgXcQ
rek video youtube/dQw4w9WgXcQ

# Download a video
rek video download https://youtube.com/watch?v=dQw4w9WgXcQ
rek video download @youtube/dQw4w9WgXcQ -o video.mp4

# Download subtitles
rek video @youtube/dQw4w9WgXcQ --sub en
rek video @youtube/dQw4w9WgXcQ -s pt-BR -o legendas.vtt

# Check if live stream is active
rek live @twitch/shroud

# Record a live stream (auto-generates unique filename!)
rek live download @twitch/shroud
# → twitch--shroud--2025-12-19-14-30-00.ts

# Record to specific directory
rek live download @twitch/shroud -O ~/streams
```

## URL Shortcuts

Save typing with shortcut syntax! Use `@site/path` or `site/path`:

```bash
# Full URL
rek video https://youtube.com/watch?v=dQw4w9WgXcQ

# Shortcut (with @)
rek video @youtube/dQw4w9WgXcQ

# Shortcut (without @)
rek video youtube/dQw4w9WgXcQ
```

### Available Shortcuts

| Site | Shortcut | Expands To |
|------|----------|------------|
| YouTube | `@youtube/VIDEO_ID` | `https://youtube.com/watch?v=VIDEO_ID` |
| Twitch | `@twitch/USERNAME` | `https://twitch.tv/USERNAME` |
| Kick | `@kick/USERNAME` | `https://kick.com/USERNAME` |
| TikTok | `@tiktok/USER/VIDEO_ID` | `https://tiktok.com/@USER/video/VIDEO_ID` |
| Instagram | `@instagram/p/CODE` | `https://instagram.com/p/CODE` |
| Chaturbate | `@chaturbate/ROOM` | `https://chaturbate.com/ROOM/` |
| Facebook | `@facebook/PATH` | `https://facebook.com/PATH` |
| Twitter/X | `@twitter/USER/status/ID` | `https://twitter.com/USER/status/ID` |
| Vimeo | `@vimeo/ID` | `https://vimeo.com/ID` |
| Reddit | `@reddit/PATH` | `https://reddit.com/PATH` |
| ...and more | Run `rek video shortcuts` | for full list |

```bash
# List all shortcuts
rek video shortcuts
rek live shortcuts
```

## Supported Platforms

### Video Sites (38 total)

| Category | Sites |
|----------|-------|
| **Social Media** | YouTube, TikTok, Instagram, Facebook, Twitter/X, Reddit, VK, Tumblr, Pinterest |
| **Streaming** | Twitch, Kick, Vimeo, Dailymotion, Bilibili, Rumble, Odysee, NicoNico, PeerTube |
| **Audio** | SoundCloud, Bandcamp, Mixcloud, Audiomack, Jamendo, LastFm, Beatport, Funkwhale |
| **Short Videos** | Streamable, Imgur, 9Gag, Coub, RedGifs, Flickr |
| **Adult** | Chaturbate, PornHub, XVideos |
| **Fallback** | Generic (any site with m3u8/mp4) |

```bash
# List all supported sites
rek video sites
```

### Live Stream Platforms (9 with native support)

| Platform | Check Status | Record |
|----------|-------------|--------|
| **Twitch** | `rek live @twitch/shroud` | `rek live download @twitch/shroud` |
| **Kick** | `rek live @kick/xqc` | `rek live download @kick/xqc` |
| **YouTube Live** | `rek live @youtube/LIVE_ID` | `rek live download @youtube/LIVE_ID` |
| **TikTok Live** | `rek live @tiktok/user` | `rek live download @tiktok/user` |
| **Facebook Live** | `rek live @facebook/user/live` | `rek live download @facebook/user/live` |
| **Chaturbate** | `rek live @chaturbate/room` | `rek live download @chaturbate/room` |
| **VK Live** | `rek live @vk/VIDEO_ID` | `rek live download @vk/VIDEO_ID` |
| **Twitter Spaces** | `rek live https://twitter.com/i/spaces/xxx` | Audio only |
| **PeerTube** | `rek live @peertube/instance/id` | Instance dependent |

## Commands

### `rek video` / `rek video info`

Get information about a video. This is the **default action** - no subcommand needed.

```bash
# Default action: info
rek video https://youtube.com/watch?v=xxx
rek video @youtube/xxx

# Explicit info subcommand (same result)
rek video info https://youtube.com/watch?v=xxx

# Output as JSON (for scripting)
rek video @youtube/xxx --json
```

**Output:**
```
Video Info

ID: dQw4w9WgXcQ
Title: Never Gonna Give You Up
Uploader: Rick Astley
Duration: 3m 33s
Views: 1,500,000,000

Available Formats:
  1. 1080p (m3u8) - 3500kbps
  2. 720p (m3u8) - 2000kbps
  3. 480p (m3u8) - 1000kbps

Subtitles:
  en       English (vtt, srv3, ttml, json3)
  pt-BR    Portuguese (Brazil) (vtt, srv3, ttml, json3)

Auto-Generated Captions:
  en       English (auto-generated) (vtt, srv3, ttml, json3)

To download: rek video @youtube/dQw4w9WgXcQ --sub <lang>
```

**Subtitle Options:**

| Option | Description |
|--------|-------------|
| `-s, --sub <lang>` | Download subtitle for language (e.g., `en`, `pt-BR`) |
| `--sub-format <fmt>` | Subtitle format: `vtt`, `srv3`, `ttml`, `json3` (default: vtt) |
| `--sub-auto` | Include auto-generated captions when downloading |
| `-o, --output <file>` | Output file for subtitle |

```bash
# Download English subtitles
rek video @youtube/dQw4w9WgXcQ --sub en

# Download with custom output file
rek video @youtube/dQw4w9WgXcQ -s pt-BR -o legendas.vtt

# Download auto-generated captions
rek video @youtube/dQw4w9WgXcQ --sub en --sub-auto
```

### `rek video download`

Download a video to disk.

```bash
# Basic download (auto-selects best quality)
rek video download https://youtube.com/watch?v=xxx
rek video download @youtube/xxx

# Specify output file
rek video download @vimeo/123456 -o my-video.mp4

# Select quality
rek video download @tiktok/user/123 quality=720p

# Verbose mode (show progress details)
rek video download @instagram/p/xxx -v
```

**Options:**

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Output file path |
| `-v, --verbose` | Show detailed progress |
| `-l, --live` | Enable live stream mode |
| `quality=<q>` | `highest`, `lowest`, or resolution like `720p`, `1080p` |
| `duration=<s>` | Recording duration for live (seconds) |
| `concurrency=<n>` | Concurrent segment downloads (default: 4) |
| `Header:Value` | Add custom HTTP header |

### `rek video check`

Check if a URL or shortcut is supported.

```bash
rek video check @youtube/xxx
# Shortcut: @youtube/xxx → https://youtube.com/watch?v=xxx
# ✔ URL is supported
# Extractor: youtube

rek video check https://random-site.com/video
# ⚠ No specific extractor, will try generic
```

### `rek live` / `rek live info`

Check live stream status. This is the **default action** for live.

```bash
# Default action: check status
rek live https://twitch.tv/shroud
rek live @twitch/shroud
rek live twitch/shroud

# Explicit info subcommand
rek live info @kick/xqc

# Output as JSON
rek live @twitch/shroud --json
```

**Output:**
```
Live Stream Info

Status: ● LIVE
ID: shroud
Title: VALORANT Ranked
Channel: shroud
Viewers: 45,234

Available Qualities:
  1. 1080p (m3u8) - 6000kbps
  2. 720p (m3u8) - 3000kbps
  3. 480p (m3u8) - 1500kbps

To record this stream:
  rek live download @twitch/shroud
```

### `rek live download`

Record a live stream to disk.

```bash
# Record indefinitely (Ctrl+C to stop) - auto-generates unique filename
rek live download @twitch/streamer
# → twitch--streamer--2025-12-19-14-30-00.ts

# Specify output directory (auto-generates filename there)
rek live download @chaturbate/room -O /mnt/recordings
# → /mnt/recordings/chaturbate--room--2025-12-19-14-30-00.ts

# Record for specific duration
rek live download @kick/streamer --duration=3600

# Specify exact output file
rek live download @youtube/xxx -o stream.ts

# With custom quality
rek live download @chaturbate/room --quality=highest
```

**Auto-Generated Filenames:**

When no `-o` output is specified, Recker generates unique filenames:

```
{provider}--{username}--{YYYY-MM-DD-HH-mm-ss}.ts
```

Examples:
- `twitch--shroud--2025-12-19-14-30-00.ts`
- `chaturbate--_keti_--2025-12-19-22-15-30.ts`
- `kick--xqc--2025-12-19-18-45-12.ts`

**Options:**

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Output file path (exact name) |
| `-O, --outputDir <dir>` | Output directory (auto-generates filename) |
| `-v, --verbose` | Show detailed information |
| `-d, --duration <sec>` | Recording duration in seconds |
| `-Q, --quality <q>` | Quality: `highest`, `lowest`, `720p`, `1080p` |
| `-c, --concurrency <n>` | Parallel segment downloads (default: 4) |
| `Header:Value` | Custom HTTP headers |

**Resilience:**

- Automatic retry with exponential backoff on transient errors (404, 503, etc.)
- Skips failed segments instead of stopping the entire recording
- Appends to existing files (safe to resume interrupted recordings)

## Examples

### Download YouTube Video

```bash
# Best quality (shortcuts work!)
rek video download @youtube/dQw4w9WgXcQ

# Specific quality
rek video download @youtube/dQw4w9WgXcQ quality=720p -o video.mp4
```

### Download YouTube Subtitles

```bash
# View available subtitles (shown in video info)
rek video @youtube/dQw4w9WgXcQ

# Download English subtitles
rek video @youtube/dQw4w9WgXcQ --sub en

# Download Portuguese subtitles with custom filename
rek video @youtube/dQw4w9WgXcQ -s pt-BR -o legendas.vtt

# Download auto-generated captions (when manual not available)
rek video @youtube/dQw4w9WgXcQ --sub en --sub-auto

# Download in specific format
rek video @youtube/dQw4w9WgXcQ --sub en --sub-format srv3
```

### Record Twitch Stream

```bash
# Check if live first
rek live @twitch/shroud

# Record with auto-generated unique filename
rek live download @twitch/shroud
# → twitch--shroud--2025-12-19-14-30-00.ts

# Record to specific directory
rek live download @twitch/shroud -O ~/streams
# → ~/streams/twitch--shroud--2025-12-19-14-30-00.ts

# Record 1 hour
rek live download @twitch/shroud --duration=3600
```

### Download TikTok Video

```bash
rek video download @tiktok/username/7123456789

# Or with full URL
rek video download https://vm.tiktok.com/xxx
```

### Download Instagram Reel/Post

```bash
rek video download @instagram/p/ABC123XYZ
rek video download https://instagram.com/reel/xxx
```

### Download Twitter/X Video

```bash
rek video download @twitter/user/status/123456789
rek video download @x/user/status/123456789
```

### Record Adult Live Stream

```bash
# Chaturbate - check status
rek live @chaturbate/username

# Record (auto-generates unique filename)
rek live download @chaturbate/username
# → chaturbate--username--2025-12-19-22-15-30.ts

# Record to specific directory
rek live download @chaturbate/username -O /mnt/recordings

# With duration limit (30 minutes)
rek live download @chaturbate/username --duration=1800
```

### Generic Site (Auto-detect)

```bash
# Works on most sites with embedded video
rek video download https://some-news-site.com/article-with-video

# The generic extractor auto-detects m3u8/mp4 URLs
```

## Progress Display

When downloading, you'll see progress:

```
Extracting video from https://youtube.com/watch?v=dQw4w9WgXcQ...
Title: Never Gonna Give You Up
Output: video.ts

  45/120 segments | 30.2 MB downloaded (37.5%)
```

For live streams:

```
Connecting to live stream: https://twitch.tv/shroud
Channel: shroud
Title: VALORANT Ranked
Output: shroud.ts
Duration: Until stopped (Ctrl+C)

Recording live stream...
  15:32 | 93 segments | 156.2 MB
```

## Output Formats

| Extension | Description |
|-----------|-------------|
| `.ts` | MPEG Transport Stream (HLS native, plays in VLC) |
| `.mp4` | If source is MP4 (no transcoding) |
| `.m4a` | Audio only (from MP4 source) |

> **Note:** Recker downloads in the original format. For format conversion, use ffmpeg:
> ```bash
> ffmpeg -i video.ts -c copy video.mp4
> ```

## Custom Headers

Some sites require authentication or specific headers:

```bash
# With cookies
rek video download https://site.com/video Cookie:"session=abc123"

# With referer
rek video download https://site.com/video Referer:"https://site.com"

# Multiple headers
rek video download https://site.com/video \
  Cookie:"auth=xxx" \
  User-Agent:"Mozilla/5.0..."
```

## Scripting Examples

### Batch Download

```bash
# Download multiple videos
cat urls.txt | while read url; do
  rek video download "$url" -o "videos/$(basename $url).mp4"
done
```

### Get Video Info as JSON

```bash
# Parse with jq
rek video @youtube/xxx --json | jq '.title'

# Check duration
rek video @youtube/xxx --json | jq '.duration'

# Check if live
rek live @twitch/shroud --json | jq '.isLive'

# List available subtitle languages
rek video @youtube/xxx --json | jq '.subtitles | keys'

# Get subtitle URL for specific language
rek video @youtube/xxx --json | jq '.subtitles.en[0].url'
```

### Record Live on Schedule

```bash
# Record for 2 hours starting at specific time
echo "rek live download @twitch/streamer duration=7200 -o stream.ts" | at 20:00
```

## Command Summary

| Command | Action |
|---------|--------|
| `rek video <url>` | Show video info + subtitles (default) |
| `rek video <url> --sub <lang>` | Download subtitle for language |
| `rek video @site/path` | Show info using shortcut |
| `rek video download <url>` | Download video |
| `rek video sites` | List supported sites |
| `rek video shortcuts` | List available shortcuts |
| `rek video check <url>` | Check URL support |
| `rek live <url>` | Show live stream info (default) |
| `rek live @site/path` | Show live info using shortcut |
| `rek live download <url>` | Record live stream (auto-filename) |
| `rek live download <url> -O <dir>` | Record to directory (auto-filename) |
| `rek live download <url> -o <file>` | Record to specific file |
| `rek live shortcuts` | List live shortcuts |

## Troubleshooting

### "Extractor not found"

The URL format might not be recognized. Try the generic extractor:

```bash
rek video download https://site.com/video
# Generic extractor will try to auto-detect video URLs
```

### "Stream is offline"

For live commands, the streamer must be live:

```bash
rek live @twitch/streamer
# Check if status shows "● LIVE"
```

### Slow Downloads

Increase concurrency for HLS streams:

```bash
rek video download https://site.com/video concurrency=8
```

### Authentication Required

Some sites require login cookies:

```bash
# Export cookies from browser and use them
rek video download https://site.com/video Cookie:"your_session_cookie"
```

## Shell Integration

All video commands work in the interactive shell:

```bash
rek shell
```

```
rek> video @youtube/xxx
rek> video download @youtube/xxx quality=1080p
rek> live @twitch/streamer
rek> live download @twitch/streamer duration=3600
```

## Next Steps

- **[HLS Protocol](/protocols/08-hls.md)** - Low-level HLS streaming API
- **[Mock Servers](08-mock-servers.md)** - Test with mock HLS server
- **[Shell](03-shell.md)** - Interactive mode features
