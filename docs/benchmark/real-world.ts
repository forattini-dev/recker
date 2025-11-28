import { run, bench, group } from 'mitata';
import { createServer } from 'node:http';
import { createClient } from '../src/index.js';
import axios from 'axios';
import got from 'got';
import ky from 'ky';

// Simulate realistic API latency
const simulateLatency = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Setup server with realistic delays
const server = createServer(async (req, res) => {
  // Simulate database query latency (10-50ms)
  await simulateLatency(10 + Math.random() * 40);

  if (req.url === '/users') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      users: Array(10).fill(null).map((_, i) => ({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        role: i % 2 === 0 ? 'admin' : 'user'
      }))
    }));
  } else if (req.url?.startsWith('/users/')) {
    const id = req.url.split('/')[2];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id,
      name: `User ${id}`,
      email: `user${id}@example.com`,
      profile: {
        bio: 'Lorem ipsum dolor sit amet',
        location: 'San Francisco',
        website: 'https://example.com'
      }
    }));
  } else if (req.method === 'POST' && req.url === '/auth/login') {
    // Simulate authentication check (50-100ms)
    await simulateLatency(50 + Math.random() * 50);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      token: 'jwt_token_here',
      user: { id: '1', name: 'Test User' }
    }));
  }
});

await new Promise<void>((resolve) => server.listen(0, resolve));
const port = (server.address() as any).port;
const url = `http://localhost:${port}`;

// Setup Clients
const recker = createClient({ baseUrl: url });
const reckerOptimized = createClient({
  baseUrl: url,
  cache: { driver: 'memory', strategy: 'stale-while-revalidate', ttl: 5000 },
  dedup: {}
});

console.log('┌─────────────────────────────────────────────────────┐');
console.log('│  Benchmark: Real-world scenarios with latency      │');
console.log('│  Note: Server adds 10-50ms latency per request     │');
console.log('└─────────────────────────────────────────────────────┘\n');

group('GET with realistic latency', () => {
  bench('recker', async () => {
    await recker.get('/users').json();
  });

  bench('recker (optimized)', async () => {
    await reckerOptimized.get('/users').json();
  });

  bench('axios', async () => {
    await axios.get(url + '/users');
  });

  bench('got', async () => {
    await got.get(url + '/users').json();
  });

  bench('ky', async () => {
    await ky.get(url + '/users').json();
  });
});

group('Sequential requests (5x)', () => {
  bench('recker', async () => {
    for (let i = 0; i < 5; i++) {
      await recker.get(`/users/${i}`).json();
    }
  });

  bench('axios', async () => {
    for (let i = 0; i < 5; i++) {
      await axios.get(`${url}/users/${i}`);
    }
  });

  bench('got', async () => {
    for (let i = 0; i < 5; i++) {
      await got.get(`${url}/users/${i}`).json();
    }
  });
});

group('Parallel requests (10x same endpoint)', () => {
  bench('recker (no dedup)', async () => {
    await Promise.all(
      Array(10).fill(null).map(() => recker.get('/users').json())
    );
  });

  bench('recker (with dedup)', async () => {
    await Promise.all(
      Array(10).fill(null).map(() => reckerOptimized.get('/users').json())
    );
  });

  bench('axios', async () => {
    await Promise.all(
      Array(10).fill(null).map(() => axios.get(url + '/users'))
    );
  });
});

group('POST authentication flow', () => {
  bench('recker', async () => {
    await recker.post('/auth/login', {
      username: 'test',
      password: 'password'
    }).json();
  });

  bench('axios', async () => {
    await axios.post(url + '/auth/login', {
      username: 'test',
      password: 'password'
    });
  });

  bench('ky', async () => {
    await ky.post(url + '/auth/login', {
      json: { username: 'test', password: 'password' }
    }).json();
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
