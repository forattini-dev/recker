# Performance Benchmarks

Comprehensive HTTP performance analysis comparing Recker against industry-standard clients. These benchmarks measure real-world scenarios that matter for production applications.

> Recker: Multi-Protocol SDK for the AI Era — Nine protocols unified with top-tier HTTP performance.

> **Methodology**: All results are averaged over 7 iterations with V8 JIT warmup for statistical reliability.

## Executive Summary

### Key Results (Averaged over 7 runs)

| Scenario | Winner | recker-mini | vs undici |
|----------|--------|-------------|-----------|
| **GET JSON** | 🏆 recker-mini | **528 µs** | 11% faster |
| **POST JSON** | undici | 618 µs | +2.6% |
| **Parallel GET (10x)** | undici | 5.31 ms | +29% |
| **Sequential GET (5x)** | undici | 2.72 ms | +10% |

### Bundle Size Comparison

| Library | Minified | Gzipped | vs Smallest |
|---------|----------|---------|-------------|
| **recker-browser-mini** ★ | 1.85 KB | **617 B** | baseline |
| wretch | 4.02 KB | 1.72 KB | +186% |
| ky | 14.04 KB | 5.03 KB | +735% |
| @hapi/wreck | 34.83 KB | 11.57 KB | +1821% |
| node-fetch | 92.95 KB | 26.18 KB | +4246% |
| got | 149.12 KB | 45.49 KB | +7449% |
| axios | 233.67 KB | 56.37 KB | +9256% |
| superagent | 305.63 KB | 75.34 KB | +12403% |
| undici | 484.50 KB | 152.08 KB | +25140% |
| **recker-mini** ★ | 486.86 KB | 152.90 KB | +25276% |
| **recker-browser** ★ | 1005.64 KB | 261.86 KB | +43360% |
| **recker** ★ | 1.97 MB | 556.08 KB | +92189% |

> ★ = Recker variants

### Recker Variants Summary

| Variant | Runtime | Transport | Bundle (gzip) | Use Case |
|---------|---------|-----------|---------------|----------|
| **recker-browser-mini** | Browser | fetch direct | **617 B** | Maximum browser performance |
| **recker-mini** | Node.js | undici direct | 152.90 KB | Maximum Node.js performance |
| **recker-browser** | Browser | FetchTransport | 261.86 KB | Browser with features |
| **recker** | Node.js | UndiciTransport | 556.08 KB | Full-featured Node.js |

---

## HTTP Client Comparison (15 Libraries)

> Results averaged over 7 iterations with V8 JIT warmup (100 iterations per client)

### GET JSON (simple)

| Library | Avg | StdDev | Min → Max | vs undici |
|---------|-----|--------|-----------|-----------|
| **recker-mini** ★ 🏆 | **528 µs** | ±113 µs | 440 µs → 790 µs | **-11%** |
| undici (raw) | 598 µs | ±179 µs | 466 µs → 1.02 ms | baseline |
| cross-fetch | 827 µs | ±153 µs | 674 µs → 1.15 ms | +38% |
| recker | 924 µs | ±193 µs | 779 µs → 1.38 ms | +55% |
| axios | 1.08 ms | ±220 µs | 915 µs → 1.58 ms | +81% |
| got | 1.15 ms | ±109 µs | 1.06 ms → 1.34 ms | +92% |
| node-fetch | 1.18 ms | ±108 µs | 1.03 ms → 1.38 ms | +97% |
| fetch (native) | 1.18 ms | ±262 µs | 912 µs → 1.74 ms | +97% |
| ky | 1.30 ms | ±86 µs | 1.18 ms → 1.45 ms | +117% |
| wretch | 1.37 ms | ±282 µs | 1.02 ms → 1.78 ms | +129% |
| wreck | 1.57 ms | ±222 µs | 1.30 ms → 1.88 ms | +163% |
| needle | 1.63 ms | ±278 µs | 1.33 ms → 2.09 ms | +173% |
| superagent | 1.73 ms | ±399 µs | 1.31 ms → 2.43 ms | +189% |
| minipass-fetch | 1.73 ms | ±242 µs | 1.35 ms → 2.04 ms | +189% |
| make-fetch-happen | 1.76 ms | ±228 µs | 1.49 ms → 2.12 ms | +194% |

### POST JSON (with body)

| Library | Avg | StdDev | Min → Max | vs undici |
|---------|-----|--------|-----------|-----------|
| undici (raw) 🏆 | **602 µs** | ±190 µs | 484 µs → 1.06 ms | baseline |
| **recker-mini** ★ | 618 µs | ±148 µs | 496 µs → 968 µs | +2.6% |
| cross-fetch | 1.14 ms | ±366 µs | 900 µs → 2.01 ms | +89% |
| recker | 1.15 ms | ±243 µs | 950 µs → 1.63 ms | +91% |
| axios | 1.44 ms | ±400 µs | 1.14 ms → 2.33 ms | +139% |
| fetch (native) | 1.53 ms | ±157 µs | 1.32 ms → 1.86 ms | +154% |
| got | 1.61 ms | ±509 µs | 1.17 ms → 2.76 ms | +167% |
| node-fetch | 1.69 ms | ±441 µs | 1.35 ms → 2.74 ms | +181% |
| wreck | 1.70 ms | ±364 µs | 1.28 ms → 2.33 ms | +182% |
| needle | 1.71 ms | ±329 µs | 1.41 ms → 2.43 ms | +184% |
| minipass-fetch | 1.86 ms | ±493 µs | 1.44 ms → 2.71 ms | +209% |
| wretch | 1.88 ms | ±378 µs | 1.43 ms → 2.43 ms | +212% |
| make-fetch-happen | 1.97 ms | ±587 µs | 1.42 ms → 2.89 ms | +227% |
| superagent | 2.09 ms | ±955 µs | 1.47 ms → 4.39 ms | +247% |
| ky | 2.54 ms | ±770 µs | 1.98 ms → 4.34 ms | +322% |

### Parallel GET (10 concurrent)

| Library | Avg | StdDev | Min → Max | vs undici |
|---------|-----|--------|-----------|-----------|
| undici (raw) 🏆 | **4.11 ms** | ±855 µs | 2.84 ms → 5.11 ms | baseline |
| **recker-mini** ★ | 5.31 ms | ±1.25 ms | 3.63 ms → 7.79 ms | +29% |
| cross-fetch | 5.63 ms | ±493 µs | 4.88 ms → 6.57 ms | +37% |
| recker | 6.91 ms | ±1.63 ms | 5.33 ms → 9.53 ms | +68% |
| fetch (native) | 7.21 ms | ±1.21 ms | 5.77 ms → 9.48 ms | +75% |
| axios | 7.23 ms | ±1.22 ms | 5.80 ms → 9.97 ms | +76% |
| got | 7.51 ms | ±467 µs | 6.57 ms → 7.95 ms | +83% |
| wretch | 8.08 ms | ±963 µs | 6.62 ms → 9.69 ms | +97% |
| node-fetch | 8.37 ms | ±719 µs | 7.75 ms → 9.92 ms | +104% |
| ky | 9.09 ms | ±1.46 ms | 7.55 ms → 12.46 ms | +121% |
| superagent | 9.97 ms | ±685 µs | 8.89 ms → 10.92 ms | +143% |
| needle | 10.34 ms | ±1.22 ms | 9.09 ms → 13.12 ms | +152% |
| make-fetch-happen | 11.27 ms | ±1.84 ms | 8.66 ms → 13.73 ms | +174% |
| wreck | 11.42 ms | ±1.92 ms | 9.08 ms → 15.45 ms | +178% |
| minipass-fetch | 13.29 ms | ±1.93 ms | 9.75 ms → 16.60 ms | +223% |

### Sequential GET (5 requests)

| Library | Avg | StdDev | Min → Max | vs undici |
|---------|-----|--------|-----------|-----------|
| undici (raw) 🏆 | **2.47 ms** | ±549 µs | 1.84 ms → 3.72 ms | baseline |
| **recker-mini** ★ | 2.72 ms | ±850 µs | 1.97 ms → 4.69 ms | +10% |
| recker | 4.39 ms | ±779 µs | 3.54 ms → 6.04 ms | +78% |
| cross-fetch | 4.43 ms | ±1.37 ms | 3.33 ms → 7.58 ms | +79% |
| fetch (native) | 5.24 ms | ±1.31 ms | 4.26 ms → 8.30 ms | +112% |
| axios | 5.45 ms | ±1.24 ms | 4.03 ms → 8.15 ms | +121% |
| wretch | 6.03 ms | ±1.01 ms | 4.88 ms → 8.11 ms | +144% |
| node-fetch | 6.44 ms | ±2.00 ms | 4.59 ms → 10.94 ms | +161% |
| got | 7.08 ms | ±2.33 ms | 4.95 ms → 12.56 ms | +187% |
| ky | 7.59 ms | ±2.18 ms | 5.00 ms → 11.78 ms | +207% |
| superagent | 7.79 ms | ±1.94 ms | 6.03 ms → 11.79 ms | +215% |
| make-fetch-happen | 7.88 ms | ±1.35 ms | 6.27 ms → 9.86 ms | +219% |
| needle | 8.13 ms | ±2.63 ms | 5.52 ms → 14.01 ms | +229% |
| wreck | 8.21 ms | ±1.76 ms | 6.12 ms → 10.97 ms | +232% |
| minipass-fetch | 8.49 ms | ±1.97 ms | 6.38 ms → 12.48 ms | +244% |

---

## Feature Overhead Analysis

Measures the performance cost of enabling various Recker features.

### Single Request Baseline

| Configuration | Avg | vs Mini |
|---------------|-----|---------|
| **recker-mini** (zero overhead) | 370 µs | baseline |
| recker (no plugins) | 712 µs | +93% |

### Single Feature Cost

| Feature | Avg | vs Vanilla | Notes |
|---------|-----|------------|-------|
| + retry | 738 µs | +4% | 3 attempts, 100ms delay |
| + rate-limit | 743 µs | +4% | 1000 req/s bucket |
| + timeout | 816 µs | +15% | 5s timeout |
| + compression | 651 µs | -9% | gzip/br |
| + cache (hit) | **48 µs** | **-93%** | Memory storage |

### Cache Performance

| Scenario | Avg | Notes |
|----------|-----|-------|
| Cache HIT | **48 µs** | 13x faster than network |
| Cache MISS | 2.13 ms | Network + storage |

### Combined Features

| Configuration | Avg | Notes |
|---------------|-----|-------|
| retry + cache | 69 µs | Cache dominates |
| all features | 78 µs | Cache dominates |

> **Key Insight**: Caching provides the biggest performance win. A cache hit is **13x faster** than a network request.

---

## Browser Optimization: Cached Closures

The browser-mini client uses **cached static closures** for maximum performance:

```typescript
// Static cached closures - 4.7% overhead vs 17.5% for async/await
const extractJson = (r: Response) => r.json();
const extractText = (r: Response) => r.text();

class MiniRequestPromise {
  json<R>(): Promise<R> {
    return this.p.then(extractJson) as Promise<R>;
  }
}
```

### Why Cached Closures?

| Approach | Pure JS Overhead | Why |
|----------|------------------|-----|
| Promise chain (raw) | baseline | No overhead |
| **Cached closure** | **+4.7%** | Static function, no allocation |
| Inline .then() | +10-15% | New closure per call |
| async/await | +17.5% | Async state machine |

---

## Test Methodology

### Environment

```
Platform:     Linux x64
Runtime:      Node.js v23.x
Benchmark:    mitata (high-precision timing)
Network:      localhost (eliminates network variance)
Iterations:   7 runs averaged
JIT Warmup:   100 iterations per client
```

### Running Benchmarks

```bash
# Single run (quick development feedback)
pnpm bench:compare                    # Default preset (balanced)
pnpm bench:compare:quick              # Quick iteration (~2x faster)
pnpm bench:compare:thorough           # More samples (~1.5x longer)
pnpm bench:compare:publication        # Maximum accuracy (~3x longer)

# Averaged results (7 iterations - recommended for documentation)
pnpm bench:compare:averaged           # 7 runs, calculates mean & stddev

# Save results as JSON
pnpm bench:compare:save               # Single run → JSON
pnpm bench:summary                    # Generate compact summary

# Feature overhead analysis
pnpm bench:features

# Bundle size comparison
pnpm bench:bundle
```

### Benchmark Presets

| Preset | Min Samples | Min CPU Time | V8 JIT Warmup | Use Case |
|--------|-------------|--------------|---------------|----------|
| `quick` | 8 | 300ms | 50 iter | Development iteration |
| `default` | 16 | 642ms | 100 iter | General benchmarking |
| `thorough` | 24 | 1000ms | 200 iter | Release documentation |
| `publication` | 48 | 2000ms | 500 iter | Maximum accuracy |

```bash
# Use any preset with environment variable
BENCH_PRESET=thorough pnpm bench:compare

# Verbose mode shows warmup progress
BENCH_VERBOSE=1 pnpm bench:compare

# Change number of averaged iterations
BENCH_ITERATIONS=10 pnpm bench:compare:averaged
```

### V8 JIT Warmup

Before measuring, each HTTP client function is executed multiple times to ensure V8's optimizing compiler (TurboFan) compiles all code paths:

```
V8 Optimization Pipeline:
1. Ignition (interpreter)    → First executions
2. Sparkplug (baseline JIT)  → After ~6 calls
3. TurboFan (optimizing JIT) → After function becomes "hot"
4. Inline Caching            → Stabilizes after type patterns emerge
```

This ensures benchmarks measure **optimized performance**, not interpreter overhead.

### Statistical Analysis

Each benchmark run produces:
- **avg**: Mean of all samples (excluding outliers)
- **min/max**: Range of observed values
- **p50/p75/p99**: Percentile distribution
- **stdDev**: Standard deviation (lower = more consistent)

When using `bench:compare:averaged`:
- Runs the full benchmark suite 7 times
- Calculates mean and standard deviation across runs
- Shows min → max range for each library
- Produces JSON output for further analysis

---

## Performance Visualization

```
GET JSON - Averaged over 7 runs (lower is better)
══════════════════════════════════════════════════════════════════════

recker-mini ★ 🏆 ████                                          528 µs
undici (raw)     █████                                         598 µs
cross-fetch      ████████                                      827 µs
recker           █████████                                     924 µs
axios            ███████████                                  1.08 ms
got              ████████████                                 1.15 ms
node-fetch       ████████████                                 1.18 ms
ky               █████████████                                1.30 ms
wretch           ██████████████                               1.37 ms
superagent       █████████████████                            1.73 ms
make-fetch-happen██████████████████                           1.76 ms
```

```
Bundle Size (gzipped, lower is better)
══════════════════════════════════════════════════════════════════════

recker-browser-mini ★  █                                         617 B
wretch                 ███                                      1.72 KB
ky                     █████████                                5.03 KB
axios                  ██████████████████████████████████████  56.37 KB
recker-mini ★          █████████████████████████████████████  152.90 KB
recker ★               ██████████████████████████████████████ 556.08 KB
```

---

## Key Findings

1. **recker-mini beats undici** in simple GET requests by 11% due to cached closures and optimized JIT compilation
2. **recker-mini is within 3%** of raw undici in POST requests - negligible overhead
3. **recker-browser-mini** is the smallest HTTP client at just **617 bytes** gzipped
4. **Caching** provides 13x performance improvement on cache hits
5. **Feature overhead** is minimal (~4-15% per feature, except cache which improves performance)
6. **Low variance** - recker-mini shows lower stdDev than undici (±113µs vs ±179µs), indicating more consistent performance

---

## JSON Results

Benchmark results are saved as JSON for programmatic consumption:

```bash
# Generate results
pnpm bench:compare:averaged

# Output files
benchmark/results/averaged-comparison.json        # Latest averaged results
benchmark/results/averaged-comparison-YYYY-MM-DD.json  # Timestamped copy
benchmark/results/summary.json                    # Compact summary
```

Example JSON structure:

```json
{
  "generated": "2026-01-08T...",
  "iterations": 7,
  "node": "v23.8.0",
  "platform": "linux",
  "results": {
    "GET JSON (simple)": {
      "recker-mini": {
        "avg": 528150,
        "avg_formatted": "528.15 µs",
        "stdDev": 112960,
        "min": 439540,
        "max": 790220,
        "runs": [439540, 480230, ...]
      }
    }
  }
}
```

---

## Reproducibility

```bash
git clone https://github.com/forattini-dev/recker
cd recker
pnpm install
pnpm build

# Quick check
pnpm bench:compare

# Full averaged results (recommended)
pnpm bench:compare:averaged
```
