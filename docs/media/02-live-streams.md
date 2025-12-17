# Live Stream Recording

Record live streams from 9+ platforms with automatic segment tracking, quality selection, and duration limits.

## Overview

Recker can record live streams from popular platforms:

- **Gaming**: Twitch, Kick, YouTube Live
- **Social**: TikTok Live, Facebook Live, Twitter Spaces
- **Adult**: Chaturbate
- **Other**: VK Live, PeerTube

## Quick Start

```typescript
import { extract, createClient } from 'recker';

const client = createClient();

// Check if streamer is live
const info = await extract('https://twitch.tv/shroud', client);

if (info.isLive) {
  // Get HLS stream URL
  const hlsFormat = info.formats.find(f => f.live);

  // Record for 5 minutes
  await client.hls(hlsFormat.url, {
    live: { duration: 300_000 }
  }).download('./stream.ts');
}
```

## Supported Platforms

| Platform | Live Detection | Recording | Notes |
|----------|---------------|-----------|-------|
| **Twitch** | `isLive: true` | HLS | Full quality support |
| **Kick** | `isLive: true` | HLS | Full quality support |
| **YouTube Live** | `isLive: true` | HLS | Via YouTube extractor |
| **TikTok Live** | `isLive: true` | HLS | Mobile streams |
| **Facebook Live** | `isLive: true` | HLS | Public streams |
| **Chaturbate** | Always live | HLS | Adult content |
| **VK Live** | `isLive: true` | HLS | VK ecosystem |
| **Twitter Spaces** | `isLive: true` | HLS | Audio only |
| **PeerTube** | `isLive: true` | HLS | Instance-dependent |

## Recording Live Streams

### Basic Recording

```typescript
import { extract, createClient } from 'recker';

const client = createClient();

// 1. Extract stream info
const info = await extract('https://twitch.tv/shroud', client);

if (!info.isLive) {
  throw new Error('Stream is offline');
}

// 2. Find live format
const liveFormat = info.formats.find(f => f.live || f.protocol === 'm3u8');

// 3. Record using HLS
await client.hls(liveFormat.url, {
  live: true  // Record until cancelled
}).download('./stream.ts');
```

### Record for Specific Duration

```typescript
// Record for 1 hour
await client.hls(liveFormat.url, {
  live: { duration: 3600_000 }  // milliseconds
}).download('./stream.ts');
```

### Quality Selection

```typescript
// Extract with quality preference
const info = await extract('https://twitch.tv/shroud', client);

// Find specific quality
const format1080p = info.formats.find(f =>
  f.live && f.height === 1080
);

const format720p = info.formats.find(f =>
  f.live && f.height === 720
);

// Use best available
const format = format1080p || format720p || info.formats.find(f => f.live);

await client.hls(format.url, {
  live: { duration: 1800_000 }
}).download('./stream.ts');
```

### With HLS Quality Selection

```typescript
// Let HLS plugin handle quality
await client.hls(liveFormat.url, {
  live: { duration: 3600_000 },
  quality: 'highest'  // or 'lowest', { resolution: '1920x1080' }
}).download('./stream.ts');
```

## Platform-Specific Examples

### Twitch

```typescript
const info = await extract('https://twitch.tv/shroud', client);

if (info.isLive) {
  console.log(`Recording: ${info.title}`);
  console.log(`Streamer: ${info.uploader}`);

  const hlsFormat = info.formats.find(f => f.live);

  await client.hls(hlsFormat.url, {
    live: { duration: 7200_000 }  // 2 hours
  }).download(`./twitch-${info.uploader}-${Date.now()}.ts`);
}
```

### YouTube Live

```typescript
const info = await extract('https://youtube.com/live/xxxxx', client);

if (info.isLive) {
  const hlsFormat = info.formats.find(f => f.protocol === 'm3u8');

  await client.hls(hlsFormat.url, {
    live: { duration: 3600_000 }
  }).download('./youtube-live.ts');
}
```

### TikTok Live

```typescript
const info = await extract('https://tiktok.com/@username/live', client);

if (info.isLive) {
  const format = info.formats.find(f => f.live);

  await client.hls(format.url, {
    live: { duration: 1800_000 }  // 30 minutes
  }).download('./tiktok-live.ts');
}
```

### Chaturbate

```typescript
// Chaturbate rooms are always considered "live" when active
const info = await extract('https://chaturbate.com/roomname/', client);

// info.isLive will be true if room is active
const format = info.formats[0]; // Usually only one HLS format

await client.hls(format.url, {
  live: { duration: 1800_000 }
}).download('./recording.ts');
```

### Twitter Spaces (Audio)

```typescript
const info = await extract('https://twitter.com/i/spaces/xxxxx', client);

if (info.isLive) {
  // Twitter Spaces is audio-only
  const audioFormat = info.formats.find(f => f.live);

  await client.hls(audioFormat.url, {
    live: true  // Record until Space ends
  }).download('./space.ts');
}
```

## Progress Tracking

### Basic Progress

```typescript
await client.hls(liveFormat.url, {
  live: { duration: 3600_000 },
  onProgress: (progress) => {
    console.log(`Segments: ${progress.downloadedSegments}`);
    console.log(`Size: ${(progress.downloadedBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Elapsed: ${(progress.elapsed / 1000).toFixed(0)}s`);
  }
}).download('./stream.ts');
```

### Rich Progress Display

```typescript
let lastLog = 0;

await client.hls(liveFormat.url, {
  live: { duration: 3600_000 },
  onProgress: (progress) => {
    const now = Date.now();
    if (now - lastLog < 5000) return; // Log every 5 seconds
    lastLog = now;

    const mb = (progress.downloadedBytes / 1024 / 1024).toFixed(2);
    const minutes = Math.floor(progress.elapsed / 60000);
    const seconds = Math.floor((progress.elapsed % 60000) / 1000);
    const speed = (progress.downloadedBytes / progress.elapsed * 1000 / 1024 / 1024).toFixed(2);

    console.log(
      `Recording: ${minutes}:${seconds.toString().padStart(2, '0')} | ` +
      `${mb} MB | ${speed} MB/s | ${progress.downloadedSegments} segments`
    );
  }
}).download('./stream.ts');
```

## Segment Callbacks

Process segments as they're downloaded:

```typescript
await client.hls(liveFormat.url, {
  live: { duration: 3600_000 },
  onSegment: async (segment) => {
    console.log(`New segment ${segment.sequence}: ${segment.data.byteLength} bytes`);

    // Upload to cloud storage in real-time
    await uploadToS3(segment.data, `segments/${segment.sequence}.ts`);
  }
}).download('./stream.ts');
```

## Cancellation

### Manual Cancellation

```typescript
const downloader = client.hls(liveFormat.url, { live: true });

// Start recording
const promise = downloader.download('./stream.ts');

// Stop after some condition
setTimeout(() => {
  console.log('Stopping recording...');
  downloader.cancel();
}, 600_000); // 10 minutes

await promise;
console.log('Recording saved');
```

### Graceful Shutdown

```typescript
const downloader = client.hls(liveFormat.url, { live: true });
const promise = downloader.download('./stream.ts');

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\nStopping recording gracefully...');
  downloader.cancel();
});

await promise;
console.log('Recording completed');
```

### Conditional Stop

```typescript
let segmentCount = 0;
const maxSegments = 100;

await client.hls(liveFormat.url, {
  live: true,
  onSegment: (segment) => {
    segmentCount++;
    if (segmentCount >= maxSegments) {
      throw new Error('Max segments reached'); // Will stop recording
    }
  }
}).download('./stream.ts');
```

## Streaming API

Process segments without saving to disk:

```typescript
const downloader = client.hls(liveFormat.url, { live: { duration: 300_000 } });

for await (const segment of downloader.stream()) {
  console.log(`Segment ${segment.sequence}: ${segment.duration}s`);

  // Process in memory
  await processSegment(segment.data);
}
```

## Error Handling

```typescript
try {
  const info = await extract('https://twitch.tv/streamer', client);

  if (!info.isLive) {
    console.log('Streamer is offline');
    return;
  }

  const format = info.formats.find(f => f.live);

  await client.hls(format.url, {
    live: { duration: 3600_000 },
    onError: (error) => {
      // Non-fatal errors (will retry)
      console.warn('Warning:', error.message);
    }
  }).download('./stream.ts');

} catch (error) {
  if (error.message.includes('offline')) {
    console.log('Stream went offline');
  } else if (error.name === 'AbortError') {
    console.log('Recording cancelled');
  } else {
    console.error('Recording failed:', error.message);
  }
}
```

## Advanced Patterns

### Auto-Record When Live

```typescript
async function waitForLive(url: string, client: Client) {
  while (true) {
    try {
      const info = await extract(url, client);
      if (info.isLive) return info;
    } catch (e) {
      // Ignore errors
    }
    console.log('Waiting for stream...');
    await new Promise(r => setTimeout(r, 60000)); // Check every minute
  }
}

const info = await waitForLive('https://twitch.tv/shroud', client);
console.log('Stream is live! Recording...');

const format = info.formats.find(f => f.live);
await client.hls(format.url, { live: true }).download('./stream.ts');
```

### Multi-Quality Recording

```typescript
const info = await extract('https://twitch.tv/shroud', client);
const formats = info.formats.filter(f => f.live);

// Record multiple qualities simultaneously
await Promise.all(formats.slice(0, 2).map((format, i) =>
  client.hls(format.url, {
    live: { duration: 600_000 }
  }).download(`./stream-quality-${i}.ts`)
));
```

### Scheduled Recording

```typescript
import { schedule } from 'node-cron';

// Record every day at 8 PM for 2 hours
schedule('0 20 * * *', async () => {
  const info = await extract('https://twitch.tv/streamer', client);

  if (info.isLive) {
    const format = info.formats.find(f => f.live);
    await client.hls(format.url, {
      live: { duration: 7200_000 }
    }).download(`./recordings/${new Date().toISOString().split('T')[0]}.ts`);
  }
});
```

## Best Practices

### 1. Always Check isLive First

```typescript
const info = await extract(url, client);
if (!info.isLive) {
  throw new Error('Stream is not live');
}
```

### 2. Set Duration Limits

```typescript
// Don't record forever
await client.hls(url, {
  live: { duration: 14400_000 }  // Max 4 hours
}).download('./stream.ts');
```

### 3. Handle Stream Ending

```typescript
await client.hls(url, {
  live: true,
  onError: (error) => {
    if (error.message.includes('404') || error.message.includes('ended')) {
      console.log('Stream ended');
    }
  }
}).download('./stream.ts');
```

### 4. Use Unique Filenames

```typescript
const filename = `${info.uploader}-${Date.now()}.ts`;
await client.hls(url, { live: true }).download(filename);
```

### 5. Monitor Disk Space

```typescript
import { statfs } from 'fs/promises';

async function checkSpace(path: string, minGB: number) {
  const stats = await statfs(path);
  const freeGB = stats.bavail * stats.bsize / 1024 / 1024 / 1024;
  return freeGB > minGB;
}

if (!await checkSpace('./', 10)) {
  console.error('Less than 10GB free, stopping');
  downloader.cancel();
}
```

## Output Formats

Live streams are saved as MPEG Transport Stream (`.ts`):

- Plays directly in VLC, mpv, ffplay
- Can be converted to MP4:
  ```bash
  ffmpeg -i stream.ts -c copy stream.mp4
  ```
- Can be streamed while recording

## Next Steps

- **[Video Extractors](01-video-extractors.md)** - Extract video info
- **[HLS Protocol](/protocols/08-hls.md)** - Low-level HLS API
- **[CLI Video Commands](/cli/09-video-live.md)** - Command line usage
