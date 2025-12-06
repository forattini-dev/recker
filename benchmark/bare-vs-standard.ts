/**
 * Mini Client vs Standard Client Benchmark
 *
 * Compares:
 * - undici (raw) - baseline
 * - recker-mini - minimal overhead wrapper
 * - recker standard - full featured
 */

import { run, bench, group } from 'mitata';
import { createServer } from 'node:http';
import { request as undiciRequest } from 'undici';
import { createMiniClient, miniGet } from '../src/mini.js';
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
const miniClient = createMiniClient({ baseUrl: url });
const standardClient = createClient({ baseUrl: url });

if (!JSON_OUTPUT) {
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║           Mini Client vs Standard Client Benchmark                ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
}

group('GET JSON (minimal overhead comparison)', () => {
  bench('undici (raw)', async () => {
    const { body } = await undiciRequest(url);
    await body.json();
  });

  bench('miniGet()', async () => {
    const res = await miniGet(url);
    await res.json();
  });

  bench('recker-mini', async () => {
    const res = await miniClient.get('/');
    await res.json();
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

  bench('recker-mini', async () => {
    const res = await miniClient.post('/', body);
    await res.json();
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

  bench('recker-mini', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await miniClient.get('/');
      await res.json();
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

  bench('recker-mini', async () => {
    await Promise.all(Array(10).fill(null).map(async () => {
      const res = await miniClient.get('/');
      return res.json();
    }));
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
  console.log('miniGet()        - Single function, no client object');
  console.log('recker-mini      - createMiniClient() - minimal wrapper');
  console.log('recker (standard)- createClient() - full featured');
  console.log('');
}
