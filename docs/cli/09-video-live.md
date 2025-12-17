# Video Download & Live Recording

Download videos and record live streams from 38+ platforms directly from your terminal.

## Quick Start

```bash
# Download a YouTube video
rek video download https://youtube.com/watch?v=dQw4w9WgXcQ

# Record a Twitch live stream
rek live https://twitch.tv/shroud -o shroud.ts

# Get video info without downloading
rek video info https://tiktok.com/@user/video/123456
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

| Platform | Command Example |
|----------|----------------|
| **Twitch** | `rek live https://twitch.tv/shroud` |
| **Kick** | `rek live https://kick.com/xqc` |
| **YouTube Live** | `rek live https://youtube.com/live/xxxxx` |
| **TikTok Live** | `rek live https://tiktok.com/@user/live` |
| **Facebook Live** | `rek live https://facebook.com/user/live` |
| **Chaturbate** | `rek live https://chaturbate.com/username/` |
| **VK Live** | `rek live https://vk.com/video-xxx` |
| **Twitter Spaces** | `rek live https://twitter.com/i/spaces/xxx` |
| **PeerTube** | `rek live https://peertube.instance/w/xxx` |

## Commands

### `rek video info`

Get information about a video without downloading.

```bash
# Basic info
rek video info https://youtube.com/watch?v=xxx

# Output as JSON (for scripting)
rek video info https://youtube.com/watch?v=xxx --json
```

**Output:**
```
Title: Never Gonna Give You Up
Uploader: Rick Astley
Duration: 3:33
Views: 1,500,000,000
Formats:
  • 1080p (video+audio) - 45.2 MB
  • 720p (video+audio) - 28.1 MB
  • 480p (video+audio) - 15.3 MB
  • audio only (m4a) - 3.2 MB
```

### `rek video download`

Download a video to disk.

```bash
# Basic download (auto-selects best quality)
rek video download https://youtube.com/watch?v=xxx

# Specify output file
rek video download https://vimeo.com/123456 -o my-video.mp4

# Select quality
rek video download https://tiktok.com/@user/video/xxx quality=720p

# Verbose mode (show progress details)
rek video download https://instagram.com/p/xxx -v
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

Check if a URL is supported.

```bash
rek video check https://youtube.com/watch?v=xxx
# ✓ Supported by: youtube

rek video check https://random-site.com/video
# ✓ Supported by: generic (auto-detect)
```

### `rek live`

Shortcut for recording live streams. Equivalent to `rek video download --live`.

```bash
# Record indefinitely (Ctrl+C to stop)
rek live https://twitch.tv/streamer

# Record for specific duration
rek live https://kick.com/streamer duration=3600

# Specify output file
rek live https://youtube.com/live/xxx -o stream.ts

# With custom quality
rek live https://chaturbate.com/room/ quality=highest
```

**Options:**

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Output file (default: `live.ts`) |
| `-v, --verbose` | Show detailed information |
| `-d, --duration <sec>` | Recording duration in seconds |
| `quality=<q>` | Quality selection |
| `concurrency=<n>` | Parallel segment downloads |
| `Header:Value` | Custom HTTP headers |

## Examples

### Download YouTube Video

```bash
# Best quality
rek video download https://youtube.com/watch?v=dQw4w9WgXcQ

# Specific quality
rek video download https://youtube.com/watch?v=dQw4w9WgXcQ quality=720p

# Audio only (if available)
rek video download https://youtube.com/watch?v=xxx quality=audio
```

### Record Twitch Stream

```bash
# Record until stopped
rek live https://twitch.tv/shroud -o shroud-$(date +%Y%m%d).ts

# Record 1 hour
rek live https://twitch.tv/shroud duration=3600

# With quality selection
rek live https://twitch.tv/shroud quality=1080p
```

### Download TikTok Video

```bash
rek video download https://tiktok.com/@username/video/7123456789

# Or with short URL
rek video download https://vm.tiktok.com/xxx
```

### Download Instagram Reel/Post

```bash
rek video download https://instagram.com/reel/xxx
rek video download https://instagram.com/p/xxx
```

### Download Twitter/X Video

```bash
rek video download https://twitter.com/user/status/123456789
rek video download https://x.com/user/status/123456789
```

### Record Adult Live Stream

```bash
# Chaturbate
rek live https://chaturbate.com/username/ -o recording.ts

# With duration limit
rek live https://chaturbate.com/username/ duration=1800
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
Downloading: Never Gonna Give You Up
Quality: 1080p (45.2 MB)
Progress: ████████████████████░░░░░░░░░░ 67% | 30.2 MB | 2.1 MB/s | ETA: 7s
```

For live streams:

```
Recording: shroud - Valorant Ranked
Duration: 00:15:32 | Segments: 93 | Size: 156.2 MB | Speed: 1.8 MB/s
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
rek video info https://youtube.com/watch?v=xxx --json | jq '.title'

# Check duration
rek video info https://youtube.com/watch?v=xxx --json | jq '.duration'
```

### Record Live on Schedule

```bash
# Record for 2 hours starting at specific time
echo "rek live https://twitch.tv/streamer duration=7200 -o stream.ts" | at 20:00
```

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
rek video info https://twitch.tv/streamer
# Check if "isLive: true" appears
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
rek> video info https://youtube.com/watch?v=xxx
rek> video download https://youtube.com/watch?v=xxx quality=1080p
rek> live https://twitch.tv/streamer duration=3600
```

## Next Steps

- **[HLS Protocol](/protocols/08-hls.md)** - Low-level HLS streaming API
- **[Mock Servers](08-mock-servers.md)** - Test with mock HLS server
- **[Shell](03-shell.md)** - Interactive mode features
