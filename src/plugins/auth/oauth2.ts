/**
 * OAuth 2.0 Authentication
 * RFC 6749 - The OAuth 2.0 Authorization Framework
 */

import { Middleware, Plugin } from '../../types/index.js';

export interface OAuth2Options {
  /**
   * OAuth2 access token or token provider function
   */
  accessToken: string | (() => string | Promise<string>);

  /**
   * Token type (default: 'Bearer')
   */
  tokenType?: string;

  /**
   * Optional refresh token handler
   * Called when a 401 is received to attempt token refresh
   */
  onTokenExpired?: () => Promise<string>;
}

/**
 * OAuth2 Authentication Middleware
 * Supports token refresh on 401 responses
 *
 * @example
 * ```typescript
 * client.use(oauth2({
 *   accessToken: () => tokenStore.getAccessToken(),
 *   onTokenExpired: async () => {
 *     await tokenStore.refresh();
 *     return tokenStore.getAccessToken();
 *   }
 * }));
 * ```
 */
export function oauth2(options: OAuth2Options): Middleware {
  const tokenType = options.tokenType ?? 'Bearer';

  return async (req, next) => {
    // Get current token
    const token = typeof options.accessToken === 'function'
      ? await options.accessToken()
      : options.accessToken;

    // Add Authorization header
    const authReq = req.withHeader('Authorization', `${tokenType} ${token}`);
    const response = await next(authReq);

    // Handle token expiration
    if (response.status === 401 && options.onTokenExpired) {
      try {
        const newToken = await options.onTokenExpired();
        const retryReq = req.withHeader('Authorization', `${tokenType} ${newToken}`);
        return next(retryReq);
      } catch {
        // Token refresh failed, return original 401 response
        return response;
      }
    }

    return response;
  };
}

/**
 * OAuth2 Authentication Plugin
 */
export function oauth2Plugin(options: OAuth2Options): Plugin {
  return (client) => {
    client.use(oauth2(options));
  };
}
