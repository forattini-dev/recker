# Advanced Configuration

> Retry logic, circuit breakers, concurrency control, compression, and other advanced features.

## Table of Contents

- [Retry Configuration](#retry-configuration)
- [Circuit Breaker](#circuit-breaker)
- [Concurrency Control](#concurrency-control)
- [Compression](#compression)
- [Caching](#caching)
- [Rate Limiting](#rate-limiting)

## Retry Configuration

Configure intelligent retry behavior for failed requests:

### Basic Retry Setup

```typescript
const client = recker({
  retry: {
    maxAttempts: 3,        // Try up to 3 times
    delay: 100,            // Start with 100ms delay
    factor: 2,             // Double delay each attempt (100ms, 200ms, 400ms)
    maxDelay: 10000,       // Cap at 10 seconds
    jitter: true           // Add randomization to prevent thundering herd
  }
})
```

### Method-Specific Retry

By default, only idempotent methods retry (GET, HEAD, OPTIONS, PUT, DELETE):

```typescript
const client = recker({
  retry: {
    maxAttempts: 3,
    methods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']  // Default
  }
})

// Include POST (use with caution - ensure idempotency!)
const client = recker({
  retry: {
    maxAttempts: 3,
    methods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'POST']
  }
})
```

### Status Code Retry

Choose which status codes trigger retries:

```typescript
const client = recker({
  retry: {
    maxAttempts: 3,
    statusCodes: [
      408,  // Request Timeout
      413,  // Payload Too Large
      429,  // Too Many Requests
      500,  // Internal Server Error
      502,  // Bad Gateway
      503,  // Service Unavailable
      504   // Gateway Timeout
    ]
  }
})

// Only retry rate limits
const client = recker({
  retry: {
    maxAttempts: 5,
    statusCodes: [429],
    delay: 5000  // Wait 5s between attempts
  }
})
```

### Retry Callbacks

Get notified on each retry attempt:

```typescript
const client = recker({
  retry: {
    maxAttempts: 3,
    onRetry: (error, attempt) => {
      console.log(`Retry ${attempt}/${3}:`, error.message)

      // Log to monitoring service
      metrics.increment('http.retry', {
        url: error.request.url,
        status: error.status,
        attempt
      })
    }
  }
})
```

### Exponential Backoff Explained

```typescript
// With factor=2, delay=100, maxDelay=10000:
// Attempt 1: fails, wait 100ms
// Attempt 2: fails, wait 200ms  (100 * 2)
// Attempt 3: fails, wait 400ms  (200 * 2)
// Attempt 4: fails, wait 800ms  (400 * 2)
// Attempt 5: fails, wait 1600ms (800 * 2)
// ...
// Max wait: 10000ms (capped by maxDelay)

// With jitter=true, actual delays vary ±25%:
// Attempt 1: 75-125ms
// Attempt 2: 150-250ms
// Attempt 3: 300-500ms
```

### Disable Retry

```typescript
// Globally disable
const client = recker({
  retry: false
})

// Disable for specific request
await client.post('/critical', {
  json: data,
  retry: false
})
```

**Related:** [Retry Guide](/guides/advanced/retry.md) | [Error Handling](/guides/basics/error-handling.md)

## Circuit Breaker

Prevent cascading failures by "opening" the circuit after too many errors:

### Basic Circuit Breaker

```typescript
const client = recker({
  circuitBreaker: {
    threshold: 5,        // Open after 5 consecutive failures
    timeout: 60000,      // Try recovery after 60 seconds
    resetTimeout: 30000  // Back to closed after 30 seconds of success
  }
})
```

### Circuit States

```
┌─────────┐  failures ≥ threshold   ┌──────┐
│ CLOSED  │ ────────────────────────→ │ OPEN │
│ (normal)│                           │(fails)│
└─────────┘                           └──────┘
     ↑                                   │
     │                                   │ timeout elapsed
     │                                   ↓
     │                              ┌─────────┐
     │         success              │ HALF-   │
     └──────────────────────────────│ OPEN    │
                                    │(testing)│
                                    └─────────┘
```

- **CLOSED** - Normal operation, requests flow through
- **OPEN** - Too many failures, requests fail immediately without trying
- **HALF-OPEN** - Testing recovery, limited requests allowed

### State Change Callbacks

```typescript
const client = recker({
  circuitBreaker: {
    threshold: 5,
    timeout: 60000,
    onStateChange: (from, to) => {
      console.log(`Circuit breaker: ${from} → ${to}`)

      if (to === 'open') {
        // Alert operations team
        alerting.send('Circuit breaker opened for API')
      } else if (to === 'closed') {
        // Service recovered
        alerting.send('Circuit breaker closed - service recovered')
      }
    }
  }
})
```

### Per-Endpoint Circuit Breakers

```typescript
// Different thresholds for different services
const userClient = recker({
  baseUrl: 'https://user-api.example.com',
  circuitBreaker: { threshold: 10 }  // More lenient
})

const paymentClient = recker({
  baseUrl: 'https://payment-api.example.com',
  circuitBreaker: { threshold: 3 }   // Stricter
})
```

### Combining with Retry

Circuit breaker activates *after* retries are exhausted:

```typescript
const client = recker({
  retry: {
    maxAttempts: 3       // Try 3 times per request
  },
  circuitBreaker: {
    threshold: 5         // Open after 5 failed requests (after retries)
  }
})

// Each request gets 3 attempts
// After 5 requests fail (each tried 3 times), circuit opens
```

**Related:** [Circuit Breaker Guide](/guides/advanced/circuit-breaker.md)

## Concurrency Control

Limit how many requests run simultaneously:

### Basic Concurrency Limit

```typescript
const client = recker({
  concurrency: {
    max: 10              // Only 10 requests at a time
  }
})

// Requests 1-10 run immediately
// Requests 11+ wait in queue
const results = await Promise.all([
  client.get('/api/1'),
  client.get('/api/2'),
  // ... 20 total requests
])
```

### Queue Configuration

```typescript
const client = recker({
  concurrency: {
    max: 5,               // 5 concurrent requests
    queue: 100,           // Queue up to 100 waiting requests
    queueBehavior: 'fifo' // First in, first out (default)
    // queueBehavior: 'lifo' // Last in, first out (stack)
  }
})
```

### Queue Callbacks

```typescript
const client = recker({
  concurrency: {
    max: 5,
    onQueue: (request) => {
      console.log(`Queued: ${request.url}`)
    },
    onDequeue: (request) => {
      console.log(`Starting: ${request.url}`)
    }
  }
})
```

### Respecting Rate Limits

```typescript
// Limit to 100 requests per minute
const client = recker({
  concurrency: {
    max: 2,              // Only 2 at a time
    interval: 60000,     // Per 60 seconds
    limit: 100           // Max 100 requests
  }
})
```

### Priority Queues

```typescript
// Higher priority = processed first
await client.get('/critical', {
  priority: 10
})

await client.get('/normal', {
  priority: 5
})

await client.get('/background', {
  priority: 1
})
```

**Related:** [Concurrency Guide](/guides/performance/concurrency.md) | [Batch Requests](/guides/performance/batch-requests.md)

## Compression

Automatically compress request/response bodies:

### Enable Compression

```typescript
const client = recker({
  compression: true    // Default: gzip
})

// Or configure algorithm
const client = recker({
  compression: {
    encoding: 'br'     // brotli (best compression)
    // encoding: 'gzip'   // gzip (good balance)
    // encoding: 'deflate' // deflate (fastest)
  }
})
```

### Compression Thresholds

```typescript
const client = recker({
  compression: {
    encoding: 'gzip',
    threshold: 1024,     // Only compress if body > 1KB
    level: 6            // Compression level 0-9 (default: 6)
  }
})
```

### Content-Type Filtering

```typescript
const client = recker({
  compression: {
    contentTypes: [
      'application/json',
      'application/xml',
      'text/*'
    ]
  }
})
```

### Request vs Response Compression

```typescript
const client = recker({
  compression: {
    request: true,      // Compress outgoing requests
    response: true      // Accept compressed responses
  }
})
```

**Related:** [Compression Guide](/guides/performance/compression.md)

## Caching

HTTP-compliant caching with ETags and Cache-Control:

### Enable Caching

```typescript
import { cache } from 'recker/plugins'

const client = recker({
  plugins: [
    cache({
      ttl: 300000,          // 5 minutes default TTL
      maxSize: 100,         // Max 100 cached responses
      respectCacheHeaders: true  // Honor Cache-Control
    })
  ]
})
```

### Cache Strategies

```typescript
// Cache first (use cache if available, even if stale)
cache({
  strategy: 'cache-first'
})

// Network first (try network, fallback to cache)
cache({
  strategy: 'network-first'
})

// Cache only (never hit network for cached items)
cache({
  strategy: 'cache-only'
})

// Network only (always bypass cache)
cache({
  strategy: 'network-only'
})

// Stale while revalidate (return cache, refresh in background)
cache({
  strategy: 'stale-while-revalidate'
})
```

### Per-Request Cache Control

```typescript
// Use cache for this request
await client.get('/users', {
  cache: true
})

// Bypass cache for this request
await client.get('/users', {
  cache: false
})

// Force revalidation
await client.get('/users', {
  cache: 'reload'
})
```

### ETags

```typescript
// First request
const response = await client.get('/resource')
const etag = response.headers.get('ETag')

// Subsequent request with If-None-Match
const response2 = await client.get('/resource', {
  headers: {
    'If-None-Match': etag
  }
})

if (response2.status === 304) {
  console.log('Not modified, use cached version')
}
```

**Related:** [Caching Guide](/guides/performance/caching.md)

## Rate Limiting

Respect API rate limits automatically:

### Detect Rate Limits

```typescript
const response = await client.get('/api')

// Recker automatically parses rate limit headers
console.log(response.headers.rateLimit)
// {
//   limit: 1000,
//   remaining: 999,
//   reset: 1234567890,
//   resetDate: Date(...)
// }
```

### Auto-Backoff on Rate Limit

```typescript
const client = recker({
  retry: {
    maxAttempts: 3,
    statusCodes: [429],   // Retry on rate limit
    respectRetryAfter: true,  // Honor Retry-After header
    onRetry: (error, attempt) => {
      const retryAfter = error.response?.headers.get('Retry-After')
      console.log(`Rate limited. Retry after: ${retryAfter}s`)
    }
  }
})
```

### Manual Rate Limiting

```typescript
import { RateLimiter } from 'recker/utils'

const limiter = new RateLimiter({
  max: 100,            // 100 requests
  interval: 60000      // per minute
})

await limiter.wait()   // Wait if limit exceeded
await client.get('/api')
```

**Related:** [Rate Limits Guide](/guides/observability/rate-limits.md) | [Concurrency Control](#concurrency-control)

## Next Steps

- **Basic configuration** → [Client Options](/configuration/client-options.md)
- **Request options** → [Request Options](/configuration/request-options.md)
- **TypeScript setup** → [TypeScript Configuration](/configuration/typescript.md)
- **Advanced guides** → [Guides](/guides/README.md)
- **Back to overview** → [Configuration Quick Reference](/configuration/quick-reference.md)
