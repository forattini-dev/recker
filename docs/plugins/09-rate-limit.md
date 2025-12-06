# Rate Limit Plugin

The **Rate Limit** plugin controls the rate of outgoing requests using a Token Bucket algorithm. Essential for adhering to API rate limits and preventing 429 errors.

## Quick Start

```typescript
import { createClient, rateLimitPlugin } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

// 100 requests per second
client.use(rateLimitPlugin({
  limit: 100,
  window: 1000  // 1 second
}));
```

## How It Works

The plugin uses a **Token Bucket** algorithm:

1. A bucket starts with `limit` tokens
2. Each request consumes one token
3. Tokens refill at the start of each window
4. When empty, requests either queue, throw, or drop

```
Time ──────────────────────────────────────────────────────────►
      │         Window 1         │         Window 2         │
      ├─────────────────────────┼─────────────────────────┤
      │ ████████░░ 8/10 tokens  │ ██████████ 10/10 refill │
      │                         │                          │
      │ Request 9 ✓ (1 token)   │ Request 11 ✓             │
      │ Request 10 ✓ (0 tokens) │ Request 12 ✓             │
      │ Request 11 → queued     │                          │
```

## Configuration

```typescript
interface RateLimitOptions {
  /**
   * Maximum requests per window
   */
  limit: number;

  /**
   * Window duration in milliseconds
   * @default 1000 (1 second)
   */
  window?: number;

  /**
   * Strategy when limit is exceeded:
   * - 'queue': Wait until a token is available (default)
   * - 'throw': Throw RateLimitExceededError immediately
   * - 'drop': Silently drop the request (dangerous!)
   * @default 'queue'
   */
  strategy?: 'queue' | 'throw' | 'drop';

  /**
   * Function to generate a key for rate limiting groups.
   * Allows per-host, per-endpoint, or custom bucketing.
   * @default Per hostname
   */
  keyGenerator?: (req: ReckerRequest) => string;

  /**
   * Adaptive Rate Limiting
   * Automatically detect RateLimit headers (X-RateLimit-Remaining, Retry-After)
   * and pause requests when the server indicates overload.
   * @default false
   */
  adaptive?: boolean;
}
```

## Strategies

### Queue (Default)

Requests wait in a queue until a token becomes available. Best for most use cases.

```typescript
client.use(rateLimitPlugin({
  limit: 10,
  window: 1000,
  strategy: 'queue'  // default
}));

// These 15 requests complete, but 5 wait for next window
await Promise.all(
  Array(15).fill(null).map(() => client.get('/api/data'))
);
```

### Throw

Immediately throws `RateLimitExceededError` when limit is reached. Useful when you need fast failure.

```typescript
import { rateLimitPlugin, RateLimitExceededError } from 'recker';

client.use(rateLimitPlugin({
  limit: 10,
  window: 1000,
  strategy: 'throw'
}));

try {
  await client.get('/api/data');
} catch (error) {
  if (error instanceof RateLimitExceededError) {
    console.log(`Rate limited: ${error.limit} req/${error.window}ms`);
  }
}
```

### Drop

Silently drops requests that exceed the limit. **Use with caution** - requests simply fail without notification.

```typescript
client.use(rateLimitPlugin({
  limit: 10,
  window: 1000,
  strategy: 'drop'  // Requests beyond limit are silently dropped
}));
```

## Bucket Keys

By default, rate limiting is **per hostname**. Customize with `keyGenerator`:

### Global Bucket (Single Limit)

```typescript
client.use(rateLimitPlugin({
  limit: 100,
  window: 1000,
  keyGenerator: () => 'global'  // All requests share one bucket
}));
```

### Per Endpoint

```typescript
client.use(rateLimitPlugin({
  limit: 10,
  window: 1000,
  keyGenerator: (req) => {
    const url = new URL(req.url);
    return `${url.hostname}${url.pathname}`;
  }
}));
```

### Per User (from Headers)

```typescript
client.use(rateLimitPlugin({
  limit: 50,
  window: 60000,  // 50 req/min per user
  keyGenerator: (req) => {
    return req.headers.get('X-User-Id') || 'anonymous';
  }
}));
```

## Adaptive Rate Limiting

When `adaptive: true`, the plugin reads standard rate limit headers from responses:

- `X-RateLimit-Remaining` / `RateLimit-Remaining`
- `X-RateLimit-Reset` / `RateLimit-Reset`
- `Retry-After`

```typescript
client.use(rateLimitPlugin({
  limit: 100,
  window: 1000,
  adaptive: true  // Respect server's rate limit headers
}));

// If server returns X-RateLimit-Remaining: 0, Retry-After: 30
// The plugin automatically pauses for 30 seconds
```

This is especially useful for APIs with dynamic rate limits or when you want to be a good API citizen.

## Common Patterns

### GitHub API (5000 req/hour)

```typescript
const github = createClient({
  baseUrl: 'https://api.github.com',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json'
  }
});

github.use(rateLimitPlugin({
  limit: 5000,
  window: 3600000,  // 1 hour
  adaptive: true    // Respect X-RateLimit-* headers
}));
```

### Stripe API (100 req/sec)

```typescript
const stripe = createClient({
  baseUrl: 'https://api.stripe.com/v1'
});

stripe.use(rateLimitPlugin({
  limit: 100,
  window: 1000,
  strategy: 'queue'  // Queue excess requests
}));
```

### Multi-Tenant with Different Limits

```typescript
const tierLimits = {
  free: 10,
  pro: 100,
  enterprise: 1000
};

client.use(rateLimitPlugin({
  limit: 1000,  // Max limit
  window: 1000,
  keyGenerator: (req) => {
    const tier = req.headers.get('X-Tier') || 'free';
    return `tier:${tier}`;
  }
}));
```

### Burst Protection

Allow initial bursts but smooth out sustained traffic:

```typescript
// Allow 50 req instantly, then 10 req/sec sustained
const burstLimiter = rateLimitPlugin({
  limit: 10,
  window: 1000,
  strategy: 'queue'
});

// First 50 requests go through, then 10/sec after
client.use(burstLimiter);
```

## With Other Plugins

### Rate Limit + Retry

```typescript
import { rateLimitPlugin, retryPlugin } from 'recker';

// Rate limit BEFORE retry to avoid retry storms
client.use(rateLimitPlugin({ limit: 100, window: 1000 }));
client.use(retryPlugin({ maxAttempts: 3 }));
```

### Rate Limit + Circuit Breaker

```typescript
import { rateLimitPlugin, circuitBreakerPlugin } from 'recker';

// Circuit breaker first (fail fast), then rate limit
client.use(circuitBreakerPlugin({ threshold: 5 }));
client.use(rateLimitPlugin({ limit: 100, window: 1000 }));
```

## Error Handling

```typescript
import { rateLimitPlugin, RateLimitExceededError } from 'recker';

client.use(rateLimitPlugin({
  limit: 10,
  window: 1000,
  strategy: 'throw'
}));

try {
  await client.get('/api/data');
} catch (error) {
  if (error instanceof RateLimitExceededError) {
    console.log(`Rate limit: ${error.limit}/${error.window}ms`);
    console.log(`Bucket key: ${error.key}`);

    // Wait and retry
    await new Promise(r => setTimeout(r, error.window));
    await client.get('/api/data');
  }
}
```

## Performance Considerations

- **Token Bucket** is O(1) for both consume and refill operations
- **Queued requests** use minimal memory (just promise references)
- **Adaptive mode** adds minimal overhead (header parsing)
- **Multiple buckets** (per-host/per-endpoint) scale linearly with unique keys

## API Reference

### `rateLimitPlugin(options: RateLimitOptions): Plugin`

Creates a rate limiting middleware.

### `RateLimitExceededError`

Error thrown when `strategy: 'throw'` and limit is exceeded.

```typescript
class RateLimitExceededError extends Error {
  limit: number;    // The limit that was exceeded
  window: number;   // Window duration in ms
  key: string;      // Bucket key
}
```
