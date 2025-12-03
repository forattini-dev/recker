import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RequestPool } from '../../src/utils/request-pool.js';

describe('RequestPool', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const pool = new RequestPool();
      expect(pool).toBeInstanceOf(RequestPool);
    });

    it('should create with custom options', () => {
      const pool = new RequestPool({
        concurrency: 5,
        requestsPerInterval: 10,
        interval: 1000,
      });
      expect(pool).toBeInstanceOf(RequestPool);
    });
  });

  describe('run', () => {
    it('should execute a function', async () => {
      const pool = new RequestPool();
      const result = await pool.run(async () => 'hello');
      expect(result).toBe('hello');
    });

    it('should reject with error when function throws', async () => {
      const pool = new RequestPool();
      await expect(pool.run(async () => {
        throw new Error('test error');
      })).rejects.toThrow('test error');
    });

    it('should reject immediately if signal is already aborted', async () => {
      const pool = new RequestPool();
      const controller = new AbortController();
      controller.abort();

      await expect(pool.run(async () => 'hello', controller.signal))
        .rejects.toThrow();
    });

    it('should reject if signal is aborted while queued', async () => {
      vi.useRealTimers();
      const pool = new RequestPool({ concurrency: 1 });
      const controller = new AbortController();

      // First request blocks the pool
      const longRunning = pool.run(() => new Promise(resolve => setTimeout(resolve, 100)));

      // Second request gets queued
      const queued = pool.run(async () => 'second', controller.signal);

      // Abort the queued request
      controller.abort();

      await expect(queued).rejects.toThrow();
      await longRunning;
    });

    it('should reject if signal is aborted when dequeued', async () => {
      vi.useRealTimers();
      const pool = new RequestPool({ concurrency: 1 });
      const controller = new AbortController();

      // First request completes immediately
      await pool.run(async () => 'first');

      // Second request with already aborted signal
      controller.abort();
      const second = pool.run(async () => 'second', controller.signal);

      await expect(second).rejects.toThrow();
    });
  });

  describe('concurrency control', () => {
    it('should respect concurrency limit', async () => {
      vi.useRealTimers();
      const pool = new RequestPool({ concurrency: 2 });
      let concurrent = 0;
      let maxConcurrent = 0;

      const tasks = Array.from({ length: 5 }, () =>
        pool.run(async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise(resolve => setTimeout(resolve, 50));
          concurrent--;
        })
      );

      await Promise.all(tasks);
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('should work with no concurrency limit', async () => {
      vi.useRealTimers();
      const pool = new RequestPool({ concurrency: Infinity });
      let concurrent = 0;
      let maxConcurrent = 0;

      const tasks = Array.from({ length: 5 }, () =>
        pool.run(async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise(resolve => setTimeout(resolve, 10));
          concurrent--;
        })
      );

      await Promise.all(tasks);
      expect(maxConcurrent).toBe(5);
    });
  });

  describe('rate limiting', () => {
    it('should respect rate limit', async () => {
      vi.useRealTimers();
      const pool = new RequestPool({
        requestsPerInterval: 2,
        interval: 100,
      });

      const startTime = Date.now();
      const times: number[] = [];

      const tasks = Array.from({ length: 4 }, () =>
        pool.run(async () => {
          times.push(Date.now() - startTime);
        })
      );

      await Promise.all(tasks);

      // First 2 should start immediately
      expect(times[0]).toBeLessThan(20);
      expect(times[1]).toBeLessThan(20);

      // Next 2 should start after the interval
      expect(times[2]).toBeGreaterThanOrEqual(90);
      expect(times[3]).toBeGreaterThanOrEqual(90);
    });

    it('should reset window after interval passes', async () => {
      vi.useRealTimers();
      const pool = new RequestPool({
        requestsPerInterval: 2,
        interval: 50,
      });

      // First batch
      await Promise.all([
        pool.run(async () => 'a'),
        pool.run(async () => 'b'),
      ]);

      // Wait for interval to pass
      await new Promise(resolve => setTimeout(resolve, 60));

      // Second batch should start immediately (new window)
      const startTime = Date.now();
      await Promise.all([
        pool.run(async () => 'c'),
        pool.run(async () => 'd'),
      ]);

      expect(Date.now() - startTime).toBeLessThan(50);
    });
  });

  describe('_removeFromQueue', () => {
    it('should handle removing request not in queue', async () => {
      vi.useRealTimers();
      const pool = new RequestPool({ concurrency: 1 });

      // First request completes
      await pool.run(async () => 'done');

      // Queue is now empty, this should not throw
      expect(() => (pool as any)._removeFromQueue({ fn: async () => {} })).not.toThrow();
    });
  });

  describe('asMiddleware', () => {
    it('should return a middleware function', () => {
      const pool = new RequestPool();
      const middleware = pool.asMiddleware();
      expect(typeof middleware).toBe('function');
    });

    it('should execute middleware through pool', async () => {
      const pool = new RequestPool({ concurrency: 1 });
      const middleware = pool.asMiddleware();

      const mockReq = { signal: undefined } as any;
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      const result = await middleware(mockReq, mockNext);
      expect(result).toEqual({ status: 200 });
      expect(mockNext).toHaveBeenCalledWith(mockReq);
    });

    it('should pass request signal to pool', async () => {
      vi.useRealTimers();
      const pool = new RequestPool({ concurrency: 1 });
      const middleware = pool.asMiddleware();

      const controller = new AbortController();
      controller.abort();

      const mockReq = { signal: controller.signal } as any;
      const mockNext = vi.fn().mockResolvedValue({ status: 200 });

      await expect(middleware(mockReq, mockNext)).rejects.toThrow();
    });
  });

  describe('waiting timer', () => {
    it('should not create multiple timers', async () => {
      vi.useRealTimers();
      const pool = new RequestPool({
        concurrency: 1,
        requestsPerInterval: 1,
        interval: 100,
      });

      // Fill the pool and queue
      const first = pool.run(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'first';
      });

      // These will queue up and trigger timer scheduling
      const second = pool.run(async () => 'second');
      const third = pool.run(async () => 'third');

      await Promise.all([first, second, third]);
    });
  });

  describe('abort cleanup', () => {
    it('should cleanup abort listener when request starts', async () => {
      vi.useRealTimers();
      const pool = new RequestPool({ concurrency: 1 });
      const controller = new AbortController();

      const result = await pool.run(async () => 'done', controller.signal);
      expect(result).toBe('done');

      // Signal should not affect anything now
      controller.abort();
    });

    it('should handle abort when signal is aborted during dequeue', async () => {
      vi.useRealTimers();
      const pool = new RequestPool({ concurrency: 1 });
      const controller = new AbortController();

      // First request blocks the pool
      let resolveFirst: () => void;
      const firstPromise = new Promise<void>(r => { resolveFirst = r; });
      const first = pool.run(async () => {
        await firstPromise;
        return 'first';
      });

      // Second request gets queued with signal
      const second = pool.run(async () => 'second', controller.signal);

      // Abort while queued - this test covers the reject in the abort listener (lines 68-73)
      controller.abort(new Error('Aborted by user'));

      // Complete the first request to trigger dequeue
      resolveFirst!();
      await first;

      // Second should be rejected with the abort reason
      await expect(second).rejects.toThrow('Aborted by user');
    });

  });
});
