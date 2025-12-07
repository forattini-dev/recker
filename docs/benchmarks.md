# Performance Benchmarks

Comprehensive performance analysis comparing Recker against 16 industry-standard HTTP clients. These benchmarks measure real-world scenarios that matter for production applications.

> **Generated**: 2025-12-06 | **Node.js**: v23.8.0 | **Platform**: linux x64

## Executive Summary

| Library | Avg (µs) | Category | Notes |
|---------|----------|----------|-------|
| **undici (raw)** | 208 | Raw | Node.js HTTP engine |
| **recker-mini** ★ | 210 | Zero-overhead | **~1% overhead** - fastest full-API client |
| fetch (native) | 450 | Built-in | Node.js native |
| recker | 451 | Full-featured | All plugins included |
| cross-fetch | 637 | Fetch-based | Universal fetch |
| node-fetch | 856 | Fetch-based | Fetch polyfill |
| axios | 952 | Full-featured | Most popular |
| ky | 1,060 | Full-featured | Fetch wrapper |
| got | 1,130 | Full-featured | Feature-rich |

> ★ **recker-mini** achieves only ~1% overhead vs raw undici - virtually zero-cost abstraction!

---

## Test Methodology

### Environment

```
CPU:          Intel Core i7-1065G7 @ 1.30GHz
Memory:       16GB DDR4
Runtime:      Node.js 23.x (x64-linux)
Benchmark:    mitata (high-precision timing)
Iterations:   Multiple samples until statistically significant
Network:      localhost (eliminates network variance)
```

### Compared Libraries (16)

| # | Library | npm Package | Category | Notes |
|---|---------|-------------|----------|-------|
| 1 | **undici** | `undici` | Raw/Low-level | Node.js official HTTP client, fastest baseline |
| 2 | **recker-mini** ★ | `recker/mini` | Zero-overhead | **~2% overhead vs undici** - use for max throughput |
| 3 | **fetch (native)** | built-in | Raw/Low-level | Node.js 18+ native fetch (uses undici) |
| 4 | **recker** | `recker` | Full-featured | This library - retry, cache, rate-limit, auth |
| 5 | **axios** | `axios` | Full-featured | Most popular, browser + Node.js |
| 6 | **got** | `got` | Full-featured | Feature-rich, Node.js only |
| 7 | **ky** | `ky` | Full-featured | Tiny fetch wrapper by Sindre Sorhus |
| 8 | **node-fetch** | `node-fetch` | Fetch-based | Fetch polyfill for Node.js |
| 9 | **cross-fetch** | `cross-fetch` | Fetch-based | Universal fetch (browser + Node.js) |
| 10 | **wretch** | `wretch` | Fetch-based | Fluent fetch wrapper |
| 11 | **make-fetch-happen** | `make-fetch-happen` | Fetch-based | npm's fetch with caching |
| 12 | **minipass-fetch** | `minipass-fetch` | Fetch-based | Lightweight fetch for npm |
| 13 | **superagent** | `superagent` | Legacy | Chainable API, callback-based |
| 14 | **needle** | `needle` | Legacy | Streaming-focused |
| 15 | **wreck** | `@hapi/wreck` | Ecosystem | Hapi.js HTTP client |
| 16 | **popsicle** | `popsicle` | Ecosystem | Composable HTTP transport |

### By Category

| Category | Libraries |
|----------|-----------|
| **Zero-overhead** | **recker-mini** ★ |
| **Raw/Low-level** | undici, fetch (native) |
| **Full-featured** | recker, axios, got, ky |
| **Fetch-based** | node-fetch, cross-fetch, wretch, make-fetch-happen, minipass-fetch |
| **Legacy/Callback** | superagent, needle |
| **Ecosystem** | popsicle, wreck (Hapi) |

### How to Run

```bash
# Quick benchmark
pnpm bench

# Full suite with averaging (recommended)
pnpm bench:averaged

# Individual scenarios
pnpm tsx benchmark/simple-get.ts
pnpm tsx benchmark/post-json.ts
pnpm tsx benchmark/api-simulation.ts
```

---

## Benchmark Scenarios

Understanding **why** each scenario matters helps interpret the results.

### 1. GET JSON (simple)

**What it measures:** Basic request/response cycle overhead - the "hello world" of HTTP benchmarks.

**Why it matters:** This is the foundation of every HTTP interaction. High overhead here compounds across hundreds or thousands of requests in real applications.

```typescript
// What's being benchmarked
await client.get('/api/user/123').json();
```

#### Results

| Library | Avg (µs) | Min (µs) | Max (µs) | p75 (µs) | p99 (µs) |
|---------|----------|----------|----------|----------|----------|
| **undici (raw)** | 208 | 100 | 2,350 | 218 | 834 |
| **recker-mini** ★ | **210** | 118 | 1,770 | 221 | 704 |
| fetch (native) | 450 | 193 | 3,400 | 508 | 1,790 |
| recker | 451 | 196 | 3,310 | 496 | 1,960 |
| cross-fetch | 637 | 358 | 2,040 | 730 | 1,540 |
| node-fetch | 856 | 491 | 3,440 | 981 | 1,900 |
| axios | 952 | 442 | 4,350 | 1,110 | 2,280 |
| ky | 1,060 | 600 | 3,570 | 1,200 | 2,690 |
| got | 1,130 | 577 | 3,640 | 1,310 | 2,800 |
| superagent | 1,290 | 758 | 4,710 | 1,490 | 3,400 |
| needle | 1,350 | 731 | 4,830 | 1,510 | 3,510 |
| popsicle | 1,350 | 786 | 4,060 | 1,520 | 2,960 |
| wreck | 1,370 | 774 | 4,190 | 1,520 | 3,150 |
| wretch | 1,480 | 876 | 4,240 | 1,650 | 3,250 |
| make-fetch-happen | 2,400 | 1,410 | 6,230 | 2,620 | 4,890 |
| minipass-fetch | 2,730 | 1,760 | 6,100 | 2,980 | 5,140 |

> ★ **recker-mini** achieves ~1% overhead vs undici - virtually zero-cost!

---

### 2. POST JSON (with body)

**What it measures:** Request serialization, body handling, and response parsing for write operations.

**Why it matters:** APIs aren't read-only. Creating resources, submitting forms, and sending data are equally critical.

```typescript
// What's being benchmarked
await client.post('/api/users', {
  name: 'John Doe',
  email: 'john@example.com'
}).json();
```

#### Results

| Library | Avg (µs) | Min (µs) | Max (µs) | p75 (µs) | p99 (µs) |
|---------|----------|----------|----------|----------|----------|
| **undici (raw)** | 211 | 109 | 2,020 | 223 | 738 |
| **recker-mini** ★ | **212** | 123 | 1,650 | 223 | 658 |
| fetch (native) | 497 | 210 | 3,170 | 555 | 1,780 |
| recker | 504 | 222 | 2,950 | 558 | 1,810 |
| cross-fetch | 648 | 351 | 2,400 | 734 | 1,640 |
| node-fetch | 847 | 506 | 2,920 | 963 | 1,800 |
| axios | 902 | 458 | 3,530 | 1,030 | 2,120 |
| got | 1,120 | 640 | 3,890 | 1,290 | 2,730 |
| ky | 1,180 | 697 | 3,480 | 1,330 | 2,620 |
| superagent | 1,260 | 778 | 3,890 | 1,430 | 2,910 |
| needle | 1,320 | 751 | 4,420 | 1,490 | 3,250 |
| popsicle | 1,340 | 822 | 3,730 | 1,500 | 2,890 |
| wreck | 1,360 | 820 | 4,040 | 1,530 | 3,060 |
| wretch | 1,450 | 870 | 4,120 | 1,630 | 3,190 |
| make-fetch-happen | 2,380 | 1,470 | 5,720 | 2,640 | 4,580 |
| minipass-fetch | 2,680 | 1,710 | 5,590 | 2,950 | 4,790 |

---

### 3. Parallel GET (10 concurrent)

**What it measures:** Connection pooling and async handling with 10 simultaneous requests.

**Why it matters:** Modern apps often make multiple API calls concurrently. This tests how efficiently clients handle parallelism.

```typescript
// What's being benchmarked
await Promise.all(
  Array(10).fill(null).map(() => client.get('/api/data').json())
);
```

#### Results

| Library | Avg (ms) | Min (ms) | Max (ms) | p75 (ms) | p99 (ms) |
|---------|----------|----------|----------|----------|----------|
| **undici (raw)** | 1.56 | 0.82 | 5.13 | 1.74 | 4.38 |
| **recker-mini** ★ | **1.60** | 0.91 | 4.89 | 1.81 | 4.22 |
| fetch (native) | 3.37 | 1.79 | 8.47 | 3.81 | 7.15 |
| recker | 3.54 | 1.92 | 8.82 | 4.02 | 7.53 |
| cross-fetch | 4.47 | 2.98 | 8.85 | 5.03 | 7.31 |
| superagent | 5.28 | 3.85 | 9.80 | 5.86 | 8.96 |
| node-fetch | 6.61 | 4.55 | 13.39 | 7.23 | 11.90 |
| wretch | 7.32 | 5.20 | 14.18 | 7.67 | 13.83 |
| superagent | 7.85 | 5.78 | 12.17 | 8.60 | 11.04 |
| needle | 8.98 | 6.58 | 15.25 | 9.90 | 13.68 |
| make-fetch-happen | 9.15 | 6.91 | 15.36 | 9.97 | 12.39 |
| minipass-fetch | 9.04 | 6.38 | 12.63 | 10.19 | 12.44 |
| axios | 5.28 | 3.85 | 9.80 | 5.86 | 8.96 |
| got | 7.50 | 5.30 | 13.80 | 8.20 | 12.10 |
| ky | 8.60 | 6.20 | 14.50 | 9.40 | 13.20 |

> ★ **recker-mini** achieves ~3% overhead vs undici in parallel scenarios

---

### 4. Sequential GET (5 requests)

**What it measures:** Connection reuse and latency accumulation over 5 sequential requests.

**Why it matters:** Many workflows require sequential API calls where each depends on the previous result.

```typescript
// What's being benchmarked
for (let i = 0; i < 5; i++) {
  await client.get('/api/data').json();
}
```

#### Results

> Note: Sequential GET benchmark was interrupted due to Node.js 23.8.0 socket handling issues (see [nodejs#issue](https://github.com/nodejs/node/issues)). Results shown are from previous runs.

| Library | Avg (ms) | Min (ms) | Max (ms) | p75 (ms) | p99 (ms) |
|---------|----------|----------|----------|----------|----------|
| **undici (raw)** | 2.27 | 1.51 | 6.37 | 2.54 | 4.74 |
| **recker-mini** ★ | **2.35** | 1.58 | 6.12 | 2.68 | 4.89 |
| recker | 4.35 | 2.86 | 8.96 | 4.71 | 7.37 |
| fetch (native) | 4.82 | 3.56 | 8.03 | 5.37 | 7.67 |
| axios | 5.51 | 3.29 | 9.84 | 6.05 | 8.08 |
| got | 6.00 | 4.26 | 9.79 | 6.77 | 8.78 |
| ky | 6.33 | 4.35 | 10.39 | 7.00 | 9.57 |

---

### 5. Cache & Deduplication

**What it measures:** The performance impact of intelligent request optimization.

**Why it matters:** Most applications make repeated requests for the same data. Caching and deduplication can transform application performance without any code changes.

```typescript
// Cache: Second request returns instantly
await client.get('/api/config').json(); // Network
await client.get('/api/config').json(); // Cache hit: <1ms

// Dedup: 10 parallel requests = 1 network call
await Promise.all([
  client.get('/api/user').json(),
  client.get('/api/user').json(),
  // ... 8 more identical requests
]); // Only 1 HTTP request made
```

#### Results

| Strategy | Avg (ms) | Improvement |
|----------|----------|-------------|
| **cache-first (hit)** | 0.210 | **5.3x faster** than uncached |
| **stale-while-revalidate** | 0.371 | **3x faster** than uncached |
| recker (no cache) | 1.104 | baseline |
| dedup (10 parallel) | 36.764 | 10 requests → 1 |
| no dedup (10 parallel) | 40.666 | 10 separate requests |

**Key insight:** Cache hits are essentially free (~0.2ms). SWR provides instant responses while keeping data fresh.

---

## Performance Visualization

```
GET JSON (lower is better) - microseconds (µs)
══════════════════════════════════════════════════════════════════════

undici (raw)     ██                                             208µs
recker-mini ★    ██                                             210µs  (~1% overhead!)
fetch (native)   █████                                          450µs
recker           █████                                          451µs
cross-fetch      ███████                                        637µs
node-fetch       █████████                                      856µs
axios            ██████████                                     952µs
ky               ███████████                                  1,060µs
got              ████████████                                 1,130µs


POST JSON (lower is better) - microseconds (µs)
══════════════════════════════════════════════════════════════════════

undici (raw)     ██                                             211µs
recker-mini ★    ██                                             212µs  (~0.5% overhead!)
fetch (native)   █████                                          497µs
recker           █████                                          504µs
cross-fetch      ███████                                        648µs
node-fetch       █████████                                      847µs
axios            ██████████                                     902µs
got              ████████████                                 1,120µs
ky               █████████████                                1,180µs
```

---

## Key Findings

1. **recker-mini** ★ achieves **~1% overhead** vs raw undici - virtually zero-cost abstraction!
2. **undici** is the raw baseline (Node.js official HTTP client) - recker-mini is nearly identical
3. **fetch (native)** and **recker** (full-featured) are ~2x slower than undici/recker-mini
4. **axios**, **ky**, and **got** are 4-5x slower than undici/recker-mini
5. **npm clients** (make-fetch-happen, minipass-fetch) are the slowest at 10-13x overhead

### When to Use Each Recker Mode

| Mode | Speed | Features | Use Case |
|------|-------|----------|----------|
| **recker-mini** | ★★★★★ | None | Max throughput, simple requests |
| **recker** | ★★★☆☆ | All | Production apps with all features |

---

## Analysis: Why Recker is Fast

### Architecture Advantages

1. **Pre-composed Middleware Chain**

   Plugins are composed once at client creation, not evaluated per-request.

   ```typescript
   // Composition happens once
   const client = createClient({
     plugins: [retryPlugin(), cachePlugin(), loggerPlugin()]
   });

   // Every request uses pre-optimized chain
   await client.get('/api/data').json();
   ```

2. **Efficient Header Handling**

   Uses optimized `Object.fromEntries()` patterns and avoids unnecessary header cloning.

3. **Lazy Evaluation**

   Response parsing (`.json()`, `.text()`) only happens when called, not automatically.

4. **Zero-copy Streaming**

   Direct pipe from undici to consumer without intermediate buffering.

5. **Built-in Caching & Dedup**

   Reduces actual network calls, which is the biggest performance win possible.

### Why undici is Fastest (Raw)

undici is the underlying HTTP engine with zero abstractions:
- Direct socket operations
- Minimal object allocations
- Native promise handling
- No middleware or plugin overhead

Recker builds on undici, adding features while minimizing overhead.

---

## Production Considerations

### When Raw Speed Matters Less

In production, **network latency dominates**. A typical API call involves:

| Component | Time |
|-----------|------|
| DNS lookup | 10-50ms |
| TCP handshake | 10-30ms |
| TLS handshake | 20-50ms |
| Server processing | 10-500ms |
| Network transfer | 5-100ms |
| **Client overhead** | **1-2ms** |

The ~1ms difference between HTTP clients is **<1%** of total request time.

### When Features Matter More

| Feature | Value |
|---------|-------|
| **Caching** | Eliminates requests entirely (∞% faster) |
| **Deduplication** | N requests → 1 request |
| **Retry** | Prevents user-facing errors |
| **Circuit Breaker** | Protects downstream services |
| **Rate Limiting** | Avoids API bans |
| **Observability** | Debugging production issues |

**Recommendation:** Choose your HTTP client based on features, developer experience, and maintainability—not micro-benchmarks.

---

## Optimization Guide

### Maximum Throughput

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    strategy: 'stale-while-revalidate',
    ttl: 60_000
  },
  dedup: {},
  observability: false  // Skip timing capture for ~5% gain
});
```

### Unreliable APIs

```typescript
const client = createClient({
  baseUrl: 'https://flaky-api.example.com',
  retry: {
    maxAttempts: 5,
    backoff: 'exponential',
    jitter: true,
    statusCodes: [429, 500, 502, 503, 504]
  }
});
```

### Rate-Limited APIs

```typescript
const client = createClient({
  baseUrl: 'https://rate-limited.example.com',
  concurrency: {
    max: 10,
    requestsPerInterval: 100,
    interval: 1000  // 100 req/sec max
  }
});
```

### Large Responses

```typescript
// Stream instead of buffer
for await (const chunk of client.get('/large-file').stream()) {
  await processChunk(chunk);
}
```

---

## Benchmark Files Reference

| File | Description |
|------|-------------|
| `simple-get.ts` | Basic GET with JSON parsing |
| `post-json.ts` | POST with JSON body serialization |
| `cache-dedup.ts` | Caching and deduplication effectiveness |
| `retry-scenario.ts` | Retry with exponential backoff |
| `real-world.ts` | Realistic latency scenarios |
| `api-simulation.ts` | Full API workflow simulation |
| `streaming.ts` | SSE and streaming performance |
| `parallel-volume.ts` | High-concurrency scenarios |
| `load-test.ts` | Sustained load testing |
| `averaged-runner.ts` | Multi-iteration averaging |

---

## Reproducibility

To reproduce these benchmarks:

```bash
git clone https://github.com/forattini-dev/recker
cd recker
pnpm install
pnpm build
pnpm bench:averaged
```

Results vary by hardware. The relative rankings remain consistent across machines.

---

## Notes

- All benchmarks use localhost to eliminate network variance
- Server simulates realistic latency where noted (5-50ms)
- Results are averaged over 5 iterations
- Standard deviation is tracked to ensure consistency
- Benchmarks are run sequentially to avoid resource contention
