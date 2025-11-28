import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ClientPool, globalPool, createDedupPool } from '../../src/utils/client-pool.js';
import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';

describe('ClientPool', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    return new Promise<void>((resolve) => {
      server = createServer((req: IncomingMessage, res: ServerResponse) => {
        if (req.url === '/users') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ users: ['alice', 'bob'] }));
        } else if (req.url === '/products') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ products: ['item1', 'item2'] }));
        } else if (req.url === '/echo' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(body);
          });
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Not Found' }));
        }
      });

      server.listen(0, () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
  });

  describe('Basic functionality', () => {
    it('should create and cache clients', () => {
      const pool = new ClientPool();

      const client1 = pool.get('https://api1.example.com');
      const client2 = pool.get('https://api2.example.com');
      const client1Again = pool.get('https://api1.example.com');

      expect(client1).toBeDefined();
      expect(client2).toBeDefined();
      expect(client1).toBe(client1Again); // Same instance
      expect(client1).not.toBe(client2);  // Different instances
    });

    it('should report pool size', () => {
      const pool = new ClientPool();

      expect(pool.size).toBe(0);

      pool.get('https://api1.example.com');
      expect(pool.size).toBe(1);

      pool.get('https://api2.example.com');
      expect(pool.size).toBe(2);

      // Getting existing client doesn't increase size
      pool.get('https://api1.example.com');
      expect(pool.size).toBe(2);
    });

    it('should check if client exists', () => {
      const pool = new ClientPool();

      expect(pool.has('https://api.example.com')).toBe(false);

      pool.get('https://api.example.com');
      expect(pool.has('https://api.example.com')).toBe(true);
    });

    it('should clear all clients', () => {
      const pool = new ClientPool();

      pool.get('https://api1.example.com');
      pool.get('https://api2.example.com');
      expect(pool.size).toBe(2);

      pool.clear();
      expect(pool.size).toBe(0);
    });

    it('should remove specific client', () => {
      const pool = new ClientPool();

      pool.get('https://api1.example.com');
      pool.get('https://api2.example.com');

      const removed = pool.remove('https://api1.example.com');
      expect(removed).toBe(true);
      expect(pool.size).toBe(1);
      expect(pool.has('https://api1.example.com')).toBe(false);
      expect(pool.has('https://api2.example.com')).toBe(true);
    });

    it('should return false when removing non-existent client', () => {
      const pool = new ClientPool();

      const removed = pool.remove('https://nonexistent.example.com');
      expect(removed).toBe(false);
    });
  });

  describe('with default options', () => {
    it('should create clients with provided options', () => {
      const pool = new ClientPool({
        timeout: 5000,
        headers: { 'X-Custom': 'header' }
      });

      const client = pool.get('https://api.example.com');
      expect(client).toBeDefined();
    });
  });

  describe('multi()', () => {
    it('should execute multiple requests in parallel', async () => {
      const pool = new ClientPool();

      const results = await pool.multi([
        { baseUrl, path: '/users' },
        { baseUrl, path: '/products' }
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ users: ['alice', 'bob'] });
      expect(results[1]).toEqual({ products: ['item1', 'item2'] });
    });

    it('should support different HTTP methods', async () => {
      const pool = new ClientPool();

      const results = await pool.multi([
        { baseUrl, path: '/echo', method: 'POST', options: { json: { test: 'data' } } }
      ]);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ test: 'data' });
    });

    it('should throw for unknown HTTP method', async () => {
      const pool = new ClientPool();

      await expect(
        pool.multi([{ baseUrl, path: '/users', method: 'INVALID' }])
      ).rejects.toThrow('Unknown HTTP method: INVALID');
    });

    it('should reuse clients for same baseUrl', async () => {
      const pool = new ClientPool();

      await pool.multi([
        { baseUrl, path: '/users' },
        { baseUrl, path: '/products' },
        { baseUrl, path: '/users' }
      ]);

      // Should only create one client for the same baseUrl
      expect(pool.size).toBe(1);
    });
  });

  describe('globalPool', () => {
    it('should be a pre-created ClientPool instance', () => {
      expect(globalPool).toBeInstanceOf(ClientPool);
    });

    it('should be usable like any other pool', () => {
      const client = globalPool.get('https://test.example.com');
      expect(client).toBeDefined();

      // Clean up
      globalPool.remove('https://test.example.com');
    });
  });

  describe('createDedupPool', () => {
    it('should create a pool with dedup enabled', () => {
      const pool = createDedupPool();
      expect(pool).toBeInstanceOf(ClientPool);
    });

    it('should accept additional options', () => {
      const pool = createDedupPool({ timeout: 10000 });
      expect(pool).toBeInstanceOf(ClientPool);
    });
  });
});
