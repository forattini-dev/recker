import { Client } from '../core/client.js';
import { NotFoundError, UnsupportedError } from '../core/errors.js';

// IANA Bootstrap file URL
const IANA_RDAP_BOOTSTRAP = 'https://data.iana.org/rdap/dns.json';

// Cache for IANA bootstrap data
let ianaBootstrapCache: Map<string, string> | null = null;
let ianaBootstrapLastFetch = 0;
const IANA_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Known RDAP servers (fallback if IANA bootstrap fails)
const RDAP_SERVERS: Record<string, string> = {
  'com': 'https://rdap.verisign.com/com/v1/',
  'net': 'https://rdap.verisign.com/net/v1/',
  'org': 'https://rdap.publicinterestregistry.net/rdap/org/',
  'br': 'https://rdap.registro.br/',
  'dev': 'https://rdap.nic.google/',
  'app': 'https://rdap.nic.google/',
  'xyz': 'https://rdap.centralnic.com/xyz/',
  'info': 'https://rdap.afilias.net/rdap/info/',
  'me': 'https://rdap.nic.me/',
  'co': 'https://rdap.nic.co/',
  'uk': 'https://rdap.nominet.uk/uk/',
  'de': 'https://rdap.denic.de/',
  'eu': 'https://rdap.eurid.eu/',
  'nl': 'https://rdap.sidn.nl/',
  'au': 'https://rdap.auda.org.au/',
  // Note: Some TLDs like .io do NOT support RDAP
};

// TLDs known to NOT support RDAP (use WHOIS instead)
const NO_RDAP_TLDS = new Set([
  'io', 'ai', 'gg', 'im', 'je', 'sh', 'ac', 'cx', 'gs', 'ms', 'nf', 'pn', 'tc', 'vg',
  // Many ccTLDs don't support RDAP yet
]);

export interface RDAPResult {
  handle?: string;
  ldhName?: string;
  status?: string[];
  events?: Array<{ eventAction: string; eventDate: string }>;
  entities?: Array<{ handle?: string; roles?: string[]; vcardArray?: any[] }>;
  nameservers?: Array<{ ldhName: string }>;
  secureDNS?: { delegationSigned: boolean };
  [key: string]: any;
}

interface IANABootstrap {
  version: string;
  services: Array<[string[], string[]]>;
}

/**
 * Fetch and cache IANA RDAP bootstrap data
 */
async function getIANABootstrap(client: Client): Promise<Map<string, string>> {
  const now = Date.now();

  // Return cached data if fresh
  if (ianaBootstrapCache && (now - ianaBootstrapLastFetch) < IANA_CACHE_TTL) {
    return ianaBootstrapCache;
  }

  try {
    const data = await client.get(IANA_RDAP_BOOTSTRAP, { timeout: 5000 }).json<IANABootstrap>();
    const map = new Map<string, string>();

    for (const [tlds, servers] of data.services) {
      const server = servers[0]; // Use first server
      for (const tld of tlds) {
        map.set(tld.toLowerCase(), server);
      }
    }

    ianaBootstrapCache = map;
    ianaBootstrapLastFetch = now;
    return map;
  } catch {
    // Return empty map on failure, will fall back to hardcoded servers
    return new Map();
  }
}

/**
 * Get RDAP server URL for a TLD
 */
async function getRDAPServer(client: Client, tld: string): Promise<string | null> {
  // Check if TLD is known to not support RDAP
  if (NO_RDAP_TLDS.has(tld)) {
    return null;
  }

  // Try hardcoded servers first (faster)
  if (RDAP_SERVERS[tld]) {
    return RDAP_SERVERS[tld];
  }

  // Try IANA bootstrap
  const bootstrap = await getIANABootstrap(client);
  if (bootstrap.has(tld)) {
    return bootstrap.get(tld)!;
  }

  return null;
}

/**
 * Perform RDAP lookup for a domain or IP address.
 *
 * @param client - Recker client instance
 * @param query - Domain name or IP address
 * @returns RDAP result object
 * @throws UnsupportedError if TLD doesn't support RDAP
 * @throws NotFoundError if domain/IP not found
 *
 * @example
 * ```ts
 * const result = await rdap(client, 'google.com');
 * console.log(result.status); // ['active']
 * ```
 */
export async function rdap(client: Client, query: string): Promise<RDAPResult> {
  // Detect if IP or Domain
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(query) || query.includes(':'); // IPv4 or IPv6

  let url: string;

  if (isIp) {
    // For IPs, ARIN handles redirects well for all regions
    url = `https://rdap.arin.net/registry/ip/${query}`;
  } else {
    const tld = query.split('.').pop()?.toLowerCase() || '';

    // Check if TLD supports RDAP
    const server = await getRDAPServer(client, tld);

    if (!server) {
      throw new UnsupportedError(
        `RDAP is not available for .${tld} domains. Use WHOIS instead: "rek whois ${query}"`,
        { feature: `rdap-${tld}` }
      );
    }

    // Build URL - most servers follow the pattern: base/domain/query
    const base = server.endsWith('/') ? server : `${server}/`;
    url = `${base}domain/${query}`;
  }

  try {
    // RDAP is REST-based JSON
    // Follow redirects is crucial (302/307 is standard in RDAP)
    const result = await client.get(url, {
      followRedirects: true,
      timeout: 10000,
      headers: {
        'Accept': 'application/rdap+json, application/json',
      }
    }).json<RDAPResult>();

    return result;
  } catch (error: any) {
    if (error.status === 404) {
      throw new NotFoundError(`RDAP entry not found for ${query}`, {
        resource: query,
      });
    }
    throw error;
  }
}

/**
 * Check if a TLD supports RDAP
 */
export function supportsRDAP(tld: string): boolean {
  const normalizedTld = tld.toLowerCase().replace(/^\./, '');
  return !NO_RDAP_TLDS.has(normalizedTld);
}

/**
 * Get list of TLDs known to not support RDAP
 */
export function getNoRDAPTLDs(): string[] {
  return Array.from(NO_RDAP_TLDS);
}
