import { Middleware, ReckerRequest, NextFunction } from '../types/index.js';

export interface NetworkSimulationOptions {
  /** Additional latency in milliseconds before request is sent */
  latency?: number;
  /** Probability of request failure (0 to 1) */
  errorRate?: number;
  /** Error message to throw on simulated failure */
  errorMessage?: string;
}

/**
 * Middleware to simulate poor network conditions
 */
export function simulateNetwork(options: NetworkSimulationOptions): Middleware {
  return async (req: ReckerRequest, next: NextFunction) => {
    // 1. Simulate Latency
    if (options.latency && options.latency > 0) {
      await new Promise(resolve => setTimeout(resolve, options.latency));
    }

    // 2. Simulate Packet Loss / Error
    if (options.errorRate && options.errorRate > 0) {
      if (Math.random() < options.errorRate) {
        throw new Error(options.errorMessage || 'Simulated Network Error (Packet Loss)');
      }
    }

    return next(req);
  };
}
