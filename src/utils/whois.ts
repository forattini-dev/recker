/**
 * WHOIS lookup utility
 * Queries WHOIS servers for domain and IP information
 */

import { createConnection, Socket } from 'net';
import { ReckerError } from '../core/errors.js';

export interface WhoisOptions {
  /**
   * Custom WHOIS server to query
   * If not provided, uses default servers based on TLD
   */
  server?: string;

  /**
   * Port to connect to (default: 43)
   */
  port?: number;

  /**
   * Connection timeout in milliseconds
   * @default 10000
   */
  timeout?: number;

  /**
   * Follow referrals to other WHOIS servers
   * @default true
   */
  follow?: boolean;
}

export interface WhoisResult {
  /**
   * Raw WHOIS response text
   */
  raw: string;

  /**
   * Query that was performed
   */
  query: string;

  /**
   * Server that was queried
   */
  server: string;

  /**
   * Parsed key-value pairs from response
   */
  data: Record<string, string | string[]>;
}

/**
 * Default WHOIS servers for common TLDs
 */
const DEFAULT_SERVERS: Record<string, string> = {
  'com': 'whois.verisign-grs.com',
  'net': 'whois.verisign-grs.com',
  'org': 'whois.pir.org',
  'info': 'whois.afilias.net',
  'biz': 'whois.biz',
  'us': 'whois.nic.us',
  'uk': 'whois.nic.uk',
  'ca': 'whois.cira.ca',
  'de': 'whois.denic.de',
  'fr': 'whois.afnic.fr',
  'au': 'whois.aunic.net',
  'jp': 'whois.jprs.jp',
  'cn': 'whois.cnnic.cn',
  'ru': 'whois.tcinet.ru',
  'br': 'whois.registro.br',
  'eu': 'whois.eu',
  'io': 'whois.nic.io',
  'co': 'whois.nic.co',
  'me': 'whois.nic.me',
  'tv': 'whois.nic.tv',
  'cc': 'whois.nic.cc',
  'ws': 'whois.website.ws',
  'mobi': 'whois.dotmobiregistry.net',
  'asia': 'whois.nic.asia',
  'tel': 'whois.nic.tel',
  'pro': 'whois.registrypro.pro',
  'aero': 'whois.aero',
  'cat': 'whois.cat',
  'coop': 'whois.nic.coop',
  'jobs': 'whois.nic.jobs',
  'museum': 'whois.museum',
  'travel': 'whois.nic.travel',
  'xxx': 'whois.nic.xxx',
  'app': 'whois.nic.google',
  'dev': 'whois.nic.google',
  'ai': 'whois.nic.ai',
};

/**
 * Extract TLD from domain name
 */
function extractTLD(domain: string): string {
  const parts = domain.toLowerCase().split('.');
  return parts[parts.length - 1];
}

/**
 * Get appropriate WHOIS server for domain or IP
 */
function getWhoisServer(query: string, customServer?: string): string {
  if (customServer) {
    return customServer;
  }

  // Check if it's an IP address
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

  if (ipv4Pattern.test(query) || ipv6Pattern.test(query)) {
    return 'whois.arin.net'; // ARIN for IP lookups
  }

  // Extract TLD and find server
  const tld = extractTLD(query);
  return DEFAULT_SERVERS[tld] || 'whois.iana.org';
}

/**
 * Parse WHOIS response into key-value pairs
 */
function parseWhoisData(raw: string): Record<string, string | string[]> {
  const data: Record<string, string | string[]> = {};
  const lines = raw.split('\n');

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('%') || line.startsWith('#') || !line.trim()) {
      continue;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }

    const key = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();

    if (!key || !value) {
      continue;
    }

    // Handle multiple values for same key
    if (data[key]) {
      if (Array.isArray(data[key])) {
        (data[key] as string[]).push(value);
      } else {
        data[key] = [data[key] as string, value];
      }
    } else {
      data[key] = value;
    }
  }

  return data;
}

/**
 * Extract referral server from WHOIS response
 */
function extractReferralServer(raw: string): string | null {
  const lines = raw.toLowerCase().split('\n');

  for (const line of lines) {
    if (line.includes('whois server:') || line.includes('referral url:')) {
      const match = line.match(/whois\.[\w.-]+/);
      if (match) {
        return match[0];
      }
    }
  }

  return null;
}

/**
 * Query WHOIS server
 */
async function queryWhoisServer(
  server: string,
  query: string,
  port: number,
  timeout: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    let response = '';
    let socket: Socket | null = null;

    const timeoutId = setTimeout(() => {
      socket?.destroy();
      reject(new ReckerError(
        `WHOIS query timed out after ${timeout}ms`,
        undefined,
        undefined,
        [
          'Increase the WHOIS timeout for slower registries.',
          'Check network connectivity to the WHOIS server.',
          'Retry the query; some registries respond slowly under load.'
        ]
      ));
    }, timeout);

    socket = createConnection({ host: server, port }, () => {
      socket!.write(query + '\r\n');
    });

    socket.on('data', (chunk) => {
      response += chunk.toString('utf-8');
    });

    socket.on('end', () => {
      clearTimeout(timeoutId);
      resolve(response);
    });

    socket.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timeoutId);
      const errorDetail = error.message || error.code || 'Connection failed';
      const err = new ReckerError(
        `WHOIS query failed: ${errorDetail}`,
        undefined,
        undefined,
        [
          'Verify the WHOIS server is reachable and correct.',
          'Check network/firewall settings blocking WHOIS port 43.',
          'Retry the query; transient network issues can occur.'
        ]
      );
      (err as any).code = error.code;
      reject(err);
    });

    socket.on('close', (hadError) => {
      clearTimeout(timeoutId);
      if (hadError && !response) {
        const err = new ReckerError(
          'WHOIS connection closed unexpectedly',
          undefined,
          undefined,
          [
            'The WHOIS server may be rate limiting requests.',
            'Try again in a few seconds.',
            'Some TLDs have unreliable WHOIS servers.'
          ]
        );
        (err as any).code = 'ECONNRESET';
        reject(err);
      }
    });
  });
}

/**
 * Perform WHOIS lookup
 */
export async function whois(
  query: string,
  options: WhoisOptions = {}
): Promise<WhoisResult> {
  const {
    server: customServer,
    port = 43,
    timeout = 10000,
    follow = true,
  } = options;

  // Clean up query
  const cleanQuery = query.trim().toLowerCase();

  // Get appropriate server
  let server = getWhoisServer(cleanQuery, customServer);

  // Query WHOIS server
  let raw = await queryWhoisServer(server, cleanQuery, port, timeout);

  // Follow referrals if enabled
  if (follow && !customServer) {
    const referralServer = extractReferralServer(raw);
    if (referralServer && referralServer !== server) {
      server = referralServer;
      raw = await queryWhoisServer(server, cleanQuery, port, timeout);
    }
  }

  // Parse response
  const data = parseWhoisData(raw);

  return {
    raw,
    query: cleanQuery,
    server,
    data,
  };
}

/**
 * Check if a domain is available (not registered)
 * Note: This is a best-effort check based on WHOIS response
 */
export async function isDomainAvailable(
  domain: string,
  options?: WhoisOptions
): Promise<boolean> {
  try {
    const result = await whois(domain, options);
    const rawLower = result.raw.toLowerCase();

    // Common indicators that domain is not registered
    const notFoundIndicators = [
      'no match',
      'not found',
      'no entries found',
      'no data found',
      'status: available',
      'status: free',
    ];

    return notFoundIndicators.some(indicator => rawLower.includes(indicator));
  } catch (error) {
    // If query fails, assume domain is not available
    return false;
  }
}

// ============================================================================
// WHOIS Client Class
// ============================================================================

/**
 * WHOIS Client options
 */
export interface WhoisClientOptions {
  /**
   * Default WHOIS server to use
   */
  server?: string;

  /**
   * Default port
   * @default 43
   */
  port?: number;

  /**
   * Default timeout in milliseconds
   * @default 10000
   */
  timeout?: number;

  /**
   * Follow referrals to other WHOIS servers
   * @default true
   */
  follow?: boolean;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
}

/**
 * WHOIS Client class
 *
 * Provides a consistent interface for WHOIS lookups.
 *
 * @example
 * ```typescript
 * const whoisClient = createWhois({ timeout: 15000, debug: true });
 *
 * // Domain lookup
 * const result = await whoisClient.lookup('example.com');
 * console.log(result.data);
 *
 * // IP lookup
 * const ipResult = await whoisClient.lookup('8.8.8.8');
 *
 * // Check availability
 * const available = await whoisClient.isAvailable('my-new-domain.com');
 * ```
 */
export class WhoisClient {
  private options: Required<WhoisClientOptions>;

  constructor(options: WhoisClientOptions = {}) {
    this.options = {
      server: options.server ?? '',
      port: options.port ?? 43,
      timeout: options.timeout ?? 10000,
      follow: options.follow ?? true,
      debug: options.debug ?? false,
    };
  }

  private log(message: string, ...args: unknown[]): void {
    if (this.options.debug) {
      console.log(`[WHOIS] ${message}`, ...args);
    }
  }

  /**
   * Perform WHOIS lookup for domain or IP
   */
  async lookup(query: string, options?: WhoisOptions): Promise<WhoisResult> {
    this.log(`Looking up: ${query}`);
    const start = Date.now();

    const result = await whois(query, {
      server: options?.server ?? (this.options.server || undefined),
      port: options?.port ?? this.options.port,
      timeout: options?.timeout ?? this.options.timeout,
      follow: options?.follow ?? this.options.follow,
    });

    this.log(`Lookup completed in ${Date.now() - start}ms from ${result.server}`);
    return result;
  }

  /**
   * Check if a domain is available
   */
  async isAvailable(domain: string): Promise<boolean> {
    this.log(`Checking availability: ${domain}`);
    return isDomainAvailable(domain, {
      server: this.options.server || undefined,
      port: this.options.port,
      timeout: this.options.timeout,
      follow: this.options.follow,
    });
  }

  /**
   * Get registrar info for a domain
   */
  async getRegistrar(domain: string): Promise<string | null> {
    const result = await this.lookup(domain);
    return (result.data['registrar'] as string) ||
           (result.data['sponsoring registrar'] as string) ||
           null;
  }

  /**
   * Get expiration date for a domain
   */
  async getExpiration(domain: string): Promise<Date | null> {
    const result = await this.lookup(domain);
    const expiry = result.data['registry expiry date'] as string ||
                   result.data['expiration date'] as string ||
                   result.data['expiry date'] as string;

    if (expiry) {
      const date = new Date(expiry);
      return isNaN(date.getTime()) ? null : date;
    }
    return null;
  }

  /**
   * Get name servers for a domain
   */
  async getNameServers(domain: string): Promise<string[]> {
    const result = await this.lookup(domain);
    const ns = result.data['name server'] || result.data['nserver'] || [];
    return Array.isArray(ns) ? ns : [ns];
  }
}

/**
 * Create a WHOIS client
 *
 * @example
 * ```typescript
 * import { createWhois } from 'recker';
 *
 * const whois = createWhois({
 *   timeout: 15000,
 *   debug: true
 * });
 *
 * const result = await whois.lookup('example.com');
 * console.log(result.data);
 *
 * const available = await whois.isAvailable('my-domain.com');
 * ```
 */
export function createWhois(options?: WhoisClientOptions): WhoisClient {
  return new WhoisClient(options);
}
