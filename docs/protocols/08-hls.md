# HLS (HTTP Live Streaming)

Download and process HLS streams with automatic playlist parsing, live stream support, and quality selection.

## Overview

HLS (HTTP Live Streaming) is an adaptive streaming protocol developed by Apple. It breaks video content into small segments and delivers them via HTTP. Recker provides a fluent API for:

- **VOD (Video on Demand)**: Download complete recorded streams
- **Live Streams**: Capture ongoing broadcasts with automatic segment tracking
- **Master Playlists**: Automatic quality selection from multiple variants
- **Streaming API**: Process segments as they download via AsyncIterator

## Quick Start

```typescript
import { createClient } from 'recker';

const client = createClient();

// Download VOD stream
await client.hls('https://example.com/stream.m3u8')
  .download('./video.ts');

// Record live stream for 2 minutes
await client.hls('https://example.com/live.m3u8', {
  live: { duration: 120_000 }
}).download('./recording.ts');
```

## Configuration Options

### HlsOptions

```typescript
interface HlsOptions {
  // Output mode: 'merge' concatenates segments, 'chunks' saves separately
  mode?: 'merge' | 'chunks';

  // Output format (only 'ts' supported without ffmpeg)
  format?: 'ts' | 'mp4' | 'mkv';

  // Live stream: true for infinite, or { duration: ms } for timed recording
  live?: boolean | { duration: number };

  // Quality selection for master playlists
  quality?: 'highest' | 'lowest' | { bandwidth?: number; resolution?: string };

  // Concurrent segment downloads
  concurrency?: number;

  // Callback for each downloaded segment
  onSegment?: (segment: SegmentData) => void | Promise<void>;

  // Progress callback
  onProgress?: (progress: HlsProgress) => void;

  // Error callback for non-fatal errors
  onError?: (error: Error) => void;

  // Custom headers for segment requests
  headers?: Record<string, string>;
}
```

### SegmentData

```typescript
interface SegmentData {
  sequence: number;      // Segment sequence number
  duration: number;      // Segment duration in seconds
  data: Uint8Array;      // Raw segment bytes
  url: string;           // Original segment URL
  downloadedAt: Date;    // Download timestamp
}
```

### HlsProgress

```typescript
interface HlsProgress {
  downloadedSegments: number;   // Segments downloaded so far
  totalSegments?: number;       // Total segments (undefined for live)
  downloadedBytes: number;      // Total bytes downloaded
  currentSegment: number;       // Current segment sequence
  isLive: boolean;              // Whether stream is live
  elapsed: number;              // Elapsed time in ms
}
```

## Basic Usage

### Download VOD Stream

```typescript
// Simple download with merge (default)
await client.hls('https://example.com/video.m3u8')
  .download('./video.ts');
```

### Download as Individual Chunks

```typescript
// Save each segment as separate file
await client.hls('https://example.com/video.m3u8', {
  mode: 'chunks'
}).download('./segments');

// Output: ./segments/segment-0.ts, ./segments/segment-1.ts, ...
```

### Custom Chunk Naming

```typescript
await client.hls(url, { mode: 'chunks' })
  .download((segment) =>
    `./output/part-${segment.sequence.toString().padStart(5, '0')}.ts`
  );

// Output: ./output/part-00000.ts, ./output/part-00001.ts, ...
```

## Live Streams

### Record for Duration

```typescript
// Record for 5 minutes
await client.hls('https://example.com/live.m3u8', {
  live: { duration: 300_000 }  // 5 minutes in ms
}).download('./recording.ts');
```

### Record Indefinitely

```typescript
const downloader = client.hls('https://example.com/live.m3u8', {
  live: true  // Record until cancelled
});

// Start downloading
const promise = downloader.download('./stream.ts');

// Stop after some condition
setTimeout(() => {
  downloader.cancel();
}, 600_000);  // Stop after 10 minutes

await promise;
```

### How Live Tracking Works

Recker automatically:

1. Fetches the playlist periodically (based on `targetDuration`)
2. Tracks seen segment sequence numbers
3. Downloads only new segments
4. Continues until `#EXT-X-ENDLIST` tag or duration limit

```typescript
await client.hls(liveUrl, {
  live: true,
  onSegment: (seg) => {
    console.log(`New segment ${seg.sequence}: ${seg.data.byteLength} bytes`);
  }
}).download('./live.ts');
```

## Quality Selection

HLS master playlists contain multiple quality variants. Recker automatically selects the best one or lets you choose.

### Automatic Selection

```typescript
// Highest quality (default)
await client.hls(masterUrl).download('./video.ts');

// Same as:
await client.hls(masterUrl, { quality: 'highest' }).download('./video.ts');
```

### Select Lowest Quality

```typescript
await client.hls(masterUrl, {
  quality: 'lowest'
}).download('./video.ts');
```

### Select by Resolution

```typescript
await client.hls(masterUrl, {
  quality: { resolution: '1920x1080' }
}).download('./video.ts');
```

### Select by Bandwidth

```typescript
// Finds closest matching bandwidth
await client.hls(masterUrl, {
  quality: { bandwidth: 3_000_000 }  // ~3 Mbps
}).download('./video.ts');
```

### Inspect Available Qualities

```typescript
const info = await client.hls(masterUrl).info();

if (info.master) {
  console.log('Available variants:');
  for (const variant of info.master.variants) {
    console.log(`  ${variant.resolution} @ ${variant.bandwidth} bps`);
  }
}

console.log(`Selected: ${info.selectedVariant?.resolution}`);
```

## Streaming API

Process segments as they download without saving to disk.

### AsyncIterator

```typescript
for await (const segment of client.hls(url).stream()) {
  console.log(`Segment ${segment.sequence}: ${segment.data.byteLength} bytes`);

  // Process segment (e.g., upload to cloud)
  await uploadToS3(segment.data, `segment-${segment.sequence}.ts`);
}
```

### Pipe to Writable Stream

```typescript
import { createWriteStream } from 'fs';

const output = createWriteStream('./video.ts');
await client.hls(url).pipe(output);
```

### Custom Processing Pipeline

```typescript
import { Transform } from 'stream';

// Create a transform that processes each segment
const processor = new Transform({
  transform(chunk, encoding, callback) {
    // Process chunk
    console.log(`Processing ${chunk.byteLength} bytes`);
    callback(null, chunk);
  }
});

// Pipe through processor
const output = createWriteStream('./processed.ts');
processor.pipe(output);

await client.hls(url).pipe(processor);
```

## Progress Tracking

### Basic Progress

```typescript
await client.hls(url, {
  onProgress: (progress) => {
    if (progress.totalSegments) {
      const percent = (progress.downloadedSegments / progress.totalSegments * 100).toFixed(1);
      console.log(`${percent}% (${progress.downloadedSegments}/${progress.totalSegments})`);
    } else {
      console.log(`Downloaded ${progress.downloadedSegments} segments (live)`);
    }
  }
}).download('./video.ts');
```

### Detailed Progress

```typescript
await client.hls(url, {
  onProgress: (progress) => {
    const mbDownloaded = (progress.downloadedBytes / 1024 / 1024).toFixed(2);
    const seconds = (progress.elapsed / 1000).toFixed(1);
    const speed = (progress.downloadedBytes / progress.elapsed * 1000 / 1024 / 1024).toFixed(2);

    console.log([
      `Segments: ${progress.downloadedSegments}`,
      progress.totalSegments ? `/ ${progress.totalSegments}` : '(live)',
      `| ${mbDownloaded} MB`,
      `| ${seconds}s`,
      `| ${speed} MB/s`
    ].join(' '));
  }
}).download('./video.ts');
```

## Get Stream Information

Inspect stream without downloading.

```typescript
const info = await client.hls('https://example.com/stream.m3u8').info();

console.log('Is live:', info.isLive);
console.log('Total duration:', info.totalDuration, 'seconds');

if (info.master) {
  console.log('Variants:', info.master.variants.length);
  console.log('Selected:', info.selectedVariant);
}

if (info.playlist) {
  console.log('Segments:', info.playlist.segments.length);
  console.log('Target duration:', info.playlist.targetDuration);
}
```

### Info Response

```typescript
interface HlsInfo {
  master?: HlsMasterPlaylist;      // Present for master playlists
  playlist?: HlsPlaylist;          // Media playlist info
  selectedVariant?: HlsVariant;    // Which variant was selected
  isLive: boolean;                 // true if no #EXT-X-ENDLIST
  totalDuration?: number;          // Total seconds (VOD only)
}
```

## Cancellation

### Cancel Download

```typescript
const downloader = client.hls(url, { live: true });
const promise = downloader.download('./stream.ts');

// Cancel after 10 seconds
setTimeout(() => {
  downloader.cancel();
}, 10_000);

await promise;  // Resolves when cancelled
```

### Cancel with AbortController

```typescript
const controller = new AbortController();

client.hls(url, {
  live: true,
  onSegment: async () => {
    // Some condition to stop
    if (shouldStop()) {
      controller.abort();
    }
  }
}).download('./stream.ts').catch(err => {
  if (err.name === 'AbortError') {
    console.log('Download cancelled');
  }
});
```

## Custom Headers

### Authentication

```typescript
await client.hls(url, {
  headers: {
    'Authorization': 'Bearer token123',
    'Cookie': 'session=abc'
  }
}).download('./video.ts');
```

### Referer

```typescript
await client.hls(url, {
  headers: {
    'Referer': 'https://example.com/player',
    'Origin': 'https://example.com'
  }
}).download('./video.ts');
```

## Patterns

### Segment Callback for Custom Processing

```typescript
let totalBytes = 0;

await client.hls(url, {
  onSegment: async (segment) => {
    totalBytes += segment.data.byteLength;

    // Log each segment
    console.log(`Segment ${segment.sequence}: ${segment.duration}s`);

    // Or do async work
    await processSegment(segment);
  }
}).download('./video.ts');

console.log(`Total: ${totalBytes} bytes`);
```

### Upload While Downloading

```typescript
for await (const segment of client.hls(url).stream()) {
  // Upload each segment as it's downloaded
  await s3.upload({
    Bucket: 'videos',
    Key: `stream/${segment.sequence}.ts`,
    Body: segment.data
  }).promise();

  console.log(`Uploaded segment ${segment.sequence}`);
}
```

### Parallel Download with Streaming

```typescript
const segments: SegmentData[] = [];

for await (const segment of client.hls(url).stream()) {
  segments.push(segment);
}

// Process all segments in parallel
await Promise.all(segments.map(async (seg) => {
  await processSegment(seg);
}));
```

### Error Handling

```typescript
try {
  await client.hls(url, {
    onError: (error) => {
      // Non-fatal errors (e.g., temporary network issues in live mode)
      console.warn('Warning:', error.message);
    }
  }).download('./video.ts');
} catch (error) {
  // Fatal errors
  console.error('Failed:', error.message);
}
```

## Format Considerations

### MPEG Transport Stream (.ts)

The default and only format supported without ffmpeg. TS files:

- Are directly playable in VLC, mpv, and most video players
- Can be concatenated by simple byte appending
- Are the native HLS segment format
- Don't require transcoding

```typescript
// Direct playback ready
await client.hls(url).download('./video.ts');
// Open ./video.ts in any video player
```

### Other Formats (Requires ffmpeg)

MP4 and MKV formats require ffmpeg for remuxing:

```typescript
// This will throw an error without ffmpeg
await client.hls(url, { format: 'mp4' }).download('./video.mp4');
// Error: Format 'mp4' requires ffmpeg
```

If you need MP4/MKV output, download as .ts first, then convert:

```bash
ffmpeg -i video.ts -c copy video.mp4
```

## Encrypted Streams

Encrypted HLS streams (AES-128, SAMPLE-AES) require ffmpeg for decryption:

```typescript
// This will throw an error for encrypted streams
await client.hls(encryptedUrl).download('./video.ts');
// Error: Encrypted HLS (AES-128) requires ffmpeg
```

To handle encrypted streams, use ffmpeg directly:

```bash
ffmpeg -i "https://example.com/encrypted.m3u8" -c copy output.ts
```

## HLS Protocol Reference

### Playlist Types

| Type | Description | Use Case |
|------|-------------|----------|
| Master Playlist | Lists multiple quality variants | Adaptive streaming |
| Media Playlist | Lists actual video segments | Direct playback |
| VOD | Contains `#EXT-X-ENDLIST` | Recorded content |
| Live | No `#EXT-X-ENDLIST` | Live broadcasts |
| Event | Has `#EXT-X-PLAYLIST-TYPE:EVENT` | Growing archive |

### Common Tags

```
#EXTM3U                           - Playlist header
#EXT-X-VERSION:3                  - HLS version
#EXT-X-TARGETDURATION:10          - Max segment duration
#EXT-X-MEDIA-SEQUENCE:0           - First segment number
#EXT-X-STREAM-INF:BANDWIDTH=...   - Variant info (master)
#EXTINF:9.009,                    - Segment duration
#EXT-X-ENDLIST                    - End of playlist (VOD)
#EXT-X-KEY:METHOD=AES-128,...     - Encryption info
```

### Example Master Playlist

```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=1280x720
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1920x1080
1080p.m3u8
```

### Example Media Playlist

```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:9.009,
segment0.ts
#EXTINF:9.009,
segment1.ts
#EXTINF:9.009,
segment2.ts
#EXT-X-ENDLIST
```

## Comparison with Other Approaches

| Feature | Recker HLS | ffmpeg | yt-dlp |
|---------|-----------|--------|--------|
| Fluent API | Yes | No | No |
| Live support | Yes | Yes | Yes |
| Streaming iterator | Yes | No | No |
| Encryption | No* | Yes | Yes |
| Format conversion | No* | Yes | Yes |
| Progress callback | Yes | Partial | Yes |
| Custom headers | Yes | Yes | Yes |
| Cancellation | Yes | Ctrl+C | Ctrl+C |

*Requires ffmpeg for these features

## Best Practices

### 1. Check Stream Info First

```typescript
const info = await client.hls(url).info();

if (info.isLive) {
  console.log('This is a live stream');
} else {
  console.log(`Duration: ${info.totalDuration}s`);
}
```

### 2. Use Progress for Long Downloads

```typescript
await client.hls(url, {
  onProgress: (p) => {
    process.stdout.write(`\rDownloading: ${p.downloadedSegments} segments...`);
  }
}).download('./video.ts');
```

### 3. Handle Live Stream Boundaries

```typescript
// Always set a duration limit for live streams
await client.hls(liveUrl, {
  live: { duration: 3600_000 }  // Max 1 hour
}).download('./recording.ts');
```

### 4. Use Streaming for Large Files

```typescript
// Don't buffer everything in memory
for await (const segment of client.hls(url).stream()) {
  await appendToFile('./video.ts', segment.data);
}
```

### 5. Clean Up on Errors

```typescript
const downloader = client.hls(url, { live: true });

process.on('SIGINT', () => {
  console.log('Stopping download...');
  downloader.cancel();
});

await downloader.download('./stream.ts');
```

## Next Steps

- **[SSE](06-sse.md)** - Server-Sent Events streaming
- **[WebSocket](01-websocket.md)** - Real-time bidirectional communication
- **[HTTP Fundamentals](../http/02-fundamentals.md)** - Core HTTP concepts
