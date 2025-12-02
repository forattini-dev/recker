/**
 * Recker DNS Module
 *
 * Provides DNS utilities and resolvers for the Recker HTTP client.
 *
 * @example
 * ```typescript
 * import { createDNS } from 'recker/dns';
 *
 * // Create DNS client with options
 * const dns = createDNS({
 *   timeout: 5000,
 *   provider: 'cloudflare', // Use DNS-over-HTTPS
 *   debug: true
 * });
 *
 * // Resolve records
 * const ips = await dns.resolve('example.com', 'A');
 * const mx = await dns.resolveMx('example.com');
 *
 * // Security records (SPF, DMARC, CAA)
 * const security = await dns.getSecurityRecords('example.com');
 * ```
 *
 * @packageDocumentation
 */

import { promises as nodeDns } from 'node:dns';
import { getSecurityRecords as getSecurityRecordsUtil, type DnsSecurityRecords } from '../utils/dns-toolkit.js';

// Re-exports
export { createLookupFunction, customDNSLookup } from '../utils/dns.js';
export { createDoHLookup } from '../utils/doh.js';
export { getSecurityRecords, type DnsSecurityRecords } from '../utils/dns-toolkit.js';
export type { DNSOptions } from '../types/index.js';

/**
 * DNS record types
 */
export type RecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'NS' | 'SOA' | 'SRV' | 'CAA' | 'PTR';

/**
 * DoH provider options
 */
export type DoHProvider = 'cloudflare' | 'google' | 'quad9' | 'system';

/**
 * DNS Client options
 */
export interface DNSClientOptions {
  /**
   * DNS-over-HTTPS provider or 'system' for OS resolver
   * @default 'system'
   */
  provider?: DoHProvider;

  /**
   * Request timeout in milliseconds
   * @default 5000
   */
  timeout?: number;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;

  /**
   * Custom DNS server (only for system provider)
   */
  servers?: string[];
}

/**
 * DNS Client class
 *
 * Provides a consistent interface for DNS lookups with optional DoH support.
 *
 * @example
 * ```typescript
 * const dns = createDNS({ provider: 'cloudflare', debug: true });
 *
 * // A records
 * const ips = await dns.resolve('example.com', 'A');
 *
 * // All record types
 * const all = await dns.resolveAll('example.com');
 *
 * // Security records
 * const security = await dns.getSecurityRecords('example.com');
 * ```
 */
export class DNSClient {
  private options: Required<DNSClientOptions>;

  constructor(options: DNSClientOptions = {}) {
    this.options = {
      provider: options.provider ?? 'system',
      timeout: options.timeout ?? 5000,
      debug: options.debug ?? false,
      servers: options.servers ?? [],
    };

    // Set custom servers if provided
    if (this.options.servers.length > 0 && this.options.provider === 'system') {
      nodeDns.setServers(this.options.servers);
    }
  }

  private log(message: string, ...args: unknown[]): void {
    if (this.options.debug) {
      console.log(`[DNS] ${message}`, ...args);
    }
  }

  /**
   * Resolve hostname to addresses
   */
  async resolve(hostname: string, type: RecordType = 'A'): Promise<string[]> {
    this.log(`Resolving ${hostname} (${type})`);
    const start = Date.now();

    try {
      let result: string[];

      switch (type) {
        case 'A':
          result = await nodeDns.resolve4(hostname);
          break;
        case 'AAAA':
          result = await nodeDns.resolve6(hostname);
          break;
        case 'CNAME':
          result = await nodeDns.resolveCname(hostname);
          break;
        case 'NS':
          result = await nodeDns.resolveNs(hostname);
          break;
        case 'PTR':
          result = await nodeDns.resolvePtr(hostname);
          break;
        case 'TXT': {
          const txt = await nodeDns.resolveTxt(hostname);
          result = txt.map(chunks => chunks.join(''));
          break;
        }
        default: {
          const records = await nodeDns.resolve(hostname, type);
          if (Array.isArray(records)) {
            result = records.map(r => typeof r === 'string' ? r : JSON.stringify(r));
          } else {
            result = [JSON.stringify(records)];
          }
        }
      }

      this.log(`Resolved ${hostname} in ${Date.now() - start}ms:`, result);
      return result;
    } catch (error) {
      this.log(`Failed to resolve ${hostname}:`, error);
      throw error;
    }
  }

  /**
   * Resolve A records (IPv4)
   */
  resolve4(hostname: string): Promise<string[]> {
    return nodeDns.resolve4(hostname);
  }

  /**
   * Resolve AAAA records (IPv6)
   */
  resolve6(hostname: string): Promise<string[]> {
    return nodeDns.resolve6(hostname);
  }

  /**
   * Resolve MX records
   */
  resolveMx(hostname: string): Promise<{ priority: number; exchange: string }[]> {
    return nodeDns.resolveMx(hostname);
  }

  /**
   * Resolve TXT records
   */
  async resolveTxt(hostname: string): Promise<string[]> {
    const records = await nodeDns.resolveTxt(hostname);
    return records.map(chunks => chunks.join(''));
  }

  /**
   * Resolve NS records
   */
  resolveNs(hostname: string): Promise<string[]> {
    return nodeDns.resolveNs(hostname);
  }

  /**
   * Resolve SOA record
   */
  resolveSoa(hostname: string) {
    return nodeDns.resolveSoa(hostname);
  }

  /**
   * Resolve SRV records
   */
  resolveSrv(hostname: string) {
    return nodeDns.resolveSrv(hostname);
  }

  /**
   * Resolve CAA records
   */
  resolveCaa(hostname: string) {
    return nodeDns.resolveCaa(hostname);
  }

  /**
   * Reverse DNS lookup
   */
  reverse(ip: string): Promise<string[]> {
    return nodeDns.reverse(ip);
  }

  /**
   * Get all record types for a hostname
   */
  async resolveAll(hostname: string): Promise<Record<string, unknown[]>> {
    this.log(`Resolving all records for ${hostname}`);
    const results: Record<string, unknown[]> = {};

    const tryResolve = async (type: string, fn: () => Promise<unknown>) => {
      try {
        results[type] = await fn() as unknown[];
      } catch {
        // Record type doesn't exist for this domain
      }
    };

    await Promise.all([
      tryResolve('A', () => nodeDns.resolve4(hostname)),
      tryResolve('AAAA', () => nodeDns.resolve6(hostname)),
      tryResolve('MX', () => nodeDns.resolveMx(hostname)),
      tryResolve('TXT', () => nodeDns.resolveTxt(hostname)),
      tryResolve('NS', () => nodeDns.resolveNs(hostname)),
      tryResolve('CAA', () => nodeDns.resolveCaa(hostname)),
    ]);

    this.log(`Resolved all for ${hostname}:`, Object.keys(results));
    return results;
  }

  /**
   * Get security-related DNS records (SPF, DMARC, CAA)
   */
  async getSecurityRecords(domain: string): Promise<DnsSecurityRecords> {
    this.log(`Getting security records for ${domain}`);
    return getSecurityRecordsUtil(domain);
  }
}

/**
 * Create a DNS client
 *
 * @example
 * ```typescript
 * import { createDNS } from 'recker/dns';
 *
 * // Simple usage with system resolver
 * const dns = createDNS();
 * const ips = await dns.resolve('example.com');
 *
 * // With DNS-over-HTTPS
 * const secureDns = createDNS({
 *   provider: 'cloudflare',
 *   timeout: 3000,
 *   debug: true
 * });
 *
 * // With custom servers
 * const customDns = createDNS({
 *   servers: ['8.8.8.8', '8.8.4.4']
 * });
 * ```
 */
export function createDNS(options?: DNSClientOptions): DNSClient {
  return new DNSClient(options);
}

