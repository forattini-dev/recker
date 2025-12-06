/**
 * API Simulation Benchmark
 *
 * Simulates realistic API usage patterns including:
 * - Authentication flows (login + authenticated requests)
 * - CRUD operations with varying payload sizes
 * - Error handling and recovery
 * - Headers manipulation
 * - Query parameters
 * - Rate-limited endpoints
 */

import { run, bench, group } from 'mitata';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '../src/index.js';
import axios from 'axios';
import got from 'got';
import ky from 'ky';

// Realistic API response data
const users = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1,
  name: `User ${i + 1}`,
  email: `user${i + 1}@example.com`,
  role: i % 5 === 0 ? 'admin' : 'user',
  createdAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
  profile: {
    avatar: `https://avatars.example.com/${i + 1}.png`,
    bio: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    location: ['New York', 'London', 'Tokyo', 'Paris', 'Berlin'][i % 5],
    social: {
      twitter: `@user${i + 1}`,
      github: `user${i + 1}`,
    }
  }
}));

const products = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1,
  name: `Product ${i + 1}`,
  description: 'High-quality product with excellent features. '.repeat(3),
  price: Math.floor(Math.random() * 1000) + 10,
  category: ['Electronics', 'Clothing', 'Books', 'Home', 'Sports'][i % 5],
  inStock: Math.random() > 0.2,
  ratings: {
    average: (Math.random() * 2 + 3).toFixed(1),
    count: Math.floor(Math.random() * 1000)
  },
  images: Array.from({ length: 3 }, (_, j) => `https://images.example.com/product${i + 1}_${j + 1}.jpg`)
}));

// Token store for auth simulation
const tokens = new Map<string, { userId: number; expiresAt: number }>();

// Setup server with realistic API endpoints
const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || '/', `http://localhost`);
  const path = url.pathname;
  const method = req.method || 'GET';

  // Simulate network latency (5-15ms)
  await new Promise(r => setTimeout(r, 5 + Math.random() * 10));

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Helper to read body
  const readBody = async (): Promise<any> => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      return null;
    }
  };

  // Helper to send JSON
  const json = (data: any, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  // Helper to check auth
  const checkAuth = (): { userId: number } | null => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;

    const token = auth.slice(7);
    const session = tokens.get(token);

    if (!session || session.expiresAt < Date.now()) {
      tokens.delete(token);
      return null;
    }

    return { userId: session.userId };
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  if (path === '/auth/login' && method === 'POST') {
    const body = await readBody();

    // Simulate auth delay
    await new Promise(r => setTimeout(r, 20 + Math.random() * 30));

    if (body?.email && body?.password) {
      const token = `token_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const userId = Math.floor(Math.random() * 100) + 1;

      tokens.set(token, {
        userId,
        expiresAt: Date.now() + 3600000 // 1 hour
      });

      return json({
        token,
        user: users[userId - 1],
        expiresIn: 3600
      });
    }

    return json({ error: 'Invalid credentials' }, 401);
  }

  if (path === '/auth/refresh' && method === 'POST') {
    const user = checkAuth();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const newToken = `token_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    tokens.set(newToken, {
      userId: user.userId,
      expiresAt: Date.now() + 3600000
    });

    return json({ token: newToken, expiresIn: 3600 });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // USERS ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  if (path === '/users' && method === 'GET') {
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const role = url.searchParams.get('role');

    let filtered = users;
    if (role) {
      filtered = users.filter(u => u.role === role);
    }

    const start = (page - 1) * limit;
    const paginated = filtered.slice(start, start + limit);

    return json({
      data: paginated,
      meta: {
        total: filtered.length,
        page,
        limit,
        pages: Math.ceil(filtered.length / limit)
      }
    });
  }

  if (path.match(/^\/users\/\d+$/) && method === 'GET') {
    const id = parseInt(path.split('/')[2]);
    const user = users.find(u => u.id === id);

    if (!user) return json({ error: 'User not found' }, 404);
    return json(user);
  }

  if (path === '/users' && method === 'POST') {
    const user = checkAuth();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await readBody();
    const newUser = {
      id: users.length + 1,
      ...body,
      createdAt: new Date().toISOString()
    };

    return json(newUser, 201);
  }

  if (path.match(/^\/users\/\d+$/) && method === 'PUT') {
    const user = checkAuth();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await readBody();
    const id = parseInt(path.split('/')[2]);

    return json({ id, ...body, updatedAt: new Date().toISOString() });
  }

  if (path.match(/^\/users\/\d+$/) && method === 'DELETE') {
    const user = checkAuth();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    return json({ success: true }, 200);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRODUCTS ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  if (path === '/products' && method === 'GET') {
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    const category = url.searchParams.get('category');
    const minPrice = parseInt(url.searchParams.get('minPrice') || '0');
    const maxPrice = parseInt(url.searchParams.get('maxPrice') || '9999');

    let filtered = products.filter(p =>
      p.price >= minPrice &&
      p.price <= maxPrice &&
      (!category || p.category === category)
    );

    const start = (page - 1) * limit;
    const paginated = filtered.slice(start, start + limit);

    return json({
      data: paginated,
      meta: {
        total: filtered.length,
        page,
        limit,
        pages: Math.ceil(filtered.length / limit)
      }
    });
  }

  if (path.match(/^\/products\/\d+$/) && method === 'GET') {
    const id = parseInt(path.split('/')[2]);
    const product = products.find(p => p.id === id);

    if (!product) return json({ error: 'Product not found' }, 404);
    return json(product);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SPECIAL ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  // Rate limited endpoint
  if (path === '/rate-limited') {
    // Simulate rate limit (30% chance)
    if (Math.random() < 0.3) {
      res.setHeader('Retry-After', '1');
      return json({ error: 'Rate limit exceeded' }, 429);
    }
    return json({ success: true });
  }

  // Slow endpoint
  if (path === '/slow') {
    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
    return json({ data: 'slow response' });
  }

  // Large response
  if (path === '/large') {
    const largeData = {
      items: Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        data: 'x'.repeat(100),
        nested: { a: 1, b: 2, c: 3 }
      }))
    };
    return json(largeData);
  }

  // Echo headers
  if (path === '/echo-headers') {
    return json({
      headers: Object.fromEntries(
        Object.entries(req.headers).filter(([k]) =>
          !['host', 'connection', 'content-length'].includes(k)
        )
      )
    });
  }

  // Health check
  if (path === '/health') {
    return json({ status: 'ok', timestamp: Date.now() });
  }

  // 404
  json({ error: 'Not found' }, 404);
});

await new Promise<void>((resolve) => server.listen(0, resolve));
const port = (server.address() as any).port;
const baseUrl = `http://localhost:${port}`;

// Setup clients
const recker = createClient({ baseUrl });
const reckerWithRetry = createClient({
  baseUrl,
  retry: { maxAttempts: 3, delay: 100, statusCodes: [429] }
});
const axiosClient = axios.create({ baseURL: baseUrl });

console.log('┌─────────────────────────────────────────────────────────────────┐');
console.log('│  Benchmark: Realistic API Simulation                            │');
console.log('│                                                                 │');
console.log('│  Scenarios:                                                     │');
console.log('│  - Authentication flow (login + token usage)                    │');
console.log('│  - CRUD operations with pagination                              │');
console.log('│  - Varying payload sizes                                        │');
console.log('│  - Headers and query parameters                                 │');
console.log('│  - Error handling                                               │');
console.log('└─────────────────────────────────────────────────────────────────┘\n');

// ═══════════════════════════════════════════════════════════════════════════════
// BENCHMARK 1: Authentication Flow
// ═══════════════════════════════════════════════════════════════════════════════

group('Authentication Flow (login + 3 authenticated requests)', () => {
  bench('recker', async () => {
    // Login
    const loginRes = await recker.post('/auth/login', {
      email: 'test@example.com',
      password: 'password123'
    }).json<{ token: string }>();

    // Make authenticated requests
    const authClient = createClient({
      baseUrl,
      headers: { Authorization: `Bearer ${loginRes.token}` }
    });

    await Promise.all([
      authClient.get('/users?page=1&limit=10').json(),
      authClient.get('/users/1').json(),
      authClient.post('/users', { name: 'New User', email: 'new@example.com' }).json(),
    ]);
  });

  bench('axios', async () => {
    const loginRes = await axios.post(`${baseUrl}/auth/login`, {
      email: 'test@example.com',
      password: 'password123'
    });

    const token = loginRes.data.token;
    const config = { headers: { Authorization: `Bearer ${token}` } };

    await Promise.all([
      axios.get(`${baseUrl}/users?page=1&limit=10`, config),
      axios.get(`${baseUrl}/users/1`, config),
      axios.post(`${baseUrl}/users`, { name: 'New User', email: 'new@example.com' }, config),
    ]);
  });

  bench('got', async () => {
    const loginRes = await got.post(`${baseUrl}/auth/login`, {
      json: { email: 'test@example.com', password: 'password123' }
    }).json<{ token: string }>();

    const config = { headers: { Authorization: `Bearer ${loginRes.token}` } };

    await Promise.all([
      got.get(`${baseUrl}/users?page=1&limit=10`, config).json(),
      got.get(`${baseUrl}/users/1`, config).json(),
      got.post(`${baseUrl}/users`, { ...config, json: { name: 'New User', email: 'new@example.com' } }).json(),
    ]);
  });

  bench('ky', async () => {
    const loginRes = await ky.post(`${baseUrl}/auth/login`, {
      json: { email: 'test@example.com', password: 'password123' }
    }).json<{ token: string }>();

    const authKy = ky.extend({
      headers: { Authorization: `Bearer ${loginRes.token}` }
    });

    await Promise.all([
      authKy.get(`${baseUrl}/users?page=1&limit=10`).json(),
      authKy.get(`${baseUrl}/users/1`).json(),
      authKy.post(`${baseUrl}/users`, { json: { name: 'New User', email: 'new@example.com' } }).json(),
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BENCHMARK 2: CRUD Operations
// ═══════════════════════════════════════════════════════════════════════════════

group('CRUD Operations (Create, Read, Update, Delete)', () => {
  // Use existing user IDs (1-100)
  const testUserId = Math.floor(Math.random() * 50) + 1;

  bench('recker', async () => {
    // Get token first
    const login = await recker.post('/auth/login', {
      email: 'test@example.com',
      password: 'password123'
    }).json<{ token: string }>();

    const auth = createClient({
      baseUrl,
      headers: { Authorization: `Bearer ${login.token}` }
    });

    // Create (returns new ID but we use existing for Read)
    await auth.post('/users', {
      name: 'CRUD Test',
      email: 'crud@test.com'
    }).json();

    // Read existing user
    await auth.get(`/users/${testUserId}`).json();

    // Update existing user
    await auth.put(`/users/${testUserId}`, {
      name: 'Updated CRUD Test'
    }).json();

    // Delete (simulated)
    await auth.delete(`/users/${testUserId}`).json();
  });

  bench('axios', async () => {
    const login = await axios.post(`${baseUrl}/auth/login`, {
      email: 'test@example.com',
      password: 'password123'
    });

    const config = { headers: { Authorization: `Bearer ${login.data.token}` } };

    await axios.post(`${baseUrl}/users`, {
      name: 'CRUD Test',
      email: 'crud@test.com'
    }, config);

    await axios.get(`${baseUrl}/users/${testUserId}`, config);
    await axios.put(`${baseUrl}/users/${testUserId}`, { name: 'Updated CRUD Test' }, config);
    await axios.delete(`${baseUrl}/users/${testUserId}`, config);
  });

  bench('got', async () => {
    const login = await got.post(`${baseUrl}/auth/login`, {
      json: { email: 'test@example.com', password: 'password123' }
    }).json<{ token: string }>();

    const opts = { headers: { Authorization: `Bearer ${login.token}` } };

    await got.post(`${baseUrl}/users`, {
      ...opts,
      json: { name: 'CRUD Test', email: 'crud@test.com' }
    }).json();

    await got.get(`${baseUrl}/users/${testUserId}`, opts).json();
    await got.put(`${baseUrl}/users/${testUserId}`, { ...opts, json: { name: 'Updated CRUD Test' } }).json();
    await got.delete(`${baseUrl}/users/${testUserId}`, opts).json();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BENCHMARK 3: Paginated Listing
// ═══════════════════════════════════════════════════════════════════════════════

group('Paginated Listing (5 pages of products)', () => {
  bench('recker', async () => {
    const pages = await Promise.all([
      recker.get('/products?page=1&limit=10&category=Electronics').json(),
      recker.get('/products?page=2&limit=10&category=Electronics').json(),
      recker.get('/products?page=3&limit=10&category=Electronics').json(),
      recker.get('/products?page=4&limit=10&category=Electronics').json(),
      recker.get('/products?page=5&limit=10&category=Electronics').json(),
    ]);
  });

  bench('axios', async () => {
    await Promise.all([
      axios.get(`${baseUrl}/products?page=1&limit=10&category=Electronics`),
      axios.get(`${baseUrl}/products?page=2&limit=10&category=Electronics`),
      axios.get(`${baseUrl}/products?page=3&limit=10&category=Electronics`),
      axios.get(`${baseUrl}/products?page=4&limit=10&category=Electronics`),
      axios.get(`${baseUrl}/products?page=5&limit=10&category=Electronics`),
    ]);
  });

  bench('got', async () => {
    await Promise.all([
      got.get(`${baseUrl}/products?page=1&limit=10&category=Electronics`).json(),
      got.get(`${baseUrl}/products?page=2&limit=10&category=Electronics`).json(),
      got.get(`${baseUrl}/products?page=3&limit=10&category=Electronics`).json(),
      got.get(`${baseUrl}/products?page=4&limit=10&category=Electronics`).json(),
      got.get(`${baseUrl}/products?page=5&limit=10&category=Electronics`).json(),
    ]);
  });

  bench('ky', async () => {
    await Promise.all([
      ky.get(`${baseUrl}/products?page=1&limit=10&category=Electronics`).json(),
      ky.get(`${baseUrl}/products?page=2&limit=10&category=Electronics`).json(),
      ky.get(`${baseUrl}/products?page=3&limit=10&category=Electronics`).json(),
      ky.get(`${baseUrl}/products?page=4&limit=10&category=Electronics`).json(),
      ky.get(`${baseUrl}/products?page=5&limit=10&category=Electronics`).json(),
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BENCHMARK 4: Custom Headers
// ═══════════════════════════════════════════════════════════════════════════════

group('Custom Headers (10 requests with varied headers)', () => {
  bench('recker', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        recker.get('/echo-headers', {
          headers: {
            'X-Request-Id': `req-${i}`,
            'X-Correlation-Id': `corr-${Date.now()}-${i}`,
            'Accept-Language': i % 2 === 0 ? 'en-US' : 'pt-BR',
            'X-Client-Version': '1.0.0',
            'Cache-Control': 'no-cache'
          }
        }).json()
      )
    );
  });

  bench('axios', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        axios.get(`${baseUrl}/echo-headers`, {
          headers: {
            'X-Request-Id': `req-${i}`,
            'X-Correlation-Id': `corr-${Date.now()}-${i}`,
            'Accept-Language': i % 2 === 0 ? 'en-US' : 'pt-BR',
            'X-Client-Version': '1.0.0',
            'Cache-Control': 'no-cache'
          }
        })
      )
    );
  });

  bench('got', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        got.get(`${baseUrl}/echo-headers`, {
          headers: {
            'X-Request-Id': `req-${i}`,
            'X-Correlation-Id': `corr-${Date.now()}-${i}`,
            'Accept-Language': i % 2 === 0 ? 'en-US' : 'pt-BR',
            'X-Client-Version': '1.0.0',
            'Cache-Control': 'no-cache'
          }
        }).json()
      )
    );
  });

  bench('ky', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        ky.get(`${baseUrl}/echo-headers`, {
          headers: {
            'X-Request-Id': `req-${i}`,
            'X-Correlation-Id': `corr-${Date.now()}-${i}`,
            'Accept-Language': i % 2 === 0 ? 'en-US' : 'pt-BR',
            'X-Client-Version': '1.0.0',
            'Cache-Control': 'no-cache'
          }
        }).json()
      )
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BENCHMARK 5: Mixed Workload
// ═══════════════════════════════════════════════════════════════════════════════

group('Mixed Workload (realistic API usage pattern)', () => {
  bench('recker', async () => {
    // Typical SPA session: login, fetch user, list items, view detail, update
    const login = await recker.post('/auth/login', {
      email: 'test@example.com',
      password: 'password123'
    }).json<{ token: string; user: any }>();

    const auth = createClient({
      baseUrl,
      headers: { Authorization: `Bearer ${login.token}` }
    });

    // Parallel fetches like a dashboard
    await Promise.all([
      recker.get('/products?limit=5').json(),
      recker.get('/users?limit=5').json(),
      recker.get('/health').json(),
    ]);

    // Sequential detail views
    await recker.get('/products/1').json();
    await recker.get('/products/2').json();

    // Update action
    await auth.put('/users/1', { name: 'Updated Name' }).json();
  });

  bench('axios', async () => {
    const login = await axios.post(`${baseUrl}/auth/login`, {
      email: 'test@example.com',
      password: 'password123'
    });

    const config = { headers: { Authorization: `Bearer ${login.data.token}` } };

    await Promise.all([
      axios.get(`${baseUrl}/products?limit=5`),
      axios.get(`${baseUrl}/users?limit=5`),
      axios.get(`${baseUrl}/health`),
    ]);

    await axios.get(`${baseUrl}/products/1`);
    await axios.get(`${baseUrl}/products/2`);
    await axios.put(`${baseUrl}/users/1`, { name: 'Updated Name' }, config);
  });

  bench('got', async () => {
    const login = await got.post(`${baseUrl}/auth/login`, {
      json: { email: 'test@example.com', password: 'password123' }
    }).json<{ token: string }>();

    const opts = { headers: { Authorization: `Bearer ${login.token}` } };

    await Promise.all([
      got.get(`${baseUrl}/products?limit=5`).json(),
      got.get(`${baseUrl}/users?limit=5`).json(),
      got.get(`${baseUrl}/health`).json(),
    ]);

    await got.get(`${baseUrl}/products/1`).json();
    await got.get(`${baseUrl}/products/2`).json();
    await got.put(`${baseUrl}/users/1`, { ...opts, json: { name: 'Updated Name' } }).json();
  });

  bench('ky', async () => {
    const login = await ky.post(`${baseUrl}/auth/login`, {
      json: { email: 'test@example.com', password: 'password123' }
    }).json<{ token: string }>();

    const authKy = ky.extend({
      headers: { Authorization: `Bearer ${login.token}` }
    });

    await Promise.all([
      ky.get(`${baseUrl}/products?limit=5`).json(),
      ky.get(`${baseUrl}/users?limit=5`).json(),
      ky.get(`${baseUrl}/health`).json(),
    ]);

    await ky.get(`${baseUrl}/products/1`).json();
    await ky.get(`${baseUrl}/products/2`).json();
    await authKy.put(`${baseUrl}/users/1`, { json: { name: 'Updated Name' } }).json();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BENCHMARK 6: Large Response
// ═══════════════════════════════════════════════════════════════════════════════

group('Large Response Handling (~500KB JSON)', () => {
  bench('recker', async () => {
    await recker.get('/large').json();
  });

  bench('axios', async () => {
    await axios.get(`${baseUrl}/large`);
  });

  bench('got', async () => {
    await got.get(`${baseUrl}/large`).json();
  });

  bench('ky', async () => {
    await ky.get(`${baseUrl}/large`).json();
  });

  bench('fetch (native)', async () => {
    const res = await fetch(`${baseUrl}/large`);
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
