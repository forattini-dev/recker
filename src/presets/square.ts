import { ClientOptions } from '../types/index.js';

export interface SquarePresetOptions {
  /**
   * Square Access Token
   */
  accessToken: string;
  /**
   * Use sandbox environment
   * @default false
   */
  sandbox?: boolean;
  /**
   * Square API version (YYYY-MM-DD format)
   * @default '2024-01-18'
   */
  version?: string;
}

/**
 * Square Payments API preset
 *
 * Particularities:
 * - Separate sandbox and production environments
 * - Idempotency keys required for mutations
 * - API versioning via header
 * - Strong consistency for payment operations
 *
 * @see https://developer.squareup.com/reference/square
 *
 * @example Payments
 * ```typescript
 * const client = createClient(square({ accessToken: 'xxx', sandbox: true }));
 *
 * // Create payment
 * await client.post('/payments', {
 *   json: {
 *     idempotency_key: crypto.randomUUID(),
 *     source_id: 'card_nonce',
 *     amount_money: { amount: 1000, currency: 'USD' },
 *     location_id: 'location_xxx'
 *   }
 * }).json();
 *
 * // List customers
 * await client.get('/customers').json();
 * ```
 *
 * @example With Idempotency Helper
 * ```typescript
 * const payment = await client.post('/payments', {
 *   json: { ... },
 *   headers: { 'Idempotency-Key': crypto.randomUUID() }
 * }).json();
 * ```
 */
export function square(options: SquarePresetOptions): ClientOptions {
  const baseUrl = options.sandbox
    ? 'https://connect.squareupsandbox.com/v2'
    : 'https://connect.squareup.com/v2';

  return {
    baseUrl,
    headers: {
      'Authorization': `Bearer ${options.accessToken}`,
      'Content-Type': 'application/json',
      'Square-Version': options.version || '2024-01-18',
    },
    timeout: 30 * 1000,
    retry: {
      maxAttempts: 3,
      backoff: 'exponential',
      delay: 1000,
      // Square is idempotent with proper keys, safe to retry
      statusCodes: [408, 429, 500, 502, 503, 504],
    }
  };
}

/**
 * Square Payments preset (scoped to payments endpoint)
 */
export const squarePayments = (options: SquarePresetOptions): ClientOptions => ({
  ...square(options),
  baseUrl: options.sandbox
    ? 'https://connect.squareupsandbox.com/v2/payments'
    : 'https://connect.squareup.com/v2/payments',
});

/**
 * Square Catalog preset (for inventory management)
 */
export const squareCatalog = (options: SquarePresetOptions): ClientOptions => ({
  ...square(options),
  baseUrl: options.sandbox
    ? 'https://connect.squareupsandbox.com/v2/catalog'
    : 'https://connect.squareup.com/v2/catalog',
});

/**
 * Square Sandbox preset (convenience alias)
 */
export const squareSandbox = (options: Omit<SquarePresetOptions, 'sandbox'>): ClientOptions =>
  square({ ...options, sandbox: true });
