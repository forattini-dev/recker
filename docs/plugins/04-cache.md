# Cache Plugin

The **Cache** plugin implements HTTP caching with support for multiple strategies, storage backends, and RFC 7234 compliance.

## Quick Start

```typescript
import { createClient, cache, MemoryStorage } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(cache({
  storage: new MemoryStorage({ maxMemoryBytes: 100 * 1024 * 1024 }),
  ttl: 60000, // 1 minute
}));

// First call - fetches from API
const users1 = await client.get('/users').json();

// Second call - returns from cache
const users2 = await client.get('/users').json();
```

## Configuration

```typescript
interface CacheOptions {
  // Storage backend
  storage?: CacheStorage;

  // Cache strategy
  strategy?: CacheStrategy;

  // Default TTL in ms (fallback when no Cache-Control)
  ttl?: number;

  // HTTP methods to cache (default: ['GET'])
  methods?: string[];

  // Custom key generator
  keyGenerator?: (req: ReckerRequest) => string;

  // Respect Cache-Control headers (default: true)
  respectCacheControl?: boolean;

  // Include Vary header in cache key (default: true)
  respectVary?: boolean;

  // Maximum time to serve stale content (default: 0)
  maxStale?: number;

  // Force revalidation on each request (default: false)
  forceRevalidate?: boolean;
}
```

## Strategies

### cache-first (Default)

Returns from cache if available, otherwise fetches from network:

```typescript
client.use(cache({
  strategy: 'cache-first',
  ttl: 300000, // 5 minutes
}));

// 1. Check cache
// 2. If found and not expired → return cache
// 3. If not found → fetch from network, save to cache
```

### stale-while-revalidate

Returns cache immediately (even if stale), updates in background:

```typescript
client.use(cache({
  strategy: 'stale-while-revalidate',
  ttl: 60000,
  maxStale: 300000, // Accept up to 5 min stale
}));

// 1. Return cache immediately (even if expired)
// 2. Fetch update in background
// 3. Next request will have fresh data
```

### network-only

Always fetches from network, ignores cache:

```typescript
client.use(cache({
  strategy: 'network-only',
}));

// Useful to force refresh on specific requests
```

### rfc-compliant

Full RFC 7234 implementation:

```typescript
client.use(cache({
  strategy: 'rfc-compliant',
  respectCacheControl: true,
  respectVary: true,
}));

// Respects:
// - Cache-Control: max-age, no-cache, no-store, private, public
// - Expires header
// - ETag and Last-Modified for revalidation
// - Vary header for variants
```

### revalidate

Always revalidates with server before using cache:

```typescript
client.use(cache({
  strategy: 'revalidate',
}));

// Always sends If-None-Match or If-Modified-Since
// Server returns 304 Not Modified if unchanged
```

## Storage Backends

### MemoryStorage (Default)

```typescript
import { MemoryStorage } from 'recker';

client.use(cache({
  storage: new MemoryStorage({
    maxMemoryBytes: 100 * 1024 * 1024,
    compression: { enabled: true },
    evictionPolicy: 'lru',
  }),
}));
```

See [Memory Cache](./01-memory-cache.md) for complete documentation.

### FileStorage

```typescript
import { FileStorage } from 'recker';

client.use(cache({
  storage: new FileStorage({
    directory: './cache',
    maxSize: 500 * 1024 * 1024, // 500MB
  }),
}));
```

### RedisStorage

```typescript
import { RedisStorage } from 'recker';
import { createClient as createRedisClient } from 'redis';

const redis = createRedisClient({ url: 'redis://localhost:6379' });
await redis.connect();

client.use(cache({
  storage: new RedisStorage({ client: redis }),
}));
```

### Custom Storage

Implement the `CacheStorage` interface:

```typescript
interface CacheStorage {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, entry: CacheEntry, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  has?(key: string): boolean;
  clear?(): void;
}

class MyStorage implements CacheStorage {
  async get(key: string) { /* ... */ }
  async set(key: string, entry: CacheEntry, ttl?: number) { /* ... */ }
  async delete(key: string) { /* ... */ }
}

client.use(cache({ storage: new MyStorage() }));
```

## Cache-Control

The plugin respects Cache-Control headers from the server:

```typescript
client.use(cache({
  respectCacheControl: true, // default
}));

// Response with Cache-Control: max-age=3600
// → Cached for 1 hour

// Response with Cache-Control: no-store
// → Not cached

// Response with Cache-Control: no-cache
// → Cached, but always revalidates

// Response with Cache-Control: private
// → Not cached (user-specific data)
```

## Vary Header

The plugin considers the Vary header to create cache variants:

```typescript
client.use(cache({
  respectVary: true, // default
}));

// Response with Vary: Accept-Language
// → Separate cache for each language

// Request with Accept-Language: en
// → Cache key includes "en"

// Request with Accept-Language: pt-BR
// → Cache key includes "pt-BR"
```

## Custom Key Generator

```typescript
client.use(cache({
  keyGenerator: (req) => {
    // Include user in key
    const userId = req.headers.get('X-User-Id') || 'anonymous';
    return `${userId}:${req.method}:${req.url}`;
  },
}));
```

## Bypass Cache

### Per Request

```typescript
// Force refresh
const fresh = await client.get('/users', {
  headers: { 'Cache-Control': 'no-cache' },
}).json();

// No cache for this request
const noStore = await client.get('/users', {
  headers: { 'Cache-Control': 'no-store' },
}).json();
```

### Manual Invalidation

```typescript
const storage = new MemoryStorage();

client.use(cache({ storage }));

// After a POST/PUT/DELETE, invalidate
await client.post('/users', { body: newUser });
storage.clearByPrefix('GET:https://api.example.com/users');
```

## Examples

### Rate Limited API

```typescript
client.use(cache({
  storage: new MemoryStorage({ maxMemoryBytes: 50 * 1024 * 1024 }),
  strategy: 'cache-first',
  ttl: 300000, // 5 min
}));

// Reduces API calls, avoids rate limiting
```

### Real-time with Fallback

```typescript
client.use(cache({
  strategy: 'stale-while-revalidate',
  ttl: 5000, // 5 seconds
  maxStale: 60000, // Accept up to 1 min stale
}));

// Always responds fast with "recent enough" data
// Updates in background
```

### Static Assets

```typescript
const assetClient = createClient({
  baseUrl: 'https://cdn.example.com',
});

assetClient.use(cache({
  storage: new FileStorage({ directory: './asset-cache' }),
  strategy: 'cache-first',
  ttl: 86400000, // 24 hours
}));
```

### Multi-tenant

```typescript
client.use(cache({
  keyGenerator: (req) => {
    const tenantId = req.headers.get('X-Tenant-Id') || 'default';
    return `tenant:${tenantId}:${req.method}:${req.url}`;
  },
  storage: new MemoryStorage({ maxMemoryBytes: 100 * 1024 * 1024 }),
}));
```

## Metrics

```typescript
const storage = new MemoryStorage({ trackStats: true });

client.use(cache({ storage }));

// After some usage...
const stats = storage.getStats();
console.log(`Hit rate: ${stats.hitRate}%`);
console.log(`Cache size: ${storage.size()} items`);
```

## Tips

1. **Use MemoryStorage** for low latency
2. **Use FileStorage** for persistence between restarts
3. **Use RedisStorage** for shared cache between instances
4. **Adjust TTL** based on data nature
5. **Use stale-while-revalidate** for better UX
6. **Monitor hit rate** to adjust configuration
7. **Combine with retry** for complete resilience
