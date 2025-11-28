import { run, bench, group, summary } from 'mitata';
import { createServer } from 'node:http';
import { createClient } from '../src/index.js';
import axios from 'axios';
import got from 'got';
import ky from 'ky';
import { request as undiciRequest } from 'undici';

// Setup server
const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ hello: 'world' }));
});

await new Promise<void>((resolve) => server.listen(0, resolve));
const port = (server.address() as any).port;
const url = `http://localhost:${port}`;

// Setup Clients
const recker = createClient({ baseUrl: url });

// Main Benchmark
console.log(`Running benchmark against server at ${url}\n`);

group('HTTP Clients (GET JSON)', () => {
  
  bench('undici (raw)', async () => {
    const { body } = await undiciRequest(url);
    await body.json();
  });

  bench('fetch (native)', async () => {
    const res = await fetch(url);
    await res.json();
  });

  bench('recker (core)', async () => {
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

});

await run({
  avg: true, // enable/disable avg column (default: true)
  json: false, // enable/disable json output (default: false)
  colors: true, // enable/disable colors (default: true)
  min_max: true, // enable/disable min/max column (default: true)
  collect: false, // enable/disable collecting returned values into an array during the benchmark (default: false)
  percentiles: true, // enable/disable percentiles column (default: true)
});

server.close();
