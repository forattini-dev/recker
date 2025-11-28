# Streaming & Realtime

Recker treats streaming as a first-class citizen. Whether you are consuming LLM tokens (Server-Sent Events) or downloading gigabytes of data, Recker handles the backpressure and iteration for you.

## Server-Sent Events (SSE)

Perfect for AI/LLM integrations (OpenAI, Anthropic). Recker automatically parses `data: ...` lines and yields objects.

```typescript
const client = createClient({ baseUrl: 'https://api.openai.com/v1' });

const stream = client.post('/chat/completions', {
  body: { model: 'gpt-4', stream: true, messages: [...] }
}).sse();

for await (const event of stream) {
  const json = JSON.parse(event.data);
  process.stdout.write(json.choices[0].delta?.content || '');
}
```

## Download with Progress

For large files, you want to track progress without buffering the entire file in memory.

```typescript
const download = client.get('/large-dataset.zip').download();

for await (const progress of download) {
  console.log(`Downloaded: ${progress.percent.toFixed(2)}%`);
  // { loaded: 1024, total: 50000, percent: 2.04 }
}
```

### Saving to File (Node.js)

You can pipe the stream directly to disk using the `.write()` helper (Node.js only).

```typescript
await client.get('/image.png').write('./downloads/image.png');
```

## Bidirectional Streaming (Advanced)

Recker exposes the raw standard `ReadableStream` (Web API). You can use this to pipe data directly from one service to another with near-zero memory footprint.

```typescript
const source = await client.get('/source-file').read(); // ReadableStream
const dest = await client.post('/dest-bucket', { body: source });
```

This allows "streaming uploads" where Recker reads from the source stream and writes to the destination network socket simultaneously.