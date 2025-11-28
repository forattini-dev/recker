import { lookup } from 'node:dns';
import { promisify } from 'node:util';
import { DNSOptions } from '../types/index.js';

const lookupAsync = promisify(lookup);

/**
 * Custom DNS Lookup Function
 * Handles DNS overrides and custom servers (basic implementation)
 */
export function createLookupFunction(options: DNSOptions) {
  return (hostname: string, opts: any, callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void) => {
    // 1. Check Overrides
    if (options.override && options.override[hostname]) {
      const ip = options.override[hostname];
      // Detect family (simple check)
      const family = ip.includes(':') ? 6 : 4;
      return callback(null, ip, family);
    }

    // 2. Custom Servers (Not fully implemented in Node's lookup without raw dns packet construction or 'dns.setServers' which is global)
    // Node's 'lookup' uses the OS resolver (getaddrinfo). To use custom servers, we'd need 'resolve' instead.
    // But undici expects a 'lookup' signature.
    // For true custom server support, we would need a userland DNS client or use 'dns.resolve' logic mapped to lookup.
    
    // Fallback to system lookup
    lookup(hostname, opts, callback);
  };
}

/**
 * Convenience async lookup that respects overrides and prefers IPv4 when requested.
 * Note: Custom DNS servers are not applied here (Node's lookup uses OS resolver);
 * we gracefully fall back to system resolution.
 */
export async function customDNSLookup(hostname: string, options: DNSOptions = {}): Promise<{ address: string; family: number }> {
  if (options.override && options.override[hostname]) {
    const ip = options.override[hostname];
    const family = ip.includes(':') ? 6 : 4;
    return { address: ip, family };
  }

  const lookupOptions: any = {};
  if (options.preferIPv4) {
    lookupOptions.family = 4;
  }

  const result = await lookupAsync(hostname, lookupOptions) as unknown as { address: string; family: number };
  return { address: result.address, family: result.family };
}
