import { Client } from '../core/client.js';
import type { ExtendedClientOptions } from '../core/client.js';
import { UnsupportedError } from '../core/errors.js';

/**
 * ClientPool - Reuse clients across multiple domains for better performance.
 *
 * Creating a new client for each domain has significant overhead.
 * This pool maintains a cache of clients by baseUrl to avoid repeated initialization.
 *
 * @example
 * ```typescript
 * const pool = new ClientPool({ dedup: {} });
 *
 * // These will reuse cached clients
 * const client1 = pool.get('https://api1.example.com');
 * const client2 = pool.get('https://api2.example.com');
 * const client1Again = pool.get('https://api1.example.com'); // Same instance as client1
 *
 * // Make requests
 * await Promise.all([
 *   client1.get('/data').json(),
 *   client2.get('/data').json(),
 * ]);
 * ```
 */
export class ClientPool {
  private pool: Map<string, Client> = new Map();
  private defaultOptions: Omit<ExtendedClientOptions, 'baseUrl'>;

  constructor(options: Omit<ExtendedClientOptions, 'baseUrl'> = {}) {
    this.defaultOptions = options;
  }

  /**
   * Get or create a client for the given baseUrl.
   * Clients are cached by baseUrl for reuse.
   */
  get(baseUrl: string): Client {
    let client = this.pool.get(baseUrl);

    if (!client) {
      client = new Client({
        ...this.defaultOptions,
        baseUrl,
      });
      this.pool.set(baseUrl, client);
    }

    return client;
  }

  /**
   * Check if a client exists for the given baseUrl.
   */
  has(baseUrl: string): boolean {
    return this.pool.has(baseUrl);
  }

  /**
   * Get the number of cached clients.
   */
  get size(): number {
    return this.pool.size;
  }

  /**
   * Clear all cached clients.
   */
  clear(): void {
    this.pool.clear();
  }

  /**
   * Remove a specific client from the pool.
   */
  remove(baseUrl: string): boolean {
    return this.pool.delete(baseUrl);
  }

  /**
   * Execute requests across multiple domains in parallel.
   * Automatically uses cached clients for each domain.
   *
   * @example
   * ```typescript
   * const pool = new ClientPool({ dedup: {} });
   *
   * const results = await pool.multi([
   *   { baseUrl: 'https://api1.example.com', path: '/users' },
   *   { baseUrl: 'https://api2.example.com', path: '/products' },
   *   { baseUrl: 'https://api1.example.com', path: '/orders' }, // Reuses api1 client
   * ]);
   * ```
   */
  async multi<T = unknown>(
    requests: Array<{
      baseUrl: string;
      path: string;
      method?: string;
      options?: Record<string, unknown>;
    }>
  ): Promise<T[]> {
    const promises = requests.map(({ baseUrl, path, method = 'GET', options = {} }) => {
      const client = this.get(baseUrl);
      const methodFn = (client as any)[method.toLowerCase()];

      if (typeof methodFn !== 'function') {
        throw new UnsupportedError(`Unknown HTTP method: ${method}`, {
          feature: method,
        });
      }

      return methodFn.call(client, path, options).json() as Promise<T>;
    });

    return Promise.all(promises);
  }
}

/**
 * Global client pool instance for convenience.
 * Use this for simple multi-domain scenarios without creating your own pool.
 *
 * @example
 * ```typescript
 * import { globalPool } from 'recker';
 *
 * const api1 = globalPool.get('https://api1.example.com');
 * const api2 = globalPool.get('https://api2.example.com');
 * ```
 */
export const globalPool = new ClientPool();

/**
 * Helper function to create a pool with deduplication enabled.
 *
 * @example
 * ```typescript
 * const pool = createDedupPool();
 * const client = pool.get('https://api.example.com');
 * ```
 */
export function createDedupPool(options: Omit<ExtendedClientOptions, 'baseUrl' | 'dedup'> = {}): ClientPool {
  return new ClientPool({
    ...options,
    dedup: {},
  });
}
