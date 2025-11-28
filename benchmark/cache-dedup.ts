import { run, bench, group } from 'mitata';
import { createServer } from 'node:http';
import { createClient } from '../src/index.js';

let requestCount = 0;

// Setup server
const server = createServer((req, res) => {
  requestCount++;
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60'
  });
  res.end(JSON.stringify({
    data: 'Response ' + requestCount,
    timestamp: Date.now()
  }));
});

await new Promise<void>((resolve) => server.listen(0, resolve));
const port = (server.address() as any).port;
const url = `http://localhost:${port}`;

// Setup Clients
const reckerNoCache = createClient({ baseUrl: url });

const reckerCacheFirst = createClient({
  baseUrl: url,
  cache: {
    driver: 'memory',
    strategy: 'cache-first',
    ttl: 60_000
  }
});

const reckerStaleWhileRevalidate = createClient({
  baseUrl: url,
  cache: {
    driver: 'memory',
    strategy: 'stale-while-revalidate',
    ttl: 60_000
  }
});

const reckerDedup = createClient({
  baseUrl: url,
  dedup: {}
});

console.log('┌─────────────────────────────────────────────────────┐');
console.log('│  Benchmark: Cache & Deduplication                   │');
console.log('└─────────────────────────────────────────────────────┘\n');

group('No cache (baseline)', () => {
  bench('recker (no cache)', async () => {
    await reckerNoCache.get('/data').json();
  });
});

group('Cache strategies', () => {
  bench('cache-first (2nd+ hit)', async () => {
    // First request warms up cache
    await reckerCacheFirst.get('/cache-first').json();
    // This should hit cache
    await reckerCacheFirst.get('/cache-first').json();
  });

  bench('stale-while-revalidate', async () => {
    // First request warms up cache
    await reckerStaleWhileRevalidate.get('/swr').json();
    // This returns stale + revalidates in background
    await reckerStaleWhileRevalidate.get('/swr').json();
  });
});

group('Request deduplication', () => {
  bench('dedup (10 parallel)', async () => {
    // All 10 requests should share a single HTTP call
    await Promise.all(
      Array(10).fill(null).map(() =>
        reckerDedup.get('/dedup').json()
      )
    );
  });

  bench('no dedup (10 parallel)', async () => {
    // Each request makes its own HTTP call
    await Promise.all(
      Array(10).fill(null).map(() =>
        reckerNoCache.get('/no-dedup').json()
      )
    );
  });
});

await run({
  avg: true,
  json: false,
  colors: true,
  min_max: true,
  percentiles: true,
});

console.log('\n📊 Server received ' + requestCount + ' total requests');
console.log('   (Lower is better - shows cache/dedup effectiveness)\n');

server.close();
