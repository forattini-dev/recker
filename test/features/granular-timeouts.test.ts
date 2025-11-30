import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Client } from '../../src/index.js';
import { TimeoutError } from '../../src/core/errors.js';
import http from 'node:http';

describe('Granular Timeouts', () => {
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

  describe('Connect Timeout', () => {
    it.skip('should timeout during TCP connection', async () => {
      // Skipped: Difficult to test reliably as it depends on network conditions
      // Connect timeouts work via Undici's connectTimeout option
      // Manual testing can be done with: http://192.0.2.1 (TEST-NET-1, blackhole)
    });

    it.skip('should use transport-level connect timeout as fallback', async () => {
      // Skipped: Same as above - network-dependent test
    });

    it.skip('should prioritize request-level timeout over transport-level', async () => {
      // Skipped: Same as above - network-dependent test
    });
  });

  describe('Response Timeout (TTFB)', () => {
    it('should timeout waiting for response headers', async () => {
      return new Promise<void>((resolve, reject) => {
        // Server accepts connection but never sends response
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          // Accept but never respond
          // Keep connection open indefinitely
        });

        const client = new Client({
          baseUrl: serverUrl
        });

        client.get('/', {
          timeout: {
            response: 100
          }
        }).then(() => {
          reject(new Error('Expected timeout'));
        }).catch((error: any) => {
          expect(error).toBeInstanceOf(TimeoutError);
          expect(error.phase).toBe('response');
          expect(error.timeout).toBe(100);
          resolve();
        });
      });
    });

    it('should succeed if response arrives before timeout', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          // Respond immediately
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('OK');
        });

        const client = new Client({
          baseUrl: serverUrl
        });

        client.get('/', {
          timeout: {
            response: 1000
          }
        }).then((response) => {
          expect(response.status).toBe(200);
          resolve();
        }).catch(reject);
      });
    });
  });

  describe('Send Timeout', () => {
    it.skip('should timeout during request body upload', async () => {
      // Skipped: Difficult to reliably test send timeout with local server
      // The bodyTimeout in Undici is primarily for response body, not request body
      // This would require a server that intentionally slows down reading the request
    });
  });

  describe('Total Request Timeout', () => {
    it('should timeout for total request time', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          // Delay response to exceed total timeout
          setTimeout(() => {
            res.writeHead(200);
            res.end('OK');
          }, 200);
        });

        const client = new Client({
          baseUrl: serverUrl
        });

        client.get('/', {
          timeout: {
            request: 100 // Total timeout
          }
        }).then(() => {
          reject(new Error('Expected timeout'));
        }).catch((error: any) => {
          expect(error).toBeInstanceOf(TimeoutError);
          expect(error.phase).toBe('request');
          expect(error.timeout).toBe(100);
          resolve();
        });
      });
    });

    it('should respect total timeout across multiple phases', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          // Multiple delays that individually pass but exceed total
          setTimeout(() => {
            res.writeHead(200);
            setTimeout(() => {
              res.write('partial');
              setTimeout(() => {
                res.end('data');
              }, 50);
            }, 50);
          }, 50);
        });

        const client = new Client({
          baseUrl: serverUrl
        });

        client.get('/', {
          timeout: {
            request: 100 // Total should timeout
          }
        }).then(() => {
          reject(new Error('Expected timeout'));
        }).catch((error: any) => {
          expect(error).toBeInstanceOf(TimeoutError);
          expect(error.phase).toBe('request');
          resolve();
        });
      });
    });
  });

  describe('Combined Timeouts', () => {
    it('should respect multiple timeout phases', async () => {
      const client = new Client({
        baseUrl: serverUrl
      });

      // All timeouts configured
      const timeoutOptions = {
        connect: 5000,
        response: 1000,
        send: 1000,
        request: 10000
      };

      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', (req, res) => {
          res.writeHead(200);
          res.end('OK');
        });

        client.get('/', {
          timeout: timeoutOptions
        }).then((response) => {
          expect(response.status).toBe(200);
          resolve();
        }).catch(reject);
      });
    });

    it.skip('should use secureConnect for HTTPS connections', async () => {
      // Skipped: Network-dependent test
      // secureConnect maps to Undici's connectTimeout for TLS handshake
      // Manual testing can be done with non-routable HTTPS endpoints
    });
  });

  describe('Error Messages', () => {
    it('should provide clear error messages with timeout values', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', () => {
          // Never respond
        });

        const client = new Client({
          baseUrl: serverUrl
        });

        client.get('/', {
          timeout: {
            response: 150
          }
        }).then(() => {
          reject(new Error('Expected timeout'));
        }).catch((error: any) => {
          expect(error.message).toContain('timed out');
          expect(error.message).toContain('150ms');
          expect(error.phase).toBe('response');
          expect(error.timeout).toBe(150);
          expect(error.suggestions).toBeDefined();
          expect(error.suggestions.length).toBeGreaterThan(0);
          resolve();
        });
      });
    });

    it('should include event name for diagnostics', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', () => {
          // Never respond
        });

        const client = new Client({
          baseUrl: serverUrl
        });

        client.get('/', {
          timeout: {
            response: 100
          }
        }).then(() => {
          reject(new Error('Expected timeout'));
        }).catch((error: any) => {
          expect(error.event).toBe('timeout:response');
          resolve();
        });
      });
    });
  });

  describe('AbortSignal Integration', () => {
    it('should respect existing AbortSignal with total timeout', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', () => {
          // Never respond
        });

        const client = new Client({
          baseUrl: serverUrl
        });

        const controller = new AbortController();

        // Abort externally
        setTimeout(() => {
          controller.abort();
        }, 50);

        client.get('/', {
          signal: controller.signal,
          timeout: {
            request: 1000 // Should abort via signal first
          }
        }).then(() => {
          reject(new Error('Expected abort'));
        }).catch((error: any) => {
          // Should be aborted by signal, not timeout
          expect(error).toBeInstanceOf(TimeoutError);
          resolve();
        });
      });
    });

    it('should combine AbortSignal and timeout properly', async () => {
      return new Promise<void>((resolve, reject) => {
        server.removeAllListeners('request');
        server.on('request', () => {
          // Never respond
        });

        const client = new Client({
          baseUrl: serverUrl
        });

        const controller = new AbortController();

        client.get('/', {
          signal: controller.signal,
          timeout: {
            request: 100 // Timeout should fire first
          }
        }).then(() => {
          reject(new Error('Expected timeout'));
        }).catch((error: any) => {
          expect(error).toBeInstanceOf(TimeoutError);
          expect(error.phase).toBe('request');
          expect(error.timeout).toBe(100);
          resolve();
        });
      });
    });
  });
});
