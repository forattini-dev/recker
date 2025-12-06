import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rateLimitPlugin, RateLimitExceededError } from '../../src/plugins/rate-limit.js';
import { HttpRequest } from '../../src/core/request.ts'; // Changed from ReckerRequest

describe('Rate Limit Plugin', () => {
  let clientMock: any;
  let next: any;

  beforeEach(() => {
    clientMock = {
      use: vi.fn((middleware) => {
        clientMock.middleware = middleware;
      })
    };
    next = vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers() }); // Added headers for adaptive tests
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}')); // Mock fetch for MockHttpServer
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should allow requests within limit', async () => {
    rateLimitPlugin({ limit: 2, window: 1000 })(clientMock);
    const middleware = clientMock.middleware;
    const req = new HttpRequest('http://example.com');

    await middleware(req, next);
    await middleware(req, next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('should throw when limit exceeded (throw strategy)', async () => {
    rateLimitPlugin({ limit: 1, window: 1000, strategy: 'throw' })(clientMock);
    const middleware = clientMock.middleware;
    const req = new HttpRequest('http://example.com');

    await middleware(req, next); // 1st ok
    
    await expect(middleware(req, next)).rejects.toThrow(RateLimitExceededError);
  });

  it('should queue requests (queue strategy)', async () => {
    rateLimitPlugin({ limit: 1, window: 1000, strategy: 'queue' })(clientMock);
    const middleware = clientMock.middleware;
    const req = new HttpRequest('http://example.com');

    // First request consumes token
    const p1 = middleware(req, next);
    
    // Second request queues
    const p2 = middleware(req, next);

    await p1;
    expect(next).toHaveBeenCalledTimes(1);

    // Advance time by 1.1s to ensure refill
    await vi.advanceTimersByTimeAsync(1100);

    await p2;
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('should rate limit per host by default', async () => {
    rateLimitPlugin({ limit: 1, window: 1000, strategy: 'throw' })(clientMock);
    const middleware = clientMock.middleware;

    const reqA = new HttpRequest('http://a.com');
    const reqB = new HttpRequest('http://b.com');

    await middleware(reqA, next);
    await middleware(reqB, next); // Should work because different host

    await expect(middleware(reqA, next)).rejects.toThrow(RateLimitExceededError);
  });

  it.skip('should adapt to X-RateLimit-Remaining headers and pause queue', async () => {
    const { MockHttpServer } = await import('../../src/testing/mock-http-server.js');
    const server = await MockHttpServer.create({ port: 3000 });
    const baseUrl = server.url;

    // First response: OK, but indicates 0 remaining requests and resets in 10s
    // Mocked to be consumed by the middleware's next(req) call
    next.mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers({
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': (Math.floor(Date.now() / 1000) + 10).toString(), // Reset in 10 seconds
        }),
        text: () => Promise.resolve('OK from server 1')
    });
    // Second response (after reset): OK
    next.mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        text: () => Promise.resolve('OK from server 2')
    });


    // Client with adaptive rate limit
    rateLimitPlugin({ limit: 1000, window: 60000, adaptive: true })(clientMock); // High internal limit
    const middleware = clientMock.middleware;

    const req = new HttpRequest(`${baseUrl}/limited`);

    // Send first request - should get RateLimit-Remaining: 0
    const res1Promise = middleware(req, next);
    await res1Promise; // Wait for the response to come back and trigger adaptLimits

    expect(next).toHaveBeenCalledTimes(1); // First call to next

    // Send second request - should be queued by adaptive logic
    const res2Promise = middleware(req, next);

    // next should not have been called for the second request yet
    expect(next).toHaveBeenCalledTimes(1); 

    // Advance time by 5 seconds - still blocked by adaptive logic
    await vi.advanceTimersByTimeAsync(5000);
    expect(next).toHaveBeenCalledTimes(1); // Still only 1 call

    // Advance time by another 5 seconds (total 10s) - should now proceed
    await vi.advanceTimersByTimeAsync(5000); // Total 10 seconds advanced

    await res2Promise; // Now the second request should resolve
    expect(next).toHaveBeenCalledTimes(2); // Second call to next

    await server.stop();
  }, 15000); // Increase timeout for this test

  it.skip('should adapt to Retry-After headers (429) and pause queue', async () => {
    const { MockHttpServer } = await import('../../src/testing/mock-http-server.js');
    const server = await MockHttpServer.create({ port: 3001 });
    const baseUrl = server.url;

    // First response: 429 Too Many Requests, Retry-After 5 seconds
    next.mockResolvedValueOnce({
        ok: false, status: 429, headers: new Headers({ 'Retry-After': '5' }),
        text: () => Promise.resolve('Too Many Requests')
    });
    // Second response (after retry-after): OK
    next.mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        text: () => Promise.resolve('OK after retry')
    });


    // Client with adaptive rate limit
    rateLimitPlugin({ limit: 1000, window: 60000, adaptive: true })(clientMock); // High internal limit
    const middleware = clientMock.middleware;

    const req = new HttpRequest(`${baseUrl}/overloaded`);

    // Send first request - should get 429 and trigger Retry-After
    const res1Promise = middleware(req, next);
    await res1Promise; // Wait for the response to come back and trigger adaptLimits

    expect(next).toHaveBeenCalledTimes(1); // First call to next

    // Send second request - should be queued by adaptive logic
    const res2Promise = middleware(req, next);

    // next should not have been called for the second request yet
    expect(next).toHaveBeenCalledTimes(1);

    // Advance time by 2 seconds - still blocked
    await vi.advanceTimersByTimeAsync(2000);
    expect(next).toHaveBeenCalledTimes(1); // Still only 1 call

    // Advance time by another 3 seconds (total 5s) - should now proceed
    await vi.advanceTimersByTimeAsync(3000); // Total 5 seconds advanced

    await res2Promise; // Now the second request should resolve
    expect(next).toHaveBeenCalledTimes(2); // Second call to next

    await server.stop();
  }, 10000); // Increase timeout for this test

  it('should use drop strategy and throw error', async () => {
    rateLimitPlugin({ limit: 1, window: 1000, strategy: 'drop' })(clientMock);
    const middleware = clientMock.middleware;
    const req = new HttpRequest('http://example.com');

    await middleware(req, next); // 1st ok

    await expect(middleware(req, next)).rejects.toThrow('Request dropped due to rate limit');
  });

  it('should use custom keyGenerator', async () => {
    const customKeyGenerator = vi.fn().mockReturnValue('custom-key');
    rateLimitPlugin({ limit: 1, window: 1000, strategy: 'throw', keyGenerator: customKeyGenerator })(clientMock);
    const middleware = clientMock.middleware;

    const req = new HttpRequest('http://example.com');
    await middleware(req, next);

    expect(customKeyGenerator).toHaveBeenCalledWith(req);
  });

  it('should handle invalid URL in default keyGenerator', async () => {
    rateLimitPlugin({ limit: 1, window: 1000 })(clientMock);
    const middleware = clientMock.middleware;

    const req = new HttpRequest('invalid-url');

    // Should not throw and use 'global' as key
    await middleware(req, next);
    expect(next).toHaveBeenCalled();
  });

  it('should properly handle RateLimitExceededError properties', () => {
    const error = new RateLimitExceededError(100, 60000, 'test-key');

    expect(error.limit).toBe(100);
    expect(error.window).toBe(60000);
    expect(error.key).toBe('test-key');
    expect(error.name).toBe('RateLimitExceededError');
    expect(error.message).toContain('test-key');
  });

  it('should process queue when requests are waiting', async () => {
    rateLimitPlugin({ limit: 1, window: 500, strategy: 'queue' })(clientMock);
    const middleware = clientMock.middleware;
    const req = new HttpRequest('http://queue-test.com');

    // First request consumes token
    const p1 = middleware(req, next);

    // Second and third requests queue
    const p2 = middleware(req, next);
    const p3 = middleware(req, next);

    await p1;
    expect(next).toHaveBeenCalledTimes(1);

    // Advance time to refill
    await vi.advanceTimersByTimeAsync(600);
    await p2;
    expect(next).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(600);
    await p3;
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('should handle adaptive mode with Retry-After header', async () => {
    rateLimitPlugin({ limit: 10, window: 1000, adaptive: true })(clientMock);
    const middleware = clientMock.middleware;

    // Mock response with Retry-After header
    next.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '2' }),
    });

    const req = new HttpRequest('http://adaptive.com');
    await middleware(req, next);

    // Verify the response was returned
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should handle adaptive mode with RateLimit-Reset header as epoch', async () => {
    rateLimitPlugin({ limit: 10, window: 1000, adaptive: true })(clientMock);
    const middleware = clientMock.middleware;

    // Mock response with X-RateLimit headers (epoch timestamp)
    const resetTime = Math.floor(Date.now() / 1000) + 5; // 5 seconds from now
    next.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': resetTime.toString(),
      }),
    });

    const req = new HttpRequest('http://adaptive-epoch.com');
    await middleware(req, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should handle adaptive mode with RateLimit-Reset header as seconds', async () => {
    rateLimitPlugin({ limit: 10, window: 1000, adaptive: true })(clientMock);
    const middleware = clientMock.middleware;

    // Mock response with small reset value (interpreted as seconds from now)
    next.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({
        'ratelimit-remaining': '0',
        'ratelimit-reset': '30', // 30 seconds
      }),
    });

    const req = new HttpRequest('http://adaptive-seconds.com');
    await middleware(req, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should handle Retry-After as a date string', async () => {
    rateLimitPlugin({ limit: 10, window: 1000, adaptive: true })(clientMock);
    const middleware = clientMock.middleware;

    const futureDate = new Date(Date.now() + 5000).toUTCString();
    next.mockResolvedValueOnce({
      ok: false,
      status: 503,
      headers: new Headers({ 'Retry-After': futureDate }),
    });

    const req = new HttpRequest('http://retry-date.com');
    await middleware(req, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

});
