import { run, bench, group } from 'mitata';
import { createServer } from 'node:http';
import { createClient } from '../src/index.js';
import axios from 'axios';
import got from 'got';
import ky from 'ky';
import { request as undiciRequest } from 'undici';
import needle from 'needle';
import superagent from 'superagent';

const JSON_OUTPUT = process.env.BENCH_JSON === '1';

// Large response (1MB of JSON)
const largeData = {
  items: Array(1000).fill(null).map((_, i) => ({
    id: i,
    name: `Item ${i}`,
    description: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(10),
    metadata: {
      created: Date.now(),
      index: i
    }
  }))
};

const largePayload = JSON.stringify(largeData);

// Setup server
const server = createServer((req, res) => {
  if (req.url === '/large') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(largePayload)
    });
    res.end(largePayload);
  } else if (req.url === '/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Transfer-Encoding': 'chunked'
    });

    // Stream 100 chunks
    let count = 0;
    const interval = setInterval(() => {
      if (count >= 100) {
        clearInterval(interval);
        res.end();
        return;
      }
      res.write(`Chunk ${count}\n`);
      count++;
    }, 1);
  } else if (req.url === '/sse') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Send 50 SSE events
    for (let i = 0; i < 50; i++) {
      res.write(`id: ${i}\n`);
      res.write(`event: message\n`);
      res.write(`data: ${JSON.stringify({ count: i, timestamp: Date.now() })}\n\n`);
    }

    res.end();
  }
});

await new Promise<void>((resolve) => server.listen(0, resolve));
const port = (server.address() as any).port;
const url = `http://localhost:${port}`;

const recker = createClient({ baseUrl: url });

if (!JSON_OUTPUT) {
  console.log('┌─────────────────────────────────────────────────────┐');
  console.log('│  Benchmark: Streaming & Large responses            │');
  console.log('└─────────────────────────────────────────────────────┘\n');
}

group('Large JSON response (1MB)', () => {
  bench('undici (raw)', async () => {
    const { body } = await undiciRequest(url + '/large');
    await body.json();
  });

  bench('fetch (native)', async () => {
    const res = await fetch(url + '/large');
    await res.json();
  });

  bench('recker (.json())', async () => {
    await recker.get('/large').json();
  });

  bench('axios', async () => {
    await axios.get(url + '/large');
  });

  bench('got', async () => {
    await got.get(url + '/large').json();
  });

  bench('ky', async () => {
    await ky.get(url + '/large').json();
  });

  bench('needle', async () => {
    await needle('get', url + '/large', { json: true });
  });

  bench('superagent', async () => {
    await superagent.get(url + '/large');
  });
});

group('Chunked streaming (100 chunks)', () => {
  bench('recker (async iteration)', async () => {
    let chunks = 0;
    for await (const _ of recker.get('/stream')) {
      chunks++;
    }
  });

  bench('fetch (native)', async () => {
    const res = await fetch(url + '/stream');
    const reader = res.body!.getReader();
    let chunks = 0;
    while (true) {
      const { done } = await reader.read();
      if (done) break;
      chunks++;
    }
  });
});

group('Server-Sent Events (50 events)', () => {
  bench('recker (.sse())', async () => {
    let events = 0;
    for await (const _ of recker.get('/sse').sse()) {
      events++;
    }
  });

  bench('fetch (manual parsing)', async () => {
    const res = await fetch(url + '/sse');
    const text = await res.text();
    const events = text.split('\n\n').filter(e => e.includes('data:'));
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
