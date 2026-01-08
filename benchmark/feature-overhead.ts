/**
 * Feature Overhead Benchmark
 *
 * Measures the performance cost of enabling various Recker features.
 * Tests: retry, cache, rate-limit, logger, compression, auth, and combinations.
 */

import { bench, group } from 'mitata';
import { run, DEFAULT_RUN_OPTIONS, inlineWarmup, WARMUP_ITERATIONS } from './mitata-config.js';
import { createServer } from 'node:http';
import { createClient } from '../src/index.js';
import { createMiniClient } from '../src/mini.js';

// Setup server
const server = createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'max-age=60'
  });
  res.end(JSON.stringify({ ok: true, ts: Date.now() }));
});

await new Promise<void>((resolve) => server.listen(0, resolve));
const port = (server.address() as any).port;
const url = `http://localhost:${port}`;

console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║              Feature Overhead Benchmark                           ║');
console.log('║                                                                   ║');
console.log('║   Measures performance cost of enabling Recker features          ║');
console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

// ─────────────────────────────────────────────────────────────────────────────
// Baseline Clients
// ─────────────────────────────────────────────────────────────────────────────

// Baseline: Mini client (zero overhead)
const miniClient = createMiniClient({ baseUrl: url });

// Baseline: Vanilla client (no plugins)
const vanillaClient = createClient({ baseUrl: url });

// ─────────────────────────────────────────────────────────────────────────────
// Single Feature Clients
// ─────────────────────────────────────────────────────────────────────────────

// With retry only
const retryClient = createClient({
  baseUrl: url,
  retry: { maxAttempts: 3, delay: 100 }
});

// With cache only (memory) - use default storage
const cacheClient = createClient({
  baseUrl: url,
  cache: { ttl: 60000 }
});

// With rate limit only
const rateLimitClient = createClient({
  baseUrl: url,
  rateLimit: { limit: 1000, window: 1000 }
});

// With timeout only
const timeoutClient = createClient({
  baseUrl: url,
  timeout: 5000
});

// With compression only
const compressionClient = createClient({
  baseUrl: url,
  compression: true
});

// ─────────────────────────────────────────────────────────────────────────────
// Combined Feature Clients
// ─────────────────────────────────────────────────────────────────────────────

// Retry + Cache (common combo)
const retryCacheClient = createClient({
  baseUrl: url,
  retry: { maxAttempts: 3, delay: 100 },
  cache: { ttl: 60000 }
});

// All common features
const fullFeaturedClient = createClient({
  baseUrl: url,
  retry: { maxAttempts: 3, delay: 100 },
  cache: { ttl: 60000 },
  rateLimit: { limit: 1000, window: 1000 },
  timeout: 5000,
  compression: true
});

// ─────────────────────────────────────────────────────────────────────────────
// V8 JIT Warmup
// ─────────────────────────────────────────────────────────────────────────────

const preset = (process.env.BENCH_PRESET as 'quick' | 'default' | 'thorough' | 'publication') || 'default';

console.log(`Warming up V8 JIT (${WARMUP_ITERATIONS[preset]} iterations)...`);

await inlineWarmup([
  async () => { const res = await miniClient.get('/'); await res.json(); },
  async () => { await vanillaClient.get('/').json(); },
  async () => { await retryClient.get('/').json(); },
  async () => { await cacheClient.get('/').json(); },
  async () => { await rateLimitClient.get('/').json(); },
  async () => { await timeoutClient.get('/').json(); },
  async () => { await compressionClient.get('/').json(); },
  async () => { await retryCacheClient.get('/').json(); },
  async () => { await fullFeaturedClient.get('/').json(); },
], WARMUP_ITERATIONS[preset]);

console.log('Warmup complete!\n');

// ─────────────────────────────────────────────────────────────────────────────
// Benchmarks
// ─────────────────────────────────────────────────────────────────────────────

group('Single Request (baseline comparison)', () => {
  bench('recker-mini (zero overhead)', async () => {
    const res = await miniClient.get('/');
    await res.json();
  });

  bench('recker (no plugins)', async () => {
    await vanillaClient.get('/').json();
  });
});

group('Single Feature Cost', () => {
  bench('+ retry', async () => {
    await retryClient.get('/').json();
  });

  bench('+ cache (memory)', async () => {
    await cacheClient.get('/').json();
  });

  bench('+ rate-limit', async () => {
    await rateLimitClient.get('/').json();
  });

  bench('+ timeout', async () => {
    await timeoutClient.get('/').json();
  });

  bench('+ compression', async () => {
    await compressionClient.get('/').json();
  });
});

group('Combined Features Cost', () => {
  bench('retry + cache', async () => {
    await retryCacheClient.get('/').json();
  });

  bench('all features', async () => {
    await fullFeaturedClient.get('/').json();
  });
});

// Prime the cache before benchmark
await cacheClient.get('/cached-endpoint').json();

group('Cache Hit Performance', () => {
  bench('cache HIT', async () => {
    await cacheClient.get('/cached-endpoint').json();
  });

  bench('cache MISS (new key)', async () => {
    await cacheClient.get(`/miss-${Math.random()}`).json();
  });
});

group('Parallel Requests (10 concurrent)', () => {
  bench('mini (baseline)', async () => {
    await Promise.all(Array(10).fill(null).map(async () => {
      const res = await miniClient.get('/');
      return res.json();
    }));
  });

  bench('vanilla', async () => {
    await Promise.all(Array(10).fill(null).map(() =>
      vanillaClient.get('/').json()
    ));
  });

  bench('with retry + cache', async () => {
    await Promise.all(Array(10).fill(null).map(() =>
      retryCacheClient.get('/').json()
    ));
  });

  bench('all features', async () => {
    await Promise.all(Array(10).fill(null).map(() =>
      fullFeaturedClient.get('/').json()
    ));
  });
});

await run(DEFAULT_RUN_OPTIONS, preset);

server.close();

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('                            LEGEND                                 ');
console.log('═══════════════════════════════════════════════════════════════════');
console.log('');
console.log('recker-mini      - Zero overhead, raw undici wrapper');
console.log('recker (vanilla) - Full client, no plugins enabled');
console.log('+ retry          - 3 attempts, 100ms base delay');
console.log('+ cache          - Memory storage, 60s TTL');
console.log('+ rate-limit     - 1000 req/s token bucket');
console.log('+ timeout        - 5s request timeout');
console.log('+ compression    - gzip/br request compression');
console.log('');
console.log('Lower is better. Compare against "recker-mini" baseline.');
console.log('');
