import { describe, it, expect } from 'vitest';
import {
  normalizeConcurrency,
  calculateOptimalConnections,
  createBatchConfig
} from '../../src/utils/concurrency.js';

describe('Concurrency Utilities', () => {
  describe('normalizeConcurrency', () => {
    it('should handle simple number config', () => {
      const result = normalizeConcurrency({ concurrency: 20 });
      expect(result.max).toBe(20);
      expect(result.runner.concurrency).toBe(20);
    });

    it('should handle object config with max', () => {
      const result = normalizeConcurrency({
        concurrency: { max: 30, requestsPerInterval: 100, interval: 2000 }
      });
      expect(result.max).toBe(30);
      expect(result.requestsPerInterval).toBe(100);
      expect(result.interval).toBe(2000);
    });

    it('should handle no config (defaults)', () => {
      const result = normalizeConcurrency({});
      expect(result.max).toBe(Infinity);
      expect(result.runner.concurrency).toBe(Infinity);
    });

    it('should handle runner config without max', () => {
      const result = normalizeConcurrency({
        concurrency: { runner: { concurrency: 10 } }
      });
      expect(result.max).toBe(Infinity);
      expect(result.runner.concurrency).toBe(10);
    });

    it('should handle HTTP/2 boolean config', () => {
      const result = normalizeConcurrency({
        concurrency: { max: 50 },
        http2: true
      });
      expect(result.agent.connections).toBeGreaterThanOrEqual(1);
    });

    it('should handle HTTP/2 object config', () => {
      const result = normalizeConcurrency({
        concurrency: { max: 100 },
        http2: { enabled: true, maxConcurrentStreams: 50 }
      });
      expect(result.http2.maxConcurrentStreams).toBeLessThanOrEqual(200);
    });

    it('should use runner concurrency as configured', () => {
      const result = normalizeConcurrency({
        concurrency: {
          max: 50,
          runner: { concurrency: 20, retries: 3, retryDelay: 1000 }
        }
      });
      expect(result.runner.concurrency).toBe(20);
      expect(result.runner.retries).toBe(3);
      expect(result.runner.retryDelay).toBe(1000);
    });

    it('should use explicit agent connections if provided', () => {
      const result = normalizeConcurrency({
        concurrency: {
          max: 100,
          agent: { connections: 25 }
        }
      });
      expect(result.agent.connections).toBe(25);
    });

    it('should handle HTTP/2 with explicit maxConcurrentStreams', () => {
      const result = normalizeConcurrency({
        concurrency: {
          max: 200,
          http2: { maxConcurrentStreams: 150 }
        },
        http2: { enabled: true }
      });
      expect(result.http2.maxConcurrentStreams).toBe(150);
    });
  });

  describe('calculateOptimalConnections', () => {
    it('should calculate connections for HTTP/1.1', () => {
      const result = calculateOptimalConnections(100, false);
      expect(result).toBe(50); // 100/2 = 50
    });

    it('should cap HTTP/1.1 connections at 50', () => {
      const result = calculateOptimalConnections(200, false);
      expect(result).toBe(50); // Capped at 50
    });

    it('should calculate connections for HTTP/2', () => {
      const result = calculateOptimalConnections(100, true, 100);
      expect(result).toBe(1); // 100/100 = 1
    });

    it('should handle HTTP/2 default streams', () => {
      const result = calculateOptimalConnections(500, true);
      expect(result).toBe(5); // 500/100 = 5
    });

    it('should handle pipelining for HTTP/1.1', () => {
      const result = calculateOptimalConnections(20, false, undefined, 5);
      expect(result).toBe(4); // 20/5 = 4
    });

    it('should return at least 1 connection', () => {
      const result = calculateOptimalConnections(1, false);
      expect(result).toBeGreaterThanOrEqual(1);
    });
  });

  describe('createBatchConfig', () => {
    const baseConfig = normalizeConcurrency({ concurrency: 50 });

    it('should create batch config with custom concurrency', () => {
      const result = createBatchConfig(baseConfig, 20, 10);
      expect(result.max).toBe(20);
      expect(result.runner.concurrency).toBe(20);
    });

    it('should recalculate connections for batch', () => {
      const result = createBatchConfig(baseConfig, 10, 5);
      expect(result.agent.connections).toBeGreaterThanOrEqual(1);
    });

    it('should enable smart pipelining for large batches', () => {
      const result = createBatchConfig(baseConfig, 10, 25);
      expect(result.agent.pipelining).toBe(2);
    });

    it('should not enable smart pipelining for small batches', () => {
      const result = createBatchConfig(baseConfig, 3, 5);
      expect(result.agent.pipelining).toBe(1);
    });

    it('should preserve base config properties', () => {
      const result = createBatchConfig(baseConfig, 15, 10);
      expect(result.requestsPerInterval).toBe(baseConfig.requestsPerInterval);
      expect(result.interval).toBe(baseConfig.interval);
    });

    it('should use base pipelining for batch with requestCount <= 20', () => {
      const result = createBatchConfig(baseConfig, 10, 20);
      expect(result.agent.pipelining).toBe(baseConfig.agent.pipelining ?? 1);
    });

    it('should use base pipelining for batch with concurrency <= 5', () => {
      const result = createBatchConfig(baseConfig, 5, 25);
      expect(result.agent.pipelining).toBe(baseConfig.agent.pipelining ?? 1);
    });
  });

  describe('normalizeConcurrency edge cases', () => {
    it('should use explicit pipelining value when calculating connections', () => {
      const result = normalizeConcurrency({
        concurrency: {
          max: 100,
          agent: { pipelining: 4 }
        }
      });
      // With pipelining=4 and max=100, connections should be 100/4 = 25
      expect(result.agent.connections).toBe(25);
      expect(result.agent.pipelining).toBe(4);
    });
  });
});
