/**
 * Basic Authentication
 * RFC 7617 - The 'Basic' HTTP Authentication Scheme
 */

import { Middleware, Plugin } from '../../types/index.js';

export interface BasicAuthOptions {
  username: string;
  password: string;
}

/**
 * Basic Authentication Middleware
 * Adds Authorization header with Base64 encoded credentials
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   baseUrl: 'https://api.example.com',
 * });
 * client.use(basicAuth({ username: 'user', password: 'pass' }));
 * ```
 */
export function basicAuth(options: BasicAuthOptions): Middleware {
  const credentials = Buffer.from(`${options.username}:${options.password}`).toString('base64');
  const authHeader = `Basic ${credentials}`;

  return async (req, next) => {
    const newReq = req.withHeader('Authorization', authHeader);
    return next(newReq);
  };
}

/**
 * Basic Authentication Plugin
 */
export function basicAuthPlugin(options: BasicAuthOptions): Plugin {
  return (client) => {
    client.use(basicAuth(options));
  };
}
