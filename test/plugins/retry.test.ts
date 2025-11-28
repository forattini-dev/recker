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
});
