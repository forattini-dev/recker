/**
 * Bare Client vs Standard Client Benchmark
 *
 * Compares:
 * - undici (raw) - baseline
 * - recker bare - minimal overhead wrapper
 * - recker standard - full featured
 * - recker (fast) - with observability disabled
 */

import { run, bench, group } from 'mitata';
import { createServer } from 'node:http';
import { request as undiciRequest } from 'undici';
import { createBareClient, bareGet } from '../src/bare.js';
import { createClient } from '../src/index.js';

const JSON_OUTPUT = process.env.BENCH_JSON === '1';

// Test payload
const payload = {
  id: '123',
  name: 'Test User',
  email: 'test@example.com',
  timestamp: Date.now()
};

// Setup server
const server = createServer((req, res) => {
  if (req.method === 'POST') {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  }
});

await new Promise<void>((resolve) => server.listen(0, resolve));
const port = (server.address() as any).port;
const url = `http://localhost:${port}`;

// Setup clients
const bareClient = createBareClient({ baseUrl: url });
const standardClient = createClient({ baseUrl: url });
const fastClient = createClient({ baseUrl: url, observability: false });

if (!JSON_OUTPUT) {
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║           Bare Client vs Standard Client Benchmark                ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
}

group('GET JSON (minimal overhead comparison)', () => {
  bench('undici (raw)', async () => {
    const { body } = await undiciRequest(url);
    await body.json();
  });

  bench('bareGet()', async () => {
    const res = await bareGet(url);
    await res.json();
  });

  bench('bare client', async () => {
    const res = await bareClient.get('/');
    await res.json();
  });

  bench('recker (fast)', async () => {
    await fastClient.get('/').json();
  });

  bench('recker (standard)', async () => {
    await standardClient.get('/').json();
  });
});

group('POST JSON', () => {
  const body = { name: 'John', email: 'john@example.com' };

  bench('undici (raw)', async () => {
    const { body: respBody } = await undiciRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    await respBody.json();
  });

  bench('bare client', async () => {
    const res = await bareClient.post('/', body);
    await res.json();
  });

  bench('recker (fast)', async () => {
    await fastClient.post('/', body).json();
  });

  bench('recker (standard)', async () => {
    await standardClient.post('/', body).json();
  });
});

group('Sequential GET (5 requests)', () => {
  bench('undici (raw)', async () => {
    for (let i = 0; i < 5; i++) {
      const { body } = await undiciRequest(url);
      await body.json();
    }
  });

  bench('bare client', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await bareClient.get('/');
      await res.json();
    }
  });

  bench('recker (fast)', async () => {
    for (let i = 0; i < 5; i++) {
      await fastClient.get('/').json();
    }
  });

  bench('recker (standard)', async () => {
    for (let i = 0; i < 5; i++) {
      await standardClient.get('/').json();
    }
  });
});

group('Parallel GET (10 concurrent)', () => {
  bench('undici (raw)', async () => {
    await Promise.all(Array(10).fill(null).map(async () => {
      const { body } = await undiciRequest(url);
      return body.json();
    }));
  });

  bench('bare client', async () => {
    await Promise.all(Array(10).fill(null).map(async () => {
      const res = await bareClient.get('/');
      return res.json();
    }));
  });

  bench('recker (fast)', async () => {
    await Promise.all(Array(10).fill(null).map(() =>
      fastClient.get('/').json()
    ));
  });

  bench('recker (standard)', async () => {
    await Promise.all(Array(10).fill(null).map(() =>
      standardClient.get('/').json()
    ));
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
  console.log('                             SUMMARY                                ');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('undici (raw)     - Direct undici.request() - baseline');
  console.log('bareGet()        - Single function, no client object');
  console.log('bare client      - createBareClient() - minimal wrapper');
  console.log('recker (fast)    - createClient({ observability: false })');
  console.log('recker (standard)- createClient() - full featured');
  console.log('');
}
