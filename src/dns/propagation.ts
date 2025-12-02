import { request } from 'undici';
import pc from '../utils/colors.js';

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
  location?: string; // Placeholder for future GeoIP
}

const PROVIDERS = [
  { id: 'google', name: 'Google DNS', url: 'https://dns.google/resolve' },
  { id: 'cloudflare', name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query' },
  { id: 'quad9', name: 'Quad9', url: 'https://dns.quad9.net:5053/dns-query' },
  { id: 'alidns', name: 'AliDNS (China)', url: 'https://dns.alidns.com/resolve' },
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

// Map numeric ID to string (for results)
const TYPE_ID_MAP: Record<number, string> = Object.entries(TYPE_MAP).reduce((acc, [k, v]) => {
    acc[Number(v)] = k;
    return acc;
}, {} as Record<number, string>);


export async function checkPropagation(domain: string, type: string = 'A'): Promise<PropagationResult[]> {
    const typeId = TYPE_MAP[type.toUpperCase()] || type;

    const queries = PROVIDERS.map(async (provider) => {
        const start = performance.now();
        try {
            const url = new URL(provider.url);
            url.searchParams.set('name', domain);
            url.searchParams.set('type', typeId);
            
            // AliDNS specific: expects 'type' as string name for A/AAAA/etc? 
            // Actually AliDNS supports type=A.
            // Cloudflare/Google support type=1 or type=A.
            // Quad9 JSON endpoint also supports this.
            
            const { body, statusCode } = await request(url, {
                method: 'GET',
                headers: { 'Accept': 'application/dns-json' }
            });

            if (statusCode !== 200) {
                 throw new Error(`HTTP ${statusCode}`);
            }

            const json = await body.json() as any;
            const duration = performance.now() - start;

            // Standard DoH JSON format
            // Status 0 = NoError
            if (json.Status !== 0) {
                // Mapping common DNS status codes
                const statusMap: Record<number, string> = {
                    1: 'FormErr', 2: 'ServFail', 3: 'NXDomain', 4: 'NotImp', 5: 'Refused'
                };
                const errorName = statusMap[json.Status] || `Code ${json.Status}`;
                
                return {
                    id: provider.id,
                    provider: provider.name,
                    status: 'error' as const,
                    records: [],
                    rawRecords: [],
                    latency: duration,
                    error: errorName
                };
            }

            const answers = (json.Answer || []) as DnsRecord[];
            const records = answers.map(r => r.data);

            return {
                id: provider.id,
                provider: provider.name,
                status: 'ok' as const,
                records,
                rawRecords: answers,
                latency: duration
            };

        } catch (err: any) {
            return {
                id: provider.id,
                provider: provider.name,
                status: 'error' as const,
                records: [],
                rawRecords: [],
                latency: performance.now() - start,
                error: err.message
            };
        }
    });

    return Promise.all(queries);
}

export function formatPropagationReport(results: PropagationResult[], domain: string, type: string): string {
    let output = '';
    
    output += `
${pc.bold(pc.cyan('🌍 Global DNS Propagation Check'))}
`;
    output += `${pc.gray('Domain:')} ${pc.white(domain)}  ${pc.gray('Type:')} ${pc.white(type.toUpperCase())}

`;

    // Group by Result Value (to highlight inconsistencies)
    const consensus: Record<string, number> = {};
    
    results.forEach(res => {
        const key = res.status === 'ok' ? res.records.sort().join(', ') : `Error: ${res.error}`;
        consensus[key] = (consensus[key] || 0) + 1;

        const statusIcon = res.status === 'ok' ? pc.green('✔') : pc.red('✖');
        const latencyColor = res.latency < 50 ? pc.green : res.latency < 200 ? pc.yellow : pc.red;
        const latencyText = latencyColor(`${Math.round(res.latency)}ms`.padStart(5));
        const providerName = pc.bold(res.provider.padEnd(15));
        
        let recordsText = '';
        if (res.status === 'ok') {
            if (res.records.length === 0) {
                recordsText = pc.yellow('(No records)');
            } else {
                recordsText = res.records.join(', ');
                if (recordsText.length > 60) recordsText = recordsText.substring(0, 57) + '...';
            }
        } else {
            recordsText = pc.red(res.error || 'Unknown Error');
        }

        output += `  ${statusIcon} ${providerName} ${latencyText}  ${recordsText}
`;
    });

    output += '\n';
    
    // Consensus Analysis
    const distinctAnswers = Object.keys(consensus);
    if (distinctAnswers.length === 1) {
        if (distinctAnswers[0].startsWith('Error')) {
             output += pc.red('❌ All providers returned error.\n');
        } else {
             output += pc.green('✅ All providers returned the same records. Propagation is complete.\n');
        }
    } else if (distinctAnswers.length > 1) {
        output += pc.yellow('⚠  Inconsistent results detected (Propagation in progress or Split-Horizon DNS).\n');
    }

    return output;
}
