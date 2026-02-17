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
 * - wreck (Hapi)
 */

import { bench, group } from 'mitata';
import { run, DEFAULT_RUN_OPTIONS, printMethodology, createHttpWarmup, WARMUP_ITERATIONS } from './mitata-config.js';
import { createServer } from 'node:http';
import { gzipSync } from 'node:zlib';
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

// Large payload (~1MB JSON)
const largePayload = {
  id: 'large-payload-test',
  items: Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    name: `Item ${i}`,
    description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    value: Math.random() * 1000,
    tags: ['tag1', 'tag2', 'tag3'],
  }))
};
const largePayloadStr = JSON.stringify(largePayload);
const largePayloadBuffer = Buffer.from(largePayloadStr);

// Tiny payload (10 bytes)
const tinyPayload = { ok: true };
const tinyPayloadStr = JSON.stringify(tinyPayload);

// Gzip compressed payload
const gzippedPayload = gzipSync(Buffer.from(JSON.stringify(mediumPayload)));

// Heavy headers (50+ headers)
const heavyHeaders: Record<string, string> = {};
for (let i = 0; i < 50; i++) {
  heavyHeaders[`X-Custom-Header-${i}`] = `value-${i}-${'x'.repeat(50)}`;
}

// Setup server with all endpoints
const server = createServer((req, res) => {
  const urlPath = req.url || '/';

  // POST handler
  if (req.method === 'POST') {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, received: JSON.parse(body) }));
    });
    return;
  }

  // Large payload (~1MB)
  if (urlPath === '/large') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': largePayloadBuffer.length.toString()
    });
    res.end(largePayloadBuffer);
    return;
  }

  // Tiny payload (10 bytes)
  if (urlPath === '/tiny') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(tinyPayloadStr);
    return;
  }

  // Slow response (100ms delay)
  if (urlPath === '/slow') {
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mediumPayload));
    }, 100);
    return;
  }

  // Chunked transfer encoding
  if (urlPath === '/chunked') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Transfer-Encoding': 'chunked'
    });
    const data = JSON.stringify(mediumPayload);
    const chunkSize = Math.ceil(data.length / 5);
    for (let i = 0; i < data.length; i += chunkSize) {
      res.write(data.slice(i, i + chunkSize));
    }
    res.end();
    return;
  }

  // Gzip compressed response
  if (urlPath === '/gzip') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip'
    });
    res.end(gzippedPayload);
    return;
  }

  // Redirect chain (3 hops)
  if (urlPath === '/redirect1') {
    res.writeHead(302, { 'Location': '/redirect2' });
    res.end();
    return;
  }
  if (urlPath === '/redirect2') {
    res.writeHead(302, { 'Location': '/redirect3' });
    res.end();
    return;
  }
  if (urlPath === '/redirect3') {
    res.writeHead(302, { 'Location': '/' });
    res.end();
    return;
  }

  // Error responses
  if (urlPath === '/error/400') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Request' }));
    return;
  }
  if (urlPath === '/error/500') {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
    return;
  }

  // Heavy headers response (50+ headers)
  if (urlPath === '/headers') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      ...heavyHeaders
    });
    res.end(JSON.stringify(mediumPayload));
    return;
  }

  // Default: medium payload
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(mediumPayload));
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
  console.log('║   Testing 15 HTTP libraries × 12 scenarios for Node.js           ║');
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

// Register all HTTP client functions for warmup (base endpoints)
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

// Warmup new endpoints (fewer iterations since these are secondary paths)
const warmupEndpoints = createHttpWarmup(url, preset);
warmupEndpoints
  .add('large', async () => { const { body } = await undiciRequest(`${url}/large`); await body.json(); })
  .add('tiny', async () => { const { body } = await undiciRequest(`${url}/tiny`); await body.json(); })
  .add('chunked', async () => { const { body } = await undiciRequest(`${url}/chunked`); await body.json(); })
  .add('gzip', async () => { await axios.get(`${url}/gzip`); }) // axios auto-decompresses gzip
  .add('headers', async () => { const { body } = await undiciRequest(`${url}/headers`); await body.json(); })
  .add('redirect', async () => { const { body } = await undiciRequest(`${url}/redirect1`, { maxRedirections: 5 }); await body.json(); })
  .add('error', async () => { try { const { body } = await undiciRequest(`${url}/error/500`); await body.json(); } catch {} });

// Run warmup (verbose mode controlled by BENCH_VERBOSE env)
await warmup.run({ verbose: !JSON_OUTPUT && process.env.BENCH_VERBOSE === '1' });
await warmupEndpoints.run({ verbose: !JSON_OUTPUT && process.env.BENCH_VERBOSE === '1' });

if (!JSON_OUTPUT) {
  console.log(`Warmup complete! (${warmup.count + warmupEndpoints.count} scenarios × ${WARMUP_ITERATIONS[preset]} iterations)\n`);
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

// ─────────────────────────────────────────────────────────────────────────────
// Large Payload Benchmark (~1MB JSON)
// ─────────────────────────────────────────────────────────────────────────────

group('GET Large Payload (~1MB)', () => {
  const largeUrl = `${url}/large`;

  bench('undici (raw)', async () => {
    const { body } = await undiciRequest(largeUrl);
    await body.json();
  });

  bench('recker-mini', async () => {
    const res = await miniClient.get('/large');
    await res.json();
  });

  bench('fetch (native)', async () => {
    const res = await fetch(largeUrl);
    await res.json();
  });

  bench('recker', async () => {
    await recker.get('/large').json();
  });

  bench('axios', async () => {
    await axios.get(largeUrl);
  });

  bench('got', async () => {
    await got.get(largeUrl).json();
  });

  bench('ky', async () => {
    await ky.get(largeUrl).json();
  });

  bench('node-fetch', async () => {
    const res = await nodeFetch(largeUrl);
    await res.json();
  });

  bench('superagent', async () => {
    await superagent.get(largeUrl);
  });

  bench('needle', async () => {
    await needle('get', largeUrl, { json: true });
  });

  bench('wretch', async () => {
    await wretch(largeUrl).get().json();
  });

  bench('wreck', async () => {
    const { payload } = await Wreck.get(largeUrl, { json: true });
    return payload;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tiny Payload Benchmark (10 bytes)
// ─────────────────────────────────────────────────────────────────────────────

group('GET Tiny Payload (10 bytes)', () => {
  const tinyUrl = `${url}/tiny`;

  bench('undici (raw)', async () => {
    const { body } = await undiciRequest(tinyUrl);
    await body.json();
  });

  bench('recker-mini', async () => {
    const res = await miniClient.get('/tiny');
    await res.json();
  });

  bench('fetch (native)', async () => {
    const res = await fetch(tinyUrl);
    await res.json();
  });

  bench('recker', async () => {
    await recker.get('/tiny').json();
  });

  bench('axios', async () => {
    await axios.get(tinyUrl);
  });

  bench('got', async () => {
    await got.get(tinyUrl).json();
  });

  bench('ky', async () => {
    await ky.get(tinyUrl).json();
  });

  bench('node-fetch', async () => {
    const res = await nodeFetch(tinyUrl);
    await res.json();
  });

  bench('superagent', async () => {
    await superagent.get(tinyUrl);
  });

  bench('needle', async () => {
    await needle('get', tinyUrl, { json: true });
  });

  bench('wretch', async () => {
    await wretch(tinyUrl).get().json();
  });

  bench('wreck', async () => {
    const { payload } = await Wreck.get(tinyUrl, { json: true });
    return payload;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Chunked Transfer Encoding Benchmark
// ─────────────────────────────────────────────────────────────────────────────

group('GET Chunked Response', () => {
  const chunkedUrl = `${url}/chunked`;

  bench('undici (raw)', async () => {
    const { body } = await undiciRequest(chunkedUrl);
    await body.json();
  });

  bench('recker-mini', async () => {
    const res = await miniClient.get('/chunked');
    await res.json();
  });

  bench('fetch (native)', async () => {
    const res = await fetch(chunkedUrl);
    await res.json();
  });

  bench('recker', async () => {
    await recker.get('/chunked').json();
  });

  bench('axios', async () => {
    await axios.get(chunkedUrl);
  });

  bench('got', async () => {
    await got.get(chunkedUrl).json();
  });

  bench('ky', async () => {
    await ky.get(chunkedUrl).json();
  });

  bench('node-fetch', async () => {
    const res = await nodeFetch(chunkedUrl);
    await res.json();
  });

  bench('superagent', async () => {
    await superagent.get(chunkedUrl);
  });

  bench('needle', async () => {
    await needle('get', chunkedUrl, { json: true });
  });

  bench('wretch', async () => {
    await wretch(chunkedUrl).get().json();
  });

  bench('wreck', async () => {
    const { payload } = await Wreck.get(chunkedUrl, { json: true });
    return payload;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gzip Compression Benchmark
// ─────────────────────────────────────────────────────────────────────────────

group('GET Gzip Compressed', () => {
  const gzipUrl = `${url}/gzip`;

  // Tests automatic gzip decompression (Content-Encoding: gzip)
  // Libraries vary in their auto-decompression support

  bench('axios', async () => {
    await axios.get(gzipUrl);
  });

  bench('got', async () => {
    // got has built-in decompression (decompress: true by default)
    await got.get(gzipUrl, { retry: { limit: 0 } }).json();
  });

  bench('node-fetch', async () => {
    const res = await nodeFetch(gzipUrl);
    await res.json();
  });

  bench('superagent', async () => {
    await superagent.get(gzipUrl);
  });

  bench('needle', async () => {
    await needle('get', gzipUrl, { json: true });
  });

  bench('wreck', async () => {
    const { payload } = await Wreck.get(gzipUrl, { json: true, gunzip: true });
    return payload;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Redirect Chain Benchmark (3 hops)
// ─────────────────────────────────────────────────────────────────────────────

group('GET with Redirects (3 hops)', () => {
  const redirectUrl = `${url}/redirect1`;

  // Libraries that follow redirects automatically
  bench('undici (raw)', async () => {
    const { body } = await undiciRequest(redirectUrl, { maxRedirections: 5 });
    await body.json();
  });

  bench('fetch (native)', async () => {
    const res = await fetch(redirectUrl, { redirect: 'follow' });
    await res.json();
  });

  bench('recker', async () => {
    await recker.get('/redirect1').json();
  });

  bench('axios', async () => {
    await axios.get(redirectUrl, { maxRedirects: 5 });
  });

  bench('got', async () => {
    await got.get(redirectUrl, { followRedirect: true }).json();
  });

  bench('ky', async () => {
    await ky.get(redirectUrl).json();
  });

  bench('node-fetch', async () => {
    const res = await nodeFetch(redirectUrl, { redirect: 'follow' });
    await res.json();
  });

  bench('superagent', async () => {
    await superagent.get(redirectUrl).redirects(5);
  });

  bench('needle', async () => {
    await needle('get', redirectUrl, { follow_max: 5, json: true });
  });

  bench('wretch', async () => {
    await wretch(redirectUrl).get().json();
  });

  bench('wreck', async () => {
    const { payload } = await Wreck.get(redirectUrl, { json: true, redirects: 5 });
    return payload;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error Response Benchmark (500 status)
// ─────────────────────────────────────────────────────────────────────────────

group('GET Error Response (500)', () => {
  const errorUrl = `${url}/error/500`;

  // Measure error handling overhead
  bench('undici (raw)', async () => {
    try {
      const { body, statusCode } = await undiciRequest(errorUrl);
      await body.json();
    } catch {}
  });

  bench('recker-mini', async () => {
    try {
      const res = await miniClient.get('/error/500');
      await res.json();
    } catch {}
  });

  bench('fetch (native)', async () => {
    const res = await fetch(errorUrl);
    await res.json(); // fetch doesn't throw on 500
  });

  bench('recker', async () => {
    try {
      await recker.get('/error/500').json();
    } catch {}
  });

  bench('axios', async () => {
    try {
      await axios.get(errorUrl);
    } catch {}
  });

  bench('got', async () => {
    try {
      await got.get(errorUrl).json();
    } catch {}
  });

  bench('ky', async () => {
    try {
      await ky.get(errorUrl).json();
    } catch {}
  });

  bench('node-fetch', async () => {
    const res = await nodeFetch(errorUrl);
    await res.json();
  });

  bench('superagent', async () => {
    try {
      await superagent.get(errorUrl);
    } catch {}
  });

  bench('needle', async () => {
    await needle('get', errorUrl, { json: true });
  });

  bench('wretch', async () => {
    try {
      await wretch(errorUrl).get().json();
    } catch {}
  });

  bench('wreck', async () => {
    try {
      const { payload } = await Wreck.get(errorUrl, { json: true });
      return payload;
    } catch {}
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Heavy Headers Benchmark (50+ response headers)
// ─────────────────────────────────────────────────────────────────────────────

group('GET Heavy Headers (50+)', () => {
  const headersUrl = `${url}/headers`;

  bench('undici (raw)', async () => {
    const { body, headers } = await undiciRequest(headersUrl);
    await body.json();
  });

  bench('recker-mini', async () => {
    const res = await miniClient.get('/headers');
    await res.json();
  });

  bench('fetch (native)', async () => {
    const res = await fetch(headersUrl);
    await res.json();
  });

  bench('recker', async () => {
    await recker.get('/headers').json();
  });

  bench('axios', async () => {
    await axios.get(headersUrl);
  });

  bench('got', async () => {
    await got.get(headersUrl).json();
  });

  bench('ky', async () => {
    await ky.get(headersUrl).json();
  });

  bench('node-fetch', async () => {
    const res = await nodeFetch(headersUrl);
    await res.json();
  });

  bench('superagent', async () => {
    await superagent.get(headersUrl);
  });

  bench('needle', async () => {
    await needle('get', headersUrl, { json: true });
  });

  bench('wretch', async () => {
    await wretch(headersUrl).get().json();
  });

  bench('wreck', async () => {
    const { payload } = await Wreck.get(headersUrl, { json: true });
    return payload;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mixed Workload Benchmark (realistic API usage pattern)
// ─────────────────────────────────────────────────────────────────────────────

group('Mixed Workload (GET + POST + Parallel)', () => {
  // Simulates realistic API usage: GET, POST, parallel requests
  bench('undici (raw)', async () => {
    // 1. GET request
    const { body: b1 } = await undiciRequest(url);
    await b1.json();

    // 2. POST request
    const { body: b2 } = await undiciRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mediumPayload)
    });
    await b2.json();

    // 3. Parallel GETs
    await Promise.all([
      undiciRequest(url).then(r => r.body.json()),
      undiciRequest(url).then(r => r.body.json()),
      undiciRequest(url).then(r => r.body.json()),
    ]);
  });

  bench('recker-mini', async () => {
    const r1 = await miniClient.get('/');
    await r1.json();
    const r2 = await miniClient.post('/', mediumPayload);
    await r2.json();
    await Promise.all([
      miniClient.get('/').then(r => r.json()),
      miniClient.get('/').then(r => r.json()),
      miniClient.get('/').then(r => r.json()),
    ]);
  });

  bench('fetch (native)', async () => {
    const r1 = await fetch(url);
    await r1.json();
    const r2 = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mediumPayload)
    });
    await r2.json();
    await Promise.all([
      fetch(url).then(r => r.json()),
      fetch(url).then(r => r.json()),
      fetch(url).then(r => r.json()),
    ]);
  });

  bench('recker', async () => {
    await recker.get('/').json();
    await recker.post('/', mediumPayload).json();
    await Promise.all([
      recker.get('/').json(),
      recker.get('/').json(),
      recker.get('/').json(),
    ]);
  });

  bench('axios', async () => {
    await axios.get(url);
    await axios.post(url, mediumPayload);
    await Promise.all([
      axios.get(url),
      axios.get(url),
      axios.get(url),
    ]);
  });

  bench('got', async () => {
    await got.get(url).json();
    await got.post(url, { json: mediumPayload }).json();
    await Promise.all([
      got.get(url).json(),
      got.get(url).json(),
      got.get(url).json(),
    ]);
  });

  bench('ky', async () => {
    await ky.get(url).json();
    await ky.post(url, { json: mediumPayload }).json();
    await Promise.all([
      ky.get(url).json(),
      ky.get(url).json(),
      ky.get(url).json(),
    ]);
  });

  bench('superagent', async () => {
    await superagent.get(url);
    await superagent.post(url).send(mediumPayload);
    await Promise.all([
      superagent.get(url),
      superagent.get(url),
      superagent.get(url),
    ]);
  });

  bench('needle', async () => {
    await needle('get', url, { json: true });
    await needle('post', url, mediumPayload, { json: true });
    await Promise.all([
      needle('get', url, { json: true }),
      needle('get', url, { json: true }),
      needle('get', url, { json: true }),
    ]);
  });

  bench('wretch', async () => {
    await wretch(url).get().json();
    await wretch(url).post(mediumPayload).json();
    await Promise.all([
      wretch(url).get().json(),
      wretch(url).get().json(),
      wretch(url).get().json(),
    ]);
  });

  bench('wreck', async () => {
    await Wreck.get(url, { json: true });
    await Wreck.post(url, { payload: mediumPayload, json: true });
    await Promise.all([
      Wreck.get(url, { json: true }),
      Wreck.get(url, { json: true }),
      Wreck.get(url, { json: true }),
    ]);
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
  console.log('                    LEGEND (15 libraries × 12 scenarios)            ');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('HTTP LIBRARIES:');
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
  console.log('SCENARIOS:');
  console.log('GET JSON (simple)    - Basic JSON response (~200 bytes)');
  console.log('POST JSON            - POST with JSON body (~200 bytes)');
  console.log('Parallel GET         - 10 concurrent requests');
  console.log('Sequential GET       - 5 sequential requests');
  console.log('Large Payload        - ~1MB JSON response');
  console.log('Tiny Payload         - 10 bytes JSON response');
  console.log('Chunked Response     - Transfer-Encoding: chunked');
  console.log('Gzip Compressed      - Content-Encoding: gzip');
  console.log('Redirects (3 hops)   - 302 redirect chain');
  console.log('Error Response       - HTTP 500 error handling');
  console.log('Heavy Headers        - 50+ response headers');
  console.log('Mixed Workload       - GET + POST + Parallel (realistic API usage)');
  console.log('');

  // Print methodology for transparency
  printMethodology(preset);
}
