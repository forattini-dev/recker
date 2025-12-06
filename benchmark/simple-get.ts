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

// Setup server
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    id: '123',
    name: 'Test User',
    email: 'test@example.com',
    timestamp: Date.now()
  }));
});

await new Promise<void>((resolve) => server.listen(0, resolve));
const port = (server.address() as any).port;
const url = `http://localhost:${port}`;

// Setup Clients
const recker = createClient({ baseUrl: url });
const reckerWithFeatures = createClient({
  baseUrl: url,
  cache: { driver: 'memory', strategy: 'cache-first', ttl: 60_000 },
  dedup: {}
});

if (!JSON_OUTPUT) {
  console.log('┌─────────────────────────────────────────────────────┐');
  console.log('│  Benchmark: Simple GET with JSON parsing           │');
  console.log('└─────────────────────────────────────────────────────┘\n');
}

group('Baseline (no overhead)', () => {
  bench('undici (raw)', async () => {
    const { body } = await undiciRequest(url);
    await body.json();
  });

  bench('fetch (native)', async () => {
    const res = await fetch(url);
    await res.json();
  });
});

group('HTTP Clients (minimal config)', () => {
  bench('recker', async () => {
    await recker.get('/').json();
  });

  bench('ky', async () => {
    await ky.get(url).json();
  });

  bench('got', async () => {
    await got.get(url).json();
  });

  bench('axios', async () => {
    await axios.get(url);
  });

  bench('needle', async () => {
    await needle('get', url, { json: true });
  });

  bench('superagent', async () => {
    await superagent.get(url);
  });
});

group('Recker with features', () => {
  bench('recker (cache + dedup)', async () => {
    await reckerWithFeatures.get('/').json();
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
