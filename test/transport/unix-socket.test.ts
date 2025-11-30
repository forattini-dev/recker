import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Client } from '../../src/index.js';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const isWindows = os.platform() === 'win32';

describe.skipIf(isWindows)('Unix Domain Sockets', () => {
  let server: http.Server;
  let socketPath: string;

  beforeEach(() => {
    // Create a unique socket path for each test
    socketPath = path.join(os.tmpdir(), `recker-test-${Date.now()}.sock`);

    // Ensure socket doesn't exist
    try {
      fs.unlinkSync(socketPath);
    } catch (err) {
      // Ignore if file doesn't exist
    }
  });

  afterEach(() => {
    if (server) {
      server.close();
    }

    // Cleanup socket file
    try {
      fs.unlinkSync(socketPath);
    } catch (err) {
      // Ignore errors
    }
  });

  it('should connect to HTTP server via Unix socket', async () => {
    return new Promise<void>((resolve, reject) => {
      server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Hello from Unix socket!' }));
      });

      server.listen(socketPath, async () => {
        try {
          const client = new Client({
            baseUrl: 'http://localhost',
            socketPath: socketPath
          });

          const response = await client.get('/');
          expect(response.status).toBe(200);

          const data = await response.json();
          expect(data).toEqual({ message: 'Hello from Unix socket!' });

          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  });

  it('should handle different HTTP methods over Unix socket', async () => {
    return new Promise<void>((resolve, reject) => {
      server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          method: req.method,
          path: req.url
        }));
      });

      server.listen(socketPath, async () => {
        try {
          const client = new Client({
            baseUrl: 'http://localhost',
            socketPath: socketPath
          });

          // Test GET
          const getResp = await client.get('/test');
          const getData = await getResp.json();
          expect(getData.method).toBe('GET');
          expect(getData.path).toBe('/test');

          // Test POST
          const postResp = await client.post('/api', {
            json: { foo: 'bar' }
          });
          const postData = await postResp.json();
          expect(postData.method).toBe('POST');
          expect(postData.path).toBe('/api');

          // Test PUT
          const putResp = await client.put('/resource/1', {
            json: { updated: true }
          });
          const putData = await putResp.json();
          expect(putData.method).toBe('PUT');

          // Test DELETE
          const deleteResp = await client.delete('/resource/1');
          const deleteData = await deleteResp.json();
          expect(deleteData.method).toBe('DELETE');

          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  });

  it('should send and receive request body via Unix socket', async () => {
    return new Promise<void>((resolve, reject) => {
      server = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            received: body,
            contentType: req.headers['content-type']
          }));
        });
      });

      server.listen(socketPath, async () => {
        try {
          const client = new Client({
            baseUrl: 'http://localhost',
            socketPath: socketPath
          });

          const payload = { name: 'test', value: 123 };
          const response = await client.post('/data', payload); // Pass payload directly

          const data = await response.json();
          expect(data.contentType).toBe('application/json');
          const received = JSON.parse(data.received);
          // Client sends payload as JSON body directly
          expect(received).toEqual(payload);

          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  });

  it('should handle headers over Unix socket', async () => {
    return new Promise<void>((resolve, reject) => {
      server = http.createServer((req, res) => {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'X-Custom-Header': 'test-value'
        });
        res.end(JSON.stringify({
          receivedHeader: req.headers['x-request-id']
        }));
      });

      server.listen(socketPath, async () => {
        try {
          const client = new Client({
            baseUrl: 'http://localhost',
            socketPath: socketPath
          });

          const response = await client.get('/', {
            headers: {
              'X-Request-ID': 'test-123'
            }
          });

          expect(response.status).toBe(200);
          expect(response.headers.get('x-custom-header')).toBe('test-value');

          const data = await response.json();
          expect(data.receivedHeader).toBe('test-123');

          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  });

  it.todo('should work with query parameters over Unix socket', async () => {
    return new Promise<void>((resolve, reject) => {
      server = http.createServer((req, res) => {
        const url = new URL(req.url || '', 'http://localhost');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          query: Object.fromEntries(url.searchParams)
        }));
      });

      server.listen(socketPath, async () => {
        try {
          const client = new Client({
            baseUrl: 'http://localhost',
            socketPath: socketPath
          });

          const response = await client.get('/search', {
            searchParams: {
              q: 'test',
              limit: '10'
            }
          });

          const data = await response.json();
          expect(data.query).toEqual({ q: 'test', limit: '10' });

          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  });

  it.todo('should handle errors over Unix socket', async () => {
    return new Promise<void>((resolve, reject) => {
      server = http.createServer((req, res) => {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      });

      server.listen(socketPath, async () => {
        try {
          const client = new Client({
            baseUrl: 'http://localhost',
            socketPath: socketPath,
            throwHttpErrors: false
          });

          const response = await client.get('/not-found');
          expect(response.status).toBe(404);
          expect(response.ok).toBe(false);

          const data = await response.json();
          expect(data.error).toBe('Not Found');

          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  });

  it('should connect to Docker-like API simulation', async () => {
    return new Promise<void>((resolve, reject) => {
      // Simulate Docker API response
      server = http.createServer((req, res) => {
        if (req.url === '/version') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            Version: '20.10.0',
            ApiVersion: '1.41',
            Os: 'linux',
            Arch: 'amd64'
          }));
        } else if (req.url === '/containers/json') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([
            {
              Id: 'abc123',
              Names: ['/test-container'],
              Image: 'nginx:latest',
              State: 'running'
            }
          ]));
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      server.listen(socketPath, async () => {
        try {
          const client = new Client({
            baseUrl: 'http://localhost',
            socketPath: socketPath
          });

          // Get Docker version
          const versionResp = await client.get('/version');
          const version = await versionResp.json();
          expect(version.Version).toBe('20.10.0');
          expect(version.ApiVersion).toBe('1.41');

          // List containers
          const containersResp = await client.get('/containers/json');
          const containers = await containersResp.json();
          expect(Array.isArray(containers)).toBe(true);
          expect(containers[0].Names).toContain('/test-container');

          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  });
});
