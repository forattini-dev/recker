import { createClient } from '../../core/client.js';
import { createDNS } from '../../dns/index.js';
import { createWhois } from '../../utils/whois.js';
import { createConnection } from 'net';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { MCPTool, MCPToolResult } from '../types.js';

// Import domain tools
import { checkPropagation } from '../../dns/propagation.js';
import { 
  checkDnsHealth, 
  validateSpf, 
  validateDmarc, 
  checkDkim, 
  dig,
  dnsLookup
} from '../../utils/dns-toolkit.js';
import { inspectTLS } from '../../utils/tls-inspector.js';
import { rdap } from '../../utils/rdap.js';

const execAsync = promisify(exec);
const whoisClient = createWhois();

/**
 * Perform an HTTP request
 */
async function httpRequest(args: Record<string, unknown>): Promise<MCPToolResult> {
  const url = String(args.url || '');
  const method = String(args.method || 'GET').toUpperCase();
  const headers = (args.headers as Record<string, string>) || {};
  const body = args.body as string | object | undefined;
  const timeout = Number(args.timeout) || 10000;
  const retries = Number(args.retries) || 0;
  const headersOnly = Boolean(args.headersOnly);

  if (!url) return { content: [{ type: 'text', text: 'Error: url is required' }], isError: true };

  try {
    const client = createClient({ headers, timeout, retry: { maxAttempts: retries } });
    let response;

    // If headersOnly, use HEAD method
    const effectiveMethod = headersOnly ? 'HEAD' : method;

    switch (effectiveMethod) {
      case 'GET': response = await client.get(url); break;
      case 'POST': response = await client.post(url, { json: body }); break;
      case 'PUT': response = await client.put(url, { json: body }); break;
      case 'DELETE': response = await client.delete(url); break;
      case 'PATCH': response = await client.patch(url, { json: body }); break;
      case 'HEAD': response = await client.head(url); break;
      default: return { content: [{ type: 'text', text: `Error: Unsupported method ${effectiveMethod}` }], isError: true };
    }

    const result: Record<string, unknown> = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    };

    // Only fetch body if not headersOnly and not HEAD method
    if (!headersOnly && effectiveMethod !== 'HEAD') {
      let data: unknown = await response.text();
      try { data = JSON.parse(data as string); } catch {}
      result.data = data;
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `Request failed: ${(error as Error).message}` }], isError: true };
  }
}

/**
 * DNS Lookup (Standard)
 */
async function dnsResolve(args: Record<string, unknown>): Promise<MCPToolResult> {
  const domain = args.domain ? String(args.domain) : '';
  const type = String(args.type || 'A');
  
  if (!domain) return { content: [{ type: 'text', text: 'Error: domain is required' }], isError: true };

  try {
    const results = await dnsLookup(domain, type);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `DNS lookup failed: ${(error as Error).message}` }], isError: true };
  }
}

/**
 * DNS Propagation
 */
async function dnsPropagate(args: Record<string, unknown>): Promise<MCPToolResult> {
  const domain = args.domain ? String(args.domain) : '';
  const type = String(args.type || 'A');
  
  if (!domain) return { content: [{ type: 'text', text: 'Error: domain is required' }], isError: true };

  try {
    const results = await checkPropagation(domain, type);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `Propagation check failed: ${(error as Error).message}` }], isError: true };
  }
}

/**
 * DNS Health
 */
async function dnsHealth(args: Record<string, unknown>): Promise<MCPToolResult> {
  const domain = args.domain ? String(args.domain) : '';
  if (!domain) return { content: [{ type: 'text', text: 'Error: domain is required' }], isError: true };

  try {
    const report = await checkDnsHealth(domain);
    return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `Health check failed: ${(error as Error).message}` }], isError: true };
  }
}

/**
 * SPF Validation
 */
async function dnsSpf(args: Record<string, unknown>): Promise<MCPToolResult> {
  const domain = args.domain ? String(args.domain) : '';
  if (!domain) return { content: [{ type: 'text', text: 'Error: domain is required' }], isError: true };

  try {
    const result = await validateSpf(domain);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `SPF check failed: ${(error as Error).message}` }], isError: true };
  }
}

/**
 * DMARC Validation
 */
async function dnsDmarc(args: Record<string, unknown>): Promise<MCPToolResult> {
  const domain = args.domain ? String(args.domain) : '';
  if (!domain) return { content: [{ type: 'text', text: 'Error: domain is required' }], isError: true };

  try {
    const result = await validateDmarc(domain);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `DMARC check failed: ${(error as Error).message}` }], isError: true };
  }
}

/**
 * DKIM Check
 */
async function dnsDkim(args: Record<string, unknown>): Promise<MCPToolResult> {
  const domain = args.domain ? String(args.domain) : '';
  const selector = String(args.selector || 'default');
  
  if (!domain) return { content: [{ type: 'text', text: 'Error: domain is required' }], isError: true };

  try {
    const result = await checkDkim(domain, selector);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `DKIM check failed: ${(error as Error).message}` }], isError: true };
  }
}

/**
 * Dig (Advanced DNS)
 */
async function dnsDig(args: Record<string, unknown>): Promise<MCPToolResult> {
  const domain = args.domain ? String(args.domain) : '';
  const type = String(args.type || 'A');
  const server = args.server ? String(args.server) : undefined;
  
  if (!domain) return { content: [{ type: 'text', text: 'Error: domain is required' }], isError: true };
  
  try {
    const result = await dig(domain, { type, server });
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `Dig failed: ${(error as Error).message}` }], isError: true };
  }
}

/**
 * TLS Inspector
 */
async function tlsCheck(args: Record<string, unknown>): Promise<MCPToolResult> {
  const host = args.host ? String(args.host) : '';
  const port = Number(args.port) || 443;
  
  if (!host) return { content: [{ type: 'text', text: 'Error: host is required' }], isError: true };

  try {
    const info = await inspectTLS(host, port);
    return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `TLS check failed: ${(error as Error).message}` }], isError: true };
  }
}

/**
 * RDAP Lookup
 */
async function rdapCheck(args: Record<string, unknown>): Promise<MCPToolResult> {
  const domain = args.domain ? String(args.domain) : '';
  if (!domain) return { content: [{ type: 'text', text: 'Error: domain is required' }], isError: true };

  try {
    const client = createClient();
    const result = await rdap(client, domain);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `RDAP lookup failed: ${(error as Error).message}` }], isError: true };
  }
}

/**
 * WHOIS Lookup
 */
async function whoisCheck(args: Record<string, unknown>): Promise<MCPToolResult> {
  const query = args.query ? String(args.query) : '';
  if (!query) return { content: [{ type: 'text', text: 'Error: query is required' }], isError: true };

  try {
    const result = await whoisClient.lookup(query);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `WHOIS failed: ${(error as Error).message}` }], isError: true };
  }
}

/**
 * System DNS Status
 */
async function dnsSystemStatus(args: Record<string, unknown>): Promise<MCPToolResult> {
  const platform = process.platform;
  let cmd = '';
  
  if (platform === 'linux') cmd = 'resolvectl status';
  else if (platform === 'darwin') cmd = 'scutil --dns';
  else if (platform === 'win32') cmd = 'ipconfig /all';
  else return { content: [{ type: 'text', text: 'Unsupported platform' }], isError: true };

  try {
    const { stdout } = await execAsync(cmd);
    return { content: [{ type: 'text', text: stdout }] };
  } catch (error) {
    if (platform === 'linux') {
       try {
         const { stdout } = await execAsync('cat /etc/resolv.conf');
         return { content: [{ type: 'text', text: stdout }] };
       } catch {}
    }
    return { content: [{ type: 'text', text: `Failed to get system DNS: ${(error as Error).message}` }], isError: true };
  }
}

/**
 * Ping
 */
async function pingCheck(args: Record<string, unknown>): Promise<MCPToolResult> {
  const host = args.host ? String(args.host) : '';
  const count = Number(args.count) || 3;
  const port = Number(args.port) || 80;
  const timeout = Number(args.timeout) || 5000;
  
  if (!host) return { content: [{ type: 'text', text: 'Error: host is required' }], isError: true };
  
  const results: any[] = [];
  for (let i = 0; i < count; i++) {
    const start = Date.now();
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = createConnection({ host, port, timeout });
        socket.on('connect', () => { socket.destroy(); resolve(); });
        socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout')); });
        socket.on('error', (e) => { socket.destroy(); reject(e); });
      });
      results.push({ seq: i, time: Date.now() - start });
    } catch (e) {
      results.push({ seq: i, error: (e as Error).message });
    }
    if (i < count - 1) await new Promise(r => setTimeout(r, 200));
  }

  const successful = results.filter(r => !r.error);
  const totalTime = successful.reduce((acc, r) => acc + (r.time || 0), 0);
  const avg = successful.length > 0 ? totalTime / successful.length : 0;
  
  return { content: [{ type: 'text', text: JSON.stringify({
    host,
    port,
    sent: count,
    received: successful.length,
    loss: count > 0 ? ((count - successful.length) / count * 100) : 0,
    avgLatency: avg,
    details: results
  }, null, 2) }] };
}

export const networkTools: MCPTool[] = [
  {
    name: 'rek_http_request',
    description: 'Perform HTTP request. Useful for calling APIs, fetching pages, etc. Use headersOnly=true for lightweight requests that only return status and headers (no body).',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        method: { type: 'string', default: 'GET' },
        headers: { type: 'object' },
        body: { type: 'object' },
        headersOnly: { type: 'boolean', default: false, description: 'Return only status and headers, skip body (uses HEAD method internally)' }
      },
      required: ['url']
    }
  },
  {
    name: 'rek_dns',
    description: 'Resolve DNS records (A, AAAA, MX, TXT, etc) using system resolver.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string' },
        type: { type: 'string', default: 'A' }
      },
      required: ['domain']
    }
  },
  {
    name: 'rek_dns_propagate',
    description: 'Check DNS propagation globally across multiple providers.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string' },
        type: { type: 'string', default: 'A' }
      },
      required: ['domain']
    }
  },
  {
    name: 'rek_dns_health',
    description: 'Perform a comprehensive DNS health check (Parent NS, SOAs, MX, etc).',
    inputSchema: {
      type: 'object',
      properties: { domain: { type: 'string' } },
      required: ['domain']
    }
  },
  {
    name: 'rek_dns_spf',
    description: 'Validate SPF record for a domain.',
    inputSchema: {
      type: 'object',
      properties: { domain: { type: 'string' } },
      required: ['domain']
    }
  },
  {
    name: 'rek_dns_dmarc',
    description: 'Validate DMARC record for a domain.',
    inputSchema: {
      type: 'object',
      properties: { domain: { type: 'string' } },
      required: ['domain']
    }
  },
  {
    name: 'rek_dns_dkim',
    description: 'Check DKIM record presence.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string' },
        selector: { type: 'string', default: 'default' }
      },
      required: ['domain']
    }
  },
  {
    name: 'rek_dns_dig',
    description: 'Advanced DNS lookup (like dig command) supporting specific nameservers.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string' },
        type: { type: 'string', default: 'A' },
        server: { type: 'string', description: 'Optional specific nameserver to query (e.g. 8.8.8.8)' }
      },
      required: ['domain']
    }
  },
  {
    name: 'rek_dns_system',
    description: 'Get system DNS configuration (local resolver status).',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'rek_tls',
    description: 'Inspect TLS/SSL certificate of a host.',
    inputSchema: {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number', default: 443 }
      },
      required: ['host']
    }
  },
  {
    name: 'rek_whois',
    description: 'Query WHOIS database for domain info.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    }
  },
  {
    name: 'rek_rdap',
    description: 'Query RDAP (modern WHOIS) for structured domain info.',
    inputSchema: {
      type: 'object',
      properties: { domain: { type: 'string' } },
      required: ['domain']
    }
  },
  {
    name: 'rek_ping',
    description: 'TCP Ping a host:port to check connectivity.',
    inputSchema: {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number', default: 80 },
        count: { type: 'number', default: 3 },
        timeout: { type: 'number', default: 5000 }
      },
      required: ['host']
    }
  }
];

export const networkToolHandlers: Record<string, (args: Record<string, unknown>) => Promise<MCPToolResult>> = {
  rek_http_request: httpRequest,
  rek_dns: dnsResolve,
  rek_dns_propagate: dnsPropagate,
  rek_dns_health: dnsHealth,
  rek_dns_spf: dnsSpf,
  rek_dns_dmarc: dnsDmarc,
  rek_dns_dkim: dnsDkim,
  rek_dns_dig: dnsDig,
  rek_dns_system: dnsSystemStatus,
  rek_tls: tlsCheck,
  rek_whois: whoisCheck,
  rek_rdap: rdapCheck,
  rek_ping: pingCheck,
};
