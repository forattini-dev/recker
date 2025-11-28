import { ClientOptions } from '../types/index.js';

export interface StripePresetOptions {
  /**
   * Stripe secret key (sk_live_... or sk_test_...)
   */
  secretKey: string;
  /**
   * API version (optional, uses account default if not specified)
   */
  apiVersion?: string;
  /**
   * Idempotency key for safe retries (optional, generated per-request usually)
   */
  idempotencyKey?: string;
}

/**
 * Stripe API preset
 * @see https://stripe.com/docs/api
 */
export function stripe(options: StripePresetOptions): ClientOptions {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${options.secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (options.apiVersion) {
    headers['Stripe-Version'] = options.apiVersion;
  }

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  return {
    baseUrl: 'https://api.stripe.com/v1',
    headers,
    timeout: 30 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 500,
      // Stripe is idempotent, safe to retry
      statusCodes: [408, 429, 500, 502, 503, 504]
    }
  };
}
