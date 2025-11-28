import { Client } from '../core/client.js';

// Common RDAP servers
const RDAP_SERVERS: Record<string, string> = {
  'com': 'https://rdap.verisign.com/com/v1/',
  'net': 'https://rdap.verisign.com/net/v1/',
  'org': 'https://rdap.publicinterestregistry.net/rdap/org/',
  'io': 'https://rdap.nic.io/domain/',
  'br': 'https://rdap.registro.br/',
  // Fallback/Aggregators (use with caution in prod due to rate limits)
  'default': 'https://rdap.org/domain/'
};

export interface RDAPResult {
  handle?: string;
  status?: string[];
  events?: Array<{ eventAction: string; eventDate: string }>;
  entities?: Array<{ handle?: string; roles?: string[]; vcardArray?: any[] }>;
  [key: string]: any;
}

export async function rdap(client: Client, query: string): Promise<RDAPResult> {
  // Detect if IP or Domain
  const isIp = /^\d+\.\d+\.\d+\.\d+$/.test(query); // Simple IPv4 check
  
  let url: string;

  if (isIp) {
    // For IPs, best bet is ARIN or RIPE, they usually redirect to authoritative
    // rdap.arin.net handles redirects well
    url = `https://rdap.arin.net/registry/ip/${query}`;
  } else {
    const tld = query.split('.').pop()?.toLowerCase() || '';
    const base = RDAP_SERVERS[tld] || RDAP_SERVERS['default'];
    // Some servers expect domain/QUERY, others just QUERY if base ends in /
    // Standard is usually base/domain/QUERY
    url = base.endsWith('/') ? `${base}domain/${query}` : `${base}/${query}`;
    
    // Clean up double /domain/ if using specific registry that already includes it
    if (base.includes('/domain/')) {
        url = `${base}${query}`;
    }
  }

  try {
    // RDAP is REST-based JSON
    // Follow redirects is crucial (302/307 is standard in RDAP)
    return await client.get(url, { followRedirects: true }).json<RDAPResult>();
  } catch (error: any) {
    if (error.status === 404) {
      throw new Error(`RDAP entry not found for ${query}`);
    }
    throw error;
  }
}
