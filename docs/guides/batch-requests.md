# Batch Requests & Concurrency Control

> Execute multiple requests concurrently with unified concurrency control

Recker provides powerful batch execution capabilities with fine-grained concurrency control through the unified concurrency API. This is essential for efficiently processing large datasets, API migrations, web scraping, or any scenario requiring multiple parallel requests.

## Quick Start

```typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: 20  // Max 20 concurrent requests globally
});

// Execute batch requests
const { results, stats } = await client.batch([
  { path: '/users/1' },
  { path: '/users/2' },
  { path: '/users/3' }
], {
  concurrency: 5,  // Batch-specific limit
  mapResponse: (res) => res.json()  // Auto-transform
});

console.log(`Completed ${stats.successful}/${stats.total} in ${stats.duration}ms`);
```

## Core Concepts

### 1. Global vs Batch Concurrency

Recker distinguishes between **global** and **batch-local** concurrency:

- **Global limit** (`concurrency.max`) - Total concurrent requests across ALL operations
- **Batch limit** (`batch(..., { concurrency })`) - Per-batch concurrency only

```typescript
// Global limit: Max 20 concurrent across everything
const client = createClient({
  concurrency: 20
});

// Batch override: This batch limited to 10
await client.batch(requests, { concurrency: 10 });
```

### 2. Batch-Only Mode (No Global Limit)

For maximum parallelism, omit `max` to allow unlimited batches in parallel:

```typescript
const client = createClient({
  concurrency: {
    runner: { concurrency: 10 }  // Each batch: max 10 concurrent
  }
  // No 'max' specified → no global limit
});

// Run 3 batches in parallel (30 total concurrent)
await Promise.all([
  client.batch(batch1, { concurrency: 10 }),
  client.batch(batch2, { concurrency: 10 }),
  client.batch(batch3, { concurrency: 10 })
]);
```

## Basic Usage

### Simple Batch

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com'
});

const { results, stats } = await client.batch([
  { path: '/users/1' },
  { path: '/users/2' },
  { path: '/users/3' },
  { path: '/users/4' },
  { path: '/users/5' }
]);

// results: Array<ReckerResponse | Error>
// stats: { total, successful, failed, duration }
```

### With Response Transformation

```typescript
const { results } = await client.batch([
  { path: '/users/1' },
  { path: '/users/2' },
  { path: '/users/3' }
], {
  mapResponse: async (res) => {
    const user = await res.json();
    return { id: user.id, name: user.name };  // Transform
  }
});

// results: Array<{ id, name } | Error>
```

### With Request Options

```typescript
const { results } = await client.batch([
  {
    path: '/users/1',
    options: {
      method: 'POST',
      body: { name: 'John' },
      headers: { 'X-Custom': 'value' }
    }
  },
  { path: '/users/2' },
  { path: '/users/3' }
]);
```

## Concurrency Control

### Global Concurrency Limit

```typescript
// Limit total concurrent requests across entire client
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: 20
});

// All requests (including batches) limited to 20 concurrent
await client.batch(largeDataset);  // Max 20 at a time
```

### Batch-Specific Concurrency

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com'
});

// Override concurrency per batch
await client.batch(requests, { concurrency: 50 });
```

### Multiple Batches in Parallel

```typescript
const client = createClient({
  concurrency: {
    runner: { concurrency: 10 }  // Batch-only limit
  }
});

// Run batches in parallel without global bottleneck
const [result1, result2, result3] = await Promise.all([
  client.batch(batch1, { concurrency: 10 }),
  client.batch(batch2, { concurrency: 10 }),
  client.batch(batch3, { concurrency: 10 })
]);

// Total: 30 concurrent requests (10 from each batch)
```

## Rate Limiting

### Basic Rate Limiting

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    max: 50,                    // Max 50 concurrent
    requestsPerInterval: 100,   // Start max 100 req/sec
    interval: 1000
  }
});

const requests = Array.from({ length: 1000 }, (_, i) => ({
  path: `/items/${i}`
}));

await client.batch(requests);
// Spreads starts over 10 seconds (100 starts/sec)
```

### Per-API Rate Limiting

```typescript
// Respect GitHub API rate limit (5000 req/hour)
const client = createClient({
  baseUrl: 'https://api.github.com',
  concurrency: {
    max: 10,
    requestsPerInterval: 83,    // ~5000/hour = 83/min
    interval: 60000              // 1 minute
  }
});
```

## Multi-Domain Batches

### Per-Domain Connection Pooling

```typescript
const client = createClient({
  baseUrl: 'https://example.com',
  concurrency: {
    max: 30,
    agent: {
      perDomainPooling: true  // Separate pools per domain
    }
  }
});

const requests = [
  { path: 'https://api1.com/data' },
  { path: 'https://api2.com/data' },
  { path: 'https://api3.com/data' },
  { path: 'https://api1.com/more' },
  { path: 'https://api2.com/more' },
  { path: 'https://api3.com/more' }
];

await client.batch(requests);
// Each domain gets its own connection pool
// api1.com won't block api2.com or api3.com
```

### Web Scraping Multiple Sites

```typescript
const client = createClient({
  concurrency: {
    runner: { concurrency: 20 },  // Each batch: 20 concurrent
    agent: {
      perDomainPooling: true
    }
  }
});

const siteA = Array.from({ length: 100 }, (_, i) => ({
  path: `https://site-a.com/page/${i}`
}));

const siteB = Array.from({ length: 100 }, (_, i) => ({
  path: `https://site-b.com/page/${i}`
}));

// Scrape both sites in parallel (40 concurrent total)
const [resultsA, resultsB] = await Promise.all([
  client.batch(siteA, { concurrency: 20 }),
  client.batch(siteB, { concurrency: 20 })
]);
```

## Error Handling

### Individual Errors

```typescript
const { results } = await client.batch([
  { path: '/users/1' },
  { path: '/users/invalid' },  // Will fail
  { path: '/users/2' }
]);

results.forEach((result, index) => {
  if (result instanceof Error) {
    console.error(`Request ${index} failed:`, result.message);
  } else {
    console.log(`Request ${index} succeeded:`, result.status);
  }
});
```

### Filter Successful Results

```typescript
const { results } = await client.batch(requests, {
  mapResponse: (res) => res.json()
});

const successful = results.filter(r => !(r instanceof Error));
const failed = results.filter(r => r instanceof Error);

console.log(`Success: ${successful.length}, Failed: ${failed.length}`);
```

### Retry Failed Requests

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    runner: {
      concurrency: 10,
      retries: 3,          // Retry failed requests
      retryDelay: 1000
    }
  }
});

const { results, stats } = await client.batch(requests);
// Failed requests automatically retried 3 times
```

## Advanced Usage

### Priority Queue (Coming Soon)

```typescript
const { results } = await client.batch([
  { path: '/high-priority', priority: 10 },
  { path: '/normal', priority: 5 },
  { path: '/low-priority', priority: 1 }
]);
// Higher priority requests execute first
```

### Custom Retry Logic

```typescript
const client = createClient({
  concurrency: {
    runner: {
      concurrency: 10,
      retries: 3,
      retryDelay: 1000
    }
  }
});

// Automatic retry on failure with exponential backoff
const { results } = await client.batch(requests);
```

### HTTP/2 Optimization

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  http2: {
    enabled: true,
    maxConcurrentStreams: 100
  },
  concurrency: {
    max: 200,
    agent: {
      connections: 'auto'  // Auto = ceil(200/100) = 2 connections
    }
  }
});

// 200 concurrent requests using only 2 TCP connections!
await client.batch(requests);
```

## Performance Optimization

### Auto-Optimized Connections

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    max: 50,
    agent: {
      connections: 'auto',  // Auto-calculated based on concurrency
      keepAlive: true,
      keepAliveTimeout: 4000
    }
  }
});

// HTTP/1.1: ~25 connections (max / 2)
// HTTP/2: ~1 connection (max / maxStreams)
```

### Smart Pipelining

For large batches, Recker automatically enables HTTP/1.1 pipelining:

```typescript
const client = createClient({
  concurrency: 100
});

// Automatically enables pipelining for batches > 20 requests
await client.batch(largeDataset);
```

## Stats & Monitoring

### Basic Stats

```typescript
const { stats } = await client.batch(requests);

console.log(stats);
// {
//   total: 100,
//   successful: 95,
//   failed: 5,
//   duration: 2345  // milliseconds
// }
```

### Progress Tracking (Coming Soon)

```typescript
const { results } = await client.batch(requests, {
  onProgress: (progress) => {
    console.log(`${progress.completed}/${progress.total}`);
    console.log(`Success rate: ${progress.successRate}%`);
  }
});
```

## Real-World Examples

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

### Data Export

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: 20
});

const requests = Array.from({ length: 100 }, (_, i) => ({
  path: `/export/page/${i + 1}`
}));

const { results } = await client.batch(requests, {
  mapResponse: async (res) => res.json()
});

const data = results
  .filter(r => !(r instanceof Error))
  .flatMap(page => page.data);

console.log(`Exported ${data.length} records`);
```

### Health Checks

```typescript
const client = createClient({
  concurrency: 10
});

const services = [
  'https://api1.com/health',
  'https://api2.com/health',
  'https://api3.com/health',
  'https://api4.com/health',
  'https://api5.com/health'
];

const requests = services.map(url => ({ path: url }));

const { results } = await client.batch(requests);

const status = results.map((result, i) => ({
  service: services[i],
  healthy: !(result instanceof Error) && result.ok
}));

console.table(status);
```

## Best Practices

### 1. Start Conservative

```typescript
// Start with low concurrency and increase based on API capacity
const client = createClient({
  concurrency: 10
});

// Monitor and adjust based on error rates
```

### 2. Use Rate Limiting

```typescript
// Always respect API rate limits
const client = createClient({
  concurrency: {
    max: 50,
    requestsPerInterval: 100,  // Based on API limits
    interval: 1000
  }
});
```

### 3. Enable Per-Domain Pooling

```typescript
// For multi-domain batches, always enable per-domain pooling
const client = createClient({
  concurrency: {
    max: 20,
    agent: {
      perDomainPooling: true
    }
  }
});
```

### 4. Use Batch-Only for Multiple Batches

```typescript
// When running multiple batches in parallel, use batch-only mode
const client = createClient({
  concurrency: {
    runner: { concurrency: 10 }  // No global limit
  }
});
```

### 5. Transform Responses

```typescript
// Always use mapResponse to reduce memory usage
const { results } = await client.batch(requests, {
  mapResponse: async (res) => {
    const data = await res.json();
    return { id: data.id, name: data.name };  // Only keep what you need
  }
});
```

## See Also

- [Unified Concurrency](./concurrency.md) - Deep dive into concurrency architecture
- [Connection Pooling](./connection-pooling.md) - TCP connection management
- [Observability](./observability.md) - Monitor performance in production
