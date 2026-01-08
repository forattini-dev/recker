/**
 * Comprehensive HTTP Clients Comparison Benchmark
 *
 * Compares all major HTTP clients for Node.js:
 * - undici (Node.js official)
 * - fetch (native)
 * - recker (batteries-included)
 * - axios
 * - got
 * - ky
 * - node-fetch
 * - cross-fetch
 * - superagent
 * - needle
 * - wretch
 * - make-fetch-happen (npm ecosystem)
 * - minipass-fetch
 * - popsicle
 * - wreck (Hapi)
 */

import { bench, group } from 'mitata';
import { run, DEFAULT_RUN_OPTIONS, printMethodology, createHttpWarmup, WARMUP_ITERATIONS } from './mitata-config.js';
import { createServer } from 'node:http';
import { createClient } from '../src/index.js';
import { createMiniClient } from '../src/mini.js';

// HTTP Clients
import axios from 'axios';
import got from 'got';
import ky from 'ky';
import { request as undiciRequest } from 'undici';
import needle from 'needle';
import superagent from 'superagent';
import nodeFetch from 'node-fetch';
import crossFetch from 'cross-fetch';
import wretch from 'wretch';
import makeFetchHappen from 'make-fetch-happen';
import minipassFetch from 'minipass-fetch';
import Wreck from '@hapi/wreck';

process.setMaxListeners(0);

const JSON_OUTPUT = process.env.BENCH_JSON === '1';

// Test payloads
const smallPayload = { hello: 'world' };
const mediumPayload = {
  id: '123',
  name: 'Test User',
  email: 'test@example.com',
  timestamp: Date.now(),
  tags: ['developer', 'nodejs', 'typescript'],
  metadata: {
    created: Date.now(),
    source: 'benchmark',
    version: '1.0.0'
  }
};

// Setup server
const server = createServer((req, res) => {
  if (req.method === 'POST') {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, received: JSON.parse(body) }));
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mediumPayload));
  }
});

await new Promise<void>((resolve) => server.listen(0, resolve));
const port = (server.address() as any).port;
const url = `http://localhost:${port}`;

// Setup Clients
const recker = createClient({ baseUrl: url });
const miniClient = createMiniClient({ baseUrl: url });

// Use preset from env: BENCH_PRESET=thorough pnpm bench:compare
const preset = (process.env.BENCH_PRESET as 'quick' | 'default' | 'thorough' | 'publication') || 'default';

if (!JSON_OUTPUT) {
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║           HTTP Clients Comprehensive Comparison                   ║');
  console.log('║                                                                   ║');
  console.log('║   Testing 15 HTTP libraries for Node.js                          ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
  console.log(`Server: ${url}`);
  console.log(`Preset: ${preset} (warmup: ${WARMUP_ITERATIONS[preset]} iterations)\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// V8 JIT Warmup Phase
// ─────────────────────────────────────────────────────────────────────────────
// Run each HTTP client function multiple times to ensure V8's TurboFan JIT
// compiler optimizes all code paths before we start measuring.

if (!JSON_OUTPUT) {
  console.log('Warming up V8 JIT for all HTTP clients...');
}

const warmup = createHttpWarmup(url, preset);

// Register all HTTP client functions for warmup
warmup
  .add('undici', async () => { const { body } = await undiciRequest(url); await body.json(); })
  .add('recker-mini', async () => { const res = await miniClient.get('/'); await res.json(); })
  .add('fetch', async () => { const res = await fetch(url); await res.json(); })
  .add('recker', async () => { await recker.get('/').json(); })
  .add('axios', async () => { await axios.get(url); })
  .add('got', async () => { await got.get(url).json(); })
  .add('ky', async () => { await ky.get(url).json(); })
  .add('node-fetch', async () => { const res = await nodeFetch(url); await res.json(); })
  .add('cross-fetch', async () => { const res = await crossFetch(url); await res.json(); })
  .add('superagent', async () => { await superagent.get(url); })
  .add('needle', async () => { await needle('get', url, { json: true }); })
  .add('wretch', async () => { await wretch(url).get().json(); })
  .add('make-fetch-happen', async () => { const res = await makeFetchHappen(url); await res.json(); })
  .add('minipass-fetch', async () => { const res = await minipassFetch(url); await res.json(); })
  .add('wreck', async () => { await Wreck.get(url, { json: true }); });

// Run warmup (verbose mode controlled by BENCH_VERBOSE env)
await warmup.run({ verbose: !JSON_OUTPUT && process.env.BENCH_VERBOSE === '1' });

if (!JSON_OUTPUT) {
  console.log(`Warmup complete! (${warmup.count} clients × ${WARMUP_ITERATIONS[preset]} iterations)\n`);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET JSON Benchmark
// ─────────────────────────────────────────────────────────────────────────────

group('GET JSON (simple)', () => {
  // Baseline: Raw transports
  bench('undici (raw)', async () => {
    const { body } = await undiciRequest(url);
    await body.json();
  });

  // Recker mini client - zero overhead wrapper
  bench('recker-mini', async () => {
    const res = await miniClient.get('/');
    await res.json();
  });

  bench('fetch (native)', async () => {
    const res = await fetch(url);
    await res.json();
  });

  // High-level clients
  bench('recker', async () => {
    await recker.get('/').json();
  });

  bench('axios', async () => {
    await axios.get(url);
  });

  bench('got', async () => {
    await got.get(url).json();
  });

  bench('ky', async () => {
    await ky.get(url).json();
  });

  bench('node-fetch', async () => {
    const res = await nodeFetch(url);
    await res.json();
  });

  bench('cross-fetch', async () => {
    const res = await crossFetch(url);
    await res.json();
  });

  bench('superagent', async () => {
    await superagent.get(url);
  });

  bench('needle', async () => {
    await needle('get', url, { json: true });
  });

  bench('wretch', async () => {
    await wretch(url).get().json();
  });

  bench('make-fetch-happen', async () => {
    const res = await makeFetchHappen(url);
    await res.json();
  });

  bench('minipass-fetch', async () => {
    const res = await minipassFetch(url);
    await res.json();
  });

  bench('wreck', async () => {
    const { payload } = await Wreck.get(url, { json: true });
    return payload;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST JSON Benchmark
// ─────────────────────────────────────────────────────────────────────────────

group('POST JSON (with body)', () => {
  const body = mediumPayload;

  bench('undici (raw)', async () => {
    const { body: respBody } = await undiciRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    await respBody.json();
  });

  bench('recker-mini', async () => {
    const res = await miniClient.post('/', body);
    await res.json();
  });

  bench('fetch (native)', async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    await res.json();
  });

  bench('recker', async () => {
    await recker.post('/', body).json();
  });

  bench('axios', async () => {
    await axios.post(url, body);
  });

  bench('got', async () => {
    await got.post(url, { json: body }).json();
  });

  bench('ky', async () => {
    await ky.post(url, { json: body }).json();
  });

  bench('node-fetch', async () => {
    const res = await nodeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    await res.json();
  });

  bench('cross-fetch', async () => {
    const res = await crossFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    await res.json();
  });

  bench('superagent', async () => {
    await superagent.post(url).send(body);
  });

  bench('needle', async () => {
    await needle('post', url, body, { json: true });
  });

  bench('wretch', async () => {
    await wretch(url).post(body).json();
  });

  bench('make-fetch-happen', async () => {
    const res = await makeFetchHappen(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    await res.json();
  });

  bench('minipass-fetch', async () => {
    const res = await minipassFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    await res.json();
  });

  bench('wreck', async () => {
    const { payload } = await Wreck.post(url, { payload: body, json: true });
    return payload;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Parallel Requests Benchmark
// ─────────────────────────────────────────────────────────────────────────────

group('Parallel GET (10 concurrent)', () => {
  bench('undici (raw)', async () => {
    await Promise.all(Array(10).fill(null).map(async () => {
      const { body } = await undiciRequest(url);
      return body.json();
    }));
  });

  bench('recker-mini', async () => {
    await Promise.all(Array(10).fill(null).map(async () => {
      const res = await miniClient.get('/');
      return res.json();
    }));
  });

  bench('fetch (native)', async () => {
    await Promise.all(Array(10).fill(null).map(async () => {
      const res = await fetch(url);
      return res.json();
    }));
  });

  bench('recker', async () => {
    await Promise.all(Array(10).fill(null).map(() =>
      recker.get('/').json()
    ));
  });

  bench('axios', async () => {
    await Promise.all(Array(10).fill(null).map(() =>
      axios.get(url)
    ));
  });

  bench('got', async () => {
    await Promise.all(Array(10).fill(null).map(() =>
      got.get(url).json()
    ));
  });

  bench('ky', async () => {
    await Promise.all(Array(10).fill(null).map(() =>
      ky.get(url).json()
    ));
  });

  bench('node-fetch', async () => {
    await Promise.all(Array(10).fill(null).map(async () => {
      const res = await nodeFetch(url);
      return res.json();
    }));
  });

  bench('cross-fetch', async () => {
    await Promise.all(Array(10).fill(null).map(async () => {
      const res = await crossFetch(url);
      return res.json();
    }));
  });

  bench('superagent', async () => {
    await Promise.all(Array(10).fill(null).map(() =>
      superagent.get(url)
    ));
  });

  bench('needle', async () => {
    await Promise.all(Array(10).fill(null).map(() =>
      needle('get', url, { json: true })
    ));
  });

  bench('wretch', async () => {
    await Promise.all(Array(10).fill(null).map(() =>
      wretch(url).get().json()
    ));
  });

  bench('make-fetch-happen', async () => {
    await Promise.all(Array(10).fill(null).map(async () => {
      const res = await makeFetchHappen(url);
      return res.json();
    }));
  });

  bench('minipass-fetch', async () => {
    await Promise.all(Array(10).fill(null).map(async () => {
      const res = await minipassFetch(url);
      return res.json();
    }));
  });

  bench('wreck', async () => {
    await Promise.all(Array(10).fill(null).map(async () => {
      const { payload } = await Wreck.get(url, { json: true });
      return payload;
    }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sequential Requests Benchmark
// ─────────────────────────────────────────────────────────────────────────────

group('Sequential GET (5 requests)', () => {
  bench('undici (raw)', async () => {
    for (let i = 0; i < 5; i++) {
      const { body } = await undiciRequest(url);
      await body.json();
    }
  });

  bench('recker-mini', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await miniClient.get('/');
      await res.json();
    }
  });

  bench('fetch (native)', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await fetch(url);
      await res.json();
    }
  });

  bench('recker', async () => {
    for (let i = 0; i < 5; i++) {
      await recker.get('/').json();
    }
  });

  bench('axios', async () => {
    for (let i = 0; i < 5; i++) {
      await axios.get(url);
    }
  });

  bench('got', async () => {
    for (let i = 0; i < 5; i++) {
      await got.get(url).json();
    }
  });

  bench('ky', async () => {
    for (let i = 0; i < 5; i++) {
      await ky.get(url).json();
    }
  });

  bench('node-fetch', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await nodeFetch(url);
      await res.json();
    }
  });

  bench('cross-fetch', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await crossFetch(url);
      await res.json();
    }
  });

  bench('superagent', async () => {
    for (let i = 0; i < 5; i++) {
      await superagent.get(url);
    }
  });

  bench('needle', async () => {
    for (let i = 0; i < 5; i++) {
      await needle('get', url, { json: true });
    }
  });

  bench('wretch', async () => {
    for (let i = 0; i < 5; i++) {
      await wretch(url).get().json();
    }
  });

  bench('make-fetch-happen', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await makeFetchHappen(url);
      await res.json();
    }
  });

  bench('minipass-fetch', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await minipassFetch(url);
      await res.json();
    }
  });

  bench('wreck', async () => {
    for (let i = 0; i < 5; i++) {
      const { payload } = await Wreck.get(url, { json: true });
    }
  });
});

await run({
  ...DEFAULT_RUN_OPTIONS,
  format: JSON_OUTPUT ? 'json' : undefined,
  colors: !JSON_OUTPUT,
}, preset);

server.close();

if (!JSON_OUTPUT) {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('                         LEGEND (15 libraries)                      ');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('undici               - Node.js official HTTP client (fastest baseline)');
  console.log('recker-mini          - Zero-overhead undici wrapper ★');
  console.log('fetch                - Native fetch API (Node.js 18+)');
  console.log('recker               - Batteries-included (retry, cache, rate-limit)');
  console.log('axios                - Most popular, browser + Node');
  console.log('got                  - Full-featured, Node-focused');
  console.log('ky                   - Fetch-based, originally for browsers');
  console.log('node-fetch           - Fetch polyfill for Node');
  console.log('cross-fetch          - Universal fetch (browser + Node)');
  console.log('superagent           - Mature, callback + promise');
  console.log('needle               - Lightweight, streaming support');
  console.log('wretch               - Fluent fetch wrapper');
  console.log('make-fetch-happen    - npm ecosystem (caching, retry)');
  console.log('minipass-fetch       - Minipass-based fetch');
  console.log('wreck                - Hapi ecosystem client');
  console.log('');

  // Print methodology for transparency
  printMethodology(preset);
}
