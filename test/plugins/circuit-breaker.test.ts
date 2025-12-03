import { describe, it, expect, vi } from 'vitest';
import { createClient } from '../../src/core/client.js';
import { circuitBreaker, CircuitBreakerError } from '../../src/plugins/circuit-breaker.js';
import { ReckerRequest } from '../../src/types/index.js';

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

  it('should handle error events correctly', async () => {
    let callCount = 0;
    const transport = {
        async dispatch() {
            callCount++;
            throw new Error('Network error');
        }
    };

    const stateChange = vi.fn();
    const client = createClient({
        baseUrl: 'http://error.com',
        transport: transport as any,
        plugins: [
            circuitBreaker({
                threshold: 2,
                resetTimeout: 50,
                onStateChange: stateChange
            })
        ]
    });

    // Trip circuit via errors
    await expect(client.get('/error')).rejects.toThrow('Network error');
    await expect(client.get('/error')).rejects.toThrow('Network error');

    // Circuit should be open now
    await expect(client.get('/error')).rejects.toThrow(CircuitBreakerError);
    expect(callCount).toBe(2); // Third call didn't reach transport
  });

  it('should reset failures on successful request in CLOSED state', async () => {
    let callCount = 0;
    const transport = {
        async dispatch() {
            callCount++;
            if (callCount === 1) {
                return { ok: false, status: 500, statusText: 'Error' } as any;
            }
            return { ok: true, status: 200 } as any;
        }
    };

    const client = createClient({
        baseUrl: 'http://reset.com',
        transport: transport as any,
        plugins: [
            circuitBreaker({
                threshold: 3,
                resetTimeout: 50
            })
        ]
    });

    // First request fails
    await client.get('/test', { throwHttpErrors: false });

    // Second request succeeds - should reset failures
    await client.get('/test');

    // Third request fails - since failures were reset, won't trip yet
    await client.get('/test', { throwHttpErrors: false });

    // Fourth request should still work (not tripped)
    const res = await client.get('/test');
    expect(res.ok).toBe(true);
  });

  it('should handle invalid URL and use "unknown" key', async () => {
    const transport = {
      async dispatch() {
        return { ok: true, status: 200 } as any;
      }
    };

    const stateChange = vi.fn();
    const client = createClient({
      transport: transport as any,
      plugins: [
        circuitBreaker({
          threshold: 3,
          resetTimeout: 50,
          onStateChange: stateChange
        })
      ]
    });

    // Make a request with an invalid URL (no baseUrl)
    // This should not throw but use "unknown" as the circuit key
    const res = await client.get('not-a-valid-url');
    expect(res.ok).toBe(true);
  });

  it('should rethrow CircuitBreakerError in onError handler', async () => {
    let callCount = 0;
    const transport = {
      async dispatch() {
        callCount++;
        throw new Error('Network error');
      }
    };

    const client = createClient({
      baseUrl: 'http://breaker-test.com',
      transport: transport as any,
      plugins: [
        circuitBreaker({
          threshold: 2,
          resetTimeout: 100
        })
      ]
    });

    // Trip the circuit
    await expect(client.get('/test1')).rejects.toThrow('Network error');
    await expect(client.get('/test2')).rejects.toThrow('Network error');

    // Now the circuit is open - this should throw CircuitBreakerError
    // and the error should propagate correctly through the onError handler
    const promise = client.get('/test3');
    await expect(promise).rejects.toThrow(CircuitBreakerError);
    expect(callCount).toBe(2); // The third call should not reach transport
  });
});
