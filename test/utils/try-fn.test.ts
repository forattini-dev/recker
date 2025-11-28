import { describe, it, expect } from 'vitest';
import { tryFn, tryFnSync } from '../../src/utils/try-fn.js';

describe('tryFn', () => {
  it('should handle sync functions (success)', () => {
    const [ok, err, data] = tryFnSync(() => 42);
    expect(ok).toBe(true);
    expect(err).toBeNull();
    expect(data).toBe(42);
  });

  it('should handle sync functions (error)', () => {
    const [ok, err, data] = tryFnSync(() => { throw new Error('fail'); });
    expect(ok).toBe(false);
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toBe('fail');
    expect(data).toBeUndefined();
  });

  it('should handle async functions (success)', async () => {
    const [ok, err, data] = await tryFn(async () => 42);
    expect(ok).toBe(true);
    expect(err).toBeNull();
    expect(data).toBe(42);
  });

  it('should handle async functions (error)', async () => {
    const [ok, err, data] = await tryFn(async () => { throw new Error('fail'); });
    expect(ok).toBe(false);
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toBe('fail');
    expect(data).toBeUndefined();
  });

  it('should handle promises directly (success)', async () => {
    const [ok, err, data] = await tryFn(Promise.resolve(42));
    expect(ok).toBe(true);
    expect(err).toBeNull();
    expect(data).toBe(42);
  });

  it('should handle promises directly (error)', async () => {
    const [ok, err, data] = await tryFn(Promise.reject(new Error('fail')));
    expect(ok).toBe(false);
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toBe('fail');
    expect(data).toBeUndefined();
  });
  
  it('should handle null/undefined input', () => {
      // @ts-ignore
      const [ok, err] = tryFn(null);
      expect(ok).toBe(false);
      expect(err?.message).toContain('cannot be null');
  });
});
