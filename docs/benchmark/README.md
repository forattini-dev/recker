# Recker Benchmarks

Comprehensive benchmark suite for measuring Recker's performance.

## Running Benchmarks

```bash
# Run all benchmarks
pnpm bench

# Run all benchmarks sequentially
pnpm bench:all

# Run averaged benchmarks (5 iterations for statistical reliability)
pnpm bench:averaged

# Run API simulation benchmark
pnpm bench:api

# Run specific benchmark
pnpm tsx benchmark/simple-get.ts
pnpm tsx benchmark/post-json.ts
pnpm tsx benchmark/retry-scenario.ts
pnpm tsx benchmark/cache-dedup.ts
pnpm tsx benchmark/streaming.ts
pnpm tsx benchmark/real-world.ts
pnpm tsx benchmark/api-simulation.ts
```

## Benchmark Suites

### 1. Simple GET (`simple-get.ts`)
Tests basic GET request performance with JSON parsing.

**What it measures:**
- Client initialization cost
- JSON parsing performance
- Cache/dedup benefits

### 2. POST JSON (`post-json.ts`)
Tests POST requests with automatic JSON serialization.

**What it measures:**
- Request body serialization
- Content-Type header handling
- Response parsing

### 3. Retry Scenario (`retry-scenario.ts`)
Tests retry logic with exponential backoff when server returns 503 errors.

**What it measures:**
- Retry strategy overhead
- Backoff timing accuracy
- Error handling performance

### 4. Cache & Dedup (`cache-dedup.ts`)
Tests caching strategies and request deduplication.

**What it measures:**
- Cache hit performance (should be near-instant)
- Stale-while-revalidate efficiency
- Dedup effectiveness (10 parallel requests → 1 HTTP call)

**Expected results:** Cached requests should be 100x+ faster. Dedup should reduce HTTP calls by 90%.

### 5. Streaming (`streaming.ts`)
Tests streaming capabilities including SSE parsing.

**What it measures:**
- Large response handling (1MB JSON)
- Chunked transfer encoding
- Server-Sent Events parsing

### 6. Real-world (`real-world.ts`)
Tests realistic API scenarios with simulated network latency.

**What it measures:**
- Performance with realistic latency (10-50ms)
- Sequential vs parallel requests
- Cache/dedup benefits in real scenarios

### 7. API Simulation (`api-simulation.ts`)
Comprehensive API workflow simulation with realistic patterns.

**What it measures:**
- Authentication flows (login + authenticated requests)
- CRUD operations (Create, Read, Update, Delete)
- Paginated listing (5 pages of results)
- Custom headers handling (10 requests with varied headers)
- Mixed workload (realistic SPA session)
- Large response handling (~500KB JSON)

**Expected results:** Recker should beat axios, got, and ky in all scenarios.

### 8. Averaged Runner (`averaged-runner.ts`)
Multi-iteration benchmark runner for statistical reliability.

**Features:**
- Runs each benchmark 5 times (configurable via BENCH_ITERATIONS)
- Sequential execution to avoid performance interference
- Calculates avg, min, max, and standard deviation
- Shows winner and Recker vs competitors summary

## Understanding Results

Mitata benchmark output includes:

- **avg (min … max)**: Average time with range
- **p75 / p99**: 75th and 99th percentile latencies
- **ops/sec**: Operations per second (higher is better)

### What to look for:

✅ **Good results:**
- Cache providing 10x+ speedup
- Dedup reducing HTTP calls
- Consistent p99 latencies

❌ **Red flags:**
- Cache not providing expected speedup
- Dedup not reducing HTTP calls
- High variance between runs

## Interpreting Performance

### Absolute Numbers
Don't focus too much on absolute μs/ms numbers. They vary by machine.

### Relative Performance
Focus on performance with and without optimizations:
```
no cache:     1.5ms  ← baseline
with cache:   0.15ms ← 10x faster
with dedup:   0.8ms  ← 2x faster (parallel)
```

### Real-world Impact
- Sub-1ms differences are negligible for most apps
- 10-50ms differences matter for high-throughput APIs
- Cache/dedup can provide 10-100x improvements

## Performance Tips

### Optimize for your use case:

**High-throughput, same endpoints:**
```typescript
// Enable dedup to collapse parallel requests
createClient({ dedup: {} })
```

**Read-heavy APIs:**
```typescript
// Aggressive caching
createClient({
  cache: { strategy: 'stale-while-revalidate', ttl: 60000 }
})
```

**Unreliable APIs:**
```typescript
// Smart retry with backoff
createClient({
  retry: { backoff: 'exponential', maxAttempts: 5 }
})
```

## Contributing Benchmarks

To add a new benchmark:

1. Create `benchmark/your-benchmark.ts`
2. Use mitata's `group()` and `bench()` APIs
3. Add to `benchmarks` array in `run-all.ts`
4. Document in this README

### Benchmark Guidelines:

- ✅ Test realistic scenarios
- ✅ Use consistent test data
- ✅ Warm up caches before measuring
- ❌ Don't test artificial micro-optimizations

## CI/CD Integration

Benchmarks can be run in CI to detect performance regressions:

```yaml
# .github/workflows/benchmark.yml
- name: Run benchmarks
  run: pnpm bench > benchmark-results.txt

- name: Compare with baseline
  run: node scripts/compare-benchmarks.js
```

## Hardware Info

Benchmark results vary by hardware. Document your setup:

```bash
node -v           # Node version
uname -a          # OS info
sysctl -n hw.cpu  # CPU (macOS)
lscpu             # CPU (Linux)
```

## Known Limitations

1. **Network variability**: Local server removes real network effects
2. **JIT warmup**: First runs may be slower (mitata handles this)
3. **GC pauses**: Can affect timing (run multiple iterations)
4. **System load**: Close other apps for consistent results

## Questions?

- Performance issues? [Open an issue](https://github.com/forattini-dev/recker/issues)
- Benchmark ideas? Submit a PR!
