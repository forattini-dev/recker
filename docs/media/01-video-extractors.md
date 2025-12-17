# Video Extractors

Extract video information and download from 38+ platforms programmatically.

## Overview

Recker provides built-in extractors for popular video and audio platforms. Each extractor understands the specific site's structure and can extract:

- Video metadata (title, duration, views, etc.)
- Available formats and qualities
- Direct download URLs
- Live stream information

## Quick Start

```typescript
import { extract, createClient } from 'recker';

const client = createClient();

// Auto-detect site and extract
const info = await extract('https://youtube.com/watch?v=dQw4w9WgXcQ', client);

console.log(info.title);      // "Never Gonna Give You Up"
console.log(info.uploader);   // "Rick Astley"
console.log(info.duration);   // 213 (seconds)
console.log(info.formats);    // Array of available formats
```

## Supported Sites

### All Extractors (38)

```typescript
import { listExtractors } from 'recker';

console.log(listExtractors());
// ['youtube', 'twitch', 'twitter', 'tiktok', 'instagram', 'facebook', ...]
```

| Category | Sites |
|----------|-------|
| **Social Media** | YouTube, TikTok, Instagram, Facebook, Twitter/X, Reddit, VK, Tumblr, Pinterest |
| **Streaming** | Twitch, Kick, Vimeo, Dailymotion, Bilibili, Rumble, Odysee, NicoNico, PeerTube |
| **Audio** | SoundCloud, Bandcamp, Mixcloud, Audiomack, Jamendo, LastFm, Beatport, Funkwhale |
| **Short Videos** | Streamable, Imgur, 9Gag, Coub, RedGifs, Flickr |
| **Adult** | Chaturbate, PornHub, XVideos |
| **Fallback** | Generic (auto-detects m3u8/mp4 on any site) |

### Live Stream Support

These extractors support live streams:

| Site | Live Support | Notes |
|------|--------------|-------|
| Twitch | ✓ | Full HLS streaming |
| Kick | ✓ | Full HLS streaming |
| YouTube | ✓ | YouTube Live |
| TikTok | ✓ | TikTok Live |
| Facebook | ✓ | Facebook Live |
| Chaturbate | ✓ | Adult streams |
| VK | ✓ | VK Live |
| Twitter | ✓ | Spaces (audio) |
| PeerTube | ✓ | Instance-dependent |

## Core Functions

### `extract(url, client, options?)`

Auto-detect and extract from any supported URL.

```typescript
import { extract, createClient } from 'recker';

const client = createClient();
const info = await extract('https://youtube.com/watch?v=xxx', client);
```

**Options:**

```typescript
interface ExtractOptions {
  preferExtractor?: string;   // Try specific extractor first
  skipGeneric?: boolean;      // Don't fall back to generic
  requireSpecific?: boolean;  // Throw if no specific extractor found
}
```

**Example with options:**

```typescript
// Force YouTube extractor
const info = await extract(url, client, {
  preferExtractor: 'youtube'
});

// Require specific extractor (no generic fallback)
const info = await extract(url, client, {
  requireSpecific: true
});
```

### `isSupported(url, includeGeneric?)`

Check if a URL is supported.

```typescript
import { isSupported } from 'recker';

await isSupported('https://youtube.com/watch?v=xxx');
// true

await isSupported('https://random-site.com/video');
// false (unless includeGeneric=true)

await isSupported('https://random-site.com/video', true);
// true (generic can try any URL)
```

### `getExtractorName(url)`

Get the name of the extractor that would handle a URL.

```typescript
import { getExtractorName } from 'recker';

await getExtractorName('https://youtube.com/watch?v=xxx');
// 'youtube'

await getExtractorName('https://twitch.tv/shroud');
// 'twitch'
```

### `findExtractor(url, client, includeGeneric?)`

Get the extractor instance for a URL.

```typescript
import { findExtractor, createClient } from 'recker';

const client = createClient();
const extractor = findExtractor('https://youtube.com/watch?v=xxx', client);

if (extractor) {
  console.log(extractor.IE_NAME); // 'youtube'
  const info = await extractor.extract(url);
}
```

## ExtractorResult

The result returned by all extractors:

```typescript
interface ExtractorResult {
  // Required fields
  id: string;              // Video ID
  title: string;           // Video title
  formats: Format[];       // Available formats

  // Optional metadata
  description?: string;
  uploader?: string;
  uploaderId?: string;
  uploaderUrl?: string;
  duration?: number;       // Seconds
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  timestamp?: number;      // Unix timestamp
  uploadDate?: string;     // YYYYMMDD format
  thumbnail?: string;
  thumbnails?: Thumbnail[];
  categories?: string[];
  tags?: string[];

  // Live stream info
  isLive?: boolean;

  // Platform-specific
  extractor?: string;      // Extractor name
  extractorKey?: string;   // Extractor key
  webpageUrl?: string;     // Original URL
}
```

## Format Object

Each format in the `formats` array:

```typescript
interface Format {
  // Required
  url: string;             // Direct download URL
  formatId: string;        // Unique format identifier

  // Quality info
  ext?: string;            // File extension (mp4, webm, m3u8)
  resolution?: string;     // e.g., "1920x1080"
  width?: number;
  height?: number;
  fps?: number;

  // Bitrate
  tbr?: number;            // Total bitrate (kbps)
  vbr?: number;            // Video bitrate
  abr?: number;            // Audio bitrate

  // Audio
  asr?: number;            // Audio sample rate
  acodec?: string;         // Audio codec
  vcodec?: string;         // Video codec

  // Size
  filesize?: number;       // Bytes (if known)
  filesizeApprox?: number; // Estimated bytes

  // Type flags
  videoOnly?: boolean;     // No audio
  audioOnly?: boolean;     // No video
  live?: boolean;          // Live stream format

  // HLS/DASH
  protocol?: string;       // 'http', 'https', 'm3u8', 'dash'
  manifestUrl?: string;    // Master playlist URL
}
```

## Using Specific Extractors

You can use extractors directly:

```typescript
import { extractors, createClient } from 'recker';

const client = createClient();

// YouTube
const youtube = new extractors.YouTube(client);
const info = await youtube.extract('https://youtube.com/watch?v=xxx');

// Twitch
const twitch = new extractors.Twitch(client);
const info = await twitch.extract('https://twitch.tv/shroud');

// TikTok
const tiktok = new extractors.TikTok(client);
const info = await tiktok.extract('https://tiktok.com/@user/video/123');
```

### Available Extractor Classes

```typescript
import { extractors } from 'recker';

// All available extractors
extractors.YouTube
extractors.Twitch
extractors.Twitter
extractors.X           // Alias for Twitter
extractors.TikTok
extractors.Instagram
extractors.Facebook
extractors.Vimeo
extractors.Dailymotion
extractors.Reddit
extractors.Kick
extractors.SoundCloud
extractors.Bilibili
extractors.Rumble
extractors.Odysee
extractors.VK
extractors.NicoNico
extractors.Bandcamp
extractors.Streamable
extractors.Imgur
extractors.NineGag
extractors.Coub
extractors.RedGifs
extractors.Tumblr
extractors.Pinterest
extractors.Flickr
extractors.Mixcloud
extractors.Audiomack
extractors.Jamendo
extractors.LastFm
extractors.Beatport
extractors.PeerTube
extractors.Funkwhale
extractors.Chaturbate
extractors.PornHub
extractors.XVideos
extractors.XVideosQuickies
extractors.Generic
```

## Downloading Videos

After extracting, use the format URLs to download:

```typescript
import { extract, createClient } from 'recker';
import { createWriteStream } from 'fs';

const client = createClient();
const info = await extract('https://youtube.com/watch?v=xxx', client);

// Find best format
const bestFormat = info.formats
  .filter(f => !f.videoOnly && !f.audioOnly)
  .sort((a, b) => (b.height || 0) - (a.height || 0))[0];

// Download
const response = await client.get(bestFormat.url);
const stream = createWriteStream('video.mp4');
await response.body.pipeTo(stream);
```

### Download HLS Stream

For live streams or HLS formats:

```typescript
const info = await extract('https://twitch.tv/shroud', client);

// Find HLS format
const hlsFormat = info.formats.find(f => f.protocol === 'm3u8');

if (hlsFormat) {
  // Use HLS downloader
  await client.hls(hlsFormat.url, {
    live: info.isLive ? { duration: 60000 } : false
  }).download('./stream.ts');
}
```

## Custom Extractors

Register your own extractor:

```typescript
import { BaseExtractor, registerExtractor, createClient } from 'recker';
import type { ExtractorResult } from 'recker';

class MyExtractor extends BaseExtractor {
  IE_NAME = 'mysite';
  VALID_URL = /^https?:\/\/mysite\.com\/video\/(\d+)/;

  async extract(url: string): Promise<ExtractorResult> {
    const match = url.match(this.VALID_URL);
    const videoId = match![1];

    // Fetch video data from API
    const response = await this.client.get(`https://api.mysite.com/v/${videoId}`);
    const data = await response.json();

    return {
      id: videoId,
      title: data.title,
      formats: [{
        url: data.videoUrl,
        formatId: 'main',
        ext: 'mp4',
        height: data.height,
        width: data.width
      }],
      duration: data.duration,
      uploader: data.author
    };
  }
}

// Register the extractor
registerExtractor(MyExtractor, 'mysite');

// Now it works automatically
const client = createClient();
const info = await extract('https://mysite.com/video/123', client);
```

### Registration Priority

```typescript
// Register at different priorities
registerExtractor(MyExtractor, 'mysite', 'first');        // Check first
registerExtractor(MyExtractor, 'mysite', 'before-generic'); // Before generic (default)
registerExtractor(MyExtractor, 'mysite', 'last');         // Check last
```

## Error Handling

```typescript
import { extract, ExtractorError, createClient } from 'recker';

const client = createClient();

try {
  const info = await extract('https://youtube.com/watch?v=xxx', client);
} catch (error) {
  if (error instanceof ExtractorError) {
    console.error('Extraction failed:', error.message);
    console.error('Is temporary:', error.isTemporary);
  }
}
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `No extractor found` | URL not recognized | Check URL format or use generic |
| `Video not found` | Video deleted/private | Check if video exists |
| `Stream offline` | Live stream not active | Wait for stream to start |
| `Authentication required` | Private content | Provide auth cookies |

## Examples

### Get All Available Qualities

```typescript
const info = await extract('https://youtube.com/watch?v=xxx', client);

// Group by quality
const qualities = info.formats
  .filter(f => f.height && !f.videoOnly)
  .reduce((acc, f) => {
    const key = `${f.height}p`;
    acc[key] = acc[key] || [];
    acc[key].push(f);
    return acc;
  }, {} as Record<string, Format[]>);

console.log('Available qualities:', Object.keys(qualities));
// ['1080p', '720p', '480p', '360p']
```

### Download Best Audio

```typescript
const info = await extract('https://youtube.com/watch?v=xxx', client);

const audioFormat = info.formats
  .filter(f => f.audioOnly)
  .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

if (audioFormat) {
  const response = await client.get(audioFormat.url);
  // Save as audio file
}
```

### Check if Live

```typescript
const info = await extract('https://twitch.tv/streamer', client);

if (info.isLive) {
  console.log('Stream is live!');
  // Start recording...
} else {
  console.log('Stream is offline');
}
```

### Batch Extract

```typescript
const urls = [
  'https://youtube.com/watch?v=xxx',
  'https://tiktok.com/@user/video/123',
  'https://twitter.com/user/status/456'
];

const results = await Promise.all(
  urls.map(url => extract(url, client).catch(e => ({ error: e.message, url })))
);

for (const result of results) {
  if ('error' in result) {
    console.log(`Failed: ${result.url} - ${result.error}`);
  } else {
    console.log(`Found: ${result.title}`);
  }
}
```

## TypeScript Support

All types are exported:

```typescript
import type {
  ExtractorResult,
  Format,
  Thumbnail,
  BaseExtractor,
  ExtractorError
} from 'recker';
```

## Next Steps

- **[CLI Video Commands](/cli/09-video-live.md)** - Use from command line
- **[HLS Protocol](/protocols/08-hls.md)** - Low-level HLS streaming
- **[Scraping](/scraping/01-overview.md)** - HTML parsing and extraction
