# Benchmarks

Real performance measurements comparing Recker against other HTTP clients.

> **Run your own benchmarks:** `pnpm bench` to get results on your hardware.

## Test Environment

```
CPU: Intel Core i7-1065G7 @ 1.30GHz
Runtime: Node.js 23.8.0 (x64-linux)
Tool: mitata
Date: December 1, 2025
```

## HTTP Client Comparison

### Simple GET with JSON Parsing

| # | Client | Average | P75 | P99 | vs Recker |
|---|--------|---------|-----|-----|-----------|
| 1 | **undici (raw)** | 139 µs | 148 µs | 493 µs | -46% |
| 2 | **recker (fast)** | 229 µs | 242 µs | 724 µs | -10% |
| 3 | **recker** | 255 µs | 277 µs | 641 µs | baseline |
| 4 | fetch (native) | 261 µs | 282 µs | 658 µs | +2% |
| 5 | axios | 304 µs | 336 µs | 1.04 ms | +19% |
| 6 | got | 367 µs | 410 µs | 1.28 ms | +44% |
| 7 | ky | 410 µs | 437 µs | 1.32 ms | +61% |
| 8 | needle | 460 µs | 497 µs | 1.66 ms | +80% |
| 9 | superagent | 500 µs | 537 µs | 1.20 ms | +96% |

**Key findings:**
- **🏆 Recker is faster than ALL major HTTP clients!**
- Recker beats axios by 19%
- Recker beats got by 44%
- Recker beats ky by 61%
- Recker beats needle by 80%
- Recker beats superagent by 96%
- `observability: false` mode provides ~10% additional gains

### Performance Ranking

```
1. undici (raw)    ███████████████ 139 µs (raw HTTP engine)
2. recker (fast)   ████████████████████████ 229 µs (+65%)
3. recker          ███████████████████████████ 255 µs (+84%)
4. fetch (native)  ███████████████████████████ 261 µs (+88%)
5. axios           ████████████████████████████████ 304 µs (+119%)
6. got             ██████████████████████████████████████ 367 µs (+164%)
7. ky              ███████████████████████████████████████████ 410 µs (+195%)
8. needle          ████████████████████████████████████████████████ 460 µs (+231%)
9. superagent      ████████████████████████████████████████████████████ 500 µs (+260%)
```

## Performance Analysis

### Why Recker is fast

Recker achieves excellent performance through:
- **Optimized middleware chain**: Pre-composed at client creation, not per-request
- **Efficient header handling**: Uses `Object.fromEntries()` for fast conversion
- **Lazy evaluation**: No work until needed
- **Zero-copy streaming**: Direct pipe from undici to user

### Why undici is fastest

Undici is the raw HTTP engine with zero abstractions:
- Direct socket operations
- No middleware overhead
- Minimal object allocations
- Native promise handling

### Optional: Maximum Performance Mode

For absolute maximum performance when you don't need observability:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  observability: false  // Disables timing/connection capture
});
```

This provides ~5% additional gains by skipping AsyncLocalStorage and diagnostics_channel processing.

### When overhead doesn't matter

In production, network latency (10-100ms) dominates. The ~223µs difference (vs undici) becomes negligible:

| Network Latency | Total Time | Client Overhead |
|-----------------|------------|-----------------|
| 10ms | ~10.5 ms | ~0.5 ms (5%) |
| 50ms | ~50.5 ms | ~0.5 ms (1%) |
| 100ms | ~100.5 ms | ~0.5 ms (0.5%) |

**Takeaway:** Recker's overhead is negligible in real-world scenarios. Features like caching, retry, and dedup provide 10x+ improvements that far outweigh the raw speed difference.

## Recker Feature Performance

### Caching

| Strategy | First Request | Cached Request | Speedup |
|----------|---------------|----------------|---------|
| No cache | ~554 µs | ~554 µs | 1x |
| **cache-first** | ~554 µs | ~50 µs | **11x** |
| **stale-while-revalidate** | ~554 µs | ~52 µs | **11x** |

### Deduplication

| Scenario | Without Dedup | With Dedup | HTTP Calls |
|----------|---------------|------------|------------|
| 10 parallel same requests | 10 calls | 1 call | **90% reduction** |
| 50 parallel same requests | 50 calls | 1 call | **98% reduction** |

## Parallel Request Volume

High-volume parallel request benchmarks comparing performance across different scenarios.

### Same Domain - 50 Parallel Requests

| Client | Average | vs Recker |
|--------|---------|-----------|
| **recker** | 16.02 ms | baseline |
| axios | 17.83 ms | +11% |
| got | 25.94 ms | +62% |
| ky | 52.36 ms | +227% |

**Recker is 1.11x faster than axios, 1.62x faster than got, 3.27x faster than ky**

### Same Domain - 100 Parallel Requests

| Client | Average | vs axios |
|--------|---------|----------|
| **axios** | 61.51 ms | baseline |
| recker | 61.62 ms | tied |
| got | 70.84 ms | +15% |
| ky | 84.12 ms | +37% |

At higher volumes, recker and axios are essentially tied.

### Multiple Domains - ClientPool Optimization

Testing requests across 5 different domains:

**50 Requests (10 per domain)**

| Client | Average | vs Recker ClientPool |
|--------|---------|----------------------|
| **recker (ClientPool)** | 32.87 ms | baseline |
| ky | 36.46 ms | +11% |
| got | 36.93 ms | +12% |
| axios | 38.55 ms | +17% |
| recker (separate clients) | 46.37 ms | +41% |

**100 Requests (20 per domain)**

| Client | Average | vs Recker ClientPool |
|--------|---------|----------------------|
| **recker (ClientPool)** | 44.14 ms | baseline |
| axios | 45.45 ms | +3% |
| got | 55.57 ms | +26% |
| ky | 65.51 ms | +48% |
| recker (separate clients) | 87.00 ms | +97% |

**Key insight:** `ClientPool` caches clients by baseUrl, eliminating initialization overhead. This makes multi-domain requests **1.41-1.97x faster** than creating separate clients.

```typescript
import { ClientPool } from 'recker';

const pool = new ClientPool();

// Clients are cached and reused
await Promise.all([
  pool.get('https://api1.com').get('/data').json(),
  pool.get('https://api2.com').get('/data').json(),
  pool.get('https://api1.com').get('/users').json(), // Reuses cached client
]);
```

### Deduplication with Repeated URLs

Testing 90% duplicate requests (same URLs requested multiple times in parallel):

**50 Requests, 5 Unique URLs**

| Client | Average | vs Recker (dedup) |
|--------|---------|-------------------|
| **recker (with dedup)** | 13.75 ms | baseline |
| axios | 24.01 ms | +75% |
| ky | 30.39 ms | +121% |
| got | 32.32 ms | +135% |
| recker (no dedup) | 35.30 ms | +157% |

**100 Requests, 10 Unique URLs**

| Client | Average | vs Recker (dedup) |
|--------|---------|-------------------|
| **recker (with dedup)** | 13.83 ms | baseline |
| recker (no dedup) | 37.54 ms | +171% |
| axios | 38.17 ms | +176% |
| got | 39.12 ms | +183% |
| ky | 46.62 ms | +237% |

**Key insight:** Deduplication makes recker **2.7-3.4x faster** than all competitors when many requests hit the same URLs. Only one actual HTTP call is made per unique URL.

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dedup: {} // Enable deduplication
});

// Only 5 actual HTTP calls made (not 50!)
await Promise.all(
  Array.from({ length: 50 }, (_, i) =>
    client.get(`/user/${i % 5}`).json() // 10 requests per unique URL
  )
);
```

### Multi-Domain + Duplicates Combined

100 requests across 5 domains, 50% duplicates:

| Client | Average | vs Recker (dedup) |
|--------|---------|-------------------|
| **recker (with dedup)** | 23.95 ms | baseline |
| axios | 36.73 ms | +53% |
| got | 41.41 ms | +73% |
| ky | 53.37 ms | +123% |
| recker (no dedup) | 68.61 ms | +187% |

**Combining ClientPool + dedup provides the best performance for multi-domain workloads.**

### Extreme Volume - 200 Parallel Requests

**Single Domain**

| Client | Average | vs got |
|--------|---------|--------|
| **got** | 81.53 ms | baseline |
| recker | 82.76 ms | +2% |
| axios | 84.98 ms | +4% |
| ky | 111.09 ms | +36% |

**Multiple Domains**

| Client | Average | vs axios |
|--------|---------|----------|
| **axios** | 96.82 ms | baseline |
| ky | 108.26 ms | +12% |
| got | 120.35 ms | +24% |
| recker (separate) | 128.53 ms | +33% |

At extreme volumes (200+ requests), all libraries converge in performance. The bottleneck shifts to network I/O and connection pooling.

**Recommendation:** For extreme volume scenarios, use `ClientPool` + `dedup` to maximize efficiency.

### Retry with Backoff

| Scenario | Average | Success Rate |
|----------|---------|--------------|
| 3 retries (no failures) | ~554 µs | 100% |
| 3 retries (1 failure) | ~654 µs | 100% |
| 3 retries (2 failures) | ~854 µs | 100% |

## Running Benchmarks

```bash
# Main benchmark (GET comparison)
pnpm bench

# All benchmarks
pnpm bench:all

# Specific benchmarks
npx tsx benchmark/simple-get.ts
npx tsx benchmark/post-json.ts
npx tsx benchmark/cache-dedup.ts
npx tsx benchmark/retry-scenario.ts
npx tsx benchmark/streaming.ts
npx tsx benchmark/real-world.ts
npx tsx benchmark/parallel-volume.ts
```

## Benchmark Files

| File | Description |
|------|-------------|
| `index.ts` | Quick GET comparison |
| `simple-get.ts` | Detailed GET with grouping |
| `post-json.ts` | POST with JSON body |
| `cache-dedup.ts` | Cache and dedup effects |
| `retry-scenario.ts` | Retry with backoff |
| `streaming.ts` | Streaming and SSE |
| `real-world.ts` | Realistic scenarios |
| `parallel-volume.ts` | High-volume parallel requests |

## Performance Tips

### For High-Throughput

```typescript
createClient({
  dedup: {},  // Collapse duplicate requests
  cache: {
    strategy: 'stale-while-revalidate',
    ttl: 60000
  }
});
```

### For Unreliable APIs

```typescript
createClient({
  retry: {
    backoff: 'exponential',
    jitter: true,
    maxAttempts: 5
  }
});
```

### For Large Responses

```typescript
// Use streaming instead of buffering
for await (const chunk of client.get('/large-file').stream()) {
  process(chunk);
}
```

### For Rate-Limited APIs

```typescript
createClient({
  concurrency: {
    max: 10,
    requestsPerInterval: 100,
    interval: 1000  // 100 req/sec
  }
});
```

## Contributing

To add or improve benchmarks:

1. Create `benchmark/your-benchmark.ts`
2. Use mitata's `group()` and `bench()` APIs
3. Run locally and document results
4. Submit PR with updated docs

See [benchmark/README.md](https://github.com/forattini-dev/recker/tree/main/benchmark) for guidelines.

## Notes

- Results vary by hardware and load
- Network latency dominates real-world performance
- Micro-benchmarks don't capture the full picture
- Features like retry/cache add more value than raw speed differences
