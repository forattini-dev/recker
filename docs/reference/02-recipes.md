# Recipes

Common patterns and solutions.

## Authentication

### Bearer Token

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'Authorization': 'Bearer your-token'
  }
});
```

### Basic Auth

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'Authorization': 'Basic ' + Buffer.from('user:pass').toString('base64')
  }
});
```

### API Key in Header

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'X-API-Key': 'your-api-key'
  }
});
```

### API Key in Query

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  params: {
    api_key: 'your-api-key'
  }
});
```

### Dynamic Token Refresh

```typescript
let token = 'initial-token';

const client = createClient({
  baseUrl: 'https://api.example.com'
});

client.beforeRequest((req) => {
  return req.withHeader('Authorization', `Bearer ${token}`);
});

// Refresh on 401
client.onError(async (error, req) => {
  if (error instanceof HttpError && error.status === 401) {
    token = await refreshToken();
    return client.request(req.method, req.url);
  }
});
```

## Error Handling

### Retry on Failure

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    maxAttempts: 3,
    backoff: 'exponential',
    retryOn: [429, 500, 502, 503, 504]
  }
});
```

### Custom Error Handler

```typescript
async function safeRequest<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) {
      console.error(`HTTP ${error.status}: ${error.message}`);
    } else if (error instanceof NetworkError) {
      console.error(`Network error: ${error.code}`);
    } else if (error instanceof TimeoutError) {
      console.error(`Timeout: ${error.type}`);
    }
    return null;
  }
}

const users = await safeRequest(() => client.get('/users').json());
```

### Fallback Response

```typescript
client.onError(async (error, req) => {
  // Return cached data on network error
  if (error instanceof NetworkError) {
    const cached = await cache.get(req.url);
    if (cached) {
      return new Response(JSON.stringify(cached), { status: 200 });
    }
  }
});
```

## Pagination

### Page-Based

```typescript
async function getAllPages<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const data = await client.get(path, {
      params: { page, per_page: 100 }
    }).json<{ items: T[]; has_more: boolean }>();

    items.push(...data.items);
    hasMore = data.has_more;
    page++;
  }

  return items;
}
```

### Cursor-Based

```typescript
async function* paginate<T>(path: string): AsyncGenerator<T> {
  let cursor: string | undefined;

  while (true) {
    const data = await client.get(path, {
      params: cursor ? { cursor } : {}
    }).json<{ items: T[]; next_cursor?: string }>();

    for (const item of data.items) {
      yield item;
    }

    if (!data.next_cursor) break;
    cursor = data.next_cursor;
  }
}

// Usage
for await (const user of paginate('/users')) {
  console.log(user);
}
```

### Using Link Headers

```typescript
import { parseLinkHeader } from 'recker/utils/link-header';

async function getAllWithLinks<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let url: string | null = path;

  while (url) {
    const response = await client.get(url);
    const data = await response.json<T[]>();
    items.push(...data);

    const links = parseLinkHeader(response.headers.get('link') || '');
    url = links.next || null;
  }

  return items;
}
```

## File Operations

### Upload File

```typescript
import { createReadStream } from 'fs';
import FormData from 'form-data';

const form = new FormData();
form.append('file', createReadStream('./document.pdf'));
form.append('name', 'My Document');

await client.post('/upload', {
  body: form,
  headers: form.getHeaders()
});
```

### Download File

```typescript
await client.get('/files/document.pdf').write('./downloaded.pdf');
```

### Download with Progress

```typescript
const response = await client.get('/files/large.zip');

for await (const progress of response.download()) {
  console.log(`${progress.percent}% - ${progress.rate} bytes/sec`);
}

// Save to file
await response.write('./large.zip');
```

### Multipart Upload

```typescript
const formData = new FormData();
formData.append('file1', createReadStream('./file1.txt'));
formData.append('file2', createReadStream('./file2.txt'));
formData.append('metadata', JSON.stringify({ tags: ['important'] }));

await client.post('/batch-upload', { formData });
```

## Streaming

### Stream Response

```typescript
const response = await client.get('/stream');

for await (const chunk of response) {
  process.stdout.write(new TextDecoder().decode(chunk));
}
```

### Server-Sent Events

```typescript
const response = await client.get('/events');

for await (const event of response.sse()) {
  console.log(`${event.event}: ${event.data}`);
}
```

### Pipe to File

```typescript
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

const response = await client.get('/large-file');
const dest = createWriteStream('./output.bin');
await pipeline(response.stream(), dest);
```

## Caching

### In-Memory Cache

```typescript
import { cache } from 'recker/plugins/cache';
import { MemoryStorage } from 'recker/cache';

const client = createClient({
  baseUrl: 'https://api.example.com'
});

client.use(cache({
  storage: new MemoryStorage(),
  ttl: 60000  // 1 minute
}));
```

### File Cache

```typescript
import { cache } from 'recker/plugins/cache';
import { FileStorage } from 'recker/cache';

const client = createClient({
  baseUrl: 'https://api.example.com'
});

client.use(cache({
  storage: new FileStorage({ directory: './.cache' }),
  ttl: 3600000  // 1 hour
}));
```

### Stale-While-Revalidate

```typescript
client.use(cache({
  storage: new MemoryStorage(),
  strategy: 'stale-while-revalidate',
  ttl: 60000
}));
```

## Batch Operations

### Parallel Requests

```typescript
// Use batch for parallel requests with stats
const { results } = await client.batch([
  { path: '/users' },
  { path: '/posts' },
  { path: '/comments' }
], { mapResponse: r => r.json() });

const [users, posts, comments] = results;
```

### Batch with Concurrency Limit

```typescript
const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const { results, stats } = await client.batch(
  ids.map(id => ({ path: `/users/${id}` })),
  {
    concurrency: 3,
    mapResponse: res => res.json()
  }
);

console.log(`Fetched ${stats.successful}/${stats.total} in ${stats.duration}ms`);
```

### Rate-Limited Batch

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    requestsPerInterval: 10,
    interval: 1000  // 10 requests per second
  }
});

// Requests automatically rate-limited
const { results } = await client.batch(
  items.map(item => ({ path: `/items/${item.id}` })),
  { mapResponse: r => r.json() }
);
```

## Validation

### With Zod

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email()
});

// Parse (throws on invalid)
const user = await client.get('/users/1').parse(UserSchema);

// Safe parse (returns result object)
const result = await client.get('/users/1').safeParse(UserSchema);
if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error);
}
```

### Array Validation

```typescript
const UsersSchema = z.array(UserSchema);
const users = await client.get('/users').parse(UsersSchema);
```

## Mocking

### For Testing

```typescript
import { MockTransport } from 'recker/testing';

const mock = new MockTransport();
mock.setMockResponse('GET', '/users', 200, [{ id: 1, name: 'John' }]);

const client = createClient({
  baseUrl: 'https://api.example.com',
  transport: mock
});

const users = await client.get('/users').json();
// Returns mock data
```

### Multiple Responses

```typescript
mock.setMockResponse('POST', '/login', 200, { token: 'abc' });
mock.setMockResponse('GET', '/profile', 200, { name: 'John' });
mock.setMockResponse('GET', '/profile', 401, { error: 'Unauthorized' }, { times: 1 });
```

## AI Integration

### Simple Chat

```typescript
import { ai } from 'recker/ai';

const response = await ai.chat('Hello!');
console.log(response.content);
```

### Streaming Chat

```typescript
const stream = await ai.stream({
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'Write a story' }]
});

for await (const event of stream) {
  if (event.type === 'text') {
    process.stdout.write(event.content);
  }
}
```

### With Tools

```typescript
const response = await ai.chat({
  model: 'gpt-5.1',
  messages: [{ role: 'user', content: 'What is the weather?' }],
  tools: [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string' }
        }
      }
    }
  }]
});

if (response.toolCalls) {
  // Execute tools...
}
```

## WebSocket

### Basic Connection

```typescript
import { websocket } from 'recker/websocket';

const ws = websocket('wss://api.example.com/ws');

ws.on('message', (msg) => {
  console.log(msg.data);
});

ws.on('open', () => {
  ws.sendJSON({ type: 'subscribe', channel: 'updates' });
});
```

### With Reconnection

```typescript
const ws = websocket('wss://api.example.com/ws', {
  reconnect: true,
  reconnectDelay: 1000,
  maxReconnectAttempts: 5
});
```

## Next Steps

- **[Testing](03-testing.md)** - Test your applications
- **[Presets](04-presets.md)** - Pre-configured clients
