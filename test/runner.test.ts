import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RequestRunner } from '../src/runner/request-runner.js';

describe('RequestRunner', () => {
  it('should process items with concurrency', async () => {
    const runner = new RequestRunner({ concurrency: 2 });
    const items = [100, 200, 50, 100, 50];
    const start = Date.now();
    
    const { results, stats } = await runner.run(items, async (ms) => {
      await new Promise(resolve => setTimeout(resolve, ms));
      return ms;
    });

    const duration = Date.now() - start;

    expect(results).toEqual(items);
    expect(stats.successful).toBe(5);
    expect(stats.failed).toBe(0);
    
    // With concurrency 2:
    // [100, 200] start. 
    // 100 finishes (t=100). [50] starts.
    // 50 finishes (t=150). [100] starts.
    // 200 finishes (t=200). [50] starts.
    // 100 finishes (t=250).
    // 50 finishes (t=250).
    // Approx total time should be around 250-300ms, definitely less than sum (500ms)
    expect(duration).toBeLessThan(500); 
  });

  it('should handle errors gracefully', async () => {
    const runner = new RequestRunner({ concurrency: 5 });
    const items = [1, 2, 3];

    const { results, stats } = await runner.run(items, async (n) => {
      if (n === 2) throw new Error('Fail');
      return n * 2;
    });

    expect(results[0]).toBe(2);
    expect(results[1]).toBeInstanceOf(Error);
    expect(results[2]).toBe(6);
    expect(stats.failed).toBe(1);
  });
});
