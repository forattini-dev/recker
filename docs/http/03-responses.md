# Responses & Data

Learn how to handle responses, streaming, downloads, and uploads.

## Parsing Responses

### JSON

```typescript
// Direct parsing
const data = await client.get('/api/users').json();

// With type safety
interface User {
  id: number;
  name: string;
}
const user = await client.get<User>('/api/users/1').json();
```

### Text

```typescript
const html = await client.get('/page.html').text();
const csv = await client.get('/data.csv').text();
```

### Buffer

```typescript
const buffer = await client.get('/image.png').buffer();
// Returns Node.js Buffer
```

### Blob

```typescript
const blob = await client.get('/file.pdf').blob();
// Returns Blob object
```

### ArrayBuffer

```typescript
const arrayBuffer = await client.get('/binary').arrayBuffer();
```

### Clean Text (AI/LLM)

Extract clean text from HTML responses - perfect for AI applications:

```typescript
// Strips HTML tags, scripts, styles
const text = await client.get('https://example.com/article').cleanText();
// Returns: "Article title\nParagraph content..."
```

## Streaming

### Async Iteration

Response objects are async-iterable:

```typescript
for await (const chunk of client.get('/large-file')) {
  // chunk is Uint8Array
  process.stdout.write(chunk);
}
```

### ReadableStream

Access the underlying Web Streams API:

```typescript
const response = await client.get('/stream');
const stream = response.read();

const reader = stream.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  console.log('Chunk:', value);
}
```

### Server-Sent Events (SSE)

Perfect for AI/LLM streaming responses:

```typescript
const response = client.post('/chat/completions', {
  json: {
    model: 'gpt-5.1',
    messages: [{ role: 'user', content: 'Hello' }],
    stream: true
  }
});

for await (const event of response.sse()) {
  if (event.data === '[DONE]') break;

  const data = JSON.parse(event.data);
  const content = data.choices[0]?.delta?.content;

  if (content) {
    process.stdout.write(content);
  }
}
```

#### SSE Event Structure

```typescript
interface SSEEvent {
  event?: string;   // Event type
  data: string;     // Event data
  id?: string;      // Event ID
  retry?: number;   // Reconnection delay
}
```

#### Filter by Event Type

```typescript
for await (const event of response.sse()) {
  switch (event.event) {
    case 'message':
      handleMessage(event.data);
      break;
    case 'error':
      handleError(event.data);
      break;
    case 'done':
      break;
  }
}
```

## Downloads

### Download to File

```typescript
// Simple download
await client.get('/file.zip').write('./downloads/file.zip');

// With progress tracking
const result = await client.get('/large-file.zip').download('./file.zip');
console.log(`Downloaded ${result.progress.loaded} bytes`);
```

### Download with Options

```typescript
await client.get('/file.zip').download('./local/file.zip', {
  createDir: true,    // Create directory if needed
  overwrite: true,    // Overwrite existing file
  onProgress: (progress) => {
    console.log(`${progress.percent}% complete`);
  }
});
```

### Resumable Downloads

Resume interrupted downloads:

```typescript
import { downloadToFile } from 'recker';

await downloadToFile(client, '/large-dataset.zip', './dataset.zip', {
  resume: true,
  onProgress: (p) => console.log(`${p.percent}%`)
});
```

## Uploads

### File Upload

```typescript
import { readFile } from 'fs/promises';

const file = await readFile('./document.pdf');
await client.post('/upload', {
  body: file,
  headers: {
    'Content-Type': 'application/pdf'
  }
});
```

### FormData Upload

```typescript
const formData = new FormData();
formData.append('file', new Blob([fileBuffer]), 'document.pdf');
formData.append('title', 'My Document');

await client.post('/upload', { body: formData });
```

### Stream Upload

```typescript
import { createReadStream } from 'fs';

await client.post('/upload', {
  body: createReadStream('./large-file.zip')
});
```

### Chunked Upload

```typescript
import { uploadParallel } from 'recker';

await uploadParallel({
  file: largeBuffer,
  chunkSize: 5 * 1024 * 1024, // 5MB chunks
  uploadChunk: async (chunk, index) => {
    await client.put(`/uploads/part-${index}`, { body: chunk });
  }
});
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
await client.post('/upload', {
  body: fileBuffer,
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
  estimated?: number;  // Seconds remaining
}
```

### Using download() Generator

```typescript
const response = await client.get('/large-file');

for await (const progress of response.download()) {
  console.log(`${progress.percent}% - ${progress.loaded}/${progress.total}`);
}
```

## HLS Video Streaming

Download and merge HLS streams:

```typescript
import { downloadHls } from 'recker';

await downloadHls(
  client,
  'https://example.com/video.m3u8',
  './video.ts',
  {
    concurrency: 5,
    merge: true,
    onProgress: (p) => {
      console.log(`Segments: ${p.completed}/${p.total}`);
    }
  }
);
```

## Response Metadata

### Timings

Access detailed timing information:

```typescript
const response = await client.get('/api/data');

console.log(response.timings);
// {
//   queuing: 5,      // Time in queue
//   dns: 15,         // DNS lookup
//   tcp: 20,         // TCP connection
//   tls: 30,         // TLS handshake
//   firstByte: 100,  // Time to first byte
//   total: 250       // Total time
// }
```

### Connection Info

```typescript
console.log(response.connection);
// {
//   protocol: 'h2',
//   cipher: 'TLS_AES_256_GCM_SHA384',
//   remoteAddress: '93.184.216.34',
//   remotePort: 443
// }
```

## Response Cloning

Clone a response to read it multiple times:

```typescript
const response = await client.get('/api/data');

// Clone before consuming
const clone = response.clone();

// Read original
const json = await response.json();

// Read clone
const text = await clone.text();
```

## Best Practices

### Memory-Efficient Processing

```typescript
// ✅ Good: Process chunks as they arrive
for await (const chunk of client.get('/large-file')) {
  await processChunk(chunk);
}

// ❌ Bad: Load everything into memory
const chunks = [];
for await (const chunk of client.get('/large-file')) {
  chunks.push(chunk); // Memory grows!
}
```

### Stream to File

```typescript
import { createWriteStream } from 'fs';

const response = await client.get('/huge-file');
const writeStream = createWriteStream('./output.bin');

for await (const chunk of response) {
  writeStream.write(chunk);
}
writeStream.end();
```

### Handle Large JSON

```typescript
// For very large JSON responses, consider streaming parsers
import { parser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';

const response = await client.get('/huge-array.json');
const stream = response.read();

// Process items one at a time
const pipeline = stream
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(parser())
  .pipeThrough(streamArray());

for await (const { value } of pipeline) {
  await processItem(value);
}
```

## Next Steps

- **[Validation](04-validation.md)** - Type-safe requests with contracts
- **[Configuration](05-configuration.md)** - Client options and hooks
- **[Resilience](07-resilience.md)** - Retry and circuit breaker
