# Migration Guide

Migrating to Recker from other HTTP clients is straightforward. This guide covers common migration scenarios.

## From Axios

### Basic GET Request

```typescript
// Axios
const response = await axios.get('https://api.example.com/users');
const data = response.data;

// Recker
const data = await client.get('/users').json();
```

### POST with JSON

```typescript
// Axios
const response = await axios.post('https://api.example.com/users', {
  name: 'John',
  email: 'john@example.com'
});

// Recker
const data = await client.post('/users', {
  name: 'John',
  email: 'john@example.com'
}).json();
```

### Custom Headers

```typescript
// Axios
const response = await axios.get('/users', {
  headers: {
    'Authorization': 'Bearer token'
  }
});

// Recker
const data = await client
  .get('/users')
  .withHeader('Authorization', 'Bearer token')
  .json();
```

### Query Parameters

```typescript
// Axios
const response = await axios.get('/users', {
  params: { role: 'admin', limit: 10 }
});

// Recker
const data = await client
  .get('/users')
  .withQuery({ role: 'admin', limit: 10 })
  .json();
```

### Interceptors

```typescript
// Axios
axios.interceptors.request.use((config) => {
  config.headers['X-Request-ID'] = uuid();
  return config;
});

axios.interceptors.response.use((response) => {
  console.log(response.status);
  return response;
});

// Recker
client.beforeRequest((req) => {
  return req.withHeader('X-Request-ID', uuid());
});

client.afterResponse((req, res) => {
  console.log(res.status);
  return res;
});
```

### Error Handling

```typescript
// Axios
try {
  const response = await axios.get('/users');
} catch (error) {
  if (error.response) {
    console.log(error.response.status);
    console.log(error.response.data);
  }
}

// Recker
try {
  const data = await client.get('/users').json();
} catch (error) {
  console.log(error.status);
  console.log(await error.response?.json());
}
```

### Timeout

```typescript
// Axios
const response = await axios.get('/users', {
  timeout: 5000
});

// Recker
const data = await client.get('/users', {
  signal: AbortSignal.timeout(5000)
}).json();
```

### Cancel Requests

```typescript
// Axios
const source = axios.CancelToken.source();

axios.get('/users', {
  cancelToken: source.token
});

source.cancel('Request cancelled');

// Recker
const controller = new AbortController();

client.get('/users', {
  signal: controller.signal
});

controller.abort();
```

### Progress Tracking

```typescript
// Axios
axios.get('/file', {
  onDownloadProgress: (progressEvent) => {
    const percent = (progressEvent.loaded / progressEvent.total) * 100;
    console.log(percent);
  }
});

// Recker – callback style
await client.get('/file', {
  onDownloadProgress: (progress) => {
    console.log(progress.percent);
  }
});

// Recker – async iterator style
const response = await client.get('/file');
for await (const progress of response.download()) {
  console.log(progress.percent);
}
```

```typescript
// Upload progress
await client.post('/upload', payload, {
  onUploadProgress: (progress) => {
    console.log(progress.percent);
  }
});
```

### Base URL & Defaults

```typescript
// Axios
const instance = axios.create({
  baseURL: 'https://api.example.com',
  headers: {
    'Authorization': 'Bearer token'
  },
  timeout: 5000
});

// Recker
const client = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'Authorization': 'Bearer token'
  },
  signal: AbortSignal.timeout(5000)
});
```

## From Got

### Basic Request

```typescript
// Got
const data = await got('https://api.example.com/users').json();

// Recker
const data = await client.get('/users').json();
```

### Retry

```typescript
// Got
const data = await got('https://api.example.com/users', {
  retry: {
    limit: 3,
    methods: ['GET'],
    statusCodes: [408, 413, 429, 500, 502, 503, 504]
  }
}).json();

// Recker
const client = createClient({
  retry: {
    maxAttempts: 3,
    backoff: 'exponential'
  }
});

const data = await client.get('/users').json();
```

### Hooks

```typescript
// Got
const data = await got('https://api.example.com/users', {
  hooks: {
    beforeRequest: [
      options => {
        options.headers['X-Timestamp'] = Date.now();
      }
    ]
  }
}).json();

// Recker
client.beforeRequest((req) => {
  return req.withHeader('X-Timestamp', Date.now().toString());
});

const data = await client.get('/users').json();
```

### Pagination

```typescript
// Got
import got from 'got';

const allPages = [];
for await (const page of got.paginate('https://api.example.com/users')) {
  allPages.push(page);
}

// Recker
import { paginate } from 'recker';

for await (const page of paginate(client, '/users')) {
  console.log(page.data);
}
```

### Streaming

```typescript
// Got
import { pipeline } from 'stream/promises';
import got from 'got';
import { createWriteStream } from 'fs';

await pipeline(
  got.stream('https://example.com/file'),
  createWriteStream('file.txt')
);

// Recker
const response = await client.get('/file');
const fileStream = createWriteStream('file.txt');

for await (const chunk of response.stream()) {
  fileStream.write(chunk);
}
fileStream.end();
```

## From Ky

### Basic Request

```typescript
// Ky
const data = await ky.get('https://api.example.com/users').json();

// Recker
const data = await client.get('/users').json();
```

### POST JSON

```typescript
// Ky
const data = await ky.post('https://api.example.com/users', {
  json: { name: 'John' }
}).json();

// Recker
const data = await client.post('/users', {
  name: 'John'
}).json();
```

### Search Params

```typescript
// Ky
const data = await ky.get('https://api.example.com/users', {
  searchParams: { role: 'admin' }
}).json();

// Recker
const data = await client
  .get('/users')
  .withQuery({ role: 'admin' })
  .json();
```

### Retry

```typescript
// Ky
const data = await ky.get('https://api.example.com/users', {
  retry: {
    limit: 3,
    methods: ['get'],
    statusCodes: [408, 413, 429, 500, 502, 503, 504]
  }
}).json();

// Recker
const client = createClient({
  retry: {
    maxAttempts: 3,
    backoff: 'exponential'
  }
});

const data = await client.get('/users').json();
```

### Hooks

```typescript
// Ky
const ky = ky.create({
  hooks: {
    beforeRequest: [
      request => {
        request.headers.set('X-Timestamp', Date.now());
      }
    ]
  }
});

// Recker
const client = createClient();

client.beforeRequest((req) => {
  return req.withHeader('X-Timestamp', Date.now().toString());
});
```

### Timeout

```typescript
// Ky
const data = await ky.get('https://api.example.com/users', {
  timeout: 5000
}).json();

// Recker
const data = await client.get('/users', {
  signal: AbortSignal.timeout(5000)
}).json();
```

## From Fetch

### Basic Request

```typescript
// Fetch
const response = await fetch('https://api.example.com/users');
const data = await response.json();

// Recker
const data = await client.get('/users').json();
```

### POST JSON

```typescript
// Fetch
const response = await fetch('https://api.example.com/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ name: 'John' })
});
const data = await response.json();

// Recker
const data = await client.post('/users', {
  name: 'John'
}).json();
```

### Custom Headers

```typescript
// Fetch
const response = await fetch('https://api.example.com/users', {
  headers: {
    'Authorization': 'Bearer token'
  }
});

// Recker
const data = await client
  .get('/users')
  .withHeader('Authorization', 'Bearer token')
  .json();
```

### AbortController

```typescript
// Fetch
const controller = new AbortController();

fetch('https://api.example.com/users', {
  signal: controller.signal
});

controller.abort();

// Recker (same API)
const controller = new AbortController();

client.get('/users', {
  signal: controller.signal
});

controller.abort();
```

### Error Handling

```typescript
// Fetch
const response = await fetch('https://api.example.com/users');

if (!response.ok) {
  throw new Error(`HTTP error! status: ${response.status}`);
}

const data = await response.json();

// Recker (automatic error handling)
try {
  const data = await client.get('/users').json();
} catch (error) {
  console.error('Request failed:', error.status);
}
```

## Key Differences

### Automatic JSON Handling

Recker automatically handles JSON serialization/deserialization:

```typescript
// Other clients
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
const result = await response.json();

// Recker
const result = await client.post(url, data).json();
```

### Immutable Request Building

Recker uses immutable request building:

```typescript
const base = client.get('/users');
const withAuth = base.withHeader('Authorization', 'Bearer token');
const withQuery = withAuth.withQuery({ role: 'admin' });

// base, withAuth, withQuery are all separate requests
```

### Built-in Features

Recker includes features that require plugins in other clients:

- **Request deduplication**: Automatic
- **Smart retry with exponential backoff**: Built-in
- **Debug mode with timings**: Built-in
- **SSE parsing**: Native support
- **Schema validation**: Zod integration

## Performance Benefits

After migrating to Recker, you can expect:

1. **Faster requests**: 15-40% faster than axios/got/ky
2. **Cache benefits**: 5x speedup with cache enabled
3. **Deduplication**: 2-10x speedup for duplicate parallel requests
4. **Better error handling**: Automatic retry with exponential backoff

## Common Pitfalls

### Forgetting to Call `.json()` or `.text()`

```typescript
// ❌ Wrong
const data = await client.get('/users');

// ✅ Correct
const data = await client.get('/users').json();
```

### Mutating Requests

```typescript
// ❌ Wrong (requests are immutable)
const req = client.get('/users');
req.withHeader('X-Test', 'value'); // This doesn't modify req

// ✅ Correct
const req = client.get('/users').withHeader('X-Test', 'value');
```

### Not Using BaseURL

```typescript
// ❌ Less convenient
const data = await client.get('https://api.example.com/users').json();

// ✅ Better
const client = createClient({ baseUrl: 'https://api.example.com' });
const data = await client.get('/users').json();
```

## Migrating to Unified Concurrency API

If you were using the legacy `rateLimit` or separate `agent` configuration, migrate to the new unified `concurrency` API:

### Legacy Rate Limit → Unified Concurrency

```typescript
// ❌ Old API (deprecated)
const client = createClient({
  rateLimit: {
    concurrency: 10,
    requestsPerInterval: 100,
    interval: 1000
  },
  agent: {
    connections: 20,
    keepAlive: true
  }
});

// ✅ New API (recommended)
const client = createClient({
  concurrency: {
    max: 10,                    // Global concurrency limit
    requestsPerInterval: 100,   // Rate limiting
    interval: 1000,
    agent: {
      connections: 'auto',      // Auto-optimized (or specify manually)
      keepAlive: true,
      perDomainPooling: true    // NEW: Per-domain connection pools
    }
  }
});
```

### Simple Migration

```typescript
// ❌ Old
const client = createClient({
  rateLimit: { concurrency: 20 }
});

// ✅ New
const client = createClient({
  concurrency: 20  // Simple shorthand
});
```

### Batch-Only Concurrency (New Feature)

```typescript
// NEW: Run multiple batches in parallel without global bottleneck
const client = createClient({
  concurrency: {
    runner: { concurrency: 10 }  // Each batch: max 10 concurrent
  }
  // Note: No 'max' specified → no global limit
});

// Run 3 batches in parallel (30 total concurrent)
await Promise.all([
  client.batch(batch1, { concurrency: 10 }),
  client.batch(batch2, { concurrency: 10 }),
  client.batch(batch3, { concurrency: 10 })
]);
```

### Multi-Domain Batches (New Feature)

```typescript
// NEW: Separate connection pools per domain
const client = createClient({
  concurrency: {
    max: 20,
    agent: {
      perDomainPooling: true  // Each domain gets its own pool
    }
  }
});

const requests = [
  { path: 'https://api1.com/data' },
  { path: 'https://api2.com/data' },
  { path: 'https://api3.com/data' }
];

await client.batch(requests);
// api1.com won't block api2.com or api3.com
```

### Benefits of New API

1. **Unified Configuration**: One place for concurrency, rate limiting, and connection pooling
2. **Auto-Optimization**: `connections: 'auto'` auto-calculates based on concurrency and HTTP version
3. **Per-Domain Pooling**: Separate pools prevent domain blocking
4. **Batch-Only Mode**: Run unlimited batches in parallel without global bottleneck
5. **HTTP/2 Support**: Auto-configured concurrent streams

## Next Steps

- Check out [Examples](/examples/README.md) for more use cases
- Read about [Concurrency & Batch Requests](/http/08-concurrency.md) in detail
- Read about [Performance](/benchmarks.md) improvements
- Learn about [Plugins](/http/10-plugins.md)
