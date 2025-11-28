# Caching

Recker includes a robust RFC 7234-compliant HTTP cache system with support for multiple strategies, storage drivers, and advanced features like ETag revalidation and stale-while-revalidate.

## Quick Start

```typescript
import { createClient, cache, MemoryStorage } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [
    cache({
      storage: new MemoryStorage(),
      strategy: 'cache-first',
      ttl: 60_000  // 1 minute
    })
  ]
});

// First request fetches from network
const data1 = await client.get('/users').json();

// Second request returns cached response instantly
const data2 = await client.get('/users').json();
```

## Cache Strategies

### `cache-first` (Default)

Returns cached response immediately if available. Only fetches from network on cache miss.

```typescript
cache({ strategy: 'cache-first' })
```

**Best for:**
- Static content that rarely changes
- Reference data (countries, categories)
- Reducing API calls for repeated requests

```
Request Flow:
┌─────────┐     ┌───────┐     ┌─────────┐
│ Request │ ──▶ │ Cache │ ──▶ │ Return  │  (cache hit)
└─────────┘     └───────┘     └─────────┘
                    │
                    ▼ (cache miss)
               ┌─────────┐
               │ Network │
               └─────────┘
```

### `network-first`

Always tries network first. Falls back to cache only on network failure.

```typescript
cache({ strategy: 'network-first' })
```

**Best for:**
- Data that changes frequently
- User-specific content
- When freshness is more important than speed

```
Request Flow:
┌─────────┐     ┌─────────┐     ┌────────┐
│ Request │ ──▶ │ Network │ ──▶ │ Return │  (network ok)
└─────────┘     └─────────┘     └────────┘
                    │
                    ▼ (network error)
               ┌───────┐
               │ Cache │ (fallback)
               └───────┘
```

### `stale-while-revalidate`

Returns cached response immediately, then updates cache in the background.

```typescript
cache({ strategy: 'stale-while-revalidate' })
```

**Best for:**
- Balancing speed and freshness
- Dashboard data
- Lists that can be slightly stale

```
Request Flow:
┌─────────┐     ┌───────┐     ┌────────┐
│ Request │ ──▶ │ Cache │ ──▶ │ Return │  (instant)
└─────────┘     └───────┘     └────────┘
                    │
                    ▼ (background)
               ┌─────────┐
               │ Network │ ──▶ Update Cache
               └─────────┘
```

### `rfc-compliant` / `revalidate`

Full RFC 7234 compliance with conditional requests and ETag validation.

```typescript
cache({ strategy: 'rfc-compliant' })
```

**Best for:**
- APIs that support ETag/Last-Modified
- When bandwidth optimization matters
- Strict cache correctness requirements

```
Request Flow:
┌─────────┐     ┌───────┐     ┌──────────────────┐
│ Request │ ──▶ │ Cache │ ──▶ │ Check Freshness  │
└─────────┘     └───────┘     └──────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
               [Fresh]          [Stale+ETag]      [No Cache]
                  │                   │                 │
                  ▼                   ▼                 ▼
              Return             Conditional         Full
              Cached              Request           Request
                               (If-None-Match)
                                      │
                         ┌────────────┴────────────┐
                         ▼                         ▼
                      [304]                     [200]
                    Refresh                    Replace
                    Timestamp                   Cache
```

### `network-only`

Bypasses cache entirely. Still stores responses for potential future use.

```typescript
cache({ strategy: 'network-only' })
```

**Best for:**
- Real-time data
- Authentication requests
- Debugging cache issues

## Storage Drivers

### Memory Storage (Default)

Fast in-memory cache. Data is lost on process restart.

```typescript
import { MemoryStorage } from 'recker';

cache({
  storage: new MemoryStorage(),
  ttl: 60_000
})
```

**Characteristics:**
- Fastest read/write
- No persistence
- Memory-bound (watch for large responses)

### File Storage

Persistent disk-based cache. Survives restarts.

```typescript
import { FileStorage } from 'recker';

cache({
  storage: new FileStorage('./.cache'),
  ttl: 3600_000  // 1 hour
})
```

**Characteristics:**
- Persists across restarts
- Good for development
- Slower than memory
- Automatic cleanup of expired entries

### Redis Storage

Distributed cache for microservices and serverless.

```typescript
import { RedisStorage } from 'recker';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

cache({
  storage: new RedisStorage(redis, 'api-cache:'),
  ttl: 300_000  // 5 minutes
})
```

**Characteristics:**
- Shared across instances
- Persistent (with Redis persistence)
- Network latency overhead
- Automatic TTL handling via Redis SETEX

```typescript
// With connection options
const redis = new Redis({
  host: 'redis.example.com',
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  db: 0
});

cache({
  storage: new RedisStorage(redis, 'myapp:cache:')
})
```

### Custom Storage

Implement the `CacheStorage` interface for custom backends:

```typescript
import { CacheStorage, CacheEntry } from 'recker';

class MyCustomStorage implements CacheStorage {
  async get(key: string): Promise<CacheEntry | undefined> {
    // Fetch from your storage
  }

  async set(key: string, entry: CacheEntry, ttl?: number): Promise<void> {
    // Store in your storage
  }

  async delete(key: string): Promise<void> {
    // Remove from your storage
  }
}

cache({
  storage: new MyCustomStorage()
})
```

## Cache Options

### Full Options Reference

```typescript
interface CacheOptions {
  // Storage backend (default: MemoryStorage)
  storage?: CacheStorage;

  // Cache strategy (default: 'cache-first')
  strategy?: 'cache-first' | 'network-first' | 'stale-while-revalidate'
           | 'network-only' | 'rfc-compliant' | 'revalidate';

  // Time to live in ms (default: 60000)
  // Used as fallback when no Cache-Control header
  ttl?: number;

  // HTTP methods to cache (default: ['GET'])
  methods?: string[];

  // Custom cache key generator
  keyGenerator?: (req: ReckerRequest) => string;

  // Respect Cache-Control headers (default: true)
  respectCacheControl?: boolean;

  // Include Vary header in cache key (default: true)
  respectVary?: boolean;

  // Max stale time in ms for SWR (default: 0)
  maxStale?: number;

  // Force revalidation on every request (default: false)
  forceRevalidate?: boolean;
}
```

### Custom Key Generator

```typescript
cache({
  keyGenerator: (req) => {
    // Include user ID in cache key for user-specific caching
    const userId = req.headers.get('X-User-ID') || 'anonymous';
    return `${userId}:${req.method}:${req.url}`;
  }
})
```

### Caching POST Requests

By default, only GET requests are cached. For AI/LLM applications, you may want to cache POST requests with identical payloads:

```typescript
cache({
  methods: ['GET', 'POST'],
  keyGenerator: (req) => {
    // Recker automatically includes body hash for POST requests
    return `${req.method}:${req.url}`;
  }
})
```

Recker automatically generates a SHA-256 hash of the request body for non-GET methods, allowing semantic caching of AI prompts.

## RFC 7234 Compliance

### Cache-Control Headers

Recker respects standard Cache-Control directives:

**Response Headers:**
- `max-age=N` - Cache for N seconds
- `s-maxage=N` - Shared cache max age (takes precedence)
- `no-cache` - Must revalidate before using
- `no-store` - Never cache this response
- `must-revalidate` - Must not serve stale on error
- `private` - User-specific, no shared caching
- `public` - Can be cached by shared caches
- `stale-while-revalidate=N` - Serve stale for N seconds while revalidating
- `stale-if-error=N` - Serve stale for N seconds on network error

**Request Headers:**
- `max-age=N` - Won't accept response older than N seconds
- `min-fresh=N` - Wants response fresh for at least N more seconds
- `max-stale=N` - Willing to accept stale response up to N seconds old
- `only-if-cached` - Only return cached response, never fetch
- `no-cache` - Force revalidation
- `no-store` - Don't cache this request

### ETag Revalidation

When using `rfc-compliant` strategy, Recker automatically uses conditional requests:

```typescript
// Server response includes:
// ETag: "abc123"
// Cache-Control: max-age=60

// After 60 seconds, Recker sends:
// If-None-Match: "abc123"

// Server responds with:
// 304 Not Modified (if unchanged)
// or 200 OK with new content
```

This saves bandwidth when content hasn't changed.

### Last-Modified Revalidation

```typescript
// Server response includes:
// Last-Modified: Wed, 21 Oct 2024 07:28:00 GMT

// On revalidation, Recker sends:
// If-Modified-Since: Wed, 21 Oct 2024 07:28:00 GMT
```

### Vary Header Support

Recker respects `Vary` headers for content negotiation:

```typescript
// Server response:
// Vary: Accept-Language, Accept-Encoding

// Recker creates separate cache entries for:
// - Accept-Language: en + Accept-Encoding: gzip
// - Accept-Language: pt + Accept-Encoding: gzip
// - Accept-Language: en + Accept-Encoding: br
```

## Cache Debugging

### X-Cache Headers

Recker adds debugging headers to cached responses:

```typescript
const response = await client.get('/data');

console.log(response.headers.get('X-Cache'));
// 'hit' | 'stale' | 'revalidated'

console.log(response.headers.get('X-Cache-Age'));
// Seconds since cached (e.g., '45')

console.log(response.headers.get('Age'));
// RFC 7234 Age header
```

### Warning Headers

For stale responses (RFC 7234):

```typescript
// 110 Response is Stale
response.headers.get('Warning');
// '110 - "Response is Stale"'

// 111 Revalidation Failed (served stale after network error)
response.headers.get('Warning');
// '111 - "Revalidation Failed"'
```

## Cache Invalidation

### Automatic Invalidation

Unsafe HTTP methods automatically invalidate related cache entries:

```typescript
// This POST invalidates cached GET /users
await client.post('/users', { json: { name: 'John' } });

// These methods trigger invalidation:
// POST, PUT, PATCH, DELETE
// PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK (WebDAV)
// LINK, UNLINK, PURGE
```

### Manual Invalidation

For custom storage, implement cache clearing:

```typescript
// Clear specific entry
await storage.delete('GET:https://api.example.com/users');

// Clear all entries (MemoryStorage)
const memoryStorage = new MemoryStorage();
memoryStorage.clear();

// Clear with pattern (RedisStorage)
await redis.del('api-cache:*');
```

### PURGE Method

Use the PURGE method for CDN-style cache invalidation:

```typescript
await client.purge('/cached-resource');
// Invalidates local cache AND sends PURGE to origin
```

## Common Patterns

### Cache with Fallback

```typescript
const client = createClient({
  plugins: [
    cache({
      strategy: 'network-first',
      ttl: 3600_000  // 1 hour fallback
    })
  ]
});

try {
  const data = await client.get('/api/data').json();
} catch (error) {
  // Network failed, but we got cached data
  if (error.response?.headers.get('X-Cache') === 'stale') {
    console.log('Using stale cached data');
  }
}
```

### Conditional Caching

```typescript
cache({
  keyGenerator: (req) => {
    // Don't cache authenticated requests with memory storage
    if (req.headers.get('Authorization')) {
      return `auth:${req.url}:${Date.now()}`; // Unique key = no caching
    }
    return `${req.method}:${req.url}`;
  }
})
```

### Per-Request Cache Override

```typescript
// Force fresh fetch for this request
const fresh = await client.get('/data', {
  headers: {
    'Cache-Control': 'no-cache'
  }
}).json();

// Only use cache, never fetch
const cached = await client.get('/data', {
  headers: {
    'Cache-Control': 'only-if-cached'
  }
}).json();

// Accept stale up to 5 minutes old
const maybeStale = await client.get('/data', {
  headers: {
    'Cache-Control': 'max-stale=300'
  }
}).json();
```

### AI/LLM Prompt Caching

Cache identical AI prompts to save costs:

```typescript
const client = createClient({
  baseUrl: 'https://api.openai.com/v1',
  plugins: [
    cache({
      methods: ['POST'],
      strategy: 'cache-first',
      ttl: 86400_000,  // 24 hours
      keyGenerator: (req) => {
        // Same prompt = same cache key (body hash automatic)
        return `openai:${req.method}:${req.url}`;
      }
    })
  ]
});

// These return cached response (same prompt)
await client.post('/chat/completions', {
  json: { model: 'gpt-5', messages: [{ role: 'user', content: 'Hello' }] }
});

await client.post('/chat/completions', {
  json: { model: 'gpt-5', messages: [{ role: 'user', content: 'Hello' }] }
});
```

### Multi-Tier Caching

```typescript
import { MemoryStorage, RedisStorage } from 'recker';

// Fast memory cache for hot data
const memoryClient = createClient({
  plugins: [cache({ storage: new MemoryStorage(), ttl: 60_000 })]
});

// Persistent Redis for cold data
const redisClient = createClient({
  plugins: [cache({ storage: new RedisStorage(redis), ttl: 3600_000 })]
});
```

## Performance Tips

1. **Choose the right strategy** - Use `cache-first` for static data, `stale-while-revalidate` for balanced freshness/speed

2. **Set appropriate TTLs** - Short for dynamic data (1-5 min), long for static (1+ hour)

3. **Use Redis for distributed** - Share cache across serverless functions and containers

4. **Monitor cache hit ratio** - Use X-Cache headers to measure effectiveness

5. **Consider memory limits** - MemoryStorage grows unbounded; implement cleanup for long-running processes

```typescript
// Example: Periodic cleanup for MemoryStorage
setInterval(() => {
  memoryStorage.cleanup(); // Remove expired entries
}, 60_000);
```
