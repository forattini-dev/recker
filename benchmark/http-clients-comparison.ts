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
 * - phin
 * - centra
 * - wretch
 * - bent
 * - simple-get
 * - tiny-json-http
 * - make-fetch-happen (npm ecosystem)
 * - minipass-fetch
 * - popsicle
 * - hyperquest
 * - wreck (Hapi)
 */

import { run, bench, group } from 'mitata';
import { createServer } from 'node:http';
import { createClient } from '../src/index.js';

// HTTP Clients
import axios from 'axios';
import got from 'got';
import ky from 'ky';
import { request as undiciRequest } from 'undici';
import needle from 'needle';
import superagent from 'superagent';
import nodeFetch from 'node-fetch';
import crossFetch from 'cross-fetch';
import phin from 'phin';
import centra from 'centra';
import wretch from 'wretch';
import bent from 'bent';
import simpleGet from 'simple-get';
import tinyJsonHttp from 'tiny-json-http';
import makeFetchHappen from 'make-fetch-happen';
import minipassFetch from 'minipass-fetch';
import { fetch as popsicle } from 'popsicle';
import hyperquest from 'hyperquest';
import Wreck from '@hapi/wreck';

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
const reckerFast = createClient({ baseUrl: url, observability: false });
const bentGetJson = bent(url, 'GET', 'json', 200);
const bentPostJson = bent(url, 'POST', 'json', 201);

// Helper for simple-get (callback-based)
const simpleGetAsync = (opts: any): Promise<any> => {
  return new Promise((resolve, reject) => {
    simpleGet.concat(opts, (err: Error | null, _res: any, data: Buffer) => {
      if (err) reject(err);
      else resolve(JSON.parse(data.toString()));
    });
  });
};

if (!JSON_OUTPUT) {
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║           HTTP Clients Comprehensive Comparison                   ║');
  console.log('║                                                                   ║');
  console.log('║   Testing 21 HTTP libraries for Node.js                          ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
  console.log(`Server: ${url}\n`);
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

  bench('fetch (native)', async () => {
    const res = await fetch(url);
    await res.json();
  });

  // High-level clients
  bench('recker', async () => {
    await recker.get('/').json();
  });

  bench('recker (fast)', async () => {
    await reckerFast.get('/').json();
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

  bench('phin', async () => {
    const res = await phin({ url, parse: 'json' });
    return res.body;
  });

  bench('centra', async () => {
    const res = await centra(url).send();
    return JSON.parse(res.body.toString());
  });

  bench('wretch', async () => {
    await wretch(url).get().json();
  });

  bench('bent', async () => {
    await bentGetJson('/');
  });

  bench('simple-get', async () => {
    await simpleGetAsync(url);
  });

  bench('tiny-json-http', async () => {
    await tinyJsonHttp.get({ url });
  });

  bench('make-fetch-happen', async () => {
    const res = await makeFetchHappen(url);
    await res.json();
  });

  bench('minipass-fetch', async () => {
    const res = await minipassFetch(url);
    await res.json();
  });

  bench('popsicle', async () => {
    const res = await popsicle(url);
    return res.json();
  });

  bench('hyperquest', async () => {
    return new Promise((resolve, reject) => {
      let data = '';
      hyperquest(url)
        .on('data', (chunk: Buffer) => { data += chunk.toString(); })
        .on('end', () => resolve(JSON.parse(data)))
        .on('error', reject);
    });
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

  bench('superagent', async () => {
    await superagent.post(url).send(body);
  });

  bench('needle', async () => {
    await needle('post', url, body, { json: true });
  });

  bench('phin', async () => {
    await phin({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify(body),
      parse: 'json'
    });
  });

  bench('centra', async () => {
    const res = await centra(url, 'POST')
      .header('Content-Type', 'application/json')
      .body(body, 'json')
      .send();
    return JSON.parse(res.body.toString());
  });

  bench('wretch', async () => {
    await wretch(url).post(body).json();
  });

  bench('bent', async () => {
    await bentPostJson('/', body);
  });

  bench('tiny-json-http', async () => {
    await tinyJsonHttp.post({ url, data: body });
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

  bench('popsicle', async () => {
    const res = await popsicle(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.json();
  });

  bench('hyperquest', async () => {
    return new Promise((resolve, reject) => {
      let data = '';
      const req = hyperquest(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      req.on('end', () => resolve(JSON.parse(data)));
      req.on('error', reject);
      req.end(JSON.stringify(body));
    });
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

  bench('superagent', async () => {
    await Promise.all(Array(10).fill(null).map(() =>
      superagent.get(url)
    ));
  });

  bench('wretch', async () => {
    await Promise.all(Array(10).fill(null).map(() =>
      wretch(url).get().json()
    ));
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
  console.log('                         LEGEND (21 libraries)                      ');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('undici            - Node.js official HTTP client (fastest baseline)');
  console.log('fetch             - Native fetch API');
  console.log('recker            - Batteries-included (retries, cache, rate-limit)');
  console.log('axios             - Most popular, browser + Node');
  console.log('got               - Full-featured, Node-focused');
  console.log('ky                - Fetch-based, originally for browsers');
  console.log('node-fetch        - Fetch polyfill for Node');
  console.log('cross-fetch       - Universal fetch (browser + Node)');
  console.log('superagent        - Mature, callback + promise');
  console.log('needle            - Lightweight, streaming support');
  console.log('phin              - Ultra-lightweight (~1kb)');
  console.log('centra            - Core of phin, minimal');
  console.log('wretch            - Fluent fetch wrapper');
  console.log('bent              - Functional HTTP client');
  console.log('simple-get        - Simplest callback-based');
  console.log('tiny-json-http    - Minimal JSON-only client');
  console.log('make-fetch-happen - npm ecosystem (caching, retry)');
  console.log('minipass-fetch    - Minipass-based fetch');
  console.log('popsicle          - Composable HTTP transport');
  console.log('hyperquest        - Stream-based HTTP');
  console.log('wreck             - Hapi ecosystem client');
  console.log('');
}
