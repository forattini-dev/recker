# Memory Cache

**MemoryStorage** is a high-performance in-memory cache system for Recker, designed to be safe, efficient, and container-aware.

## Features

- **Eviction Policies**: LRU (Least Recently Used) and FIFO (First In, First Out)
- **Memory Limits**: By bytes, system percentage, or auto-calculated
- **Container-Aware**: Detects memory limits in Docker/Kubernetes (cgroup v1/v2)
- **Heap Pressure Monitoring**: Monitors V8 heap pressure and performs preventive eviction
- **Compression**: Automatic gzip compression for large entries
- **Statistics**: Detailed metrics for hits, misses, evictions, and memory
- **TTL Support**: Per-entry time-to-live with automatic cleanup
- **Callbacks**: Hooks for eviction and memory pressure events

## Quick Start

```typescript
import { MemoryStorage, createClient } from 'recker';

// Basic usage with client
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    storage: new MemoryStorage({
      maxMemoryBytes: 100 * 1024 * 1024, // 100MB
    }),
    ttl: 60000, // 1 minute
  },
});

// GET requests are cached automatically
const data = await client.get('/users').json();
```

## Configuration

### Basic Options

```typescript
import { MemoryStorage } from 'recker';

const cache = new MemoryStorage({
  // Limit by number of items
  maxSize: 1000,

  // Limit by bytes (recommended)
  maxMemoryBytes: 50 * 1024 * 1024, // 50MB

  // OR limit by percentage of system memory
  maxMemoryPercent: 0.1, // 10% of available memory

  // Default TTL in ms (0 = no expiration)
  defaultTTL: 300000, // 5 minutes

  // Eviction policy
  evictionPolicy: 'lru', // 'lru' | 'fifo'
});
```

### Advanced Options

```typescript
const cache = new MemoryStorage({
  maxMemoryBytes: 100 * 1024 * 1024,

  // Automatic compression
  compression: {
    enabled: true,
    threshold: 1024, // Compress entries > 1KB
  },

  // Heap monitoring (preventive eviction)
  heapUsageThreshold: 0.85, // Evict when heap > 85%
  monitorInterval: 5000, // Check every 5s

  // Expired items cleanup
  cleanupInterval: 60000, // Every 1 minute

  // Statistics
  trackStats: true,

  // Callbacks
  onEvict: (info) => {
    console.log(`Evicted ${info.key}: ${info.reason}`);
  },
  onPressure: (info) => {
    console.log(`Memory pressure: ${info.heapUsedPercent}%`);
  },
});
```

## Eviction Policies

### LRU (Least Recently Used)

Evicts the least recently accessed items. Ideal for most use cases.

```typescript
const cache = new MemoryStorage({
  maxSize: 1000,
  evictionPolicy: 'lru',
});

// Item 'a' is the oldest
await cache.set('a', entry, 60000);
await cache.set('b', entry, 60000);
await cache.set('c', entry, 60000);

// Accessing 'a' moves it to the end of the queue
await cache.get('a');

// When cache is full, 'b' will be evicted first (least recent)
```

### FIFO (First In, First Out)

Evicts the oldest items regardless of access. Useful for time-sensitive data.

```typescript
const cache = new MemoryStorage({
  maxSize: 1000,
  evictionPolicy: 'fifo',
});

// Insertion order is maintained
await cache.set('a', entry, 60000); // First in
await cache.set('b', entry, 60000);
await cache.set('c', entry, 60000);

// Even when accessing 'a', it will be the first to go
await cache.get('a');
```

## Memory Limits

### By Bytes (Recommended)

```typescript
const cache = new MemoryStorage({
  maxMemoryBytes: 100 * 1024 * 1024, // 100MB
});
```

### By System Percentage

```typescript
const cache = new MemoryStorage({
  maxMemoryPercent: 0.1, // 10% of available memory
});
```

> **Note**: Don't use `maxMemoryBytes` and `maxMemoryPercent` together - it will throw an error.

### Auto-Calculated (Safe Default)

If you don't specify limits, the cache automatically calculates a safe limit:

```typescript
const cache = new MemoryStorage({
  // No explicit limits
});

// The cache considers:
// 1. Total system memory (or cgroup limit in containers)
// 2. V8 heap limit (--max-old-space-size)
// 3. Applies safety caps (50% of system, 60% of heap)
```

### Container-Aware

The cache automatically detects memory limits in containers:

```typescript
// In a Docker container with 512MB:
const cache = new MemoryStorage({
  maxMemoryPercent: 0.2, // 20% of 512MB = ~100MB
});
```

Files checked:
- `/sys/fs/cgroup/memory.max` (cgroup v2)
- `/sys/fs/cgroup/memory/memory.limit_in_bytes` (cgroup v1)

## Compression

Gzip compression reduces memory usage for compressible data:

```typescript
const cache = new MemoryStorage({
  maxMemoryBytes: 50 * 1024 * 1024,
  compression: {
    enabled: true,
    threshold: 1024, // Only compress entries > 1KB
  },
});

// Repetitive data compresses very well
await cache.set('logs', {
  status: 200,
  body: 'ERROR: Connection refused\n'.repeat(10000),
  // ...
}, 60000);

// Check savings
const stats = cache.getCompressionStats();
console.log(stats);
// {
//   compressedItems: 1,
//   totalItems: 1,
//   originalBytes: 270000,
//   compressedBytes: 1500,
//   spaceSavingsPercent: '99.44'
// }
```

## Heap Monitoring

The cache can monitor V8 heap pressure and perform preventive eviction:

```typescript
const cache = new MemoryStorage({
  maxMemoryBytes: 100 * 1024 * 1024,

  // Start evicting when heap > 85%
  heapUsageThreshold: 0.85,

  // Check every 5 seconds
  monitorInterval: 5000,

  // Callback when there's pressure
  onPressure: (info) => {
    console.warn(`Heap pressure: ${info.heapUsedPercent.toFixed(1)}%`);
    console.warn(`Evicted ${info.itemsEvicted} items`);
  },
});
```

## Statistics

### Cache Stats

```typescript
const stats = cache.getStats();
console.log(stats);
// {
//   hits: 1500,
//   misses: 300,
//   hitRate: '83.33',
//   sets: 500,
//   deletes: 50,
//   evictions: 100,
//   expirations: 25,
//   size: 375
// }
```

### Memory Stats

```typescript
const memStats = cache.getMemoryStats();
console.log(memStats);
// {
//   currentMemoryBytes: 45000000,
//   maxMemoryBytes: 100000000,
//   memoryUsagePercent: '45.00',
//   totalItems: 375,
//   averageItemSize: 120000,
//   effectiveTotalMemory: 17179869184,
//   heapLimit: 4294967296,
//   heapUsed: 150000000,
//   heapUsagePercent: '3.49'
// }
```

### Compression Stats

```typescript
const compStats = cache.getCompressionStats();
console.log(compStats);
// {
//   compressedItems: 50,
//   totalItems: 375,
//   originalBytes: 5000000,
//   compressedBytes: 500000,
//   spaceSavingsPercent: '90.00',
//   compressionRatio: '10.00'
// }
```

## Complete API

### Main Methods

```typescript
// Store entry
await cache.set(key: string, entry: CacheEntry, ttl?: number): Promise<void>

// Retrieve entry
await cache.get(key: string): Promise<CacheEntry | undefined>

// Delete entry
await cache.delete(key: string): Promise<void>

// Check existence
cache.has(key: string): boolean

// Clear all
cache.clear(): void

// Clear by prefix
cache.clearByPrefix(prefix: string): void

// List keys
cache.keys(): string[]

// Current size
cache.size(): number

// Shutdown (clears intervals)
cache.shutdown(): void
```

### Types

```typescript
interface CacheEntry {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timestamp: number;
}

interface EvictionInfo {
  key: string;
  reason: 'size' | 'memory' | 'expired' | 'pressure';
  itemSize: number;
}

interface PressureInfo {
  heapUsed: number;
  heapLimit: number;
  heapUsedPercent: number;
  itemsEvicted: number;
}
```

## Integration with Cache Plugin

`MemoryStorage` is used by the cache plugin:

```typescript
import { createClient, MemoryStorage, cachePlugin } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

// Add cache plugin
client.use(cachePlugin({
  storage: new MemoryStorage({
    maxMemoryBytes: 100 * 1024 * 1024,
    compression: { enabled: true },
  }),
  ttl: 300000, // 5 minutes
  methods: ['GET'], // Only cache GETs
  strategy: 'cache-first', // or 'stale-while-revalidate', 'network-only'
}));

// Now GET requests are cached
const users = await client.get('/users').json();
```

## Utilities

### formatBytes

```typescript
import { formatBytes } from 'recker';

formatBytes(1024);        // '1.00 KB'
formatBytes(1048576);     // '1.00 MB'
formatBytes(1073741824);  // '1.00 GB'
```

### getEffectiveTotalMemoryBytes

```typescript
import { getEffectiveTotalMemoryBytes } from 'recker';

const totalMem = getEffectiveTotalMemoryBytes();
// In Docker container 512MB: 536870912
// On bare metal 16GB: 17179869184
```

### getHeapStats

```typescript
import { getHeapStats } from 'recker';

const heap = getHeapStats();
// { heapUsed: 150000000, heapLimit: 4294967296, heapRatio: 0.035 }
```

### resolveCacheMemoryLimit

```typescript
import { resolveCacheMemoryLimit } from 'recker';

const limits = resolveCacheMemoryLimit({
  maxMemoryBytes: 100 * 1024 * 1024,
});
// {
//   maxMemoryBytes: 104857600,
//   derivedFromPercent: false,
//   effectiveTotal: 17179869184,
//   heapLimit: 4294967296,
//   inferredPercent: 0.0061
// }
```

## Performance

Benchmarks on typical hardware:

| Operation | Throughput |
|-----------|------------|
| Inserts | ~38,000 ops/sec |
| Reads | ~1,000,000 ops/sec |
| Mixed (80/20) | ~900,000 ops/sec |

### Performance Tips

1. **Use compression** for repetitive data (logs, HTML, JSON with arrays)
2. **Set appropriate TTL** to avoid stale cache
3. **Monitor statistics** to adjust limits
4. **Use LRU** for workloads with hot spots
5. **Use FIFO** for time-sensitive data

## Troubleshooting

### Cache is not caching

```typescript
// Check if method is GET
client.get('/users'); // ✅ Cached
client.post('/users'); // ❌ Not cached by default

// Check if TTL is not 0
const cache = new MemoryStorage({ defaultTTL: 0 }); // ❌ No TTL = no cache
```

### Memory growing indefinitely

```typescript
// Set explicit limits
const cache = new MemoryStorage({
  maxMemoryBytes: 100 * 1024 * 1024, // ✅ Limit defined
  maxSize: 10000, // ✅ Item limit
});
```

### OOM in containers

```typescript
// Use percentage instead of fixed bytes
const cache = new MemoryStorage({
  maxMemoryPercent: 0.15, // 15% of container
  heapUsageThreshold: 0.7, // Aggressive eviction
});
```

### Low hit rate

```typescript
const stats = cache.getStats();
if (parseFloat(stats.hitRate) < 50) {
  // Increase TTL
  // Increase maxSize/maxMemoryBytes
  // Check if keys are consistent
}
```
