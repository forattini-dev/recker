# Recker Benchmarks

Comprehensive benchmark suite comparing Recker against axios, got, ky, and native fetch.

## Running Benchmarks

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

## Benchmark Suites

### 1. Simple GET (`simple-get.ts`)
Tests basic GET request performance with JSON parsing.

**What it measures:**
- Baseline overhead vs raw undici/fetch
- Client initialization cost
- JSON parsing performance
- Cache/dedup benefits

**Expected results:** Recker should be within 5-10% of raw undici, faster than axios/got.

### 2. POST JSON (`post-json.ts`)
Tests POST requests with automatic JSON serialization.

**What it measures:**
- Request body serialization
- Content-Type header handling
- Response parsing

**Expected results:** Recker's auto JSON serialization should match or beat competitors.

### 3. Retry Scenario (`retry-scenario.ts`)
Tests retry logic with exponential backoff when server returns 503 errors.

**What it measures:**
- Retry strategy overhead
- Backoff timing accuracy
- Error handling performance

**Expected results:** Recker's exponential backoff should be competitive with got/ky.

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

**Expected results:** Recker's native SSE support should significantly outperform manual parsing.

### 6. Real-world (`real-world.ts`)
Tests realistic API scenarios with simulated network latency.

**What it measures:**
- Performance with realistic latency (10-50ms)
- Sequential vs parallel requests
- Cache/dedup benefits in real scenarios

**Expected results:** Recker with cache+dedup should show clear advantages in parallel scenarios.

## Understanding Results

Mitata benchmark output includes:

- **avg (min … max)**: Average time with range
- **p75 / p99**: 75th and 99th percentile latencies
- **ops/sec**: Operations per second (higher is better)

### What to look for:

✅ **Recker should be:**
- Comparable to raw undici/fetch (within 10%)
- Faster than axios in most scenarios
- Competitive with got/ky
- Significantly faster with cache/dedup enabled

❌ **Red flags:**
- >20% slower than competitors in simple scenarios
- Cache not providing 10x+ speedup
- Dedup not reducing HTTP calls

## Interpreting Performance

### Absolute Numbers
Don't focus too much on absolute μs/ms numbers. They vary by machine.

### Relative Performance
Focus on relative performance between clients:
```
recker:  1.5ms  ← baseline
got:     1.8ms  ← 20% slower
axios:   2.1ms  ← 40% slower
```

### Real-world Impact
- Sub-1ms differences are negligible
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
  cache: { strategy: 'stale-while-revalidate', ttl: 60_000 }
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
- ✅ Include multiple clients for comparison
- ✅ Use consistent test data
- ✅ Warm up caches before measuring
- ❌ Don't test artificial micro-optimizations
- ❌ Don't cherry-pick favorable scenarios

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

- Performance issues? [Open an issue](https://github.com/your-org/recker/issues)
- Benchmark ideas? Submit a PR!
- Questions? Check [CLAUDE.md](../CLAUDE.md) or ask in discussions
