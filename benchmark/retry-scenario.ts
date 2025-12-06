import { run, bench, group } from 'mitata';
import { createServer } from 'node:http';
import { createClient } from '../src/index.js';
import axios from 'axios';
import got from 'got';
import ky from 'ky';
import superagent from 'superagent';

const JSON_OUTPUT = process.env.BENCH_JSON === '1';

let requestCount = 0;

// Setup server that fails first 2 times, succeeds on 3rd
const server = createServer((req, res) => {
  requestCount++;

  // Fail first 2 requests per client
  if (requestCount % 3 !== 0) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Service temporarily unavailable' }));
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, attempt: requestCount }));
  }
});

await new Promise<void>((resolve) => server.listen(0, resolve));
const port = (server.address() as any).port;
const url = `http://localhost:${port}`;

// Setup Clients with retry
const recker = createClient({
  baseUrl: url,
  retry: {
    maxAttempts: 3,
    delay: 10,
    backoff: 'exponential',
    jitter: false // Disable for consistent benchmarking
  }
});

const axiosRetry = axios.create();
axiosRetry.interceptors.response.use(undefined, async (error) => {
  const config = error.config;
  if (!config || !config.retryCount) {
    config.retryCount = 0;
  }

  if (config.retryCount >= 2) {
    return Promise.reject(error);
  }

  config.retryCount++;
  await new Promise(resolve => setTimeout(resolve, 10 * Math.pow(2, config.retryCount - 1)));
  return axiosRetry.request(config);
});

const gotRetry = got.extend({
  retry: {
    limit: 2,
    methods: ['GET'],
    statusCodes: [503]
  }
});

const kyRetry = ky.extend({
  retry: {
    limit: 2,
    methods: ['get'],
    statusCodes: [503]
  }
});

if (!JSON_OUTPUT) {
  console.log('┌─────────────────────────────────────────────────────┐');
  console.log('│  Benchmark: Retry on 503 errors (3 attempts)       │');
  console.log('│  Note: Server fails 2x then succeeds               │');
  console.log('└─────────────────────────────────────────────────────┘\n');
}

// superagent with manual retry
const superagentRetry = async (attempts = 3) => {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await superagent.get(url);
    } catch (e: any) {
      lastError = e;
      if (e.status !== 503 || i === attempts - 1) throw e;
      await new Promise(r => setTimeout(r, 10 * Math.pow(2, i)));
    }
  }
  throw lastError;
};

group('Retry with exponential backoff', () => {
  bench('recker (exponential)', async () => {
    try {
      await recker.get('/').json();
    } catch (e) {
      // Expected some failures
    }
  });

  bench('axios (manual retry)', async () => {
    try {
      await axiosRetry.get(url);
    } catch (e) {
      // Expected some failures
    }
  });

  bench('got (with retry)', async () => {
    try {
      await gotRetry.get(url).json();
    } catch (e) {
      // Expected some failures
    }
  });

  bench('ky (with retry)', async () => {
    try {
      await kyRetry.get(url).json();
    } catch (e) {
      // Expected some failures
    }
  });

  bench('superagent (manual retry)', async () => {
    try {
      await superagentRetry();
    } catch (e) {
      // Expected some failures
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
