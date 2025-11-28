import { run, bench, group } from 'mitata';
import { createServer } from 'node:http';
import { createClient } from '../src/index.js';
import axios from 'axios';
import got from 'got';
import ky from 'ky';

const testPayload = {
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  tags: ['developer', 'nodejs', 'typescript'],
  metadata: {
    created: Date.now(),
    source: 'benchmark'
  }
};

// Setup server
const server = createServer(async (req, res) => {
  if (req.method === 'POST') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString());

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      data: { id: '123', ...body }
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

await new Promise<void>((resolve) => server.listen(0, resolve));
const port = (server.address() as any).port;
const url = `http://localhost:${port}`;

// Setup Clients
const recker = createClient({ baseUrl: url });

console.log('┌─────────────────────────────────────────────────────┐');
console.log('│  Benchmark: POST with JSON serialization           │');
console.log('└─────────────────────────────────────────────────────┘\n');

group('POST JSON payload', () => {
  bench('recker', async () => {
    await recker.post('/', testPayload).json();
  });

  bench('ky', async () => {
    await ky.post(url, { json: testPayload }).json();
  });

  bench('got', async () => {
    await got.post(url, { json: testPayload }).json();
  });

  bench('axios', async () => {
    await axios.post(url, testPayload);
  });

  bench('fetch (native)', async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });
    await res.json();
  });
});

await run({
  avg: true,
  json: false,
  colors: true,
  min_max: true,
  percentiles: true,
});

server.close();
