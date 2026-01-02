/**
 * Tests for Reck Signal System
 *
 * Tests reactive primitives: signals, effects, memos, batching
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSignal,
  createEffect,
  createMemo,
  batch,
  untrack,
  Signal,
  Effect,
} from '../../../src/cli/reck/signal.js';

// Track disposers for cleanup
let disposers: (() => void)[] = [];

describe('Signal System', () => {
  // Cleanup effects after each test to prevent memory leaks
  afterEach(() => {
    for (const dispose of disposers) {
      dispose();
    }
    disposers = [];
  });

  describe('createSignal', () => {
    it('should create a signal with initial value', () => {
      const [value, setValue] = createSignal(0);
      expect(value()).toBe(0);
    });

    it('should update value with setter', () => {
      const [value, setValue] = createSignal(0);
      setValue(5);
      expect(value()).toBe(5);
    });

    it('should update value with function', () => {
      const [value, setValue] = createSignal(10);
      setValue(prev => prev + 5);
      expect(value()).toBe(15);
    });

    it('should handle different types', () => {
      const [str, setStr] = createSignal('hello');
      const [arr, setArr] = createSignal([1, 2, 3]);
      const [obj, setObj] = createSignal({ a: 1 });

      expect(str()).toBe('hello');
      expect(arr()).toEqual([1, 2, 3]);
      expect(obj()).toEqual({ a: 1 });

      setStr('world');
      setArr([4, 5]);
      setObj({ b: 2 });

      expect(str()).toBe('world');
      expect(arr()).toEqual([4, 5]);
      expect(obj()).toEqual({ b: 2 });
    });

    it('should handle null and undefined', () => {
      const [value, setValue] = createSignal<string | null>(null);
      expect(value()).toBe(null);

      setValue('test');
      expect(value()).toBe('test');

      setValue(null);
      expect(value()).toBe(null);
    });
  });

  describe('createEffect', () => {
    it('should run immediately', () => {
      const fn = vi.fn();
      const dispose = createEffect(fn);
      disposers.push(dispose);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should re-run when dependency changes', () => {
      const [value, setValue] = createSignal(0);
      const fn = vi.fn(() => {
        value(); // Access signal to create dependency
      });

      const dispose = createEffect(fn);
      disposers.push(dispose);
      expect(fn).toHaveBeenCalledTimes(1);

      setValue(1);
      expect(fn).toHaveBeenCalledTimes(2);

      setValue(2);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not re-run when value is same', () => {
      const [value, setValue] = createSignal(5);
      const fn = vi.fn(() => {
        value();
      });

      const dispose = createEffect(fn);
      disposers.push(dispose);
      expect(fn).toHaveBeenCalledTimes(1);

      setValue(5); // Same value
      expect(fn).toHaveBeenCalledTimes(1); // Should not re-run
    });

    it('should track multiple dependencies', () => {
      const [a, setA] = createSignal(1);
      const [b, setB] = createSignal(2);
      const results: number[] = [];

      const dispose = createEffect(() => {
        results.push(a() + b());
      });
      disposers.push(dispose);

      expect(results).toEqual([3]);

      setA(10);
      expect(results).toEqual([3, 12]);

      setB(20);
      expect(results).toEqual([3, 12, 30]);
    });

    it('should cleanup on re-run', () => {
      const cleanup = vi.fn();
      const [value, setValue] = createSignal(0);

      const dispose = createEffect(() => {
        value();
        return cleanup;
      });
      disposers.push(dispose);

      expect(cleanup).not.toHaveBeenCalled();

      setValue(1);
      expect(cleanup).toHaveBeenCalledTimes(1);

      setValue(2);
      expect(cleanup).toHaveBeenCalledTimes(2);
    });

    it('should dispose effect', () => {
      const [value, setValue] = createSignal(0);
      const fn = vi.fn(() => {
        value();
      });

      const dispose = createEffect(fn);
      expect(fn).toHaveBeenCalledTimes(1);

      dispose();

      setValue(1);
      expect(fn).toHaveBeenCalledTimes(1); // Should not re-run after dispose
    });
  });

  describe('createMemo', () => {
    it('should compute derived value', () => {
      const [a] = createSignal(2);
      const [b] = createSignal(3);

      const sum = createMemo(() => a() + b());

      expect(sum()).toBe(5);
    });

    it('should update when dependencies change', () => {
      const [value, setValue] = createSignal(10);
      const doubled = createMemo(() => value() * 2);

      expect(doubled()).toBe(20);

      setValue(5);
      expect(doubled()).toBe(10);
    });
  });

  describe('batch', () => {
    it('should batch multiple updates', () => {
      const [a, setA] = createSignal(0);
      const [b, setB] = createSignal(0);
      const fn = vi.fn(() => {
        a();
        b();
      });

      const dispose = createEffect(fn);
      disposers.push(dispose);
      expect(fn).toHaveBeenCalledTimes(1);

      batch(() => {
        setA(1);
        setB(1);
      });

      // Should only re-run once for batched updates
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should work with nested batches', () => {
      const [value, setValue] = createSignal(0);
      const fn = vi.fn(() => {
        value();
      });

      const dispose = createEffect(fn);
      disposers.push(dispose);

      batch(() => {
        setValue(1);
        batch(() => {
          setValue(2);
        });
        setValue(3);
      });

      // Only the final value should trigger after all batches complete
      expect(fn).toHaveBeenCalledTimes(2);
      expect(value()).toBe(3);
    });
  });

  describe('untrack', () => {
    it('should not create dependency when reading in untrack', () => {
      const [value, setValue] = createSignal(0);
      const fn = vi.fn(() => {
        untrack(() => value());
      });

      const dispose = createEffect(fn);
      disposers.push(dispose);
      expect(fn).toHaveBeenCalledTimes(1);

      setValue(1);
      expect(fn).toHaveBeenCalledTimes(1); // Should not re-run
    });

    it('should return the value from untrack', () => {
      const [value] = createSignal(42);

      let result: number | undefined;
      const dispose = createEffect(() => {
        result = untrack(() => value());
      });
      disposers.push(dispose);

      expect(result).toBe(42);
    });
  });

  describe('Signal class direct usage', () => {
    it('should work with Signal class directly', () => {
      const signal = new Signal(10);
      expect(signal.value).toBe(10);

      signal.value = 20;
      expect(signal.value).toBe(20);
    });

    it('should support update method', () => {
      const signal = new Signal(5);
      signal.update(v => v * 2);
      expect(signal.value).toBe(10);
    });

    it('should support peek (untracked read)', () => {
      const signal = new Signal(100);
      const fn = vi.fn();

      const effect = new Effect(() => {
        signal.peek(); // Should not track
        fn();
      });

      expect(fn).toHaveBeenCalledTimes(1);

      signal.value = 200;
      expect(fn).toHaveBeenCalledTimes(1); // Should not re-run

      // Clean up
      effect.dispose();
    });
  });
});
