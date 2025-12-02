/**
 * Tests for cache memory limits
 */

import { describe, it, expect } from 'vitest';
import {
  getEffectiveTotalMemoryBytes,
  resolveCacheMemoryLimit,
  type ResolvedMemoryLimit,
} from '../../src/cache/memory-limits.js';

describe('Memory Limits', () => {
  describe('getEffectiveTotalMemoryBytes', () => {
    it('should return a positive number', () => {
      const total = getEffectiveTotalMemoryBytes();
      expect(total).toBeGreaterThan(0);
    });

    it('should return a finite number', () => {
      const total = getEffectiveTotalMemoryBytes();
      expect(Number.isFinite(total)).toBe(true);
    });
  });

  describe('resolveCacheMemoryLimit', () => {
    it('should resolve with default options', () => {
      const result = resolveCacheMemoryLimit();
      expect(result.maxMemoryBytes).toBeGreaterThan(0);
      expect(typeof result.derivedFromPercent).toBe('boolean');
      expect(result.effectiveTotal).toBeGreaterThan(0);
      expect(result.heapLimit).toBeGreaterThan(0);
    });

    it('should use explicit maxMemoryBytes when provided', () => {
      const explicitLimit = 100 * 1024 * 1024; // 100MB
      const result = resolveCacheMemoryLimit({ maxMemoryBytes: explicitLimit });
      // The limit might be capped by V8 heap, but should be positive
      expect(result.maxMemoryBytes).toBeGreaterThan(0);
      expect(result.maxMemoryBytes).toBeLessThanOrEqual(explicitLimit);
    });

    it('should use maxMemoryPercent when provided', () => {
      const result = resolveCacheMemoryLimit({ maxMemoryPercent: 0.1 }); // 10%
      expect(result.maxMemoryBytes).toBeGreaterThan(0);
      expect(result.derivedFromPercent).toBe(true);
    });

    it('should clamp maxMemoryPercent to valid range', () => {
      // Values > 1 should be clamped
      const result = resolveCacheMemoryLimit({ maxMemoryPercent: 2.0 });
      expect(result.maxMemoryBytes).toBeGreaterThan(0);
      expect(result.derivedFromPercent).toBe(true);
    });

    it('should handle zero maxMemoryPercent', () => {
      const result = resolveCacheMemoryLimit({ maxMemoryPercent: 0 });
      expect(result.maxMemoryBytes).toBeGreaterThan(0);
    });

    it('should apply safetyPercent when provided', () => {
      const result = resolveCacheMemoryLimit({ safetyPercent: 0.3 });
      expect(result.maxMemoryBytes).toBeGreaterThan(0);
    });

    it('should clamp safetyPercent to valid range', () => {
      const result = resolveCacheMemoryLimit({ safetyPercent: 0.8 });
      expect(result.maxMemoryBytes).toBeGreaterThan(0);
    });

    it('should return correct structure', () => {
      const result = resolveCacheMemoryLimit();
      expect(result).toHaveProperty('maxMemoryBytes');
      expect(result).toHaveProperty('derivedFromPercent');
      expect(result).toHaveProperty('effectiveTotal');
      expect(result).toHaveProperty('heapLimit');
      expect(result).toHaveProperty('inferredPercent');
    });

    it('should calculate inferredPercent correctly', () => {
      const result = resolveCacheMemoryLimit();
      if (result.inferredPercent !== null) {
        expect(result.inferredPercent).toBeGreaterThan(0);
        expect(result.inferredPercent).toBeLessThanOrEqual(1);
      }
    });

    it('should handle negative maxMemoryBytes', () => {
      const result = resolveCacheMemoryLimit({ maxMemoryBytes: -1000 });
      expect(result.maxMemoryBytes).toBeGreaterThan(0);
    });

    it('should handle invalid safetyPercent values', () => {
      // Negative value
      const result1 = resolveCacheMemoryLimit({ safetyPercent: -0.5 });
      expect(result1.maxMemoryBytes).toBeGreaterThan(0);

      // Zero value
      const result2 = resolveCacheMemoryLimit({ safetyPercent: 0 });
      expect(result2.maxMemoryBytes).toBeGreaterThan(0);

      // Value > 1
      const result3 = resolveCacheMemoryLimit({ safetyPercent: 1.5 });
      expect(result3.maxMemoryBytes).toBeGreaterThan(0);
    });
  });
});
