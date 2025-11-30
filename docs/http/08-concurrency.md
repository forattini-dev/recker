# Concurrency & Batch

Batch requests, parallel execution, rate limiting, and queue management.

## Architecture

Recker's concurrency system has **three coordinated layers**:

```
┌────────────────────────────────────────────┐
│  1. RequestPool (Global Middleware)        │
│     - Max concurrent requests across ALL   │
│     - Rate limiting (requests/interval)    │
│     - Applies to every request             │
└─────────────────┬──────────────────────────┘
                  ↓
┌────────────────────────────────────────────┐
│  2. RequestRunner (Batch Control)          │
│     - Batch-specific dispatch rate         │
│     - Prevents promise explosion           │
│     - Can override global concurrency      │
└─────────────────┬──────────────────────────┘
                  ↓
┌────────────────────────────────────────────┐
│  3. AgentManager (Connection Pooling)      │
│     - TCP connection reuse                 │
│     - Per-domain connection pools          │
│     - Auto-calculated from concurrency     │
└────────────────────────────────────────────┘
```

### Global vs Batch Concurrency

**Key difference:**
- **Global limit** (`max`) - Total concurrent requests across ALL operations
- **Batch limit** (`runner.concurrency`) - Per-batch concurrency only

```typescript
// Global limit: Max 20 concurrent across everything
const client = createClient({
  concurrency: 20
});

// Batch-only mode: No global limit, each batch limited independently
const client = createClient({
  concurrency: {
    runner: { concurrency: 10 }  // Each batch: max 10 concurrent
  }
});

// Now you can run multiple batches in parallel
await Promise.all([
  client.batch(req1, { concurrency: 10 }),  // 10 concurrent
  client.batch(req2, { concurrency: 10 }),  // 10 concurrent
  client.batch(req3, { concurrency: 10 })   // 10 concurrent
]);
// Result: 30 total concurrent requests (10 from each batch)
```

## Concurrency Configuration

### Simple Concurrency

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: 20 // Max 20 concurrent requests
});
```

### Advanced Configuration

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    max: 50,                    // Max concurrent requests
    requestsPerInterval: 100,   // Rate limit: 100 req/sec
    interval: 1000,             // Interval in ms
    runner: {
      concurrency: 30,          // Per-batch concurrency
      retries: 2,               // Retry failed requests
      retryDelay: 1000          // Delay between retries
    },
    agent: {
      connections: 25,          // Connections per origin
      perDomainPooling: true    // Separate pools per domain
    }
  }
});
```

## Batch Requests

### Basic Batch

```typescript
const { results, stats } = await client.batch([
  { path: '/users/1' },
  { path: '/users/2' },
  { path: '/users/3' }
]);

console.log(results); // [Response, Response, Response]
console.log(stats);
// {
//   total: 3,
//   successful: 3,
//   failed: 0,
//   duration: 150
// }
```

### Batch with Response Mapping

```typescript
const { results } = await client.batch([
  { path: '/users/1' },
  { path: '/users/2' },
  { path: '/users/3' }
], {
  mapResponse: (res) => res.json()
});

console.log(results); // [{ id: 1, ... }, { id: 2, ... }, { id: 3, ... }]
```

### Batch with Options

```typescript
const { results } = await client.batch(
  [
    { path: '/users/1', options: { headers: { 'X-Custom': 'value' } } },
    { path: '/posts/1' },
    { path: '/comments/1' }
  ],
  {
    concurrency: 10,              // Override per-batch concurrency
    mapResponse: async (res) => ({
      data: await res.json(),
      status: res.status
    })
  }
);
```

### Error Handling in Batch

Failed requests return Error objects in results:

```typescript
const { results, stats } = await client.batch([
  { path: '/users/1' },
  { path: '/users/invalid' }, // Will fail
  { path: '/users/3' }
]);

results.forEach((result, index) => {
  if (result instanceof Error) {
    console.log(`Request ${index} failed:`, result.message);
  } else {
    console.log(`Request ${index} succeeded:`, result.status);
  }
});

console.log(`${stats.successful}/${stats.total} succeeded`);
```

## Multi-Domain Requests

### Per-Domain Pooling

Separate connection pools prevent one slow domain from blocking others:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    max: 50,
    agent: {
      perDomainPooling: true
    }
  }
});

// Each domain gets its own connection pool
const { results } = await client.batch([
  { path: 'https://api.github.com/users/octocat' },
  { path: 'https://registry.npmjs.org/recker' },
  { path: 'https://api.stripe.com/v1/charges' },
  { path: 'https://api.example.com/users' }
]);
```

### Multi Method

Alias for batch:

```typescript
const { results } = await client.multi([
  { path: '/users/1' },
  { path: '/users/2' }
], { mapResponse: r => r.json() });
```

## Rate Limiting

### Request Rate Limiting

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    max: 10,
    requestsPerInterval: 100,  // Max 100 requests
    interval: 1000             // Per second
  }
});

// Requests exceeding limit are queued automatically
for (let i = 0; i < 500; i++) {
  client.get(`/items/${i}`); // Automatically rate-limited
}
```

### API-Specific Rate Limits

```typescript
// GitHub API: 5000 requests/hour
const github = createClient({
  baseUrl: 'https://api.github.com',
  concurrency: {
    requestsPerInterval: 5000,
    interval: 3600000 // 1 hour
  }
});

// Stripe API: 100 requests/second
const stripe = createClient({
  baseUrl: 'https://api.stripe.com',
  concurrency: {
    requestsPerInterval: 100,
    interval: 1000
  }
});
```

## RequestRunner

Low-level control over concurrent execution:

```typescript
import { RequestRunner } from 'recker';

const runner = new RequestRunner({
  concurrency: 10,
  retries: 2,
  retryDelay: 1000
});

// Process items
const urls = ['/users/1', '/users/2', '/users/3', ...];

const { results, stats } = await runner.run(urls, async (url) => {
  const response = await client.get(url);
  return response.json();
});

console.log(`Processed ${stats.successful} items in ${stats.duration}ms`);
```

### Runner Events

```typescript
const runner = new RequestRunner({ concurrency: 10 });

runner.on('taskStart', ({ item, index }) => {
  console.log(`Starting task ${index}`);
});

runner.on('taskComplete', ({ item, index, result }) => {
  console.log(`Task ${index} completed`);
});

runner.on('taskError', ({ item, index, error }) => {
  console.log(`Task ${index} failed: ${error.message}`);
});

runner.on('drained', () => {
  console.log('All tasks complete');
});

await runner.run(items, processor);
```

## Parallel Patterns

### Promise.all Alternative

```typescript
// Instead of uncontrolled parallel
const results = await Promise.all([
  client.get('/users/1').json(),
  client.get('/users/2').json(),
  client.get('/users/3').json()
]);

// Use batch for controlled parallel
const { results } = await client.batch(
  urls.map(url => ({ path: url })),
  { concurrency: 10, mapResponse: r => r.json() }
);
```

### Sequential Execution

```typescript
// Force sequential execution
const results = [];
for (const url of urls) {
  results.push(await client.get(url).json());
}

// Or with concurrency: 1
const { results } = await client.batch(
  urls.map(url => ({ path: url })),
  { concurrency: 1, mapResponse: r => r.json() }
);
```

### Chunked Processing

```typescript
// batch() handles chunking automatically with concurrency control
const { results } = await client.batch(
  urls.map(url => ({ path: url })),
  {
    concurrency: 10,  // Process in chunks of 10
    mapResponse: r => r.json()
  }
);
```

## Pagination with Concurrency

### Parallel Page Fetching

```typescript
// Get first page to determine total
const firstPage = await client.get('/users', {
  query: { page: 1, limit: 100 }
}).json();

const totalPages = Math.ceil(firstPage.total / 100);

// Fetch remaining pages in parallel
const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

const { results } = await client.batch(
  pageNumbers.map(page => ({
    path: '/users',
    options: { query: { page, limit: 100 } }
  })),
  { concurrency: 5, mapResponse: r => r.json() }
);

// Combine all items
const allUsers = [
  ...firstPage.items,
  ...results.flatMap(r => r.items)
];
```

### Built-in Pagination

```typescript
// Sequential pagination
const users = await client.getAll('/users', {
  pageParam: 'page',
  limitParam: 'limit'
});

// Page iteration
for await (const user of client.paginate('/users')) {
  console.log(user);
}
```

### API-Specific Pagination Patterns

#### GitHub API (Link Header)

```typescript
const github = createClient({
  baseUrl: 'https://api.github.com',
  headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}` }
});

// GitHub uses Link header (RFC 8288) - automatic!
for await (const repo of github.paginate('/user/repos', {
  params: { per_page: 100 }
})) {
  console.log(repo.full_name);
}
```

#### Stripe API (Cursor)

```typescript
const stripe = createClient({
  baseUrl: 'https://api.stripe.com/v1',
  headers: { 'Authorization': `Bearer ${STRIPE_KEY}` }
});

for await (const customer of stripe.paginate('/customers', {
  params: { limit: 100 }
}, {
  getNextUrl: (response, data) => {
    if (data.has_more) {
      const lastId = data.data[data.data.length - 1].id;
      return `/customers?limit=100&starting_after=${lastId}`;
    }
    return null;
  },
  getItems: (data) => data.data
})) {
  console.log(customer.email);
}
```

#### Twitter/X API (Cursor Token)

```typescript
const twitter = createClient({
  baseUrl: 'https://api.twitter.com/2',
  headers: { 'Authorization': `Bearer ${TWITTER_TOKEN}` }
});

for await (const tweet of twitter.paginate('/tweets/search/recent', {
  params: { query: 'nodejs', max_results: 100 }
}, {
  nextCursorPath: 'meta.next_token',
  pageParam: 'next_token',
  resultsPath: 'data'
})) {
  console.log(tweet.text);
}
```

### Resume Pagination

Save progress and resume from where you left off:

```typescript
interface PaginationState {
  lastUrl: string;
  lastCursor: string;
  processedCount: number;
}

async function resumablePaginate(
  client: Client,
  startUrl: string,
  state?: PaginationState
) {
  const currentState: PaginationState = state || {
    lastUrl: startUrl,
    lastCursor: '',
    processedCount: 0
  };

  try {
    for await (const page of client.streamPages(currentState.lastUrl, {}, {
      nextCursorPath: 'meta.cursor'
    })) {
      currentState.lastUrl = page.response.url;
      currentState.lastCursor = page.data.meta?.cursor || '';

      for (const item of page.data.items) {
        await processItem(item);
        currentState.processedCount++;
      }

      // Save checkpoint
      await saveState(currentState);
    }
  } catch (error) {
    console.log('Resume with state:', currentState);
    throw error;
  }
}
```

## Deduplication

Prevent duplicate in-flight requests:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dedup: {
    enabled: true
  }
});

// These requests share the same response
const [user1, user2, user3] = await Promise.all([
  client.get('/users/1').json(),
  client.get('/users/1').json(), // Deduped - shares response
  client.get('/users/1').json()  // Deduped - shares response
]);

// Only 1 HTTP request was made
```

## Queue Priority

```typescript
import { RequestRunner } from 'recker';

const runner = new RequestRunner({ concurrency: 5 });

// Higher priority items processed first
await runner.run([
  { url: '/critical', priority: 10 },
  { url: '/normal', priority: 5 },
  { url: '/low', priority: 1 }
], async (item) => {
  return client.get(item.url).json();
});
```

## Progress Tracking

### Batch Progress

```typescript
let completed = 0;
const total = urls.length;

const { results } = await client.batch(
  urls.map(url => ({ path: url })),
  {
    concurrency: 10,
    mapResponse: async (res) => {
      const data = await res.json();
      completed++;
      console.log(`Progress: ${completed}/${total}`);
      return data;
    }
  }
);
```

### Runner Progress Events

```typescript
const runner = new RequestRunner({ concurrency: 10 });

let completed = 0;
const total = items.length;

runner.on('taskComplete', () => {
  completed++;
  const percent = Math.round((completed / total) * 100);
  console.log(`Progress: ${percent}%`);
});

await runner.run(items, processor);
```

## Best Practices

### 1. Match Concurrency to API Limits

```typescript
// GitHub: 5000/hour = ~1.4/second
const github = createClient({
  baseUrl: 'https://api.github.com',
  concurrency: {
    max: 5,                    // Conservative parallel
    requestsPerInterval: 80,   // Leave headroom
    interval: 60000            // Per minute
  }
});
```

### 2. Use Per-Domain Pooling for Multi-API

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    agent: { perDomainPooling: true }
  }
});
```

### 3. Handle Partial Failures

```typescript
const { results, stats } = await client.batch(requests);

if (stats.failed > 0) {
  const failed = results
    .map((r, i) => ({ result: r, request: requests[i] }))
    .filter(({ result }) => result instanceof Error);

  console.log(`${failed.length} requests failed`);
  // Optionally retry failed requests
}
```

### 4. Set Reasonable Timeouts

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  timeout: 10000,  // 10s per request
  concurrency: { max: 50 }
});
```

### 5. Monitor Throughput

```typescript
const start = Date.now();

const { stats } = await client.batch(requests);

const throughput = stats.total / (stats.duration / 1000);
console.log(`Throughput: ${throughput.toFixed(2)} req/s`);
```

## Real-World Patterns

### API Migration

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    max: 50,
    requestsPerInterval: 100,
    interval: 1000
  }
});

// Migrate 10,000 users
const userIds = Array.from({ length: 10000 }, (_, i) => i + 1);

const requests = userIds.map(id => ({
  path: `/users/${id}/migrate`,
  options: { method: 'POST' }
}));

const { stats } = await client.batch(requests);

console.log(`Migrated ${stats.successful}/${stats.total} users`);
console.log(`Duration: ${(stats.duration / 1000 / 60).toFixed(2)} minutes`);
```

### Web Scraping Multiple Sites

```typescript
const client = createClient({
  concurrency: {
    runner: { concurrency: 20 },
    agent: { perDomainPooling: true }
  }
});

const siteA = Array.from({ length: 100 }, (_, i) => ({
  path: `https://site-a.com/page/${i}`
}));

const siteB = Array.from({ length: 100 }, (_, i) => ({
  path: `https://site-b.com/page/${i}`
}));

// Scrape both sites in parallel
const [resultsA, resultsB] = await Promise.all([
  client.batch(siteA, { concurrency: 20 }),
  client.batch(siteB, { concurrency: 20 })
]);
// 40 concurrent total, each domain isolated
```

### Health Checks Dashboard

```typescript
const client = createClient({
  concurrency: 10,
  timeout: 5000
});

const services = [
  'https://api1.example.com/health',
  'https://api2.example.com/health',
  'https://api3.example.com/health',
  'https://db.example.com/health',
  'https://cache.example.com/health'
];

const requests = services.map(url => ({ path: url }));

const { results } = await client.batch(requests);

const status = results.map((result, i) => ({
  service: services[i],
  healthy: !(result instanceof Error) && result.ok,
  latency: result.timings?.total || null
}));

console.table(status);
```

### Data Export with Progress

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: 20
});

let processed = 0;
const total = 100;

const requests = Array.from({ length: total }, (_, i) => ({
  path: `/export/page/${i + 1}`
}));

const { results } = await client.batch(requests, {
  mapResponse: async (res) => {
    const data = await res.json();
    processed++;
    console.log(`Progress: ${processed}/${total} (${Math.round(processed/total*100)}%)`);
    return data;
  }
});

const allData = results
  .filter(r => !(r instanceof Error))
  .flatMap(page => page.data);

console.log(`Exported ${allData.length} records`);
```

## Configuration Reference

```typescript
interface ConcurrencyConfig {
  // Max concurrent in-flight requests
  max?: number;

  // Rate limiting
  requestsPerInterval?: number;
  interval?: number;

  // Batch runner config
  runner?: {
    concurrency?: number;
    retries?: number;
    retryDelay?: number;
  };

  // Connection pool config
  agent?: {
    connections?: number;
    keepAlive?: boolean;
    keepAliveTimeout?: number;
    perDomainPooling?: boolean;
  };
}
```

## Next Steps

- **[Caching](09-cache.md)** - Response caching strategies
- **[Plugins](10-plugins.md)** - Plugin architecture
- **[Observability](12-observability.md)** - Debug and metrics
