# Server-Sent Events (SSE)

Real-time streaming from server to client using HTTP.

## Overview

Server-Sent Events (SSE) is a standard for streaming events from server to client over HTTP. Unlike WebSockets, SSE is:
- **Unidirectional**: Server pushes to client
- **HTTP-based**: Uses standard HTTP connections
- **Auto-reconnect**: Built-in reconnection support
- **Simple**: Text-based protocol

## Quick Start

```typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com'
});

// Stream SSE events
const response = await client.get('/events');

for await (const event of response.sse()) {
  console.log('Event:', event.event);
  console.log('Data:', event.data);
  console.log('ID:', event.id);
}
```

## Event Structure

### SSE Event Format

```typescript
interface SSEEvent {
  // Event type (optional)
  event?: string;

  // Event data (required)
  data: string;

  // Event ID for reconnection (optional)
  id?: string;

  // Reconnection interval hint (optional)
  retry?: number;
}
```

### Example Events

Server sends:
```
event: message
id: 1
data: Hello, World!

event: update
id: 2
data: {"status": "active"}

data: Simple event without type
```

Client receives:
```typescript
{ event: 'message', id: '1', data: 'Hello, World!' }
{ event: 'update', id: '2', data: '{"status": "active"}' }
{ event: undefined, id: undefined, data: 'Simple event without type' }
```

## Basic Usage

### Iterate Events

```typescript
const response = await client.get('/events');

for await (const event of response.sse()) {
  console.log(event.data);
}
```

### Handle Event Types

```typescript
for await (const event of response.sse()) {
  switch (event.event) {
    case 'message':
      handleMessage(event.data);
      break;
    case 'update':
      handleUpdate(JSON.parse(event.data));
      break;
    case 'error':
      handleError(event.data);
      break;
    default:
      console.log('Unknown event:', event.data);
  }
}
```

### Parse JSON Data

```typescript
interface UpdateEvent {
  type: string;
  payload: any;
}

for await (const event of response.sse()) {
  try {
    const data = JSON.parse(event.data) as UpdateEvent;
    console.log('Type:', data.type);
    console.log('Payload:', data.payload);
  } catch {
    console.log('Non-JSON event:', event.data);
  }
}
```

## AI Streaming

SSE is commonly used for AI model streaming responses.

### OpenAI-Style Streaming

```typescript
const response = await client.post('/chat/completions', {
  json: {
    model: 'gpt-5.1',
    messages: [{ role: 'user', content: 'Hello!' }],
    stream: true
  }
});

let fullContent = '';

for await (const event of response.sse()) {
  if (event.data === '[DONE]') {
    break;
  }

  const chunk = JSON.parse(event.data);
  const content = chunk.choices[0]?.delta?.content || '';

  fullContent += content;
  process.stdout.write(content);
}

console.log('\n\nFull response:', fullContent);
```

### Anthropic-Style Streaming

```typescript
const response = await client.post('/messages', {
  json: {
    model: 'claude-sonnet-4-5',
    messages: [{ role: 'user', content: 'Hello!' }],
    stream: true
  }
});

for await (const event of response.sse()) {
  const data = JSON.parse(event.data);

  switch (event.event) {
    case 'message_start':
      console.log('Message started');
      break;
    case 'content_block_delta':
      process.stdout.write(data.delta?.text || '');
      break;
    case 'message_stop':
      console.log('\nMessage complete');
      break;
  }
}
```

## Cancellation

### Abort Stream

```typescript
const controller = new AbortController();

// Cancel after 10 seconds
setTimeout(() => controller.abort(), 10000);

const response = await client.get('/events', {
  signal: controller.signal
});

try {
  for await (const event of response.sse()) {
    console.log(event.data);
  }
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Stream cancelled');
  }
}
```

### Break on Condition

```typescript
for await (const event of response.sse()) {
  console.log(event.data);

  if (event.data === '[DONE]') {
    break;  // Exit the stream
  }

  if (event.event === 'error') {
    throw new Error(event.data);
  }
}
```

## Connection Handling

### With Headers

```typescript
const response = await client.get('/events', {
  headers: {
    'Accept': 'text/event-stream',
    'Authorization': 'Bearer token',
    'X-Custom-Header': 'value'
  }
});

for await (const event of response.sse()) {
  console.log(event.data);
}
```

### With Query Parameters

```typescript
const response = await client.get('/events', {
  params: {
    channel: 'updates',
    since: '2024-01-01'
  }
});

for await (const event of response.sse()) {
  console.log(event.data);
}
```

## Patterns

### Event Accumulator

```typescript
async function collectEvents(url: string, maxEvents: number): Promise<SSEEvent[]> {
  const response = await client.get(url);
  const events: SSEEvent[] = [];

  for await (const event of response.sse()) {
    events.push(event);

    if (events.length >= maxEvents) {
      break;
    }
  }

  return events;
}

const events = await collectEvents('/events', 100);
```

### Event Processor

```typescript
type EventHandler = (event: SSEEvent) => void | Promise<void>;

async function processEvents(
  url: string,
  handlers: Record<string, EventHandler>
) {
  const response = await client.get(url);

  for await (const event of response.sse()) {
    const handler = handlers[event.event || 'default'];

    if (handler) {
      await handler(event);
    }
  }
}

await processEvents('/events', {
  message: (e) => console.log('Message:', e.data),
  update: (e) => console.log('Update:', JSON.parse(e.data)),
  default: (e) => console.log('Other:', e.data)
});
```

### Typed Event Stream

```typescript
interface ChatEvent {
  type: 'token' | 'done' | 'error';
  content?: string;
  error?: string;
}

async function* streamChat(prompt: string): AsyncGenerator<ChatEvent> {
  const response = await client.post('/chat', {
    json: { prompt, stream: true }
  });

  for await (const event of response.sse()) {
    const data = JSON.parse(event.data) as ChatEvent;
    yield data;

    if (data.type === 'done' || data.type === 'error') {
      break;
    }
  }
}

// Usage
for await (const event of streamChat('Hello!')) {
  if (event.type === 'token') {
    process.stdout.write(event.content || '');
  } else if (event.type === 'error') {
    console.error('Error:', event.error);
  }
}
```

### Reconnection Handler

```typescript
async function connectWithRetry(url: string, maxRetries = 3) {
  let retries = 0;
  let lastEventId: string | undefined;

  while (retries < maxRetries) {
    try {
      const headers: Record<string, string> = {};

      // Resume from last event
      if (lastEventId) {
        headers['Last-Event-ID'] = lastEventId;
      }

      const response = await client.get(url, { headers });

      for await (const event of response.sse()) {
        // Track last ID for reconnection
        if (event.id) {
          lastEventId = event.id;
        }

        // Process event
        console.log(event.data);
      }

      // Stream ended normally
      break;

    } catch (error) {
      retries++;
      console.log(`Reconnecting... (${retries}/${maxRetries})`);
      await sleep(1000 * retries);
    }
  }
}
```

## Error Handling

```typescript
const response = await client.get('/events');

try {
  for await (const event of response.sse()) {
    if (event.event === 'error') {
      throw new Error(`Server error: ${event.data}`);
    }

    console.log(event.data);
  }
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Stream aborted');
  } else {
    console.error('Stream error:', error.message);
  }
}
```

## Best Practices

### 1. Handle Connection Drops

```typescript
async function resilientStream(url: string) {
  while (true) {
    try {
      const response = await client.get(url);

      for await (const event of response.sse()) {
        processEvent(event);
      }

      break;  // Normal end
    } catch (error) {
      console.log('Connection lost, reconnecting...');
      await sleep(5000);
    }
  }
}
```

### 2. Set Appropriate Timeouts

```typescript
const response = await client.get('/events', {
  timeout: {
    firstByte: 30000,    // Wait for stream to start
    betweenTokens: 60000 // Allow gaps between events
  }
});
```

### 3. Track Event IDs

```typescript
let lastId: string | undefined;

for await (const event of response.sse()) {
  if (event.id) {
    lastId = event.id;
    // Store lastId for reconnection
  }

  processEvent(event);
}
```

### 4. Validate Event Data

```typescript
import { z } from 'zod';

const EventSchema = z.object({
  type: z.string(),
  payload: z.unknown()
});

for await (const event of response.sse()) {
  try {
    const data = EventSchema.parse(JSON.parse(event.data));
    processEvent(data);
  } catch (error) {
    console.error('Invalid event:', event.data);
  }
}
```

## Comparison: SSE vs WebSocket

| Feature | SSE | WebSocket |
|---------|-----|-----------|
| Direction | Server → Client | Bidirectional |
| Protocol | HTTP | WS/WSS |
| Reconnection | Automatic | Manual |
| Binary data | No | Yes |
| Browser support | Good | Excellent |
| Complexity | Simple | Moderate |

**Use SSE when:**
- Server pushes data to client
- Text/JSON data only
- Built-in reconnection needed

**Use WebSocket when:**
- Bidirectional communication needed
- Binary data transfer
- Low latency requirements

## Next Steps

- **[WebSocket](01-websocket.md)** - Bidirectional real-time
- **[AI Overview](../ai/01-overview.md)** - AI streaming with SSE
