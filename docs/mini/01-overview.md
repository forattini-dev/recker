# Mini Client

Zero-overhead HTTP client for maximum performance.

## Overview

`recker-mini` is a stripped-down HTTP client that wraps undici directly with minimal overhead. Use it when you need raw speed and don't need middleware, plugins, or advanced features.

### Performance Comparison

| Mode | Overhead vs undici | Features |
|------|-------------------|----------|
| **recker-mini** | ~2% | Base URL, default headers, JSON |
| **recker (standard)** | ~86% | All features (retry, cache, auth, etc.) |

```
GET JSON (lower is better)
═════════════════════════════════════════════════════════
undici (raw)     ██████                              142µs
recker-mini      ██████                              146µs  ← Only 2% overhead!
fetch (native)   ███████████                         260µs
axios            █████████████                       318µs
got              ████████████████                    395µs
```

## Installation

```typescript
// From main package
import { createMiniClient, miniGet, miniPost } from 'recker';

// Or dedicated subpath (tree-shakeable)
import { createMiniClient, miniGet, miniPost } from 'recker/mini';
```

## Quick Start

### Client Instance

```typescript
import { createMiniClient } from 'recker/mini';

const client = createMiniClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'Authorization': 'Bearer token123'
  }
});

// GET request
const users = await client.get('/users').then(r => r.json());

// POST request
const created = await client.post('/users', { name: 'John' }).then(r => r.json());

// Other methods
await client.put('/users/1', { name: 'Jane' });
await client.patch('/users/1', { active: true });
await client.delete('/users/1');
```

### Direct Functions (Even Faster)

For one-off requests without a client instance:

```typescript
import { miniGet, miniPost } from 'recker/mini';

// No client needed - just URL and data
const data = await miniGet('https://api.example.com/users').then(r => r.json());

const result = await miniPost(
  'https://api.example.com/users',
  { name: 'John', email: 'john@example.com' }
).then(r => r.json());
```

## API Reference

### `createMiniClient(options)`

Creates a mini client instance.

```typescript
interface MiniClientOptions {
  baseUrl: string;                    // Required: Base URL for all requests
  headers?: Record<string, string>;   // Optional: Default headers
}
```

### `MiniClient` Methods

```typescript
interface MiniClient {
  get<T>(path: string): Promise<MiniResponse<T>>;
  post<T>(path: string, body?: unknown): Promise<MiniResponse<T>>;
  put<T>(path: string, body?: unknown): Promise<MiniResponse<T>>;
  patch<T>(path: string, body?: unknown): Promise<MiniResponse<T>>;
  delete<T>(path: string): Promise<MiniResponse<T>>;
}
```

### `MiniResponse`

```typescript
interface MiniResponse<T = unknown> {
  status: number;           // HTTP status code
  headers: Headers;         // Response headers
  json(): Promise<T>;       // Parse as JSON
  text(): Promise<string>;  // Parse as text
  arrayBuffer(): Promise<ArrayBuffer>;
  blob(): Promise<Blob>;
}
```

### Direct Functions

```typescript
// GET request
miniGet<T>(url: string, headers?: Record<string, string>): Promise<MiniResponse<T>>

// POST request
miniPost<T>(url: string, data?: unknown, headers?: Record<string, string>): Promise<MiniResponse<T>>
```

## What's NOT Included

For maximum speed, mini client omits:

| Feature | Alternative |
|---------|-------------|
| Retry | Wrap in try/catch with loop |
| Cache | Use external cache (Redis, LRU) |
| Middleware/Hooks | Process before/after manually |
| Timeout | Use `AbortController` |
| Request transformation | Prepare data before calling |
| Response transformation | Process after `.json()` |
| Error handling | Check `status` manually |
| Rate limiting | Implement externally |
| Auth plugins | Add header manually |

## When to Use Mini Client

### Use Mini Client When:

- **Maximum throughput** - Processing millions of requests
- **Simple scripts** - One-off scripts, CLI tools
- **Internal services** - Trusted services on fast networks
- **Latency-critical** - Every microsecond matters
- **No features needed** - Just GET/POST with JSON

### Use Standard Client When:

- **Production APIs** - Need retry, auth, rate limiting
- **Unreliable networks** - Need automatic retry
- **Repeated data** - Cache/dedup save network calls
- **Observability** - Need timing and logging
- **Complex auth** - OAuth, AWS SigV4, etc.

## Examples

### Basic API Client

```typescript
import { createMiniClient } from 'recker/mini';

const api = createMiniClient({
  baseUrl: 'https://jsonplaceholder.typicode.com'
});

// Fetch users
const users = await api.get('/users').then(r => r.json());
console.log(`Found ${users.length} users`);

// Create post
const post = await api.post('/posts', {
  title: 'Hello',
  body: 'World',
  userId: 1
}).then(r => r.json());
console.log(`Created post ${post.id}`);
```

### With Custom Headers

```typescript
const client = createMiniClient({
  baseUrl: 'https://api.github.com',
  headers: {
    'Authorization': `token ${process.env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'my-app/1.0'
  }
});

const repos = await client.get('/user/repos').then(r => r.json());
```

### Error Handling

```typescript
const res = await client.get('/users/999');

if (res.status === 404) {
  console.log('User not found');
} else if (res.status >= 400) {
  const error = await res.json();
  throw new Error(error.message);
} else {
  const user = await res.json();
  console.log(user);
}
```

### Manual Timeout with AbortController

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5000);

try {
  // Note: Direct undici call with signal
  const { body } = await import('undici').then(u =>
    u.request('https://api.example.com/slow', {
      signal: controller.signal
    })
  );
  const data = await body.json();
  clearTimeout(timeout);
  return data;
} catch (error) {
  if (error.name === 'AbortError') {
    throw new Error('Request timed out');
  }
  throw error;
}
```

### Parallel Requests

```typescript
const client = createMiniClient({
  baseUrl: 'https://api.example.com'
});

// Parallel fetch
const [users, posts, comments] = await Promise.all([
  client.get('/users').then(r => r.json()),
  client.get('/posts').then(r => r.json()),
  client.get('/comments').then(r => r.json())
]);

console.log(`Loaded ${users.length} users, ${posts.length} posts, ${comments.length} comments`);
```

### TypeScript Generics

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

interface CreateUserInput {
  name: string;
  email: string;
}

// Typed responses
const users = await client.get<User[]>('/users').then(r => r.json());
// users is User[]

const newUser = await client.post<User>('/users', {
  name: 'John',
  email: 'john@example.com'
} as CreateUserInput).then(r => r.json());
// newUser is User
```

## Benchmarks

Run the benchmarks yourself:

```bash
# Compare mini vs standard vs undici
pnpm tsx benchmark/bare-vs-standard.ts

# Compare mini vs features (cache/dedup)
pnpm tsx benchmark/bare-vs-features.ts
```

### Results Summary

| Scenario | recker-mini | recker (standard) | Winner |
|----------|-------------|-------------------|--------|
| Single GET | 146µs | 265µs | mini (1.8x faster) |
| Single POST | 173µs | 298µs | mini (1.7x faster) |
| 10x same endpoint | 10 calls | 1 call + 9 cache hits | **standard** (cache wins) |
| 10 parallel same | 10 calls | 1 call (dedup) | **standard** (dedup wins) |

**Key insight:** Mini is faster per-request, but standard's cache/dedup can eliminate requests entirely.

## Migration from Standard Client

```typescript
// Before (standard client)
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  headers: { 'Authorization': 'Bearer token' }
});

const users = await client.get('/users').json();

// After (mini client)
import { createMiniClient } from 'recker/mini';

const client = createMiniClient({
  baseUrl: 'https://api.example.com',
  headers: { 'Authorization': 'Bearer token' }
});

const users = await client.get('/users').then(r => r.json());
// Note: .json() returns Promise, need .then() or await
```

### Key Differences

| Standard | Mini |
|----------|------|
| `client.get('/x').json()` | `client.get('/x').then(r => r.json())` |
| Chainable response | Promise-based response |
| Auto error throw | Manual status check |
| Middleware support | No middleware |
| Plugin system | No plugins |

## Next Steps

- **[Performance Guide](/http/06-performance.md)** - HTTP/2, compression, pooling
- **[Benchmarks](/benchmarks.md)** - Full benchmark results
- **[Standard Client](/http/02-fundamentals.md)** - Full-featured client
