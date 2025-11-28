/**
 * Environment Variable Proxy Detection
 * Automatically detects proxy configuration from environment variables
 * Compatible with standard conventions (HTTP_PROXY, HTTPS_PROXY, NO_PROXY)
 */

export interface EnvProxyOptions {
  /**
   * URL to check proxy for
   */
  url?: string;

  /**
   * Override HTTP proxy (instead of env var)
   */
  httpProxy?: string;

  /**
   * Override HTTPS proxy (instead of env var)
   */
  httpsProxy?: string;

  /**
   * Override NO_PROXY list (instead of env var)
   */
  noProxy?: string;
}

/**
 * Get proxy URL from environment variables based on target URL protocol
 *
 * Checks the following environment variables (in order):
 * - For HTTPS: HTTPS_PROXY, https_proxy
 * - For HTTP: HTTP_PROXY, http_proxy
 * - Fallback: ALL_PROXY, all_proxy
 *
 * @param url - Target URL to get proxy for
 * @param options - Optional overrides
 * @returns Proxy URL or undefined if no proxy should be used
 *
 * @example
 * ```typescript
 * // Set environment: HTTP_PROXY=http://proxy:8080
 * const proxy = getProxyForUrl('http://api.example.com');
 * // => 'http://proxy:8080'
 *
 * // HTTPS uses HTTPS_PROXY
 * // Set environment: HTTPS_PROXY=http://secure-proxy:8080
 * const httpsProxy = getProxyForUrl('https://api.example.com');
 * // => 'http://secure-proxy:8080'
 *
 * // NO_PROXY bypasses proxy
 * // Set environment: NO_PROXY=localhost,127.0.0.1,.internal.com
 * const localProxy = getProxyForUrl('http://localhost:3000');
 * // => undefined (bypassed)
 * ```
 */
export function getProxyForUrl(url: string, options: EnvProxyOptions = {}): string | undefined {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return undefined;
  }

  const protocol = parsedUrl.protocol.replace(':', '').toLowerCase();

  // Check if this URL should bypass the proxy
  const noProxy = options.noProxy ?? process.env.NO_PROXY ?? process.env.no_proxy ?? '';
  if (shouldBypassProxy(parsedUrl.hostname, parsedUrl.port, noProxy)) {
    return undefined;
  }

  // Get proxy based on protocol
  let proxy: string | undefined;

  if (protocol === 'https') {
    proxy = options.httpsProxy ??
      process.env.HTTPS_PROXY ??
      process.env.https_proxy ??
      process.env.ALL_PROXY ??
      process.env.all_proxy;
  } else {
    proxy = options.httpProxy ??
      process.env.HTTP_PROXY ??
      process.env.http_proxy ??
      process.env.ALL_PROXY ??
      process.env.all_proxy;
  }

  return proxy || undefined;
}

/**
 * Check if a hostname should bypass the proxy based on NO_PROXY rules
 *
 * NO_PROXY supports:
 * - Exact hostname match: 'localhost'
 * - Domain suffix match: '.example.com' (matches sub.example.com)
 * - Wildcard: '*' (bypass all)
 * - Host:port match: 'localhost:8080'
 * - IP addresses: '127.0.0.1'
 * - CIDR notation: '192.168.0.0/16'
 *
 * @param hostname - Hostname to check
 * @param port - Port to check
 * @param noProxy - NO_PROXY string (comma or space separated)
 */
export function shouldBypassProxy(hostname: string, port: string, noProxy: string): boolean {
  if (!noProxy || noProxy.trim() === '') {
    return false;
  }

  // Normalize hostname to lowercase
  hostname = hostname.toLowerCase();

  // Split NO_PROXY by comma or space
  const rules = noProxy.split(/[\s,]+/).filter(Boolean);

  for (const rule of rules) {
    const normalizedRule = rule.toLowerCase().trim();

    // Wildcard - bypass all
    if (normalizedRule === '*') {
      return true;
    }

    // CIDR notation check
    if (normalizedRule.includes('/') && !normalizedRule.includes(':')) {
      if (matchesCIDR(hostname, normalizedRule)) {
        return true;
      }
      continue;
    }

    // Host:port pattern
    if (normalizedRule.includes(':') && !normalizedRule.startsWith('[')) {
      const [ruleHost, rulePort] = normalizedRule.split(':');
      if (hostname === ruleHost && (!rulePort || port === rulePort)) {
        return true;
      }
      continue;
    }

    // Domain suffix (.example.com)
    if (normalizedRule.startsWith('.')) {
      if (hostname.endsWith(normalizedRule) || hostname === normalizedRule.slice(1)) {
        return true;
      }
      continue;
    }

    // Exact match
    if (hostname === normalizedRule) {
      return true;
    }

    // Also check if rule is a suffix without leading dot
    // e.g., NO_PROXY=example.com should match sub.example.com
    if (hostname.endsWith('.' + normalizedRule)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if an IP address matches a CIDR range
 */
function matchesCIDR(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  if (!bits) return ip === range;

  const mask = parseInt(bits, 10);
  if (isNaN(mask)) return false;

  // Only handle IPv4 for now
  const ipParts = ip.split('.').map(Number);
  const rangeParts = range.split('.').map(Number);

  if (ipParts.length !== 4 || rangeParts.length !== 4) return false;
  if (ipParts.some(isNaN) || rangeParts.some(isNaN)) return false;

  const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const rangeNum = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];
  const maskNum = ~((1 << (32 - mask)) - 1);

  return (ipNum & maskNum) === (rangeNum & maskNum);
}

/**
 * Get all proxy-related environment variables
 * Useful for debugging proxy configuration
 *
 * @returns Object with all proxy environment variables
 */
export function getProxyEnv(): Record<string, string | undefined> {
  return {
    HTTP_PROXY: process.env.HTTP_PROXY,
    http_proxy: process.env.http_proxy,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    https_proxy: process.env.https_proxy,
    ALL_PROXY: process.env.ALL_PROXY,
    all_proxy: process.env.all_proxy,
    NO_PROXY: process.env.NO_PROXY,
    no_proxy: process.env.no_proxy,
  };
}

/**
 * Create proxy configuration object from environment variables
 * Ready to use with Recker client
 *
 * @param url - Target URL to create proxy config for
 * @returns Proxy options object or undefined if no proxy
 *
 * @example
 * ```typescript
 * import { createClient } from 'recker';
 * import { createProxyConfig } from 'recker';
 *
 * const client = createClient({
 *   baseUrl: 'https://api.example.com',
 *   proxy: createProxyConfig('https://api.example.com'),
 * });
 * ```
 */
export function createProxyConfig(url: string): { url: string } | undefined {
  const proxyUrl = getProxyForUrl(url);
  if (!proxyUrl) return undefined;
  return { url: proxyUrl };
}
