import { Client } from '../core/client.js'; // Import Recker Client
import pc from '../utils/colors.js';
import { ProtocolError, ParseError } from '../core/errors.js';

export interface DnsRecord {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

export interface PropagationResult {
  id: string;
  provider: string;
  status: 'ok' | 'error';
  records: string[]; // Just the data (IPs)
  rawRecords: DnsRecord[];
  latency: number;
  error?: string;
  location?: string;
  minTTL?: number; // Added minTTL
}

// Only providers that reliably support application/dns-json
const PROVIDERS = [
  { id: 'google', name: 'Google DNS', url: 'https://dns.google/resolve', location: 'Global' },
  { id: 'cloudflare', name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query', location: 'Global' },
  { id: 'nextdns', name: 'NextDNS', url: 'https://dns.nextdns.io/dns-query', location: 'Global' },
  // Control D (freedns.controld.com) does not reliably return application/dns-json
];

// Map common types to ID
const TYPE_MAP: Record<string, string> = {
  'A': '1',
  'AAAA': '28',
  'CNAME': '5',
  'MX': '15',
  'NS': '2',
  'TXT': '16',
  'PTR': '12',
  'SRV': '33',
  'SOA': '6',
  'CAA': '257'
};

// Map numeric ID to string (for display)
const TYPE_ID_MAP: Record<number, string> = Object.entries(TYPE_MAP).reduce((acc, [k, v]) => {
  acc[Number(v)] = k;
  return acc;
}, {} as Record<number, string>);

// DNS RCODE status mapping
const DNS_STATUS_MAP: Record<number, string> = {
  0: 'NoError',
  1: 'FormErr',
  2: 'ServFail',
  3: 'NXDomain',
  4: 'NotImp',
  5: 'Refused',
  6: 'YXDomain',
  7: 'YXRRSet',
  8: 'NXRRSet',
  9: 'NotAuth',
  10: 'NotZone'
};

/**
 * Get human-readable record type name
 */
export function getTypeName(typeId: number): string {
  return TYPE_ID_MAP[typeId] || `TYPE${typeId}`;
}

export async function checkPropagation(domainInput: string, type: string = 'A'): Promise<PropagationResult[]> {
  // Sanitize input: remove protocol, path, query
  const domain = domainInput.replace(/^https?:\/\//, '').split('/')[0].split('?')[0];
  
  const typeId = TYPE_MAP[type.toUpperCase()] || type;

  // Create a single Recker client to reuse connections across providers
  // This client will handle redirects, timeouts, etc.
  const client = new Client({
    baseUrl: 'http://localhost', // Dummy base URL as we use absolute URLs in client.get()
    http2: true, // Prefer HTTP/2 for DoH for faster multiplexing if supported
    timeout: 5000, // 5 second timeout for each provider request
  });

  const queries = PROVIDERS.map(async (provider) => {
    const start = performance.now();
    
    try {
      const url = new URL(provider.url);
      url.searchParams.set('name', domain);
      url.searchParams.set('type', typeId);

      // Use Recker client's get method
      const json = await client.get(url.toString(), {
        headers: { 'Accept': 'application/dns-json' }
      }).json<any>(); // Recker Client automatically checks status and content-type for .json()

      const duration = performance.now() - start;

      return processJsonResponse(json, provider, duration);

    } catch (err: any) {
      const duration = performance.now() - start;
      
      let errorMessage: string;
      if (err.name === 'TimeoutError' || err.name === 'AbortError' || err.code === 'UND_ERR_ABORTED') {
        errorMessage = `Timeout (>${(client as any).defaultTimeout || 5000}ms)`; // Access defaultTimeout
      } else if (err.name === 'HttpError') {
        errorMessage = `HTTP ${err.status} ${err.statusText}`;
      } else if (err.name === 'NetworkError') {
        errorMessage = `Network error: ${err.code || err.message}`;
      } else if (err.name === 'ParseError') {
        errorMessage = `Parse error: ${err.message}`;
      } else {
        errorMessage = err.message || 'Unknown error';
      }

      return {
        id: provider.id,
        provider: provider.name,
        status: 'error' as const,
        records: [],
        rawRecords: [],
        latency: duration,
        error: errorMessage,
        location: provider.location
      };
    }
  });

  return Promise.all(queries);
}

/**
 * Process DoH JSON response
 */
function processJsonResponse(
  json: any,
  provider: { id: string; name: string; location: string },
  duration: number
): PropagationResult {
  // Standard DoH JSON format - Status 0 = NoError
  if (json.Status !== 0) {
    const errorName = DNS_STATUS_MAP[json.Status] || `Code ${json.Status}`;
    return {
      id: provider.id,
      provider: provider.name,
      status: 'error' as const,
      records: [],
      rawRecords: [],
      latency: duration,
      error: errorName,
      location: provider.location
    };
  }

  const answers = (json.Answer || []) as DnsRecord[];
  const records = answers.map(r => r.data);
  const minTTL = answers.length ? Math.min(...answers.map(r => r.TTL)) : undefined; // Calculate minTTL

  return {
    id: provider.id,
    provider: provider.name,
    status: 'ok' as const,
    records,
    rawRecords: answers,
    latency: duration,
    location: provider.location,
    minTTL // Include minTTL
  };
}

export function formatPropagationReport(results: PropagationResult[], domain: string, type: string): string {
  let output = '';

  // Sanitize display domain
  const displayDomain = domain.replace(/^https?:\/\//, '').split('/')[0];

  output += `\n${pc.bold(pc.cyan('🌍 Global DNS Propagation Check'))}\n`;
  output += `${pc.gray('Domain:')} ${pc.white(displayDomain)}  ${pc.gray('Type:')} ${pc.white(type.toUpperCase())}\n\n`;

  // Group by Result Value (to highlight inconsistencies)
  const consensus: Record<string, number> = {};

  results.forEach(res => {
    const key = res.status === 'ok' ? res.records.sort().join(', ') : `Error: ${res.error}`;
    consensus[key] = (consensus[key] || 0) + 1;

    const statusIcon = res.status === 'ok' ? pc.green('✔') : pc.red('✖');
    const latencyColor = res.latency < 50 ? pc.green : res.latency < 200 ? pc.yellow : pc.red;
    const latencyText = latencyColor(`${Math.round(res.latency)}ms`.padStart(6));
    const providerName = pc.bold(res.provider.padEnd(12));
    
    // TTL Display
    const ttlText = res.minTTL !== undefined ? pc.gray(`[TTL ${res.minTTL}s]`) : '';

    let recordsText = '';
    if (res.status === 'ok') {
      if (res.records.length === 0) {
        recordsText = pc.yellow('(No records)');
      } else {
        recordsText = res.records.join(', ');
        if (recordsText.length > 50) recordsText = recordsText.substring(0, 47) + '...'; // Truncate to fit
      }
    } else {
      recordsText = pc.red(res.error || 'Unknown Error');
    }

    output += `  ${statusIcon} ${providerName} ${latencyText}  ${recordsText} ${ttlText}\n`;
  });

  output += '\n';

  // Consensus Analysis
  const okResults = results.filter(r => r.status === 'ok');
  const errorResults = results.filter(r => r.status === 'error');
  const distinctAnswers = Object.keys(consensus);

  if (errorResults.length === results.length) {
    output += pc.red('❌ All providers returned errors.\n');
  } else if (okResults.length === results.length && distinctAnswers.length === 1) {
    output += pc.green('✅ All providers agree. Propagation is complete.\n');
  } else if (distinctAnswers.length > 1) {
    if (errorResults.length > 0) {
      output += pc.yellow(`⚠  ${okResults.length}/${results.length} providers responded. Some errors occurred.\n`);
    } else {
      output += pc.yellow('⚠  Inconsistent results (propagation in progress or split-horizon DNS).\n');
    }
  }

  return output;
}
