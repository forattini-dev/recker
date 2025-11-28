/**
 * XSRF/CSRF Protection Plugin
 * Automatically reads XSRF token from cookies and adds it to request headers
 */

import { Middleware } from '../types/index.js';

export interface XSRFPluginOptions {
  /**
   * Name of the cookie to read the XSRF token from
   * @default 'XSRF-TOKEN'
   */
  cookieName?: string;
  /**
   * Name of the header to send the XSRF token in
   * @default 'X-XSRF-TOKEN'
   */
  headerName?: string;
  /**
   * Manually set XSRF token (bypasses cookie reading)
   * Useful in Node.js environments or when token is obtained differently
   */
  token?: string;
  /**
   * Cookie string to parse (e.g., from previous Set-Cookie headers)
   * If not provided, will try to read from global cookie store (browser) or manual token
   */
  cookies?: string;
}

/**
 * Parse cookies from a cookie string
 */
function parseCookies(cookieString: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  if (!cookieString) {
    return cookies;
  }

  const pairs = cookieString.split(';');
  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split('=');
    const trimmedKey = key?.trim();
    const value = valueParts.join('=').trim();

    if (trimmedKey) {
      cookies[trimmedKey] = decodeURIComponent(value || '');
    }
  }

  return cookies;
}

/**
 * Get XSRF token from cookies
 */
function getXSRFToken(cookieName: string, cookies?: string): string | null {
  // Try manual cookie string first
  if (cookies) {
    const parsed = parseCookies(cookies);
    return parsed[cookieName] || null;
  }

  // In browser environment, try document.cookie
  if (typeof document !== 'undefined' && document.cookie) {
    const parsed = parseCookies(document.cookie);
    return parsed[cookieName] || null;
  }

  return null;
}

/**
 * XSRF/CSRF Protection Middleware
 *
 * Automatically adds XSRF token to requests by:
 * 1. Reading token from cookie (browser or provided cookie string)
 * 2. Or using manually provided token
 * 3. Adding it to the configured header
 *
 * @example
 * ```typescript
 * // Browser environment (auto-reads from document.cookie)
 * client.use(xsrf());
 *
 * // Node.js with manual token
 * client.use(xsrf({ token: 'my-xsrf-token' }));
 *
 * // Node.js with cookie string
 * client.use(xsrf({ cookies: 'XSRF-TOKEN=abc123; Path=/' }));
 *
 * // Custom cookie/header names
 * client.use(xsrf({
 *   cookieName: 'CSRF-TOKEN',
 *   headerName: 'X-CSRF-TOKEN'
 * }));
 * ```
 */
export function xsrf(options: XSRFPluginOptions = {}): Middleware {
  const {
    cookieName = 'XSRF-TOKEN',
    headerName = 'X-XSRF-TOKEN',
    token: manualToken,
    cookies
  } = options;

  return async (req, next) => {
    // Get token from manual option or cookies
    const token = manualToken || getXSRFToken(cookieName, cookies);

    // If we have a token, add it to headers
    if (token) {
      // Check if header already exists (don't override)
      if (!req.headers.has(headerName)) {
        req.headers.set(headerName, token);
      }
    }

    return next(req);
  };
}

/**
 * Helper to create XSRF middleware from boolean or options
 * Used internally by Client
 */
export function createXSRFMiddleware(config: boolean | XSRFPluginOptions): Middleware | null {
  if (!config) {
    return null;
  }

  if (config === true) {
    return xsrf(); // Use defaults
  }

  return xsrf(config);
}
