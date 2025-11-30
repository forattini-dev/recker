# Performance

HTTP/2, connection pooling, compression, and optimizations.

## HTTP/2

### Enable HTTP/2

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  http2: true
});
```

### HTTP/2 Benefits

- **Multiplexing**: Multiple requests over a single connection
- **Header compression**: HPACK reduces overhead
- **Server push**: Proactive resource delivery
- **Binary protocol**: More efficient parsing

### HTTP/2 Configuration

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  http2: {
    enabled: true,
    maxConcurrentStreams: 200, // Max parallel streams
    pipelining: 10            // HTTP/1.1 fallback pipelining
  }
});
```

### Per-Request Override

```typescript
// Force HTTP/2 for specific request
await client.get('/api/data', { http2: true });

// Force HTTP/1.1 for legacy endpoint
await client.get('/legacy/api', { http2: false });
```

### HTTP/2 Connection Info

```typescript
const response = await client.get('/api/data');

if (response.connection?.http2) {
  console.log('Stream ID:', response.connection.http2.streamId);
  console.log('Max concurrent:', response.connection.http2.maxConcurrentStreams);
  console.log('Active streams:', response.connection.http2.currentStreams);
}
```

## Connection Pooling

### Automatic Pooling

Recker automatically manages connection pools:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: 20 // Auto-configures connection pool
});
```

### Manual Pool Configuration

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    max: 50, // Max concurrent requests
    agent: {
      connections: 25,        // Connections per origin
      keepAlive: true,        // Keep connections alive
      keepAliveTimeout: 4000, // Keep-alive timeout (ms)
      pipelining: 1           // HTTP/1.1 pipelining factor
    }
  }
});
```

### Per-Domain Pooling

Separate connection pools for multi-domain requests:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    max: 50,
    agent: {
      perDomainPooling: true // Separate pools per domain
    }
  }
});

// Each domain gets its own pool
await client.batch([
  { path: 'https://api.github.com/users' },
  { path: 'https://registry.npmjs.org/recker' },
  { path: 'https://api.stripe.com/v1/charges' }
]);
```

### Connection Reuse

```typescript
const response = await client.get('/api/data');

// Check if connection was reused
if (response.connection?.reused) {
  console.log('Reused existing connection');
} else {
  console.log('New connection established');
}
```

## Request Compression

### Enable Compression

```typescript
// Enable with defaults (gzip, >1KB)
const client = createClient({
  baseUrl: 'https://api.example.com',
  compression: true
});
```

### Compression Options

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  compression: {
    algorithm: 'br',           // 'gzip' | 'deflate' | 'br'
    threshold: 5120,           // Only compress > 5KB
    force: false,              // Force even for small bodies
    methods: ['POST', 'PUT', 'PATCH']
  }
});
```

### Algorithm Comparison

| Algorithm | Speed | Ratio | Browser Support |
|-----------|-------|-------|-----------------|
| gzip      | Fast  | Good  | Universal       |
| deflate   | Fast  | Good  | Universal       |
| br (Brotli)| Slow | Best  | Modern browsers |

## DNS Optimization

### Custom DNS Servers

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    servers: ['8.8.8.8', '1.1.1.1'], // Google & Cloudflare DNS
    timeout: 5000,
    preferIPv4: true
  }
});
```

### DNS Override (Hosts)

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: {
      'api.example.com': '192.168.1.100'
    }
  }
});
```

### DNS Timing

```typescript
const response = await client.get('/api/data');

console.log('DNS lookup:', response.timings?.dns, 'ms');
```

## Observability & Timings

### Response Timings

```typescript
const response = await client.get('/api/data');

console.log('Timings:', response.timings);
// {
//   queuing: 2,      // Time in queue
//   dns: 15,         // DNS lookup
//   tcp: 20,         // TCP connection
//   tls: 30,         // TLS handshake
//   firstByte: 100,  // Time to first byte (TTFB)
//   content: 50,     // Content download
//   total: 217       // Total time
// }
```

### Connection Info

```typescript
const response = await client.get('/api/data');

console.log('Connection:', response.connection);
// {
//   protocol: 'h2',               // HTTP version
//   cipher: 'TLS_AES_256_GCM',    // TLS cipher
//   remoteAddress: '93.184.216.34',
//   remotePort: 443,
//   reused: true                  // Connection was reused
// }
```

### Disable Observability

For maximum performance when you don't need timings:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  observability: false
});

// response.timings and response.connection will be empty
// But request processing is faster
```

## Performance Best Practices

### 1. Enable HTTP/2

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  http2: true
});
```

### 2. Use Connection Keep-Alive

```typescript
// Enabled by default
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    agent: {
      keepAlive: true,
      keepAliveTimeout: 60000 // 60s
    }
  }
});
```

### 3. Batch Requests

```typescript
// Instead of sequential
const user = await client.get('/users/1').json();
const posts = await client.get('/posts?userId=1').json();

// Batch parallel
const { results } = await client.batch([
  { path: '/users/1' },
  { path: '/posts?userId=1' }
], { mapResponse: r => r.json() });
```

### 4. Use Response Streaming

```typescript
// Instead of buffering large responses
const data = await client.get('/large-file').buffer();

// Stream to file
await client.get('/large-file').write('./output.bin');
```

### 5. Set Appropriate Timeouts

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  timeout: {
    lookup: 1000,    // Fast DNS failure
    connect: 3000,   // Fast connection failure
    response: 10000  // Reasonable TTFB
  }
});
```

### 6. Compress Large Payloads

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  compression: { threshold: 1024 }
});
```

## Benchmarking

### Measure Request Performance

```typescript
const iterations = 1000;
const start = performance.now();

for (let i = 0; i < iterations; i++) {
  await client.get('/api/ping');
}

const duration = performance.now() - start;
console.log(`Throughput: ${iterations / (duration / 1000)} req/s`);
```

### Compare Configurations

```typescript
// Without HTTP/2
const h1Client = createClient({
  baseUrl: 'https://api.example.com',
  http2: false
});

// With HTTP/2
const h2Client = createClient({
  baseUrl: 'https://api.example.com',
  http2: true
});

async function benchmark(client: Client, name: string) {
  const start = performance.now();
  await Promise.all(
    Array(100).fill(0).map(() => client.get('/api/data'))
  );
  console.log(`${name}: ${performance.now() - start}ms`);
}

await benchmark(h1Client, 'HTTP/1.1');
await benchmark(h2Client, 'HTTP/2');
```

## Streaming

### Async Iteration

Recker responses are async-iterable for memory-efficient processing:

```typescript
// Stream binary data chunk by chunk
for await (const chunk of client.get('/large-file')) {
  // chunk is Uint8Array
  process.stdout.write(chunk);
}

// Collect into buffer
const chunks: Uint8Array[] = [];
for await (const chunk of client.get('/file')) {
  chunks.push(chunk);
}
const buffer = Buffer.concat(chunks);
```

### Download to File

```typescript
// Simple download
await client.get('/image.png').write('./downloads/image.png');

// With progress tracking
const { progress } = await client.get('/file.zip').download('./local-file.zip');
console.log(`Downloaded ${progress.loaded} bytes`);

// With options
await client.get('/file.zip').download('./local-file.zip', {
  createDir: true,     // Create directory if doesn't exist
  overwrite: true,     // Overwrite existing file
  onProgress: (progress) => {
    console.log(`${progress.percent}% complete`);
  }
});
```

### Progress Tracking

```typescript
// Download progress
await client.get('/large-file.zip', {
  onDownloadProgress: (progress) => {
    console.log(`Downloaded: ${progress.percent}%`);
    console.log(`Speed: ${(progress.rate / 1024 / 1024).toFixed(2)} MB/s`);
    console.log(`ETA: ${progress.estimated}s`);
  }
});

// Upload progress
await client.post('/upload', {
  body: fileContent,
  onUploadProgress: (progress) => {
    console.log(`Uploaded: ${progress.percent}%`);
  }
});

// Progress object structure
interface Progress {
  loaded: number;      // Bytes transferred
  total?: number;      // Total bytes (if known)
  percent: number;     // Percentage (0-100)
  rate: number;        // Bytes per second
  estimated?: number;  // Estimated seconds remaining
}
```

### Resumable Downloads

Resume interrupted downloads using Range requests:

```typescript
import { downloadToFile } from 'recker';

await downloadToFile(client, '/large-dataset.zip', './tmp/dataset.zip', {
  resume: true,
  onProgress: (p) => console.log(`Downloaded ${p.loaded} bytes`)
});
```

- If the file exists, Recker sends `Range: bytes=<size>-`
- If the server ignores Range (responds 200), it falls back to a fresh download

### Resumable Uploads

Send large files in chunks and resume by chunk index:

```typescript
import { uploadParallel } from 'recker';

await uploadParallel({
  file: myBuffer,
  chunkSize: 5 * 1024 * 1024, // 5MB chunks
  resumeFromChunk: 3,         // Skip first 3 chunks (already uploaded)
  uploadChunk: async (chunk, index) => {
    await client.put(`/uploads/${index}`, chunk);
  }
});
```

### HLS Video Streaming

Download and merge HLS streams (`.m3u8`) for offline viewing:

```typescript
import { downloadHls } from 'recker';

const client = createClient();

// Download entire HLS stream
await downloadHls(
  client,
  'https://example.com/video.m3u8',
  './movie.ts',
  {
    concurrency: 5,  // Download 5 segments concurrently
    merge: true,     // Merge into single file
    onProgress: (progress) => {
      console.log(`Segments: ${progress.completed}/${progress.total}`);
    }
  }
);
```

#### HLS Options

```typescript
interface HlsOptions {
  concurrency?: number;     // Parallel segment downloads (default: 3)
  merge?: boolean;          // Merge segments (default: true)
  keepChunks?: boolean;     // Keep individual chunks after merge
  outputDir?: string;       // Directory for chunks
  onProgress?: (progress: HlsProgress) => void;
}

interface HlsProgress {
  completed: number;
  total: number;
  percent: number;
  currentSegment: string;
}
```

### Bidirectional Streaming

Pipe data directly between services:

```typescript
// Stream from one endpoint to another
const source = await client.get('/source-file').read();
await client.post('/upload', { body: source });

// Transform while streaming
const response = await client.get('/data.json');
const transformer = new TransformStream({
  transform(chunk, controller) {
    // Process each chunk
    controller.enqueue(chunk);
  }
});

await response.read().pipeTo(transformer.writable);
```

### ReadableStream Access

Get the underlying Web Streams API ReadableStream:

```typescript
const response = await client.get('/stream');

// Get ReadableStream
const stream = await response.read();

// Use with Web Streams API
const reader = stream.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log('Chunk:', value);
}
```

### Streaming with Timeout

```typescript
const controller = new AbortController();

// Timeout after 30 seconds
setTimeout(() => controller.abort(), 30000);

try {
  for await (const chunk of client.get('/stream', {
    signal: controller.signal
  })) {
    process.stdout.write(chunk);
  }
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Stream timed out');
  }
}
```

> **Note**: For Server-Sent Events (SSE) streaming with AI/LLM APIs, see the [AI Layer documentation](/ai/02-ai-layer.md).

## Memory Optimization

### Stream Large Responses

```typescript
// ❌ Bad: Loads entire response into memory
const data = await client.get('/huge-file').buffer();

// ✅ Good: Stream chunks
for await (const chunk of client.get('/huge-file')) {
  await processChunk(chunk);
}
```

### Response Size Limits

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  maxResponseSize: 10 * 1024 * 1024 // 10 MB limit
});
```

### Clone Sparingly

```typescript
// Cloning copies the entire response body
const clone = response.clone(); // Use only when necessary
```

## High-Throughput Configuration

```typescript
const highThroughputClient = createClient({
  baseUrl: 'https://api.example.com',

  // Enable HTTP/2 multiplexing
  http2: {
    enabled: true,
    maxConcurrentStreams: 1000
  },

  // High concurrency
  concurrency: {
    max: 500,
    requestsPerInterval: 1000,
    interval: 1000,
    agent: {
      connections: 100,
      keepAlive: true,
      keepAliveTimeout: 60000,
      perDomainPooling: true
    }
  },

  // Disable observability overhead
  observability: false,

  // Aggressive timeouts
  timeout: {
    lookup: 500,
    connect: 1000,
    response: 5000,
    request: 10000
  }
});
```

## Next Steps

- **[Resilience](07-resilience.md)** - Retry and circuit breaker
- **[Concurrency](08-concurrency.md)** - Batch requests, rate limiting
- **[Caching](09-cache.md)** - Response caching strategies
