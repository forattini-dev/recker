import type { CookieJar } from '../types/index.js';

/**
 * RFC 6265 compliant regex patterns (from jshttp/cookie)
 * These validate cookie components per the spec
 */

// RFC 6265 sec 4.1.1 - cookie-name (token per RFC 7230)
// Allowing extended range per https://github.com/jshttp/cookie/issues/191
const cookieNameRegExp = /^[\u0021-\u003A\u003C\u003E-\u007E]+$/;

// RFC 6265 sec 4.1.1 - cookie-value
const cookieValueRegExp = /^[\u0021-\u003A\u003C-\u007E]*$/;

// RFC 6265 sec 4.1.1 - domain-value (subdomain per RFC 1034/1123)
const domainValueRegExp =
  /^([.]?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

// RFC 6265 sec 4.1.1 - path-value
const pathValueRegExp = /^[\u0020-\u003A\u003D-\u007E]*$/;

/**
 * Parsed cookie structure with all RFC 6265 attributes
 */
interface ParsedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: Date;
  maxAge?: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  partitioned?: boolean;  // CHIPS (Cookies Having Independent Partitioned State)
  priority?: 'Low' | 'Medium' | 'High';  // Chrome priority extension
  createdAt: number;
}

/**
 * RFC 6265 compliant in-memory cookie jar
 *
 * Features:
 * - Domain scoping with proper subdomain matching
 * - Path matching
 * - Expiration handling (Expires and Max-Age)
 * - Secure flag enforcement
 * - HttpOnly flag tracking
 * - SameSite attribute support
 *
 * @example
 * ```typescript
 * const jar = new MemoryCookieJar();
 *
 * // Set cookies (from Set-Cookie header)
 * await jar.setCookie('session=abc123; Path=/; HttpOnly', 'https://example.com');
 *
 * // Get cookies for a URL
 * const cookies = await jar.getCookieString('https://example.com/api');
 * // => "session=abc123"
 * ```
 */
export class MemoryCookieJar implements CookieJar {
  // Map<domain, Map<path, Map<name, cookie>>>
  private cookies = new Map<string, Map<string, Map<string, ParsedCookie>>>();

  /**
   * Get all matching cookies for a URL as a cookie header string
   */
  getCookieString(url: string): string {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    const pathname = parsedUrl.pathname || '/';
    const isSecure = parsedUrl.protocol === 'https:';
    const now = Date.now();

    const matchingCookies: ParsedCookie[] = [];

    // Check all domains that might match
    for (const [domain, pathMap] of this.cookies.entries()) {
      if (!this.domainMatches(hostname, domain)) continue;

      for (const [path, nameMap] of pathMap.entries()) {
        if (!this.pathMatches(pathname, path)) continue;

        for (const cookie of nameMap.values()) {
          // Skip expired cookies
          if (this.isExpired(cookie, now)) {
            nameMap.delete(cookie.name);
            continue;
          }

          // Skip secure cookies for non-secure requests
          if (cookie.secure && !isSecure) continue;

          matchingCookies.push(cookie);
        }
      }
    }

    // Sort by path length (longest first) then by creation time (oldest first)
    matchingCookies.sort((a, b) => {
      const pathDiff = b.path.length - a.path.length;
      if (pathDiff !== 0) return pathDiff;
      return a.createdAt - b.createdAt;
    });

    return matchingCookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  /**
   * Store a cookie from a Set-Cookie header value
   */
  setCookie(rawCookie: string, url: string): void {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    const pathname = parsedUrl.pathname || '/';

    const cookie = this.parseCookie(rawCookie, hostname, pathname);
    if (!cookie) return;

    // Validate domain (security check)
    if (!this.domainMatches(hostname, cookie.domain)) {
      // Cookie domain doesn't match request - reject it
      return;
    }

    // Get or create domain map
    if (!this.cookies.has(cookie.domain)) {
      this.cookies.set(cookie.domain, new Map());
    }
    const domainMap = this.cookies.get(cookie.domain)!;

    // Get or create path map
    if (!domainMap.has(cookie.path)) {
      domainMap.set(cookie.path, new Map());
    }
    const pathMap = domainMap.get(cookie.path)!;

    // Store or replace cookie
    pathMap.set(cookie.name, cookie);
  }

  /**
   * Clear all cookies
   */
  clear(): void {
    this.cookies.clear();
  }

  /**
   * Clear cookies for a specific domain
   */
  clearDomain(domain: string): void {
    this.cookies.delete(domain);
  }

  /**
   * Get all stored cookies (for debugging/testing)
   */
  getAllCookies(): ParsedCookie[] {
    const all: ParsedCookie[] = [];
    for (const domainMap of this.cookies.values()) {
      for (const pathMap of domainMap.values()) {
        for (const cookie of pathMap.values()) {
          all.push(cookie);
        }
      }
    }
    return all;
  }

  /**
   * Parse a Set-Cookie header string into a cookie object
   * RFC 6265 compliant with extended attributes (Partitioned, Priority)
   */
  private parseCookie(setCookieStr: string, requestDomain: string, requestPath: string): ParsedCookie | null {
    const parts = setCookieStr.split(';').map(p => p.trim());
    if (parts.length === 0 || !parts[0]) return null;

    // First part is name=value
    const [nameValue, ...attributes] = parts;
    const eqIndex = nameValue.indexOf('=');
    if (eqIndex === -1) return null;

    const name = nameValue.substring(0, eqIndex).trim();
    const rawValue = nameValue.substring(eqIndex + 1).trim();

    if (!name) return null;

    // URL decode the value (optimized: skip if no % present)
    const value = this.decode(rawValue);

    const cookie: ParsedCookie = {
      name,
      value,
      domain: requestDomain,
      path: this.defaultPath(requestPath),
      secure: false,
      httpOnly: false,
      createdAt: Date.now()
    };

    // Parse attributes
    for (const attr of attributes) {
      const lowerAttr = attr.toLowerCase();

      if (lowerAttr === 'secure') {
        cookie.secure = true;
      } else if (lowerAttr === 'httponly') {
        cookie.httpOnly = true;
      } else if (lowerAttr === 'partitioned') {
        // CHIPS - Cookies Having Independent Partitioned State
        cookie.partitioned = true;
      } else if (lowerAttr.startsWith('domain=')) {
        let domain = attr.substring(7).trim();
        // Remove leading dot (legacy format, per RFC 6265)
        if (domain.startsWith('.')) {
          domain = domain.substring(1);
        }
        // Validate domain format
        if (domainValueRegExp.test(domain)) {
          cookie.domain = domain.toLowerCase();
        }
      } else if (lowerAttr.startsWith('path=')) {
        const path = attr.substring(5).trim();
        // Validate path format
        if (!path || pathValueRegExp.test(path)) {
          cookie.path = path || '/';
        }
      } else if (lowerAttr.startsWith('expires=')) {
        const expiresStr = attr.substring(8).trim();
        const expires = new Date(expiresStr);
        if (Number.isFinite(expires.valueOf())) {
          cookie.expires = expires;
        }
      } else if (lowerAttr.startsWith('max-age=')) {
        const maxAgeStr = attr.substring(8).trim();
        // RFC 6265 sec 5.6.2 - must be integer (can be negative)
        if (/^-?\d+$/.test(maxAgeStr)) {
          cookie.maxAge = parseInt(maxAgeStr, 10);
        }
      } else if (lowerAttr.startsWith('samesite=')) {
        const samesite = attr.substring(9).trim().toLowerCase();
        if (samesite === 'strict') cookie.sameSite = 'Strict';
        else if (samesite === 'lax') cookie.sameSite = 'Lax';
        else if (samesite === 'none') cookie.sameSite = 'None';
      } else if (lowerAttr.startsWith('priority=')) {
        // Chrome priority extension
        const priority = attr.substring(9).trim().toLowerCase();
        if (priority === 'low') cookie.priority = 'Low';
        else if (priority === 'medium') cookie.priority = 'Medium';
        else if (priority === 'high') cookie.priority = 'High';
      }
    }

    return cookie;
  }

  /**
   * URL-decode string value. Optimized to skip native call when no %.
   * (from jshttp/cookie)
   */
  private decode(str: string): string {
    if (str.indexOf('%') === -1) return str;

    try {
      return decodeURIComponent(str);
    } catch {
      return str;
    }
  }

  /**
   * Check if request hostname matches cookie domain
   * RFC 6265 domain matching
   */
  private domainMatches(requestDomain: string, cookieDomain: string): boolean {
    const reqLower = requestDomain.toLowerCase();
    const cookieLower = cookieDomain.toLowerCase();

    // Exact match
    if (reqLower === cookieLower) return true;

    // Subdomain match (request is subdomain of cookie domain)
    // e.g., "api.example.com" matches "example.com"
    if (reqLower.endsWith('.' + cookieLower)) return true;

    return false;
  }

  /**
   * Check if request path matches cookie path
   * RFC 6265 path matching
   */
  private pathMatches(requestPath: string, cookiePath: string): boolean {
    // Exact match
    if (requestPath === cookiePath) return true;

    // Request path starts with cookie path
    if (requestPath.startsWith(cookiePath)) {
      // Cookie path ends with /
      if (cookiePath.endsWith('/')) return true;
      // Next char after cookie path is /
      if (requestPath[cookiePath.length] === '/') return true;
    }

    return false;
  }

  /**
   * Get default path for a request path
   * RFC 6265 default-path algorithm
   */
  private defaultPath(requestPath: string): string {
    // If path is empty or doesn't start with /, return /
    if (!requestPath || !requestPath.startsWith('/')) {
      return '/';
    }

    // Find last / in path
    const lastSlash = requestPath.lastIndexOf('/');
    if (lastSlash === 0) {
      return '/';
    }

    return requestPath.substring(0, lastSlash);
  }

  /**
   * Check if a cookie is expired
   */
  private isExpired(cookie: ParsedCookie, now: number): boolean {
    // Max-Age takes precedence
    if (cookie.maxAge !== undefined) {
      // Max-Age=0 means delete immediately
      if (cookie.maxAge <= 0) return true;
      const expiresAt = cookie.createdAt + (cookie.maxAge * 1000);
      return now >= expiresAt;
    }

    // Check Expires
    if (cookie.expires) {
      return now >= cookie.expires.getTime();
    }

    // Session cookie - never expires in memory
    return false;
  }
}
