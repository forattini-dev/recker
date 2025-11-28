# Client Configuration

Complete guide to configuring Recker for real projects.

## Basic Setup

```typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'Authorization': `Bearer ${process.env.API_TOKEN}`,
    'Accept': 'application/json'
  },
  timeout: 10000,
  debug: process.env.NODE_ENV !== 'production'
});
```

---

## Path Parameters

Express-style path parameters with automatic interpolation:

```typescript
// :param placeholders are replaced
const user = await client.get('/users/:id', {
  params: { id: '123' }
}).json();
// → GET /users/123

// Multiple parameters
const comment = await client.get('/posts/:postId/comments/:commentId', {
  params: { postId: '42', commentId: '7' }
}).json();
// → GET /posts/42/comments/7

// Remaining params become query string
const users = await client.get('/users/:id', {
  params: { id: '123', expand: 'profile' }
}).json();
// → GET /users/123?expand=profile
```

---

## Timeouts

```typescript
const client = createClient({
  timeout: 10000  // Global: 10 seconds
});

// Per-request override
await client.get('/fast', { timeout: 2000 });
await client.get('/slow', { timeout: 60000 });
await client.get('/stream', { timeout: 0 });  // Disable
```

### AbortController

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

try {
  await client.get('/api', { signal: controller.signal });
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Cancelled');
  }
}
```

---

## Connection Pooling

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  pool: {
    maxConnections: 10,          // Per origin
    maxConcurrentStreams: 100,   // HTTP/2 streams
    keepAliveTimeout: 4000,      // Keep-alive (ms)
    pipelining: 1                // HTTP/1.1 pipelining
  }
});
```

### Environment Presets

```typescript
// High-traffic
pool: { maxConnections: 50, keepAliveTimeout: 30000 }

// Serverless
pool: { maxConnections: 5, keepAliveTimeout: 1000 }

// Rate-limited API
pool: { maxConnections: 2, pipelining: 0 }
```

---

## HTTP/2

Automatic negotiation via ALPN - no configuration needed:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  http2: {
    enabled: true,
    maxConcurrentStreams: 200,
    pipelining: 5
  }
});

// Check protocol used
const res = await client.get('/api');
console.log(res.connection.protocol);  // 'h2'
```

---

## Proxy & TLS

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  proxy: {
    url: 'http://proxy.internal:8080',
    auth: { username: 'user', password: 'pass' },
    bypass: ['localhost', '*.internal']
  },
  tls: {
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3',
    rejectUnauthorized: true
  }
});
```

---

## Default Headers

```typescript
const client = createClient({
  headers: {
    'User-Agent': 'MyApp/1.0.0',
    'Accept': 'application/json',
    'Authorization': `Bearer ${process.env.API_TOKEN}`
  }
});

// Override per-request
await client.get('/api', {
  headers: { 'Authorization': 'Bearer other-token' }
});
```

---

## Hooks

```typescript
client
  .beforeRequest((req) => {
    return req.withHeader('X-Request-ID', crypto.randomUUID());
  })
  .afterResponse((req, res) => {
    console.log(`[${res.status}] ${req.method} ${req.url}`);
    return res;
  })
  .onError((error) => {
    if (error.status === 503) {
      return new Response(JSON.stringify({ maintenance: true }));
    }
  });
```

---

## Rate Limiting

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  rateLimit: {
    concurrency: 4,           // Max in-flight
    requestsPerInterval: 10,  // Max per interval
    interval: 1000            // Interval (ms)
  }
});
```

---

## Batch Requests

```typescript
const { results, stats } = await client.batch([
  { path: '/users/1' },
  { path: '/users/2' },
  { path: '/users/3' }
], {
  concurrency: 2,
  mapResponse: (res) => res.json()
});

console.log(stats);
// { total: 3, successful: 3, failed: 0, duration: 150 }
```

---

## Pagination Defaults

```typescript
const client = createClient({
  pagination: {
    pageParam: 'page',
    limitParam: 'limit',
    resultsPath: 'data.items'
  }
});

// Applied to paginate() calls
for await (const item of client.paginate('/items')) {
  console.log(item);
}
```

---

## Error Handling

```typescript
const client = createClient({
  throwHttpErrors: true  // Throw on 4xx/5xx
});

try {
  await client.get('/api');
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Timeout');
  } else if (error instanceof NetworkError) {
    console.log('Network failure');
  } else if (error instanceof HttpError) {
    console.log('HTTP error:', error.status);
  }
}
```

---

## Environment Configuration

```typescript
const config = {
  development: {
    baseUrl: 'http://localhost:3000',
    timeout: 30000,
    debug: true,
    retry: { maxAttempts: 0 }
  },
  production: {
    baseUrl: 'https://api.example.com',
    timeout: 5000,
    debug: false,
    retry: { maxAttempts: 3 },
    throwHttpErrors: true
  }
};

const env = process.env.NODE_ENV || 'development';
const client = createClient(config[env]);
```

---

## Full Example

```typescript
import { createClient, retry, cache, circuitBreaker } from 'recker';

export const api = createClient({
  baseUrl: process.env.API_URL,
  timeout: 10000,
  headers: {
    'Authorization': `Bearer ${process.env.API_TOKEN}`,
    'Accept': 'application/json'
  },
  pool: {
    maxConnections: 20,
    keepAliveTimeout: 10000
  },
  rateLimit: {
    requestsPerInterval: 100,
    interval: 1000
  },
  plugins: [
    retry({ maxAttempts: 3, backoff: 'exponential' }),
    cache({ ttl: 60000 }),
    circuitBreaker({ threshold: 5, resetTimeout: 30000 })
  ],
  debug: process.env.NODE_ENV !== 'production'
});
```
