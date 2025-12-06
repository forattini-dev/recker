/**
 * Bearer Token Authentication
 * RFC 6750 - The OAuth 2.0 Authorization Framework: Bearer Token Usage
 */

import { Middleware, Plugin } from '../../types/index.js';

export interface BearerAuthOptions {
  /**
   * Bearer token (static or dynamic)
   */
  token: string | (() => string | Promise<string>);

  /**
   * Token type (default: 'Bearer')
   */
  type?: string;

  /**
   * Header name (default: 'Authorization')
   */
  headerName?: string;
}

/**
 * Bearer Token Authentication Middleware
 * Supports both static tokens and dynamic token providers
 *
 * @example
 * ```typescript
 * // Static token
 * client.use(bearerAuth({ token: 'my-api-key' }));
 *
 * // Dynamic token (refreshed on each request)
 * client.use(bearerAuth({
 *   token: async () => await getAccessToken()
 * }));
 * ```
 */
export function bearerAuth(options: BearerAuthOptions): Middleware {
  const type = options.type ?? 'Bearer';
  const headerName = options.headerName ?? 'Authorization';

  return async (req, next) => {
    const token = typeof options.token === 'function'
      ? await options.token()
      : options.token;

    const authHeader = `${type} ${token}`;
    const newReq = req.withHeader(headerName, authHeader);
    return next(newReq);
  };
}

/**
 * Bearer Token Authentication Plugin
 */
export function bearerAuthPlugin(options: BearerAuthOptions): Plugin {
  return (client) => {
    client.use(bearerAuth(options));
  };
}
