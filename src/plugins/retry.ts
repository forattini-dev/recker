import { Middleware, Plugin } from '../types/index.js';
import { HttpError, NetworkError, TimeoutError } from '../core/errors.js';

export type BackoffStrategy = 'linear' | 'exponential' | 'decorrelated';

export interface RetryOptions {
  maxAttempts?: number;
  delay?: number; // Initial delay in ms (default: 1000)
  maxDelay?: number; // Maximum delay cap in ms (default: 30000)
  backoff?: BackoffStrategy; // Backoff strategy (default: 'exponential')
  jitter?: boolean; // Add randomness to prevent thundering herd (default: true)
  statusCodes?: number[];
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown, delay: number) => void;
}

/**
 * Calculate backoff delay with optional jitter
 */
function calculateDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  strategy: BackoffStrategy,
  useJitter: boolean
): number {
  let calculatedDelay: number;

  switch (strategy) {
    case 'linear':
      calculatedDelay = baseDelay * attempt;
      break;

    case 'exponential':
      // 2^attempt * baseDelay
      calculatedDelay = Math.pow(2, attempt - 1) * baseDelay;
      break;

    case 'decorrelated':
      // AWS style: random between baseDelay and (previous delay * 3)
      // For first attempt, use baseDelay
      const prevDelay = attempt === 1 ? baseDelay : Math.pow(2, attempt - 2) * baseDelay;
      calculatedDelay = Math.random() * (prevDelay * 3 - baseDelay) + baseDelay;
      break;

    default:
      calculatedDelay = baseDelay * attempt;
  }

  // Apply cap
  calculatedDelay = Math.min(calculatedDelay, maxDelay);

  // Apply jitter (±25% randomness)
  if (useJitter) {
    const jitterRange = calculatedDelay * 0.25;
    const jitterAmount = (Math.random() * jitterRange * 2) - jitterRange;
    calculatedDelay += jitterAmount;
  }

  return Math.max(0, Math.floor(calculatedDelay));
}

export function retry(options: RetryOptions = {}): Plugin {
  const maxAttempts = options.maxAttempts || 3;
  const baseDelay = options.delay || 1000;
  const maxDelay = options.maxDelay || 30_000;
  const backoffStrategy = options.backoff || 'exponential';
  const useJitter = options.jitter !== false; // Default true
  const statusCodes = options.statusCodes || [408, 429, 500, 502, 503, 504];
  const onRetry = options.onRetry;

  const defaultShouldRetry = (error: unknown) => {
    if (error instanceof NetworkError) return true;
    if (error instanceof TimeoutError) return true;
    if (error instanceof HttpError) {
        return statusCodes.includes(error.status);
    }
    if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as any).code;
        return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND';
    }
    return false;
  };

  const shouldRetry = options.shouldRetry || defaultShouldRetry;

  return (client: any) => {
    const middleware: Middleware = async (req, next) => {
        let attempt = 0;

        while (true) {
        try {
            attempt++;
            const res = await next(req);

            // Retry based on Status Code
            if (attempt < maxAttempts && !res.ok && statusCodes.includes(res.status)) {
            const delayMs = calculateDelay(attempt, baseDelay, maxDelay, backoffStrategy, useJitter);
            const err = new HttpError(res, req);

            if (onRetry) {
                onRetry(attempt, err, delayMs);
            }
            
            // Dispatch Global Hook (if available)
            if (client.hooks && client.hooks.onRetry) {
                for (const hook of client.hooks.onRetry) {
                    await hook(err, attempt, delayMs, req);
                }
            }

            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
            }

            return res;
        } catch (error: any) {
            // Retry based on Error Type
            if (attempt < maxAttempts && shouldRetry(error)) {
            const delayMs = calculateDelay(attempt, baseDelay, maxDelay, backoffStrategy, useJitter);

            if (onRetry) {
                onRetry(attempt, error, delayMs);
            }

            // Dispatch Global Hook (if available)
            if (client.hooks && client.hooks.onRetry) {
                for (const hook of client.hooks.onRetry) {
                    await hook(error, attempt, delayMs, req);
                }
            }

            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
            }
            throw error;
        }
        }
    };

    client.use(middleware);
  };
}