import { describe, it, expect } from 'vitest';
import { createClient } from '../../src/index.js';
import { retry } from '../../src/plugins/retry.js';
import { NetworkError } from '../../src/core/errors.js';
import { MockTransport } from '../helpers/mock-transport.js';

describe('Advanced Retry Logic', () => {
  const baseUrl = 'https://api.retry.com';

  it('should retry on NetworkError', async () => {
    let attempts = 0;
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/', 200, { ok: true });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        retry({ maxAttempts: 3, delay: 10 }),
        // Middleware to simulate network error inside the stack
        (client) => {
          client.use(async (req, next) => {
            attempts++;
            if (attempts <= 2) {
              throw new NetworkError('Simulated Network Error', 'ECONNRESET', req);
            }
            return next(req);
          });
        }
      ]
    });

    const res = await client.get('/').json();
    expect(res).toEqual({ ok: true });
    expect(attempts).toBe(3); // 2 fails + 1 success
  });

  it('should NOT retry on non-retryable errors (e.g. logic error)', async () => {
    let attempts = 0;
    const client = createClient({
      baseUrl,
      plugins: [
        retry({ maxAttempts: 3, delay: 10 }),
        (client) => {
          client.use(async (req, next) => {
            attempts++;
            throw new Error('Business Logic Error'); // Not a NetworkError
          });
        }
      ]
    });

    await expect(client.get('/')).rejects.toThrow('Business Logic Error');
    expect(attempts).toBe(1); // Should fail immediately
  });

  it('should allow custom shouldRetry predicate', async () => {
    let attempts = 0;
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/custom', 200, { ok: true });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      retry: {
        maxAttempts: 3,
        delay: 10,
        shouldRetry: (err: any) => err.message.includes('Special')
      },
      plugins: [
        (client) => {
          client.use(async (req, next) => {
            attempts++;
            if (attempts === 1) throw new Error('Special Error');
            return next(req);
          });
        }
      ]
    });

    const res = await client.get('/custom').json();
    expect(res).toEqual({ ok: true });
    expect(attempts).toBe(2);
  });

  it('should call onRetry callback', async () => {
    let attempts = 0;
    const retryLogs: Array<{ attempt: number; delay: number }> = [];
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/', 200, { ok: true });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        retry({
          maxAttempts: 3,
          delay: 10,
          onRetry: (attempt, error, delay) => {
            retryLogs.push({ attempt, delay });
          }
        }),
        (client) => {
          client.use(async (req, next) => {
            attempts++;
            if (attempts <= 2) {
              throw new NetworkError('Retry me', 'ECONNRESET', req);
            }
            return next(req);
          });
        }
      ]
    });

    await client.get('/').json();
    expect(retryLogs.length).toBe(2);
    expect(retryLogs[0].attempt).toBe(1);
    expect(retryLogs[1].attempt).toBe(2);
  });

  it('should retry on status code response', async () => {
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/', 503, { error: 'Service Unavailable' }, {}, { times: 1 });
    mockTransport.setMockResponse('GET', '/', 200, { ok: true });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      throwHttpErrors: false,
      plugins: [retry({ maxAttempts: 3, delay: 10 })]
    });

    const res = await client.get('/').json();
    expect(res).toEqual({ ok: true });
  });

  it('should retry on ETIMEDOUT error code', async () => {
    let attempts = 0;
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/', 200, { ok: true });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        retry({ maxAttempts: 3, delay: 10 }),
        (client) => {
          client.use(async (req, next) => {
            attempts++;
            if (attempts <= 1) {
              const err = new Error('Connection timed out');
              (err as any).code = 'ETIMEDOUT';
              throw err;
            }
            return next(req);
          });
        }
      ]
    });

    const res = await client.get('/').json();
    expect(res).toEqual({ ok: true });
    expect(attempts).toBe(2);
  });

  it('should retry on ENOTFOUND error code', async () => {
    let attempts = 0;
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/', 200, { ok: true });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        retry({ maxAttempts: 3, delay: 10 }),
        (client) => {
          client.use(async (req, next) => {
            attempts++;
            if (attempts <= 1) {
              const err = new Error('DNS lookup failed');
              (err as any).code = 'ENOTFOUND';
              throw err;
            }
            return next(req);
          });
        }
      ]
    });

    const res = await client.get('/').json();
    expect(res).toEqual({ ok: true });
    expect(attempts).toBe(2);
  });

  it('should use linear backoff strategy', async () => {
    let attempts = 0;
    const delays: number[] = [];
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/', 200, { ok: true });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        retry({
          maxAttempts: 4,
          delay: 10,
          backoff: 'linear',
          jitter: false,
          onRetry: (attempt, error, delay) => {
            delays.push(delay);
          }
        }),
        (client) => {
          client.use(async (req, next) => {
            attempts++;
            if (attempts <= 3) {
              throw new NetworkError('Retry', 'ECONNRESET', req);
            }
            return next(req);
          });
        }
      ]
    });

    await client.get('/').json();
    expect(delays).toEqual([10, 20, 30]); // linear: delay * attempt
  });

  it('should use decorrelated backoff strategy', async () => {
    let attempts = 0;
    const delays: number[] = [];
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/', 200, { ok: true });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        retry({
          maxAttempts: 3,
          delay: 10,
          backoff: 'decorrelated',
          onRetry: (attempt, error, delay) => {
            delays.push(delay);
          }
        }),
        (client) => {
          client.use(async (req, next) => {
            attempts++;
            if (attempts <= 2) {
              throw new NetworkError('Retry', 'ECONNRESET', req);
            }
            return next(req);
          });
        }
      ]
    });

    await client.get('/').json();
    expect(delays.length).toBe(2);
    // Decorrelated has randomness but should be >= baseDelay
    expect(delays[0]).toBeGreaterThanOrEqual(10);
  });

  it('should cap delay at maxDelay', async () => {
    let attempts = 0;
    const delays: number[] = [];
    const mockTransport = new MockTransport();
    mockTransport.setMockResponse('GET', '/', 200, { ok: true });

    const client = createClient({
      baseUrl,
      transport: mockTransport,
      plugins: [
        retry({
          maxAttempts: 5,
          delay: 1000,
          maxDelay: 100,
          backoff: 'exponential',
          jitter: false,
          onRetry: (attempt, error, delay) => {
            delays.push(delay);
          }
        }),
        (client) => {
          client.use(async (req, next) => {
            attempts++;
            if (attempts <= 4) {
              throw new NetworkError('Retry', 'ECONNRESET', req);
            }
            return next(req);
          });
        }
      ]
    });

    await client.get('/').json();
    // All delays should be capped at 100
    delays.forEach(d => expect(d).toBeLessThanOrEqual(100));
  });

});
