# Caching

Response caching strategies, storage backends, and RFC 7234 compliance.

## Basic Caching

### Enable Caching

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    ttl: 60000 // 1 minute
  }
});
```

### Cache Options

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    ttl: 300000,                    // 5 minutes default TTL
    strategy: 'cache-first',        // Caching strategy
    methods: ['GET'],               // Methods to cache
    driver: 'memory',               // 'memory' or 'file'
    respectCacheControl: true,      // Honor Cache-Control headers
    respectVary: true               // Include Vary headers in cache key
  }
});
```

## Cache Strategies

### cache-first

Return cached response immediately if available:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    strategy: 'cache-first',
    ttl: 60000
  }
});

// First request: network
await client.get('/users'); // → Network

// Second request: cache
await client.get('/users'); // → Cache (fast!)
```

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

**Best for:** Static data, rarely changing content

### network-first

Always try network, fall back to cache on error:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    strategy: 'network-first',
    ttl: 300000
  }
});

// Request: tries network first
await client.get('/users'); // → Network (fresh data)

// Network fails: uses cache
await client.get('/users'); // → Cache (fallback)
```

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

**Best for:** Data that should be fresh but needs offline support

### stale-while-revalidate

Return cached immediately, refresh in background:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    strategy: 'stale-while-revalidate',
    ttl: 60000
  }
});

// Returns stale cache instantly, fetches fresh in background
await client.get('/users'); // → Cache (fast!), background refresh
```

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

**Best for:** UI that needs instant response but should stay updated

### network-only

Always fetch from network, never use cache:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    strategy: 'network-only'
  }
});
```

**Best for:** Real-time data, transactions

### rfc-compliant

Full HTTP caching semantics (Cache-Control, ETag, 304):

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    strategy: 'rfc-compliant',
    respectCacheControl: true
  }
});

// Respects server's Cache-Control headers
// Uses conditional requests (ETag, If-None-Match)
// Returns 304 Not Modified when appropriate
```

**Best for:** Standards-compliant caching with server control

### revalidate

Force validation on every request:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    strategy: 'revalidate',
    forceRevalidate: true
  }
});

// Always sends If-None-Match/If-Modified-Since
// Gets 304 if unchanged, full response if changed
```

**Best for:** Data that must be validated but can use 304 optimization

## Storage Backends

### Memory Storage (Default)

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    driver: 'memory',
    ttl: 60000
  }
});
```

- Fast, in-process
- Cleared on restart
- No persistence

### File Storage

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    driver: 'file',
    fileStoragePath: './cache',
    ttl: 3600000 // 1 hour
  }
});
```

- Persistent across restarts
- Disk-based
- Slower than memory

### Custom Storage

Implement the `CacheStorage` interface:

```typescript
interface CacheStorage {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, entry: CacheEntry, ttl: number): Promise<void>;
  delete(key: string): Promise<void>;
}
```

#### Redis Example

```typescript
import { Redis } from 'ioredis';

const redis = new Redis();

const redisStorage: CacheStorage = {
  async get(key) {
    const data = await redis.get(`cache:${key}`);
    return data ? JSON.parse(data) : undefined;
  },

  async set(key, entry, ttl) {
    await redis.setex(`cache:${key}`, Math.ceil(ttl / 1000), JSON.stringify(entry));
  },

  async delete(key) {
    await redis.del(`cache:${key}`);
  }
};

const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    storage: redisStorage,
    ttl: 300000
  }
});
```

## Cache-Control Headers

### Respecting Server Directives

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    strategy: 'rfc-compliant',
    respectCacheControl: true
  }
});

// Server responds with:
// Cache-Control: max-age=3600, stale-while-revalidate=86400
//
// Client will:
// - Cache for 1 hour (max-age)
// - Serve stale for up to 24 hours while revalidating
```

### Supported Directives

| Directive | Description |
|-----------|-------------|
| `max-age` | Maximum cache age in seconds |
| `s-maxage` | Shared cache maximum age |
| `no-cache` | Must revalidate before use |
| `no-store` | Don't cache at all |
| `must-revalidate` | Must revalidate when stale |
| `private` | Only cache in private caches |
| `public` | Can cache in shared caches |
| `stale-while-revalidate` | Serve stale while revalidating |
| `stale-if-error` | Serve stale on network error |

### Request Cache-Control

```typescript
// Skip cache for this request
await client.get('/users', {
  headers: {
    'Cache-Control': 'no-cache'
  }
});

// Accept stale response
await client.get('/users', {
  headers: {
    'Cache-Control': 'max-stale=3600'
  }
});

// Only use cache (504 if not cached)
await client.get('/users', {
  headers: {
    'Cache-Control': 'only-if-cached'
  }
});
```

## Conditional Requests

### ETag Validation

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    strategy: 'revalidate'
  }
});

// First request - server returns:
// ETag: "abc123"
await client.get('/users');

// Second request - client sends:
// If-None-Match: "abc123"
//
// Server returns 304 if unchanged
await client.get('/users');
```

### Last-Modified Validation

```typescript
// First request - server returns:
// Last-Modified: Wed, 21 Oct 2024 07:28:00 GMT

// Second request - client sends:
// If-Modified-Since: Wed, 21 Oct 2024 07:28:00 GMT
```

## Cache Key Generation

### Default Key

By default, cache key is `METHOD:URL`:

```typescript
// Key: GET:https://api.example.com/users
await client.get('/users');

// Key: GET:https://api.example.com/users?page=2
await client.get('/users', { query: { page: 2 } });
```

### Custom Key Generator

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    keyGenerator: (req) => {
      // Include authorization in key
      const auth = req.headers.get('Authorization') || 'anonymous';
      return `${req.method}:${req.url}:${auth}`;
    }
  }
});
```

### Vary Header Support

Cache varies by request headers:

```typescript
// Server responds with:
// Vary: Accept-Language

// Key for Accept-Language: en
// GET:/api/content:vary:accept-language=en

// Key for Accept-Language: es
// GET:/api/content:vary:accept-language=es
```

## Cache Invalidation

### Automatic Invalidation

Unsafe methods (POST, PUT, DELETE) automatically invalidate cache:

```typescript
// This is cached
await client.get('/users/1');

// This invalidates /users/1 cache
await client.put('/users/1', { json: { name: 'John' } });

// This fetches fresh data
await client.get('/users/1');
```

### Manual Invalidation

```typescript
// PURGE method for CDN-style invalidation
await client.purge('/users/1');
```

## Response Headers

Cached responses include informational headers:

```typescript
const response = await client.get('/users');

// Cache status
response.headers.get('X-Cache'); // 'hit' | 'stale' | 'revalidated' | 'stale-error'

// Age of cached response
response.headers.get('X-Cache-Age'); // '120' (seconds)

// Warning for stale responses
response.headers.get('Warning'); // '110 - "Response is Stale"'
```

## AI/LLM Caching

Cache AI API responses by request body hash:

```typescript
const client = createClient({
  baseUrl: 'https://api.openai.com/v1',
  cache: {
    strategy: 'cache-first',
    ttl: 86400000, // 24 hours
    methods: ['POST'] // Cache POST requests
  }
});

// Same prompt returns cached response
await client.post('/chat/completions', {
  json: {
    model: 'gpt-5.1',
    messages: [{ role: 'user', content: 'Hello' }]
  }
});

// Different prompt makes new request
await client.post('/chat/completions', {
  json: {
    model: 'gpt-5.1',
    messages: [{ role: 'user', content: 'World' }]
  }
});
```

## Best Practices

### 1. Choose Strategy by Use Case

```typescript
// Static assets: cache-first
cache: { strategy: 'cache-first', ttl: 86400000 }

// User data: network-first
cache: { strategy: 'network-first', ttl: 60000 }

// Dashboard: stale-while-revalidate
cache: { strategy: 'stale-while-revalidate', ttl: 30000 }

// Transactions: network-only
cache: { strategy: 'network-only' }
```

### 2. Set Appropriate TTL

```typescript
// Static content: long TTL
cache: { ttl: 86400000 } // 24 hours

// User profiles: medium TTL
cache: { ttl: 300000 } // 5 minutes

// Real-time data: short TTL
cache: { ttl: 10000 } // 10 seconds
```

### 3. Use RFC-Compliant When Server Supports It

```typescript
cache: {
  strategy: 'rfc-compliant',
  respectCacheControl: true
}
```

### 4. Consider Cache Warming

```typescript
// Pre-populate cache on startup
async function warmCache() {
  await Promise.all([
    client.get('/config'),
    client.get('/features'),
    client.get('/translations')
  ]);
}
```

### 5. Multi-Tier Caching

```typescript
// Fast memory cache for hot data
const memoryClient = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    driver: 'memory',
    ttl: 60000        // 1 minute
  }
});

// Persistent Redis for cold data (distributed)
const redis = new Redis(process.env.REDIS_URL);
const redisClient = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    storage: redisStorage,
    ttl: 3600000      // 1 hour
  }
});
```

### 6. Per-Request Cache Override

```typescript
// Force fresh fetch (bypass cache)
const fresh = await client.get('/data', {
  headers: { 'Cache-Control': 'no-cache' }
}).json();

// Only use cache, never fetch (504 if not cached)
const cached = await client.get('/data', {
  headers: { 'Cache-Control': 'only-if-cached' }
}).json();

// Accept stale up to 5 minutes old
const maybeStale = await client.get('/data', {
  headers: { 'Cache-Control': 'max-stale=300' }
}).json();
```

### 7. Monitor Cache Performance

```typescript
// Check cache status from response headers
const response = await client.get('/data');

console.log(response.headers.get('X-Cache'));
// 'hit' | 'stale' | 'revalidated' | 'miss'

// Track hit ratio
if (response.headers.get('X-Cache') === 'hit') {
  metrics.increment('cache.hit');
} else {
  metrics.increment('cache.miss');
}
```

### 8. Periodic Cleanup for Memory Storage

```typescript
// For long-running processes, clean up expired entries
const memoryStorage = new MemoryStorage();

setInterval(() => {
  memoryStorage.cleanup(); // Remove expired entries
}, 60000);
```

## Configuration Reference

```typescript
interface CacheOptions {
  // Storage
  storage?: CacheStorage;         // Custom storage backend
  driver?: 'memory' | 'file';     // Built-in driver
  fileStoragePath?: string;       // Path for file driver

  // Strategy
  strategy?: CacheStrategy;       // Caching strategy
  ttl?: number;                   // Default TTL in milliseconds
  methods?: string[];             // Methods to cache

  // RFC 7234
  respectCacheControl?: boolean;  // Honor Cache-Control
  respectVary?: boolean;          // Include Vary in key
  maxStale?: number;              // Max stale time
  forceRevalidate?: boolean;      // Always revalidate

  // Custom
  keyGenerator?: (req) => string; // Custom key generation
}
```

## Next Steps

- **[Plugins](10-plugins.md)** - Plugin architecture
- **[Specialties](11-specialties.md)** - GraphQL, SOAP, scraping
- **[Observability](12-observability.md)** - Debug and metrics
