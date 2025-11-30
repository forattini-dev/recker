/**
 * Adaptive Timeout Tests
 *
 * Tests for the adaptive timeout manager and stream timeout controller
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AdaptiveTimeoutManager,
  StreamTimeoutController,
  adaptiveTimeouts,
} from '../../src/ai/adaptive-timeout.js';

describe('AdaptiveTimeoutManager', () => {
  let manager: AdaptiveTimeoutManager;

  beforeEach(() => {
    manager = new AdaptiveTimeoutManager();
  });

  describe('getTimeouts()', () => {
    it('should return default timeouts for unknown model', () => {
      const timeouts = manager.getTimeouts('unknown-model');

      expect(timeouts.firstToken).toBeGreaterThan(0);
      expect(timeouts.betweenTokens).toBeGreaterThan(0);
      expect(timeouts.total).toBeGreaterThan(0);
      expect(timeouts.adaptive).toBe(true);
    });

    it('should apply preset for known models', () => {
      const fastTimeouts = manager.getTimeouts('gpt-5.1-mini');
      const slowTimeouts = manager.getTimeouts('o3');

      // Fast model should have shorter timeouts
      expect(fastTimeouts.firstToken).toBeLessThan(slowTimeouts.firstToken);
    });

    it('should match partial model names', () => {
      const timeouts = manager.getTimeouts('gpt-5.1-mini-2025-01-01');

      // Should match gpt-5.1-mini preset
      expect(timeouts.firstToken).toBe(10000);
    });

    it('should allow user overrides', () => {
      const timeouts = manager.getTimeouts('gpt-5.1', {
        firstToken: 5000,
        total: 30000,
      });

      expect(timeouts.firstToken).toBe(5000);
      expect(timeouts.total).toBe(30000);
    });
  });

  describe('recordSample()', () => {
    it('should record latency samples', () => {
      manager.recordSample('gpt-5.1', 500, 50, 5000);
      manager.recordSample('gpt-5.1', 600, 60, 6000);
      manager.recordSample('gpt-5.1', 700, 70, 7000);

      const profile = manager.getProfile('gpt-5.1');
      expect(profile).toBeDefined();
      expect(profile!.samples).toHaveLength(3);
    });

    it('should calculate statistics after recording', () => {
      // Record 10 samples
      for (let i = 0; i < 10; i++) {
        manager.recordSample('test-model', 500 + i * 100, 50 + i * 10, 5000 + i * 500);
      }

      const profile = manager.getProfile('test-model');
      expect(profile).toBeDefined();
      expect(profile!.avgTtft).toBeGreaterThan(0);
      expect(profile!.p95Ttft).toBeGreaterThan(profile!.avgTtft);
    });

    it('should use learned profile for timeouts after enough samples', () => {
      // Record 10 samples with consistent values
      for (let i = 0; i < 10; i++) {
        manager.recordSample('my-model', 1000, 100, 10000);
      }

      const timeouts = manager.getTimeouts('my-model');

      // Should be based on learned P95 + buffer, not defaults
      expect(timeouts.firstToken).toBe(1200); // 1000 * 1.2
      expect(timeouts.betweenTokens).toBe(120); // 100 * 1.2
    });
  });

  describe('export/import', () => {
    it('should export and import profiles', () => {
      manager.recordSample('model-a', 500, 50, 5000);
      manager.recordSample('model-b', 600, 60, 6000);

      const exported = manager.export();
      expect(exported['model-a']).toHaveLength(1);
      expect(exported['model-b']).toHaveLength(1);

      // Create new manager and import
      const newManager = new AdaptiveTimeoutManager();
      newManager.import(exported);

      expect(newManager.getProfile('model-a')).toBeDefined();
      expect(newManager.getProfile('model-b')).toBeDefined();
    });
  });

  describe('clear()', () => {
    it('should clear all profiles', () => {
      manager.recordSample('model-a', 500, 50, 5000);
      expect(manager.getProfile('model-a')).toBeDefined();

      manager.clear();
      expect(manager.getProfile('model-a')).toBeUndefined();
    });
  });
});

describe('StreamTimeoutController', () => {
  describe('Basic functionality', () => {
    it('should create with timeouts', () => {
      const controller = new StreamTimeoutController({
        firstToken: 5000,
        betweenTokens: 1000,
        total: 30000,
        adaptive: true,
      });

      expect(controller.signal).toBeInstanceOf(AbortSignal);
    });

    it('should track elapsed time', async () => {
      const controller = new StreamTimeoutController({
        firstToken: 10000,
        betweenTokens: 1000,
        total: 30000,
        adaptive: true,
      });

      controller.start();
      await new Promise((r) => setTimeout(r, 50));

      expect(controller.elapsed).toBeGreaterThanOrEqual(50);
      controller.complete();
    });

    it('should track first token time', () => {
      const controller = new StreamTimeoutController({
        firstToken: 10000,
        betweenTokens: 1000,
        total: 30000,
        adaptive: true,
      });

      controller.start();
      expect(controller.ttft).toBeNull();

      controller.recordToken();
      expect(controller.ttft).not.toBeNull();

      controller.complete();
    });
  });

  describe('Timeout behavior', () => {
    it('should abort on first token timeout', async () => {
      const controller = new StreamTimeoutController({
        firstToken: 50,
        betweenTokens: 1000,
        total: 30000,
        adaptive: true,
      });

      const abortPromise = new Promise<void>((resolve) => {
        controller.signal.addEventListener('abort', () => resolve());
      });

      controller.start();
      await abortPromise;

      expect(controller.signal.aborted).toBe(true);
    });

    it('should not abort if first token received in time', async () => {
      const controller = new StreamTimeoutController({
        firstToken: 100,
        betweenTokens: 200, // Longer than our wait time
        total: 1000,
        adaptive: true,
      });

      controller.start();

      // Record token before timeout
      await new Promise((r) => setTimeout(r, 20));
      controller.recordToken();

      // Wait past first token timeout but not past between-token timeout
      await new Promise((r) => setTimeout(r, 100));

      expect(controller.signal.aborted).toBe(false);
      controller.complete();
    });

    it('should abort on between-token timeout', async () => {
      const controller = new StreamTimeoutController({
        firstToken: 1000,
        betweenTokens: 50,
        total: 30000,
        adaptive: true,
      });

      const abortPromise = new Promise<void>((resolve) => {
        controller.signal.addEventListener('abort', () => resolve());
      });

      controller.start();
      controller.recordToken(); // First token

      // Wait for between-token timeout
      await abortPromise;

      expect(controller.signal.aborted).toBe(true);
    });

    it('should reset between-token timer on each token', async () => {
      const controller = new StreamTimeoutController({
        firstToken: 1000,
        betweenTokens: 100,
        total: 30000,
        adaptive: true,
      });

      controller.start();

      // Keep sending tokens
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 50));
        controller.recordToken();
      }

      expect(controller.signal.aborted).toBe(false);
      controller.complete();
    });
  });

  describe('Manual abort', () => {
    it('should abort manually with reason', () => {
      const controller = new StreamTimeoutController({
        firstToken: 10000,
        betweenTokens: 1000,
        total: 30000,
        adaptive: true,
      });

      controller.start();
      controller.abort('User cancelled');

      expect(controller.signal.aborted).toBe(true);
    });
  });
});

describe('Global adaptiveTimeouts instance', () => {
  it('should be exported and usable', () => {
    expect(adaptiveTimeouts).toBeInstanceOf(AdaptiveTimeoutManager);

    const timeouts = adaptiveTimeouts.getTimeouts('gpt-5.1');
    expect(timeouts.firstToken).toBeGreaterThan(0);
  });
});
