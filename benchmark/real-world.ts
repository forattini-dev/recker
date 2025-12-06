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

if (!JSON_OUTPUT) {
  console.log('┌─────────────────────────────────────────────────────┐');
  console.log('│  Benchmark: Real-world scenarios with latency      │');
  console.log('│  Note: Server adds 10-50ms latency per request     │');
  console.log('└─────────────────────────────────────────────────────┘\n');
}

group('GET with realistic latency', () => {
  bench('undici (raw)', async () => {
    const { body } = await undiciRequest(url + '/users');
    await body.json();
  });

  bench('fetch (native)', async () => {
    const res = await fetch(url + '/users');
    await res.json();
  });

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

  bench('needle', async () => {
    await needle('get', url + '/users', { json: true });
  });

  bench('superagent', async () => {
    await superagent.get(url + '/users');
  });
});

group('Sequential requests (5x)', () => {
  bench('undici (raw)', async () => {
    for (let i = 0; i < 5; i++) {
      const { body } = await undiciRequest(`${url}/users/${i}`);
      await body.json();
    }
  });

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

  bench('ky', async () => {
    for (let i = 0; i < 5; i++) {
      await ky.get(`${url}/users/${i}`).json();
    }
  });

  bench('needle', async () => {
    for (let i = 0; i < 5; i++) {
      await needle('get', `${url}/users/${i}`, { json: true });
    }
  });

  bench('superagent', async () => {
    for (let i = 0; i < 5; i++) {
      await superagent.get(`${url}/users/${i}`);
    }
  });
});

group('Parallel requests (10x same endpoint)', () => {
  bench('undici (raw)', async () => {
    await Promise.all(
      Array(10).fill(null).map(async () => {
        const { body } = await undiciRequest(url + '/users');
        return body.json();
      })
    );
  });

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

  bench('got', async () => {
    await Promise.all(
      Array(10).fill(null).map(() => got.get(url + '/users').json())
    );
  });

  bench('ky', async () => {
    await Promise.all(
      Array(10).fill(null).map(() => ky.get(url + '/users').json())
    );
  });

  bench('superagent', async () => {
    await Promise.all(
      Array(10).fill(null).map(() => superagent.get(url + '/users'))
    );
  });
});

group('POST authentication flow', () => {
  const authPayload = { username: 'test', password: 'password' };

  bench('undici (raw)', async () => {
    const { body } = await undiciRequest(url + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authPayload)
    });
    await body.json();
  });

  bench('fetch (native)', async () => {
    const res = await fetch(url + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authPayload)
    });
    await res.json();
  });

  bench('recker', async () => {
    await recker.post('/auth/login', authPayload).json();
  });

  bench('axios', async () => {
    await axios.post(url + '/auth/login', authPayload);
  });

  bench('got', async () => {
    await got.post(url + '/auth/login', { json: authPayload }).json();
  });

  bench('ky', async () => {
    await ky.post(url + '/auth/login', { json: authPayload }).json();
  });

  bench('needle', async () => {
    await needle('post', url + '/auth/login', authPayload, { json: true });
  });

  bench('superagent', async () => {
    await superagent.post(url + '/auth/login').send(authPayload);
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
