/**
 * Mini Client vs Recker with Features Benchmark
 *
 * Shows the trade-offs:
 * - mini: fastest, but no features
 * - recker: slower per-request, but cache/dedup save network calls
 *
 * Key insight: Features pay for themselves when they reduce network calls
 */

import { run, bench, group } from 'mitata';
import { createServer } from 'node:http';
import { request as undiciRequest } from 'undici';
import { createMiniClient } from '../src/mini.js';
import { createClient } from '../src/index.js';

const JSON_OUTPUT = process.env.BENCH_JSON === '1';

// Simulate realistic API response
const payload = {
  id: '123',
  name: 'Test User',
  email: 'test@example.com',
  profile: {
    bio: 'Lorem ipsum dolor sit amet',
    avatar: 'https://example.com/avatar.jpg',
    settings: { theme: 'dark', notifications: true }
  }
};

let requestCount = 0;

// Setup server that tracks request count
const server = createServer((req, res) => {
  requestCount++;

  // Simulate 20ms latency (realistic API)
  setTimeout(() => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'max-age=60'
    });
    res.end(JSON.stringify(payload));
  }, 20);
});

await new Promise<void>((resolve) => server.listen(0, resolve));
const port = (server.address() as any).port;
const url = `http://localhost:${port}`;

// Setup clients
const miniClient = createMiniClient({ baseUrl: url });
const standardClient = createClient({ baseUrl: url });
const cachedClient = createClient({
  baseUrl: url,
  cache: {
    driver: 'memory',
    strategy: 'cache-first',
    ttl: 60_000
  }
});
const dedupClient = createClient({
  baseUrl: url,
  dedup: {}
});
const fullClient = createClient({
  baseUrl: url,
  cache: {
    driver: 'memory',
    strategy: 'cache-first',
    ttl: 60_000
  },
  dedup: {}
});

if (!JSON_OUTPUT) {
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║        Mini Client vs Recker with Features (Cache/Dedup)          ║');
  console.log('║                                                                   ║');
  console.log('║  Server has 20ms simulated latency to show feature benefits       ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Single request (mini wins)
// ─────────────────────────────────────────────────────────────────────────────

group('Single request (20ms latency)', () => {
  bench('recker-mini', async () => {
    const res = await miniClient.get('/single');
    await res.json();
  });

  bench('recker (standard)', async () => {
    await standardClient.get('/single').json();
  });

  bench('recker (with cache)', async () => {
    await cachedClient.get('/single-cached').json();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Same endpoint hit 10 times (cache wins big!)
// ─────────────────────────────────────────────────────────────────────────────

group('Same endpoint 10x (cache shines)', () => {
  bench('recker-mini (10 network calls)', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await miniClient.get('/repeated');
      await res.json();
    }
  });

  bench('recker standard (10 network calls)', async () => {
    for (let i = 0; i < 10; i++) {
      await standardClient.get('/repeated').json();
    }
  });

  bench('recker cached (1 network + 9 cache hits)', async () => {
    // Use unique path per benchmark iteration to ensure fresh cache
    const path = `/cached-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      await cachedClient.get(path).json();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: 10 parallel requests to same endpoint (dedup wins!)
// ─────────────────────────────────────────────────────────────────────────────

group('10 parallel to same endpoint (dedup shines)', () => {
  bench('recker-mini (10 network calls)', async () => {
    await Promise.all(
      Array(10).fill(null).map(() => miniClient.get('/parallel').then(r => r.json()))
    );
  });

  bench('recker standard (10 network calls)', async () => {
    await Promise.all(
      Array(10).fill(null).map(() => standardClient.get('/parallel').json())
    );
  });

  bench('recker dedup (1 network call, 9 shared)', async () => {
    // Use unique path per benchmark iteration
    const path = `/dedup-${Date.now()}-${Math.random()}`;
    await Promise.all(
      Array(10).fill(null).map(() => dedupClient.get(path).json())
    );
  });

  bench('recker full (cache + dedup)', async () => {
    const path = `/full-${Date.now()}-${Math.random()}`;
    await Promise.all(
      Array(10).fill(null).map(() => fullClient.get(path).json())
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Mixed workload (real-world simulation)
// ─────────────────────────────────────────────────────────────────────────────

group('Real-world: 5 unique + 5 repeated endpoints', () => {
  bench('recker-mini (10 network calls)', async () => {
    // 5 unique endpoints
    for (let i = 0; i < 5; i++) {
      const res = await miniClient.get(`/unique-${i}`);
      await res.json();
    }
    // 5 repeated calls to same endpoint
    for (let i = 0; i < 5; i++) {
      const res = await miniClient.get('/common');
      await res.json();
    }
  });

  bench('recker cached (5 unique + 1 cached = 6 network calls)', async () => {
    const uniqueBase = `/rw-${Date.now()}`;
    // 5 unique endpoints
    for (let i = 0; i < 5; i++) {
      await cachedClient.get(`${uniqueBase}-${i}`).json();
    }
    // 5 repeated calls - first hits network, rest hit cache
    for (let i = 0; i < 5; i++) {
      await cachedClient.get(`${uniqueBase}-common`).json();
    }
  });
});

await run({
  avg: true,
  format: JSON_OUTPUT ? 'json' : undefined,
  colors: !JSON_OUTPUT,
  min_max: true,
  percentiles: true,
});

server.close();

if (!JSON_OUTPUT) {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('                        KEY INSIGHTS                                ');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  MINI CLIENT                                                    │');
  console.log('│  ✓ Fastest per-request (~2% overhead vs undici)                 │');
  console.log('│  ✗ No cache - every request hits the network                    │');
  console.log('│  ✗ No dedup - parallel requests multiply network calls          │');
  console.log('│  ✗ No retry - failures are your problem                         │');
  console.log('│  ✗ No hooks/middleware - no request transformation              │');
  console.log('│  → Best for: Simple scripts, one-off requests, max throughput   │');
  console.log('└─────────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  RECKER WITH FEATURES                                           │');
  console.log('│  ✗ ~2x slower per-request overhead                              │');
  console.log('│  ✓ Cache saves network calls on repeated requests               │');
  console.log('│  ✓ Dedup collapses parallel requests to single network call     │');
  console.log('│  ✓ Retry handles transient failures automatically               │');
  console.log('│  ✓ Hooks enable auth, logging, transformation                   │');
  console.log('│  → Best for: Production apps, APIs with repeated data           │');
  console.log('└─────────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('💡 Rule of thumb:');
  console.log('   - 1 request to 1 endpoint? → Use recker-mini');
  console.log('   - Same data requested multiple times? → Use cache');
  console.log('   - Parallel requests to same endpoint? → Use dedup');
  console.log('   - Production API client? → Use recker with features');
  console.log('');
}
