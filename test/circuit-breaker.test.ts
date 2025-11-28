import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../src/core/client.js';
import { circuitBreaker, CircuitBreakerError } from '../src/plugins/circuit-breaker.js';
import { ReckerRequest } from '../src/types/index.js';

class FlakyTransport {
    failures = 0;
    succeedAfter = 0;
    
    constructor(succeedAfter: number) {
        this.succeedAfter = succeedAfter;
    }

    async dispatch(req: ReckerRequest) {
        this.failures++;
        if (this.failures <= this.succeedAfter) {
            return { ok: false, status: 500, statusText: 'Error' } as any;
        }
        return { ok: true, status: 200 } as any;
    }
}

describe('Circuit Breaker Plugin', () => {
  it('should open circuit after threshold failures', async () => {
    const transport = new FlakyTransport(5); // Fails 5 times, succeeds on 6th
    const stateChange = vi.fn();

    const client = createClient({
        baseUrl: 'http://flaky.com',
        transport: transport as any,
        plugins: [
            circuitBreaker({
                threshold: 3, // Open after 3 failures
                resetTimeout: 100, // Fast reset for test
                onStateChange: stateChange
            })
        ]
    });

    // 1. Fail 3 times (CLOSED -> OPEN)
    // We expect these to fail, so we suppress the throw or catch it
    await client.get('/fail', { throwHttpErrors: false }); // Fail 1
    await client.get('/fail', { throwHttpErrors: false }); // Fail 2
    await client.get('/fail', { throwHttpErrors: false }); // Fail 3 -> OPEN

    expect(stateChange).toHaveBeenCalledWith('OPEN', 'flaky.com');

    // 2. Fail fast (OPEN)
    await expect(client.get('/fail')).rejects.toThrow(CircuitBreakerError);
    
    // Transport should not have been called for the 4th time (saved a network call)
    expect(transport.failures).toBe(3);

    // 3. Wait for reset timeout (OPEN -> HALF_OPEN)
    await new Promise(r => setTimeout(r, 150));

    // 4. Next request should pass through (HALF_OPEN)
    // Note: Our transport is still failing (needs 5 failures), so this will fail and reopen circuit
    await client.get('/fail', { throwHttpErrors: false }); 
    expect(transport.failures).toBe(4); // Called network
    expect(stateChange).toHaveBeenCalledWith('HALF_OPEN', 'flaky.com');
    expect(stateChange).toHaveBeenLastCalledWith('OPEN', 'flaky.com'); // Re-opened immediately
  });

  it('should recover when service recovers', async () => {
      const transport = new FlakyTransport(3); // Fails 3 times
      const stateChange = vi.fn();
      
      const client = createClient({
          baseUrl: 'http://recover.com',
          transport: transport as any,
          plugins: [
              circuitBreaker({
                  threshold: 3,
                  resetTimeout: 50,
                  onStateChange: stateChange
              })
          ]
      });

      // Trip it
      await client.get('/test', { throwHttpErrors: false });
      await client.get('/test', { throwHttpErrors: false });
      await client.get('/test', { throwHttpErrors: false }); // OPEN

      await new Promise(r => setTimeout(r, 100));

      // Next request succeeds (transport.failures was 3, > 3 succeeds)
      await client.get('/test'); // HALF_OPEN -> SUCCESS -> CLOSED
      
      expect(stateChange).toHaveBeenLastCalledWith('CLOSED', 'recover.com');
  });
});
