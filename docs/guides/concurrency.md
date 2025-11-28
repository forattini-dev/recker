# Unified Concurrency Control

Recker provides a **unified concurrency system** that coordinates request dispatch, rate limiting, and connection pooling through a single, intuitive API.

## Global vs Local Concurrency

**Key Concept**: Recker distinguishes between **global limits** and **batch-local limits**:

- **Global limit** (`max`) - Total concurrent requests across ALL operations
- **Batch limit** (`runner.concurrency`) - Per-batch concurrency only

### When to use Global vs Local

**Global limit** - Use when you want to limit TOTAL concurrent requests:
```typescript
concurrency: 20  // Max 20 concurrent across everything
```

**Batch-only limit** - Use when you want multiple batches in parallel:
```typescript
concurrency: {
  runner: { concurrency: 10 }  // Each batch max 10, no global limit
}

// Now you can run 3 batches in parallel
await Promise.all([
  client.batch(req1, { concurrency: 10 }),  // 10 concurrent
  client.batch(req2, { concurrency: 10 }),  // 10 concurrent
  client.batch(req3, { concurrency: 10 })   // 10 concurrent
]);
// Result: 30 total concurrent requests (10 from each batch)
```

## Quick Start

### Simple Usage - Global Limit

```typescript
import { createClient } from 'recker';

// One number sets global limit
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: 20  // Max 20 concurrent requests globally
});

// All requests respect global concurrency
await client.get('/users');

// Batch operations also limited to 20 total
await client.batch(requests);
```

### Batch-Only Limit (No Global Bottleneck)

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    runner: { concurrency: 10 }  // Batch limit only
  }
});

// No global limit - can run unlimited requests in parallel
// But each batch is limited to 10 concurrent
await Promise.all([
  client.batch(requests1, { concurrency: 10 }),
  client.batch(requests2, { concurrency: 10 }),
  client.batch(requests3, { concurrency: 10 })
]);
// Result: 30 concurrent requests (not limited globally)
```

### Advanced Configuration

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    max: 20,                    // Max concurrent requests
    requestsPerInterval: 100,   // Rate limiting: 100 req/sec
    interval: 1000,

    // Advanced: Auto-calculated by default
    agent: {
      connections: 'auto',      // Auto = 10 (max/2 for HTTP/1.1)
      perDomainPooling: true    // Separate pools per domain
    }
  }
});
```

## Architecture Overview

Recker's concurrency system has **three coordinated layers**:

```
┌────────────────────────────────────────────┐
│  1. RequestPool (Global Middleware)       │
│     - Max concurrent requests across ALL   │
│     - Rate limiting (requests/interval)    │
│     - Applies to every request             │
└─────────────────┬──────────────────────────┘
                  ↓
┌────────────────────────────────────────────┐
│  2. RequestRunner (Batch Control)         │
│     - Batch-specific dispatch rate         │
│     - Prevents promise explosion           │
│     - Can override global concurrency      │
└─────────────────┬──────────────────────────┘
                  ↓
┌────────────────────────────────────────────┐
│  3. AgentManager (Connection Pooling)     │
│     - TCP connection reuse                 │
│     - Per-domain connection pools          │
│     - Auto-calculated from concurrency     │
└────────────────────────────────────────────┘
```

## Configuration Options

### ConcurrencyConfig Interface

```typescript
interface ConcurrencyConfig {
  // Simple: Max concurrent requests
  max?: number;                    // Default: 10

  // Rate limiting
  requestsPerInterval?: number;    // Default: Infinity (no limit)
  interval?: number;               // Default: 1000ms

  // Advanced overrides (usually not needed)
  runner?: {
    concurrency?: number;          // Batch runner (default: uses 'max')
    retries?: number;
    retryDelay?: number;
  };

  agent?: {
    connections?: number | 'auto'; // TCP connections ('auto' recommended)
    pipelining?: number;
    keepAlive?: boolean;
    keepAliveTimeout?: number;
    perDomainPooling?: boolean;
  };

  http2?: {
    maxConcurrentStreams?: number | 'auto';
  };
}
```

## How It Works

### Auto-Coordination

When you set `concurrency: 20`, Recker automatically:

1. **RequestPool**: Limits to 20 max concurrent requests globally
2. **AgentManager**: Creates ~10 TCP connections (auto-calculated: `max / 2`)
3. **HTTP/2 Streams**: If enabled, uses ~100 streams per connection

### Calculation Logic

**HTTP/1.1:**
```typescript
connections = ceil(max / 2)  // ~2 requests per connection (keep-alive)
```

**HTTP/2:**
```typescript
connections = ceil(max / maxStreams)  // Many streams per connection
// Example: max=20, streams=100 → connections=1
```

### Layer Priority

```
User Request
     ↓
RequestPool Middleware
  → Checks: active < max? ✓
  → Checks: within rate limit? ✓
     ↓
RequestRunner (if batch)
  → Checks: batch active < batch concurrency? ✓
     ↓
Transport + AgentManager
  → Reuses existing connection if available
  → Or creates new connection (up to limit)
     ↓
Transport → Network
```

## Use Cases

### 1. Global Limit Across Everything

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: 10  // Global limit: max 10 concurrent total
});

// All requests respect this limit
await Promise.all([
  client.get('/users/1'),
  client.get('/users/2'),
  // ... 100 more requests
]);
// Result: Max 10 executing at once, rest queued

// Even multiple batches are limited to 10 total
await Promise.all([
  client.batch(req1),  // All batches combined: max 10
  client.batch(req2),
  client.batch(req3)
]);
```

### 1b. Batch-Only Limit (Multiple Batches in Parallel)

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    runner: { concurrency: 10 }  // Only batch limit, no global
  }
});

// Each batch limited to 10, but can run multiple batches
await Promise.all([
  client.batch(req1, { concurrency: 10 }),  // 10 concurrent
  client.batch(req2, { concurrency: 10 }),  // 10 concurrent
  client.batch(req3, { concurrency: 10 })   // 10 concurrent
]);
// Result: 30 concurrent total (10 from each batch)

// Use case: Web scraping multiple sites in parallel
await Promise.all([
  client.batch(sitesA, { concurrency: 20 }),  // Site A: 20 concurrent
  client.batch(sitesB, { concurrency: 20 }),  // Site B: 20 concurrent
  client.batch(sitesC, { concurrency: 20 })   // Site C: 20 concurrent
]);
// Total: 60 concurrent requests across all sites
```

### 2. Rate Limiting

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    max: 50,               // Max 50 concurrent
    requestsPerInterval: 100,  // But only start 100/sec
    interval: 1000
  }
});

// Prevents overwhelming rate-limited APIs
const requests = Array.from({ length: 1000 }, (_, i) => ({ path: `/items/${i}` }));
await client.batch(requests);
// Result: Spreads load over 10 seconds (100 starts/sec)
```

### 3. Multi-Domain Batch

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    max: 20,
    agent: {
      perDomainPooling: true  // Critical for multi-domain!
    }
  }
});

const requests = [
  { path: 'https://api1.com/data' },
  { path: 'https://api2.com/data' },
  { path: 'https://api3.com/data' }
];

await client.batch(requests);
// Result: Separate connection pools per domain
// api1.com won't block api2.com
```

### 4. Batch-Specific Override

```typescript
const client = createClient({
  concurrency: 10  // Conservative global default
});

// Normal requests: max 10 concurrent
await client.get('/users');

// Large batch: override to 100
await client.batch(largeDataset, { concurrency: 100 });

// Back to 10 for subsequent requests
await client.get('/posts');
```

### 5. HTTP/2 Optimization

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

## Advanced: Granular Overrides

For expert users who need fine-grained control:

```typescript
const client = createClient({
  concurrency: {
    max: 50,

    // Override batch runner behavior
    runner: {
      concurrency: 30,  // Batch dispatch limited to 30
      retries: 3,
      retryDelay: 1000
    },

    // Override connection pool manually
    agent: {
      connections: 25,  // Force 25 connections (not auto)
      pipelining: 2,    // HTTP/1.1 pipelining
      keepAlive: true,
      perDomainPooling: true
    },

    // Override HTTP/2 streams
    http2: {
      maxConcurrentStreams: 200
    }
  }
});
```

**Execution Flow:**
```
1. RequestPool: max 50 concurrent globally
2. Batch Runner: max 30 dispatched at once
3. Agent: uses 25 TCP connections
4. HTTP/2: 200 streams per connection
```

## Migration from Legacy Config

### Before (Deprecated)

```typescript
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
```

### After (Recommended)

```typescript
const client = createClient({
  concurrency: {
    max: 10,
    requestsPerInterval: 100,
    interval: 1000,
    agent: {
      connections: 'auto',  // Or keep 20 if you want
      keepAlive: true
    }
  }
});
```

**Backward Compatibility**: Old format still works but shows deprecation warning in debug mode.

## Performance Tips

### 1. **Start with Simple Config**
```typescript
// Good
concurrency: 20

// Over-engineering
concurrency: {
  max: 20,
  runner: { concurrency: 18 },
  agent: { connections: 12, pipelining: 2 },
  http2: { maxConcurrentStreams: 150 }
}
```

### 2. **Use 'auto' for Connections**
Let Recker calculate optimal connections based on your concurrency and HTTP version.

```typescript
agent: { connections: 'auto' }  // ✓ Recommended
agent: { connections: 50 }       // ✗ Manual tuning usually unnecessary
```

### 3. **Match Concurrency to Server Capacity**
```typescript
// For APIs with rate limits
concurrency: {
  max: 10,                   // Conservative
  requestsPerInterval: 60,   // 60 req/min
  interval: 60000
}

// For high-performance APIs
concurrency: {
  max: 100,
  agent: { connections: 'auto' }  // Auto = 50
}
```

### 4. **Enable Per-Domain Pooling for Multi-Domain**
```typescript
// Always enable for multi-domain batches
agent: { perDomainPooling: true }
```

### 5. **Use HTTP/2 When Available**
```typescript
http2: { enabled: true },
concurrency: {
  max: 200,
  agent: { connections: 'auto' }  // Will use ~2 connections with 100 streams each
}
```

## Debugging Concurrency

### Enable Debug Mode

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: 20,
  debug: true  // Shows concurrency decisions
});
```

**Output:**
```
[Recker] Concurrency config: max=20, connections=10 (auto), perDomain=true
[Recker] Request → GET /users/1 (active: 5/20, queue: 0)
[Recker] Request → GET /users/2 (active: 6/20, queue: 0)
[Recker] Request complete ← GET /users/1 (active: 5/20)
```

### Check AgentManager Stats

```typescript
const stats = client.agentManager?.getStats();
console.log(stats);
// {
//   agentCount: 3,  // global + 2 domains
//   domains: ['api1.com', 'api2.com'],
//   totalConnections: 30  // 10 per agent
// }
```

## Troubleshooting

### Issue: Requests timing out

**Cause**: Global concurrency too low, requests queued too long

**Solution**: Increase max concurrency
```typescript
concurrency: { max: 50 }  // Increase from default 10
```

### Issue: "Too many open connections" errors

**Cause**: Agent connections set too high

**Solution**: Use 'auto' or reduce manually
```typescript
agent: { connections: 'auto' }  // Let Recker calculate
// or
agent: { connections: 10 }  // Manual limit
```

### Issue: Batch slower than expected

**Cause**: Batch concurrency limited by global

**Solution**: Override batch concurrency
```typescript
await client.batch(requests, { concurrency: 100 });  // Higher than global
```

### Issue: Multi-domain batch blocking

**Cause**: Per-domain pooling disabled

**Solution**: Enable per-domain pooling
```typescript
agent: { perDomainPooling: true }
```

## See Also

- [Connection Pooling Guide](/guides/performance/connection-pooling.md) - Deep dive into Agent
- [Batch Requests Guide](/guides/performance/batch-requests.md) - Batch operation patterns
- [Observability](/guides/observability/observability.md) - Monitor concurrency in production
