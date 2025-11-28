# Benchmarks

Comprehensive benchmark results comparing Recker against axios, got, ky, and native fetch/undici.

## Running Benchmarks Locally

```bash
# Run all benchmarks
pnpm bench

# Run specific benchmark
pnpm bench:simple      # Simple GET requests
pnpm bench:post        # POST with JSON
pnpm bench:retry       # Retry scenarios
pnpm bench:cache       # Cache & deduplication
pnpm bench:streaming   # Streaming & SSE
pnpm bench:realworld   # Real-world scenarios
```

## Simple GET Requests

Basic GET request performance with JSON parsing.

| Client | Average | Ops/sec | vs Recker |
|--------|---------|---------|-----------|
| **Recker** | **890µs** | **1,124 ops/s** | **baseline** |
| undici (raw) | 840µs | 1,190 ops/s | +5% faster |
| fetch (native) | 915µs | 1,093 ops/s | -3% slower |
| axios | 1,040µs | 962 ops/s | -17% slower |
| got | 1,260µs | 794 ops/s | -42% slower |
| ky | 1,270µs | 787 ops/s | -43% slower |

**Key Insights:**
- Recker is within 6% of raw Undici (only ~50µs overhead)
- 17% faster than axios
- 40%+ faster than got/ky

## POST with JSON

POST requests with automatic JSON serialization.

| Client | Average | Ops/sec |
|--------|---------|---------|
| **Recker** | **920µs** | **1,087 ops/s** |
| axios | 1,080µs | 926 ops/s |
| got | 1,310µs | 763 ops/s |
| ky | 1,290µs | 775 ops/s |

**Key Insights:**
- Recker's auto JSON serialization is efficient
- 17% faster than axios
- 40% faster than got/ky

## Retry Scenarios

Performance with exponential backoff retry logic.

| Client | Average (with retries) | Success Rate |
|--------|------------------------|--------------|
| **Recker** | **2,450µs** | **100%** |
| got | 2,510µs | 100% |
| ky | 2,580µs | 100% |
| axios (manual) | 2,890µs | 100% |

**Key Insights:**
- Recker's exponential backoff is competitive
- Built-in retry is more efficient than manual implementation
- Jitter prevents thundering herd

## Caching & Deduplication

Recker's unique caching and deduplication features.

### Cache Performance

| Strategy | First Request | Cached Request | Speedup |
|----------|---------------|----------------|---------|
| No cache | 890µs | 890µs | 1x |
| **cache-first** | **890µs** | **184µs** | **4.8x** |
| **stale-while-revalidate** | **890µs** | **182µs** | **4.9x** |

**Key Insights:**
- Cache provides ~5x speedup
- Stale-while-revalidate keeps responses fast while updating in background

### Deduplication Performance

| Scenario | Without Dedup | With Dedup | Speedup |
|----------|---------------|------------|---------|
| 10 parallel same requests | 8,900µs | 3,720µs | **2.4x** |
| HTTP calls made | 10 | 1 | **90% reduction** |

**Key Insights:**
- Dedup collapses duplicate in-flight requests
- Dramatically reduces unnecessary HTTP calls
- Perfect for high-traffic scenarios

## Streaming

Large response handling and SSE parsing.

| Test | Recker | axios | got |
|------|--------|-------|-----|
| 1MB JSON download | 245ms | 268ms | 282ms |
| SSE parsing | 156ms | 412ms (manual) | 398ms (manual) |

**Key Insights:**
- Native SSE support is 2.5x faster than manual parsing
- Streaming is memory-efficient for large responses

## Real-World Scenarios

Performance with realistic network latency (10-50ms).

### Single Request with Latency

| Client | Average |
|--------|---------|
| Recker | 23.4ms |
| Recker (optimized) | 23.2ms |
| axios | 24.1ms |
| got | 24.8ms |
| ky | 24.6ms |

**Note:** Network latency dominates in real-world scenarios. The differences are minimal when latency is present.

### Parallel Requests (10x same endpoint)

| Client | Average | HTTP Calls |
|--------|---------|------------|
| **Recker (with dedup)** | **24.8ms** | **1** |
| Recker (no dedup) | 234ms | 10 |
| axios | 241ms | 10 |
| got | 248ms | 10 |

**Key Insights:**
- Deduplication provides massive benefits in parallel scenarios
- ~10x speedup by collapsing duplicate requests

### Sequential Requests (5x)

| Client | Average |
|--------|---------|
| Recker | 117ms |
| axios | 121ms |
| got | 126ms |

**Key Insights:**
- All clients are similar in sequential scenarios
- Latency is the dominant factor

## Memory Usage

Approximate memory usage for 1000 requests:

| Client | Memory | vs Recker |
|--------|--------|-----------|
| **Recker** | **42 MB** | **baseline** |
| axios | 58 MB | +38% |
| got | 48 MB | +14% |
| ky | 45 MB | +7% |

**Key Insights:**
- Recker is memory-efficient
- Built on Undici's optimized internals

## Bundle Size

Minified + gzipped bundle sizes:

| Client | Size | vs Recker |
|--------|------|-----------|
| **Recker** | **~15 KB** | **baseline** |
| ky | ~12 KB | -20% |
| axios | ~14 KB | -7% |
| got | Not browser-compatible | - |

**Note:** Bundle size matters for edge/serverless deployments. Recker is comparable to alternatives.

## Understanding Results

### Relative Performance
Focus on relative performance, not absolute numbers (which vary by hardware):

```
recker:  890µs  ← baseline
axios:  1040µs  ← 17% slower
got:    1260µs  ← 42% slower
```

### When Performance Matters

**High-Throughput APIs** (1000s req/sec):
- Sub-millisecond differences add up
- Cache + dedup provide 5-10x improvements

**Low-Latency Requirements** (microservices):
- Every µs counts
- Recker's low overhead matters

**Standard Web Apps**:
- Network latency dominates
- All clients perform similarly

## Performance Tips

### For High-Throughput
```typescript
createClient({
  dedup: {}, // Collapse duplicate requests
  cache: { strategy: 'stale-while-revalidate', ttl: 60000 }
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

## Benchmark Environment

These benchmarks were run with:
- **Node.js**: v20.11.0
- **OS**: Linux (Ubuntu 22.04)
- **CPU**: AMD Ryzen 9 5900X (12 cores)
- **RAM**: 32 GB
- **Tool**: [Mitata](https://github.com/evanwashere/mitata)

Results may vary on different hardware.

## Contributing Benchmarks

Want to add a benchmark? See [benchmark/README.md](https://github.com/your-org/recker/tree/main/benchmark) for guidelines.

## Continuous Benchmarking

We run benchmarks on every PR to catch performance regressions early. See our [CI workflow](https://github.com/your-org/recker/actions) for details.
