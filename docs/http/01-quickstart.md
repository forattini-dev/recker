# Quick Start

Get up and running with Recker in 2 minutes.

## Installation

```bash
npm install recker
```

**Requirements:** Node.js 18+

## Usage Styles

Recker offers three ways to make requests:

### 1. Direct Functions (Zero Config)

```typescript
import { get, post, put, patch, del, head, options } from 'recker';

// GET
const users = await get('https://api.example.com/users').json();

// POST with JSON
const created = await post('https://api.example.com/users', {
  json: { name: 'John', email: 'john@example.com' }
}).json();

// PUT
await put('https://api.example.com/users/1', {
  json: { name: 'Jane' }
});

// DELETE
await del('https://api.example.com/users/1');
```

### 2. Unified Namespace

```typescript
import { recker } from 'recker';

// HTTP
const users = await recker.get('https://api.example.com/users').json();

// WHOIS
const whois = await recker.whois('github.com');

// DNS
const ips = await recker.dns('google.com');

// WebSocket
const ws = recker.ws('wss://api.example.com/ws');

// AI
const response = await recker.ai.chat('Hello!');
```

### 3. Configured Client

```typescript
import { createClient } from 'recker';

const api = createClient({
  baseUrl: 'https://api.example.com',
  headers: { 'Authorization': 'Bearer token123' },
  timeout: 10000
});

// Relative paths
const users = await api.get('/users').json();
const user = await api.get('/users/:id', { params: { id: '123' } }).json();
```

## Request Options

```typescript
interface RequestOptions {
  // URL path parameters (replaces :param in path)
  params?: Record<string, string | number>;

  // Query string parameters
  query?: Record<string, string | number | boolean>;

  // Request headers
  headers?: Record<string, string>;

  // JSON body (auto-serialized, sets Content-Type)
  json?: unknown;

  // Form data (URL encoded)
  form?: Record<string, string>;

  // Raw body
  body?: BodyInit;

  // Timeout in ms
  timeout?: number;

  // Abort signal
  signal?: AbortSignal;

  // Throw on non-2xx (default: true)
  throwHttpErrors?: boolean;
}
```

### Examples

```typescript
// Path params
await api.get('/users/:id/posts/:postId', {
  params: { id: '123', postId: '456' }
});
// → GET /users/123/posts/456

// Query string
await api.get('/search', {
  query: { q: 'recker', limit: 10, active: true }
});
// → GET /search?q=recker&limit=10&active=true

// Headers
await api.get('/protected', {
  headers: { 'X-Custom': 'value' }
});

// JSON body
await api.post('/users', {
  json: { name: 'John', roles: ['admin'] }
});

// Form data
await api.post('/login', {
  form: { username: 'john', password: 'secret' }
});
```

## Response Handling

```typescript
const response = api.get('/users');

// Parse as JSON
const data = await response.json<User[]>();

// Parse as text
const text = await response.text();

// Get raw buffer
const buffer = await response.buffer();

// Access response metadata
const res = await response;
console.log(res.status);      // 200
console.log(res.ok);          // true
console.log(res.headers);     // Headers object
console.log(res.timings);     // { dns, tcp, tls, firstByte, total }
```

## Error Handling

```typescript
import { HttpError, TimeoutError, NetworkError } from 'recker';

try {
  await api.get('/users/999').json();
} catch (error) {
  if (error instanceof HttpError) {
    console.log(error.status);      // 404
    console.log(error.statusText);  // "Not Found"
    const body = await error.response.json();
  }

  if (error instanceof TimeoutError) {
    console.log('Request timed out');
  }

  if (error instanceof NetworkError) {
    console.log(error.code);  // 'ECONNREFUSED', 'ENOTFOUND', etc.
  }
}
```

## Type Safety

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

// Typed response
const user = await api.get<User>('/users/1').json();
console.log(user.name);  // TypeScript knows this is string

// With Zod validation
import { z } from 'zod';

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email()
});

const validated = await api.get('/users/1').parse(UserSchema);
```

## Cancel Requests

```typescript
// Using AbortController
const controller = new AbortController();
const promise = api.get('/slow', { signal: controller.signal });

setTimeout(() => controller.abort(), 1000);

// Using .cancel()
const request = api.get('/slow');
setTimeout(() => request.cancel(), 1000);
```

## Next Steps

- **[Fundamentals](./02-fundamentals.md)** - HTTP methods, headers, body types
- **[Responses](./03-responses.md)** - Streaming, downloads, SSE
- **[Configuration](./05-configuration.md)** - Client options, plugins
- **[Resilience](./07-resilience.md)** - Retry, circuit breaker, timeouts
