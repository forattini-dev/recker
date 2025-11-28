import { Plugin, ReckerRequest, ReckerResponse } from '../types/index.js';

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit */
  threshold?: number;
  /** Time in milliseconds to wait before trying again (Half-Open state) */
  resetTimeout?: number;
  /** Optional filtering to determine which errors count as failures (default: 5xx) */
  shouldTrip?: (error: any, response?: ReckerResponse) => boolean;
  /** Callback when state changes */
  onStateChange?: (state: CircuitState, service: string) => void;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitStats {
  failures: number;
  lastFailureTime: number;
  state: CircuitState;
}

export class CircuitBreakerError extends Error {
  constructor(public service: string) {
    super(`Circuit breaker is OPEN for ${service}`);
    this.name = 'CircuitBreakerError';
  }
}

export function circuitBreaker(options: CircuitBreakerOptions = {}): Plugin {
  const threshold = options.threshold || 5;
  const resetTimeout = options.resetTimeout || 30000; // 30s
  
  // Map host/domain -> stats
  const circuits = new Map<string, CircuitStats>();

  const getCircuitKey = (req: ReckerRequest) => {
    try {
      // Group by hostname usually
      return new URL(req.url).hostname;
    } catch {
      return 'unknown';
    }
  };

  const shouldTrip = options.shouldTrip || ((err, res) => {
    if (res) return res.status >= 500; // Only 5xx errors trip by default
    return true; // Network errors trip
  });

  return (client: any) => {
    
    // 1. Check Circuit Status Before Request
    client.beforeRequest((req: ReckerRequest) => {
      const key = getCircuitKey(req);
      let stats = circuits.get(key);

      if (!stats) {
        stats = { failures: 0, lastFailureTime: 0, state: 'CLOSED' };
        circuits.set(key, stats);
      }

      if (stats.state === 'OPEN') {
        const now = Date.now();
        if (now - stats.lastFailureTime > resetTimeout) {
          // Transition to HALF_OPEN: allow one request to pass
          stats.state = 'HALF_OPEN';
          if (options.onStateChange) options.onStateChange('HALF_OPEN', key);
        } else {
          // Fail immediately
          throw new CircuitBreakerError(key);
        }
      }
    });

    // 2. Handle Response (Success/Failure)
    client.afterResponse((req: ReckerRequest, res: ReckerResponse) => {
        const key = getCircuitKey(req);
        const stats = circuits.get(key);
        if (!stats) return;

        // Determine if this request counts as a failure
        const isFailure = shouldTrip(null, res);

        if (isFailure) {
             handleFailure(stats, key);
        } else {
             handleSuccess(stats, key);
        }
    });

    client.onError((err: Error, req: ReckerRequest) => {
        // Don't count CircuitBreakerError itself as a failure (it's a symptom)
        if (err instanceof CircuitBreakerError) {
            throw err; // Rethrow fast
        }

        const key = getCircuitKey(req);
        const stats = circuits.get(key);
        if (!stats) return; // Should exist from beforeRequest

        const isFailure = shouldTrip(err, undefined);
        
        if (isFailure) {
            handleFailure(stats, key);
        }
        
        // We don't handle success here obviously
    });

    function handleSuccess(stats: CircuitStats, key: string) {
        if (stats.state === 'HALF_OPEN') {
            stats.state = 'CLOSED';
            stats.failures = 0; // Reset
            if (options.onStateChange) options.onStateChange('CLOSED', key);
        } else if (stats.state === 'CLOSED') {
            // Optional: Decay failures over time or reset on success?
            // Usually simple breakers reset count on success
            stats.failures = 0; 
        }
    }

    function handleFailure(stats: CircuitStats, key: string) {
        stats.failures++;
        stats.lastFailureTime = Date.now();

        if (stats.state === 'HALF_OPEN') {
            // If it fails in half-open, go back to OPEN immediately
            stats.state = 'OPEN';
            if (options.onStateChange) options.onStateChange('OPEN', key);
        } else if (stats.state === 'CLOSED') {
            if (stats.failures >= threshold) {
                stats.state = 'OPEN';
                if (options.onStateChange) options.onStateChange('OPEN', key);
            }
        }
    }
  };
}
