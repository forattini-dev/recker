import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Client } from '../../src/index.js';
import http from 'node:http';

describe('Multipart Auto-Serialization', () => {
  let server: http.Server;
  let serverUrl: string;

  beforeEach(() => {
    return new Promise<void>((resolve) => {
      server = http.createServer();
      server.listen(0, () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        serverUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
  });

  describe('json option', () => {
    it('should send JSON with explicit json option', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            expect(req.headers['content-type']).toBe('application/json');
            const data = JSON.parse(body);
            expect(data).toEqual({ name: 'John', age: 30 });
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
            resolve();
          });
        });

        const client = new Client({ baseUrl: serverUrl });
        client.post('/', {
          json: { name: 'John', age: 30 }
        }).catch(reject);
      });
    });

    it('should prioritize json option over body', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            expect(req.headers['content-type']).toBe('application/json');
            const data = JSON.parse(body);
            // json option should take priority
            expect(data).toEqual({ from: 'json' });
            res.writeHead(200);
            res.end();
            resolve();
          });
        });

        const client = new Client({ baseUrl: serverUrl });
        // body will be ignored in favor of json
        client.post('/', 'ignored body', {
          json: { from: 'json' }
        }).catch(reject);
      });
    });
  });

  describe('form option', () => {
    it('should send FormData with explicit form option', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          expect(req.headers['content-type']).toMatch(/^multipart\/form-data/);
          // Just check that we received multipart data
          res.writeHead(200);
          res.end();
          resolve();
        });

        const client = new Client({ baseUrl: serverUrl });
        client.post('/', {
          form: {
            name: 'John',
            age: 30,
            active: true
          }
        }).catch(reject);
      });
    });

    it('should handle file uploads with form option', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          expect(req.headers['content-type']).toMatch(/^multipart\/form-data/);
          res.writeHead(200);
          res.end();
          resolve();
        });

        const client = new Client({ baseUrl: serverUrl });
        const blob = new Blob(['test file content'], { type: 'text/plain' });

        client.post('/', {
          form: {
            name: 'John',
            avatar: blob,
            tags: ['tag1', 'tag2']
          }
        }).catch(reject);
      });
    });

    it('should prioritize form option over json and body', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          // form option should result in multipart
          expect(req.headers['content-type']).toMatch(/^multipart\/form-data/);
          res.writeHead(200);
          res.end();
          resolve();
        });

        const client = new Client({ baseUrl: serverUrl });
        // form takes priority over json and body
        client.post('/', 'ignored body', {
          json: { ignored: 'json' },
          form: { from: 'form' }
        }).catch(reject);
      });
    });
  });

  describe('Auto-detection of files in objects', () => {
    it('should auto-convert object with Blob to FormData', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          // Should automatically detect file and use multipart
          expect(req.headers['content-type']).toMatch(/^multipart\/form-data/);
          res.writeHead(200);
          res.end();
          resolve();
        });

        const client = new Client({ baseUrl: serverUrl });
        const blob = new Blob(['test content'], { type: 'text/plain' });

        // No explicit form option - should auto-detect
        client.post('/', {
          body: {
            name: 'John',
            file: blob
          }
        }).catch(reject);
      });
    });

    it('should auto-convert object with array of Blobs to FormData', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          expect(req.headers['content-type']).toMatch(/^multipart\/form-data/);
          res.writeHead(200);
          res.end();
          resolve();
        });

        const client = new Client({ baseUrl: serverUrl });
        const blob1 = new Blob(['file 1'], { type: 'text/plain' });
        const blob2 = new Blob(['file 2'], { type: 'text/plain' });

        client.post('/', {
          body: {
            name: 'John',
            files: [blob1, blob2]
          }
        }).catch(reject);
      });
    });

    it('should send as JSON when object has no files', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            // Should be JSON, not multipart
            expect(req.headers['content-type']).toBe('application/json');
            const data = JSON.parse(body);
            expect(data).toEqual({ name: 'John', age: 30 });
            res.writeHead(200);
            res.end();
            resolve();
          });
        });

        const client = new Client({ baseUrl: serverUrl });

        // No files - should default to JSON
        client.post('/', {
          body: {
            name: 'John',
            age: 30
          }
        }).catch(reject);
      });
    });
  });

  describe('FormData direct usage', () => {
    it('should handle FormData directly', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          expect(req.headers['content-type']).toMatch(/^multipart\/form-data/);
          res.writeHead(200);
          res.end();
          resolve();
        });

        const client = new Client({ baseUrl: serverUrl });
        const formData = new FormData();
        formData.append('name', 'John');
        formData.append('age', '30');

        client.post('/', {
          body: formData
        }).catch(reject);
      });
    });

    it('should handle FormData with files', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          expect(req.headers['content-type']).toMatch(/^multipart\/form-data/);
          res.writeHead(200);
          res.end();
          resolve();
        });

        const client = new Client({ baseUrl: serverUrl });
        const formData = new FormData();
        const blob = new Blob(['test'], { type: 'text/plain' });
        formData.append('name', 'John');
        formData.append('file', blob, 'test.txt');

        client.post('/', {
          body: formData
        }).catch(reject);
      });
    });
  });

  describe('URLSearchParams', () => {
    it('should send URLSearchParams as application/x-www-form-urlencoded', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            expect(req.headers['content-type']).toBe('application/x-www-form-urlencoded');
            expect(body).toBe('name=John&age=30');
            res.writeHead(200);
            res.end();
            resolve();
          });
        });

        const client = new Client({ baseUrl: serverUrl });
        const params = new URLSearchParams();
        params.set('name', 'John');
        params.set('age', '30');

        client.post('/', {
          body: params
        }).catch(reject);
      });
    });
  });

  describe('Mixed scenarios', () => {
    it('should handle nested objects in form', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          expect(req.headers['content-type']).toMatch(/^multipart\/form-data/);
          res.writeHead(200);
          res.end();
          resolve();
        });

        const client = new Client({ baseUrl: serverUrl });

        client.post('/', {
          form: {
            name: 'John',
            metadata: { key: 'value', nested: { deep: true } },
            tags: ['tag1', 'tag2']
          }
        }).catch(reject);
      });
    });

    it('should skip null/undefined values in form', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          expect(req.headers['content-type']).toMatch(/^multipart\/form-data/);
          res.writeHead(200);
          res.end();
          resolve();
        });

        const client = new Client({ baseUrl: serverUrl });

        client.post('/', {
          form: {
            name: 'John',
            age: null,
            email: undefined,
            active: true
          }
        }).catch(reject);
      });
    });
  });

  describe('Content-Type override', () => {
    it('should allow manual Content-Type override', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          // Manual override should win
          expect(req.headers['content-type']).toBe('text/plain');
          res.writeHead(200);
          res.end();
          resolve();
        });

        const client = new Client({ baseUrl: serverUrl });

        client.post('/', {
          json: { name: 'John' },
          headers: {
            'Content-Type': 'text/plain'
          }
        }).catch(reject);
      });
    });
  });
});
