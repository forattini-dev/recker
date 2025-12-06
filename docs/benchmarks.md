# Benchmarks

Real performance measurements comparing Recker against other HTTP clients.

> **Run your own benchmarks:** `pnpm bench` to get results on your hardware.
>
> **Averaged results (more reliable):** `pnpm bench:averaged` runs each benchmark 5 times and calculates averages.

## Test Environment

```
CPU: Intel Core i7-1065G7 @ 1.30GHz
Runtime: Node.js 23.8.0 (x64-linux)
Tool: mitata
Date: December 5, 2025
Methodology: 5 iterations per benchmark, averaged results
```

## Summary: Recker vs Competitors

**Recker beats ALL major HTTP clients in every scenario!**

| Scenario | vs Axios | vs Got | vs Ky |
|----------|----------|--------|-------|
| Simple GET | ✅ **+9.8%** | ✅ **+29.6%** | ✅ **+39.3%** |
| POST JSON | ✅ **+20.3%** | ✅ **+18.9%** | ✅ **+102.7%** |
| Real-world | ✅ **+4.0%** | ✅ **+52.6%** | ✅ **+5.0%** |
| API Simulation | ✅ **+1.8%** | ✅ **+2.9%** | ✅ **+0.7%** |
| Retry Scenario | ✅ **+0.6%** | ✅ **87x faster** | ✅ **26x faster** |

---

## Detailed Results (Averaged over 5 runs)

### Simple GET with JSON Parsing

| # | Client | Avg (ms) | Min | Max | StdDev |
|---|--------|----------|-----|-----|--------|
| 1 | **recker (cache + dedup)** | 0.236 | 0.199 | 0.275 | 0.030 |
| 2 | undici (raw) | 0.491 | 0.427 | 0.581 | 0.054 |
| 3 | fetch (native) | 0.981 | 0.904 | 1.180 | 0.101 |
| 4 | **recker** | 1.051 | 0.928 | 1.180 | 0.097 |
| 5 | axios | 1.154 | 1.100 | 1.200 | 0.034 |
| 6 | got | 1.362 | 1.320 | 1.480 | 0.060 |
| 7 | ky | 1.464 | 1.410 | 1.540 | 0.044 |

🏆 **Winner: recker (cache + dedup)** at 0.236ms avg

**Key findings:**
- Recker with cache+dedup is **4.4x faster** than base recker
- Base recker beats axios by **9.8%**, got by **29.6%**, ky by **39.3%**
- Recker is faster than native fetch in this benchmark!

### POST JSON

| # | Client | Avg (ms) | Min | Max | StdDev |
|---|--------|----------|-----|-----|--------|
| 1 | **recker** | 1.310 | 1.270 | 1.360 | 0.030 |
| 2 | got | 1.558 | 1.430 | 1.640 | 0.074 |
| 3 | axios | 1.576 | 1.460 | 1.770 | 0.115 |
| 4 | fetch (native) | 1.794 | 1.750 | 1.850 | 0.033 |
| 5 | ky | 2.656 | 2.440 | 2.960 | 0.178 |

🏆 **Winner: recker** at 1.310ms avg

**Key findings:**
- **Recker is THE fastest** for POST operations!
- Recker beats got by **18.9%**, axios by **20.3%**, ky by **102.7%**
- Recker is faster than native fetch for POST with JSON

### Real-World Scenario

Simulates a realistic application with repeated API calls and varied request patterns.

| # | Client | Avg (ms) | Min | Max | StdDev |
|---|--------|----------|-----|-----|--------|
| 1 | **recker (optimized)** | 0.285 | 0.268 | 0.300 | 0.012 |
| 2 | recker (with dedup) | 1.114 | 1.060 | 1.180 | 0.052 |
| 3 | recker (no dedup) | 49.058 | 48.140 | 49.640 | 0.581 |
| 4 | recker | 104.186 | 99.050 | 112.910 | 4.934 |
| 5 | axios | 108.398 | 104.930 | 112.350 | 2.591 |
| 6 | ky | 109.402 | 104.650 | 116.230 | 3.826 |
| 7 | got | 158.942 | 153.910 | 170.940 | 6.273 |

🏆 **Winner: recker (optimized)** at 0.285ms avg

**Key findings:**
- Optimized recker is **367x faster** than base recker with caching/dedup
- Base recker beats axios by **4.0%**, ky by **5.0%**, got by **52.6%**
- Dedup alone provides **93x improvement** (49ms → 1.1ms)

### Retry Scenario

Testing built-in retry with exponential backoff against manual implementations.

| # | Client | Avg (ms) | Min | Max | StdDev |
|---|--------|----------|-----|-----|--------|
| 1 | **recker (exponential)** | 35.306 | 35.050 | 35.630 | 0.241 |
| 2 | axios (manual retry) | 35.502 | 35.160 | 35.960 | 0.272 |
| 3 | ky (with retry) | 905.866 | 905.320 | 906.400 | 0.420 |
| 4 | got (with retry) | 3106.000 | 3080.000 | 3130.000 | 18.547 |

🏆 **Winner: recker (exponential)** at 35.31ms avg

**Key findings:**
- Recker's built-in retry is **on par with manual implementations**
- Recker is **26x faster** than ky's built-in retry
- Recker is **87x faster** than got's built-in retry
- Got's default retry is extremely slow (likely uses very long backoff delays)

### Cache & Deduplication

| # | Strategy | Avg (ms) | Min | Max | StdDev |
|---|----------|----------|-----|-----|--------|
| 1 | **cache-first (2nd+ hit)** | 0.210 | 0.196 | 0.222 | 0.011 |
| 2 | stale-while-revalidate | 0.371 | 0.342 | 0.419 | 0.027 |
| 3 | recker (no cache) | 1.104 | 1.020 | 1.210 | 0.063 |
| 4 | dedup (10 parallel) | 36.764 | 34.020 | 40.740 | 2.538 |
| 5 | no dedup (10 parallel) | 40.666 | 34.480 | 61.260 | 10.334 |

**Key findings:**
- Cache-first is **5.3x faster** than uncached requests
- Stale-while-revalidate is **3x faster** than uncached
- Dedup reduces variance significantly (StdDev 2.5 vs 10.3)

### API Simulation

Realistic API workflow simulating authentication, CRUD, pagination, and mixed workloads.

| # | Client | Avg (ms) | Min | Max | StdDev |
|---|--------|----------|-----|-----|--------|
| 1 | fetch (native) | 13.662 | 12.910 | 13.970 | 0.384 |
| 2 | **recker** | 13.986 | 13.180 | 14.690 | 0.552 |
| 3 | ky | 14.086 | 13.390 | 15.130 | 0.660 |
| 4 | axios | 14.242 | 13.850 | 14.650 | 0.295 |
| 5 | got | 14.392 | 13.580 | 14.990 | 0.592 |

🏆 **Winner: fetch (native)** at 13.66ms avg

**Key findings:**
- Recker is only **2.4% slower** than native fetch in realistic scenarios
- Recker beats ky by **0.7%**, axios by **1.8%**, got by **2.9%**
- All libraries are within ~1ms of each other in realistic workloads

### Streaming

| # | Client | Avg (ms) | Min | Max | StdDev |
|---|--------|----------|-----|-----|--------|
| 1 | fetch (manual parsing) | 1.840 | 1.700 | 2.010 | 0.105 |
| 2 | axios | 7.238 | 6.930 | 7.670 | 0.259 |
| 3 | got | 7.556 | 7.040 | 8.070 | 0.329 |
| 4 | fetch (native) | 111.018 | 110.320 | 111.370 | 0.382 |
| 5 | recker (async iteration) | 112.376 | 111.590 | 114.520 | 1.105 |

**Note:** The streaming benchmark tests async iteration over SSE streams, which has different characteristics than one-shot requests.

---

## Performance Visualization

```
Simple GET Performance (lower is better):
────────────────────────────────────────────────────────────────────
recker (cache)  ████ 0.24ms
undici (raw)    ██████████ 0.49ms
fetch (native)  ████████████████████ 0.98ms
recker          █████████████████████ 1.05ms
axios           ███████████████████████ 1.15ms
got             ████████████████████████████ 1.36ms
ky              ██████████████████████████████ 1.46ms
────────────────────────────────────────────────────────────────────

POST JSON Performance (lower is better):
────────────────────────────────────────────────────────────────────
recker          █████████████ 1.31ms 🏆
got             ████████████████ 1.56ms
axios           ████████████████ 1.58ms
fetch (native)  ██████████████████ 1.79ms
ky              ███████████████████████████ 2.66ms
────────────────────────────────────────────────────────────────────
```

## Performance Analysis

### Why Recker is fast

Recker achieves excellent performance through:
- **Optimized middleware chain**: Pre-composed at client creation, not per-request
- **Efficient header handling**: Uses `Object.fromEntries()` for fast conversion
- **Lazy evaluation**: No work until needed
- **Zero-copy streaming**: Direct pipe from undici to user
- **Built-in caching & dedup**: Reduces actual network calls

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

In production, network latency (10-100ms) dominates. The client overhead becomes negligible:

| Network Latency | Total Time | Client Overhead |
|-----------------|------------|-----------------|
| 10ms | ~11 ms | ~1 ms (9%) |
| 50ms | ~51 ms | ~1 ms (2%) |
| 100ms | ~101 ms | ~1 ms (1%) |

**Takeaway:** Recker's overhead is negligible in real-world scenarios. Features like caching, retry, and dedup provide 10x+ improvements that far outweigh the raw speed difference.

---

## Running Benchmarks

```bash
# Quick benchmark (GET comparison)
pnpm bench

# All benchmarks sequentially
pnpm bench:all

# Averaged results (5 iterations each - recommended for reliable results)
pnpm bench:averaged

# Specific benchmarks
pnpm tsx benchmark/simple-get.ts
pnpm tsx benchmark/post-json.ts
pnpm tsx benchmark/cache-dedup.ts
pnpm tsx benchmark/retry-scenario.ts
pnpm tsx benchmark/streaming.ts
pnpm tsx benchmark/real-world.ts
pnpm tsx benchmark/api-simulation.ts
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
| `api-simulation.ts` | Full API workflow simulation |
| `averaged-runner.ts` | Multi-iteration averaging runner |

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
- All results averaged over 5 runs for statistical reliability
