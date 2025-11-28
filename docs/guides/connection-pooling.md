# Connection Pooling

Recker provides intelligent connection pooling for optimal HTTP performance.

## Overview

Connection pooling reuses TCP connections across multiple requests, avoiding the overhead of:
- DNS lookups
- TCP handshakes
- TLS/SSL negotiations

This results in **significant performance improvements**, especially for:
- **Batch requests** to the same API
- **High-frequency** API calls
- **Multi-domain** operations

## Quick Start

```typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  agent: true  // Enable with smart defaults
});

// All requests now benefit from connection pooling
const response = await client.get('/users');
```

## Configuration

### Basic Configuration

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  agent: {
    connections: 20,           // Max concurrent connections per domain (default: 10)
    keepAlive: true,           // Reuse connections (default: true)
    keepAliveTimeout: 4000,    // Keep-alive timeout in ms (default: 4000)
    connectTimeout: 10000,     // Connection timeout in ms (default: 10000)
    perDomainPooling: true     // Separate pools per domain (default: true)
  }
});
```

### Advanced Configuration for High-Performance Scenarios

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  agent: {
    connections: 50,           // Higher limit for large batches
    keepAlive: true,
    keepAliveTimeout: 10000,   // Longer keep-alive for sustained traffic
    perDomainPooling: true     // Critical for multi-domain batches
  }
});
```

## Per-Domain Connection Pooling

When `perDomainPooling: true` (default), Recker creates separate connection pools for each domain:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  agent: { perDomainPooling: true }
});

// These requests use separate connection pools:
await client.get('https://api.service1.com/data');  // Pool 1
await client.get('https://api.service2.com/data');  // Pool 2
await client.get('https://cdn.example.com/assets'); // Pool 3
```

**Benefits:**
- **No cross-domain blocking** - Slow responses from one domain don't affect others
- **Optimal throughput** - Each domain gets its own connection pool
- **Better resource utilization**

## Batch Operations with Connection Pooling

Connection pooling shines in batch operations:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  agent: {
    connections: 30,
    keepAlive: true,
    perDomainPooling: true
  }
});

// Fetch 100 users with connection reuse
const requests = Array.from({ length: 100 }, (_, i) => ({
  path: `/users/${i + 1}`
}));

const { results, stats } = await client.batch(requests, {
  concurrency: 20  // 20 concurrent requests, reusing connections
});

console.log(`Processed ${stats.total} requests in ${stats.duration}ms`);
// Expected: ~2-3x faster than without connection pooling
```

### Multi-Domain Batch with Per-Domain Pooling

```typescript
const requests = [
  { path: 'https://api.github.com/users/1' },
  { path: 'https://api.github.com/users/2' },
  { path: 'https://api.twitter.com/tweets/1' },
  { path: 'https://api.twitter.com/tweets/2' }
];

// Separate pools for GitHub and Twitter
const { results } = await client.batch(requests, {
  concurrency: 10
});

// Each domain maintains its own connection pool
// GitHub requests reuse GitHub connections
// Twitter requests reuse Twitter connections
```

## HTTP/2 and Connection Pooling

When combined with HTTP/2, connection pooling becomes even more powerful:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  http2: {
    enabled: true,
    maxConcurrentStreams: 100
  },
  agent: {
    connections: 10,  // Fewer connections needed with HTTP/2
    keepAlive: true
  }
});

// HTTP/2 multiplexing + connection pooling = maximum throughput
const requests = Array.from({ length: 200 }, (_, i) => ({
  path: `/users/${i}`
}));

const { results } = await client.batch(requests, {
  concurrency: 50  // 50 concurrent streams on reused HTTP/2 connections
});
```

**How it works:**
- HTTP/2 allows **multiple streams** on a single connection
- Connection pooling **reuses** these multiplexed connections
- Result: **Fewer connections, higher throughput**

## Performance Benchmarks

### Without Connection Pooling
```
100 requests x ~50ms handshake + ~20ms request = ~7000ms total
```

### With Connection Pooling
```
1st request: ~50ms handshake + ~20ms request = ~70ms
99 requests: ~20ms request each = ~1980ms
Total: ~2050ms (3.4x faster!)
```

### With HTTP/2 + Connection Pooling
```
1st request: ~50ms handshake + ~20ms request = ~70ms
99 requests: ~15ms request each (multiplexed) = ~1485ms
Total: ~1555ms (4.5x faster!)
```

## Connection Pool Lifecycle

### Automatic Cleanup

Connections are automatically closed when:
- Keep-alive timeout expires
- Client is garbage collected
- Response indicates connection close

### Manual Cleanup

```typescript
// Close all connections (not needed in most cases)
// AgentManager handles cleanup automatically

// If you create multiple clients and need explicit cleanup:
const client = createClient({
  baseUrl: 'https://api.example.com',
  agent: true
});

// ... use client ...

// Not exposed publicly - handled internally
// Connections auto-close on keep-alive timeout
```

## Best Practices

### 1. **Enable for High-Throughput APIs**
```typescript
// Good: Enable agent for batch operations
const client = createClient({
  baseUrl: 'https://api.example.com',
  agent: { connections: 30 }
});

await client.batch(requests, { concurrency: 20 });
```

### 2. **Tune Connection Limits**
```typescript
// Match connection limit to concurrency
const client = createClient({
  baseUrl: 'https://api.example.com',
  agent: {
    connections: Math.ceil(expectedConcurrency / 2)  // ~2 requests per connection
  }
});
```

### 3. **Use Per-Domain Pooling for Multi-Domain Batches**
```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  agent: {
    perDomainPooling: true,  // Critical for multi-domain
    connections: 20           // Per domain
  }
});
```

### 4. **Combine with HTTP/2 for Maximum Performance**
```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  http2: { enabled: true, maxConcurrentStreams: 100 },
  agent: { connections: 10, keepAlive: true }
});
```

### 5. **Set Appropriate Timeouts**
```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  agent: {
    keepAliveTimeout: 10000,  // 10s for sustained traffic
    connectTimeout: 5000       // 5s connect timeout
  }
});
```

## Troubleshooting

### Issue: "ECONNRESET" or "socket hang up" errors

**Cause:** Keep-alive timeout too long, server closes connection first

**Solution:** Reduce keep-alive timeout
```typescript
agent: {
  keepAliveTimeout: 2000  // Shorter timeout
}
```

### Issue: Poor performance with multiple domains

**Cause:** Per-domain pooling disabled

**Solution:** Enable per-domain pooling
```typescript
agent: {
  perDomainPooling: true
}
```

### Issue: Too many open connections

**Cause:** Connection limit too high

**Solution:** Reduce connection limit
```typescript
agent: {
  connections: 10  // Lower limit
}
```

## Advanced: Internal Architecture

### AgentManager

Recker uses `AgentManager` internally to:
1. **Create global shared agent** for same-domain requests
2. **Create per-domain agents** for multi-domain batches
3. **Auto-configure connection pools** based on concurrency
4. **Manage agent lifecycle** (creation, reuse, cleanup)

### Connection Pool Selection

```
Request → UndiciTransport → AgentManager
                              ↓
                     getAgentForUrl(url)
                              ↓
                   ┌──────────┴──────────┐
                   ↓                      ↓
         Per-Domain Agent         Global Agent
         (if perDomainPooling)    (if same domain)
```

### Batch Optimization

For batch operations, `AgentManager` automatically:
- **Analyzes domains** in the batch
- **Creates optimized pools** per domain
- **Reuses connections** within each pool

## See Also

- [Batch Requests Guide](/guides/performance/batch-requests.md) - Batch operations with connection pooling
- [HTTP/2 Guide](/guides/client-config.md#http2-configuration) - HTTP/2 configuration
- [Observability](/guides/observability/observability.md) - Monitor connection reuse
