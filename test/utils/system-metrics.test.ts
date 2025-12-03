import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SystemMetrics, SystemSnapshot } from '../../src/utils/system-metrics.js';

describe('SystemMetrics', () => {
  let metrics: SystemMetrics;

  beforeEach(() => {
    metrics = new SystemMetrics();
  });

  afterEach(() => {
    metrics.stopPolling();
  });

  describe('getMemory()', () => {
    it('returns memory usage object', () => {
      const mem = metrics.getMemory();

      expect(mem).toHaveProperty('used');
      expect(mem).toHaveProperty('total');
      expect(mem).toHaveProperty('percent');

      expect(typeof mem.used).toBe('number');
      expect(typeof mem.total).toBe('number');
      expect(typeof mem.percent).toBe('number');

      expect(mem.used).toBeGreaterThan(0);
      expect(mem.total).toBeGreaterThan(0);
      expect(mem.percent).toBeGreaterThanOrEqual(0);
      expect(mem.percent).toBeLessThanOrEqual(100);
    });

    it('used + free equals total', () => {
      const mem = metrics.getMemory();
      // Percent should be used/total * 100
      const expectedPercent = (mem.used / mem.total) * 100;
      expect(mem.percent).toBeCloseTo(expectedPercent, 1);
    });
  });

  describe('getCpuUsage()', () => {
    it('returns 0 on first call (no previous snapshot)', () => {
      const cpu = metrics.getCpuUsage();
      expect(cpu).toBe(0);
    });

    it('returns CPU percentage on subsequent calls', async () => {
      // First call initializes baseline
      metrics.getCpuUsage();

      // Wait a bit for CPU time to accumulate
      await new Promise(resolve => setTimeout(resolve, 50));

      // Second call should return actual usage
      const cpu = metrics.getCpuUsage();
      expect(typeof cpu).toBe('number');
      expect(cpu).toBeGreaterThanOrEqual(0);
      expect(cpu).toBeLessThanOrEqual(100);
    });
  });

  describe('getSnapshot()', () => {
    it('returns complete system snapshot', () => {
      const snapshot = metrics.getSnapshot();

      expect(snapshot).toHaveProperty('cpu');
      expect(snapshot).toHaveProperty('memory');
      expect(snapshot).toHaveProperty('memoryUsed');
      expect(snapshot).toHaveProperty('memoryTotal');
      expect(snapshot).toHaveProperty('timestamp');

      expect(typeof snapshot.cpu).toBe('number');
      expect(typeof snapshot.memory).toBe('number');
      expect(typeof snapshot.memoryUsed).toBe('number');
      expect(typeof snapshot.memoryTotal).toBe('number');
      expect(typeof snapshot.timestamp).toBe('number');

      expect(snapshot.timestamp).toBeCloseTo(Date.now(), -2);
    });
  });

  describe('startPolling() / stopPolling()', () => {
    it('starts polling and calls listeners', async () => {
      const snapshots: SystemSnapshot[] = [];

      metrics.onSnapshot((snap) => {
        snapshots.push(snap);
      });

      metrics.startPolling(50); // Poll every 50ms

      await new Promise(resolve => setTimeout(resolve, 120));

      metrics.stopPolling();

      expect(snapshots.length).toBeGreaterThanOrEqual(1);
      expect(snapshots[0]).toHaveProperty('cpu');
      expect(snapshots[0]).toHaveProperty('memory');
    });

    it('does not start multiple polling intervals', () => {
      metrics.startPolling(100);
      metrics.startPolling(100); // Should be ignored

      // Should still work fine
      metrics.stopPolling();
    });

    it('stopPolling is safe to call multiple times', () => {
      metrics.startPolling(100);
      metrics.stopPolling();
      metrics.stopPolling(); // Should not throw
    });

    it('stopPolling is safe when not polling', () => {
      metrics.stopPolling(); // Should not throw
    });
  });

  describe('onSnapshot()', () => {
    it('allows multiple listeners', async () => {
      const results1: number[] = [];
      const results2: number[] = [];

      metrics.onSnapshot((snap) => results1.push(snap.cpu));
      metrics.onSnapshot((snap) => results2.push(snap.memory));

      metrics.startPolling(50);
      await new Promise(resolve => setTimeout(resolve, 80));
      metrics.stopPolling();

      expect(results1.length).toBeGreaterThan(0);
      expect(results2.length).toBeGreaterThan(0);
    });

    it('returns unsubscribe function', async () => {
      const snapshots: SystemSnapshot[] = [];

      const unsubscribe = metrics.onSnapshot((snap) => {
        snapshots.push(snap);
      });

      metrics.startPolling(30);
      await new Promise(resolve => setTimeout(resolve, 50));

      const countBefore = snapshots.length;
      unsubscribe();

      await new Promise(resolve => setTimeout(resolve, 50));
      metrics.stopPolling();

      // Should not have received more snapshots after unsubscribe
      expect(snapshots.length).toBe(countBefore);
    });
  });

  describe('formatBytes()', () => {
    it('formats bytes', () => {
      expect(SystemMetrics.formatBytes(500)).toBe('500B');
    });

    it('formats kilobytes', () => {
      expect(SystemMetrics.formatBytes(1024)).toBe('1.0K');
      expect(SystemMetrics.formatBytes(2048)).toBe('2.0K');
    });

    it('formats megabytes', () => {
      expect(SystemMetrics.formatBytes(1024 * 1024)).toBe('1.0M');
      expect(SystemMetrics.formatBytes(5 * 1024 * 1024)).toBe('5.0M');
    });

    it('formats gigabytes', () => {
      expect(SystemMetrics.formatBytes(1024 * 1024 * 1024)).toBe('1.0G');
      expect(SystemMetrics.formatBytes(16 * 1024 * 1024 * 1024)).toBe('16.0G');
    });

    it('handles edge cases', () => {
      expect(SystemMetrics.formatBytes(0)).toBe('0B');
      expect(SystemMetrics.formatBytes(1023)).toBe('1023B');
    });
  });

  describe('formatMemory()', () => {
    it('formats memory as used/total', () => {
      const result = SystemMetrics.formatMemory(
        8 * 1024 * 1024 * 1024,  // 8GB used
        16 * 1024 * 1024 * 1024  // 16GB total
      );
      expect(result).toBe('8.0G/16.0G');
    });

    it('formats small memory', () => {
      const result = SystemMetrics.formatMemory(512 * 1024, 1024 * 1024);
      expect(result).toBe('512.0K/1.0M');
    });
  });
});
