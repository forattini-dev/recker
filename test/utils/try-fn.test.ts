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

  it('should handle direct values', () => {
    // Pass a direct value (not a function or promise)
    const [ok, err, data] = tryFn(42) as [boolean, Error | null, number | undefined];
    expect(ok).toBe(true);
    expect(err).toBeNull();
    expect(data).toBe(42);
  });

  it('should handle direct string values', () => {
    const [ok, err, data] = tryFn('hello') as [boolean, Error | null, string | undefined];
    expect(ok).toBe(true);
    expect(err).toBeNull();
    expect(data).toBe('hello');
  });

  it('should handle direct object values', () => {
    const obj = { foo: 'bar' };
    const [ok, err, data] = tryFn(obj) as [boolean, Error | null, typeof obj | undefined];
    expect(ok).toBe(true);
    expect(err).toBeNull();
    expect(data).toBe(obj);
  });

  it('should wrap non-Error throws in async function', async () => {
    const [ok, err, data] = await tryFn(async () => {
      throw 'string error';
    });
    expect(ok).toBe(false);
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toContain('string error');
    expect(data).toBeUndefined();
  });

  it('should wrap non-Error throws in sync function', () => {
    const [ok, err, data] = tryFnSync(() => {
      throw 'string error';
    });
    expect(ok).toBe(false);
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toContain('string error');
    expect(data).toBeUndefined();
  });

  it('should wrap non-Error rejection from promise', async () => {
    const [ok, err, data] = await tryFn(Promise.reject('rejected string'));
    expect(ok).toBe(false);
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toContain('rejected string');
    expect(data).toBeUndefined();
  });

  it('should handle sync function returning null', () => {
    const [ok, err, data] = tryFn(() => null as any) as [boolean, Error | null, null | undefined];
    expect(ok).toBe(true);
    expect(err).toBeNull();
    expect(data).toBeNull();
  });

  it('should handle sync function returning promise', async () => {
    const [ok, err, data] = await tryFn(() => Promise.resolve('from sync fn'));
    expect(ok).toBe(true);
    expect(err).toBeNull();
    expect(data).toBe('from sync fn');
  });

  it('should handle sync function throwing error', () => {
    const [ok, err, data] = tryFn(() => { throw new Error('sync throw'); }) as [boolean, Error | null, unknown];
    expect(ok).toBe(false);
    expect(err).toBeInstanceOf(Error);
    expect(err?.message).toBe('sync throw');
  });

  it('should handle undefined input', () => {
    // @ts-ignore
    const [ok, err] = tryFn(undefined);
    expect(ok).toBe(false);
    expect(err?.message).toContain('cannot be null');
  });

  it('should return sync result for function returning a non-null value', () => {
    // This tests line 71 - returning synchronously for sync functions that return values
    const result = tryFn(() => 'sync value');
    // Should be synchronous result (not a promise)
    expect(Array.isArray(result)).toBe(true);
    const [ok, err, data] = result as [boolean, Error | null, string | undefined];
    expect(ok).toBe(true);
    expect(err).toBeNull();
    expect(data).toBe('sync value');
  });
});
