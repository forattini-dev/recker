/**
 * API Key Authentication
 * Common pattern for API authentication via header or query parameter
 */

import { Middleware, Plugin, ReckerRequest } from '../../types/index.js';

export interface ApiKeyAuthOptions {
  /**
   * API key value
   */
  key: string | (() => string | Promise<string>);

  /**
   * Where to send the key: 'header' or 'query'
   * @default 'header'
   */
  in?: 'header' | 'query';

  /**
   * Name of the header or query parameter
   * @default 'X-API-Key'
   */
  name?: string;
}

/**
 * API Key Authentication Middleware
 * Sends API key in header or query parameter
 *
 * @example
 * ```typescript
 * // In header (default)
 * client.use(apiKeyAuth({ key: 'my-api-key' }));
 *
 * // In query parameter
 * client.use(apiKeyAuth({
 *   key: 'my-api-key',
 *   in: 'query',
 *   name: 'api_key'
 * }));
 * ```
 */
export function apiKeyAuth(options: ApiKeyAuthOptions): Middleware {
  const location = options.in ?? 'header';
  const name = options.name ?? 'X-API-Key';

  return async (req, next) => {
    const key = typeof options.key === 'function'
      ? await options.key()
      : options.key;

    if (location === 'header') {
      const newReq = req.withHeader(name, key);
      return next(newReq);
    } else {
      // Append to query string
      const url = new URL(req.url);
      url.searchParams.set(name, key);

      // Create new request with updated URL
      const newReq = {
        ...req,
        url: url.toString(),
      } as ReckerRequest;

      return next(newReq);
    }
  };
}

/**
 * API Key Authentication Plugin
 */
export function apiKeyAuthPlugin(options: ApiKeyAuthOptions): Plugin {
  return (client) => {
    client.use(apiKeyAuth(options));
  };
}
