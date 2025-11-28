# Streaming & SSE

Recker treats streaming as a first-class citizen, with native support for Server-Sent Events (SSE), async iteration, progress tracking, and efficient memory handling for large files.

## Server-Sent Events (SSE)

Perfect for AI/LLM integrations like OpenAI, Anthropic, and other streaming APIs.

### Basic SSE Consumption

```typescript
import { createClient } from 'recker';

const client = createClient({ baseUrl: 'https://api.openai.com/v1' });

const response = client.post('/chat/completions', {
  json: {model: 'gpt-5',
    messages: [{ role: 'user', content: 'Hello!' }],
    stream: true
  },
  headers: {
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
  }
});

for await (const event of response.sse()) {
  if (event.data === '[DONE]') break;

  const chunk = JSON.parse(event.data);
  const content = chunk.choices[0]?.delta?.content;

  if (content) {
    process.stdout.write(content);
  }
}
```

### SSE Event Structure

Each SSE event contains:

```typescript
interface SSEEvent {
  event?: string;   // Event type (e.g., 'message', 'error')
  data: string;     // Event data
  id?: string;      // Event ID for reconnection
  retry?: number;   // Reconnection delay in ms
}
```

### Filtering by Event Type

```typescript
for await (const event of response.sse()) {
  switch (event.event) {
    case 'message':
      console.log('Message:', event.data);
      break;
    case 'error':
      console.error('Error:', event.data);
      break;
    case 'done':
      console.log('Stream complete');
      break;
  }
}
```

### Collecting SSE into Array

```typescript
const events = [];

for await (const event of response.sse()) {
  if (event.data !== '[DONE]') {
    events.push(JSON.parse(event.data));
  }
}

// Process all events
const fullText = events
  .map(e => e.choices[0]?.delta?.content || '')
  .join('');
```

## Async Iteration (Raw Streaming)

Recker responses are async-iterable, allowing you to process data chunk by chunk:

```typescript
// Stream binary data
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

### Memory-Efficient Processing

Process large files without loading them entirely into memory:

```typescript
import { createWriteStream } from 'fs';

const response = await client.get('/huge-file.zip');
const writeStream = createWriteStream('./downloaded.zip');

for await (const chunk of response) {
  writeStream.write(chunk);
}

writeStream.end();
console.log('Download complete');
```

## Progress Tracking

### Download Progress

```typescript
const response = await client.get('/large-file.zip', {
  onDownloadProgress: (progress) => {
    console.log(`Downloaded: ${progress.percent}%`);
    console.log(`Speed: ${(progress.rate / 1024 / 1024).toFixed(2)} MB/s`);
    console.log(`ETA: ${progress.estimated}s`);
  }
});
```

### Upload Progress

```typescript
import { readFile } from 'fs/promises';

const fileContent = await readFile('./upload.zip');

await client.post('/upload', {
  body: fileContent,
  onUploadProgress: (progress) => {
    console.log(`Uploaded: ${progress.percent}%`);
  }
});
```

### Progress Object

```typescript
interface Progress {
  loaded: number;      // Bytes transferred
  total?: number;      // Total bytes (if known)
  percent: number;     // Percentage (0-100)
  rate: number;        // Bytes per second
  estimated?: number;  // Estimated seconds remaining
}
```

## Download to File

### Using `download()`

```typescript
// Download with progress tracking
const { progress } = await client.get('/file.zip').download('./local-file.zip');

console.log(`Downloaded ${progress.loaded} bytes`);
```

### Simple Write

```typescript
await client.get('/image.png').write('./downloads/image.png');
```

### With Custom Options

```typescript
await client.get('/file.zip').download('./local-file.zip', {
  // Create directory if doesn't exist
  createDir: true,

  // Overwrite existing file
  overwrite: true,

  // Progress callback
  onProgress: (progress) => {
    console.log(`${progress.percent}% complete`);
  }
});
```

## Resumable Downloads

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

## Resumable Uploads

Send large files in chunks and resume by chunk index:

```typescript
import { uploadParallel } from 'recker';

await uploadParallel({
  file: myBuffer,
  chunkSize: 5 * 1024 * 1024, // 5MB chunks
  resumeFromChunk: 3, // Skip first 3 chunks (already uploaded)
  uploadChunk: async (chunk, index) => {
    await client.put(`/uploads/${index}`, chunk);
  }
});
```

## Bidirectional Streaming

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

## ReadableStream Access

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

## HLS Video Streaming

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

### HLS Options

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

## Streaming with Timeout

Set timeouts for streaming operations:

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

## Error Handling in Streams

```typescript
try {
  for await (const event of client.post('/stream').sse()) {
    // Process event
  }
} catch (error) {
  if (error.code === 'ECONNRESET') {
    console.log('Connection was reset');
  } else if (error.code === 'ETIMEDOUT') {
    console.log('Request timed out');
  } else {
    throw error;
  }
}
```

## Streaming Best Practices

1. **Use async iteration for large files** - Avoid `.json()` or `.text()` for large responses
2. **Set appropriate timeouts** - Streaming can take longer than regular requests
3. **Handle connection errors** - Streams can be interrupted
4. **Consider retry for SSE** - Use event IDs for resumable streams
5. **Monitor memory usage** - Don't accumulate chunks unnecessarily

```typescript
// Good: Process chunks as they arrive
for await (const chunk of response) {
  await processChunk(chunk);
}

// Bad: Accumulate everything in memory
const chunks = [];
for await (const chunk of response) {
  chunks.push(chunk);  // Memory grows!
}
```

## AI/LLM Integration Examples

### OpenAI

```typescript
async function streamCompletion(messages: Message[]) {
  const response = client.post('/v1/chat/completions', {
    json: { model: 'gpt-5', messages, stream: true }
  });

  let fullContent = '';
  for await (const event of response.sse()) {
    if (event.data === '[DONE]') break;

    const chunk = JSON.parse(event.data);
    const content = chunk.choices[0]?.delta?.content || '';
    fullContent += content;
    process.stdout.write(content);
  }

  return fullContent;
}
```

### Anthropic

```typescript
async function streamClaude(prompt: string) {
  const response = client.post('/v1/messages', {
    json: {
      model: 'claude-3-opus-20240229',
      max_tokens: 1024,
      stream: true,
      messages: [{ role: 'user', content: prompt }]
    }
  });

  for await (const event of response.sse()) {
    if (event.event === 'content_block_delta') {
      const data = JSON.parse(event.data);
      process.stdout.write(data.delta?.text || '');
    }
  }
}
```

### Clean Text Extraction

For AI applications, extract clean text from HTML responses:

```typescript
const response = await client.get('https://example.com/article');
const cleanText = await response.cleanText();

// Send to LLM
const summary = await llm.summarize(cleanText);
```
