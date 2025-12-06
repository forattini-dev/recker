import { createClient } from '../../core/client.js';
import { createDNS } from '../../dns/index.js';
import { createWhois } from '../../utils/whois.js';
import { createConnection } from 'net';
import type { MCPTool, MCPToolResult } from '../types.js';

// Initialize shared clients
const dnsClient = createDNS({ provider: 'system' });
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

  if (!url) {
    return {
      content: [{ type: 'text', text: 'Error: url is required' }],
      isError: true,
    };
  }

  try {
    const client = createClient({
      headers,
      timeout,
      retry: {
        maxAttempts: retries,
      },
    });

    let response;
    switch (method) {
      case 'GET':
        response = await client.get(url);
        break;
      case 'POST':
        response = await client.post(url, { json: body });
        break;
      case 'PUT':
        response = await client.put(url, { json: body });
        break;
      case 'DELETE':
        response = await client.delete(url);
        break;
      case 'PATCH':
        response = await client.patch(url, { json: body });
        break;
      case 'HEAD':
        response = await client.head(url);
        break;
      default:
        return {
          content: [{ type: 'text', text: `Error: Unsupported method ${method}` }],
          isError: true,
        };
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    const result = {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      data: await response.text(),
    };

    // Try to parse JSON data for better readability
    try {
      result.data = JSON.parse(result.data);
    } catch {
      // Keep as text
    }

    return {
      content: [{ 
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{ 
        type: 'text',
        text: `Request failed: ${(error as Error).message}`,
      }],
      isError: true,
    };
  }
}

/**
 * Perform a DNS lookup
 */
async function dnsLookup(args: Record<string, unknown>): Promise<MCPToolResult> {
  const domain = String(args.domain || '');
  const type = String(args.type || 'A').toUpperCase();

  if (!domain) {
    return {
      content: [{ type: 'text', text: 'Error: domain is required' }],
      isError: true,
    };
  }

  try {
    let result;
    if (type === 'ALL') {
      result = await dnsClient.resolveAll(domain);
    } else {
      result = await dnsClient.resolve(domain, type as any);
    }

    return {
      content: [{ 
        type: 'text',
        text: JSON.stringify({ domain, type, result }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{ 
        type: 'text',
        text: `DNS lookup failed: ${(error as Error).message}`,
      }],
      isError: true,
    };
  }
}

/**
 * Perform a WHOIS lookup
 */
async function whoisLookup(args: Record<string, unknown>): Promise<MCPToolResult> {
  const query = String(args.query || '');

  if (!query) {
    return {
      content: [{ type: 'text', text: 'Error: query is required' }],
      isError: true,
    };
  }

  try {
    const result = await whoisClient.lookup(query);
    return {
      content: [{ 
        type: 'text',
        text: JSON.stringify({
          server: result.server,
          data: result.data,
        }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{ 
        type: 'text',
        text: `WHOIS lookup failed: ${(error as Error).message}`,
      }],
      isError: true,
    };
  }
}

/**
 * Perform a TCP ping
 */
async function ping(args: Record<string, unknown>): Promise<MCPToolResult> {
  const host = String(args.host || '');
  const port = Number(args.port) || 80;
  const timeout = Number(args.timeout) || 5000;
  const count = Number(args.count) || 3;

  if (!host) {
    return {
      content: [{ type: 'text', text: 'Error: host is required' }],
      isError: true,
    };
  }

  const results: { seq: number; time?: number; error?: string }[] = [];

  for (let i = 0; i < count; i++) {
    const start = Date.now();
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = createConnection({ host, port, timeout });
        
        socket.on('connect', () => {
          socket.destroy();
          resolve();
        });

        socket.on('timeout', () => {
          socket.destroy();
          reject(new Error('Timeout'));
        });

        socket.on('error', (err) => {
          socket.destroy();
          reject(err);
        });
      });
      results.push({ seq: i + 1, time: Date.now() - start });
    } catch (error) {
      results.push({ seq: i + 1, error: (error as Error).message });
    }
    
    // Small delay between pings
    if (i < count - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  const successful = results.filter(r => !r.error);
  const totalTime = successful.reduce((acc, r) => acc + (r.time || 0), 0);
  const avg = successful.length > 0 ? totalTime / successful.length : 0;

  return {
    content: [{ 
      type: 'text',
      text: JSON.stringify({
        host,
        port,
        sent: count,
        received: successful.length,
        loss: `${((count - successful.length) / count * 100).toFixed(1)}%`,
        avgLatency: `${avg.toFixed(2)}ms`,
        details: results,
      }, null, 2),
    }],
  };
}

export const networkTools: MCPTool[] = [
  {
    name: 'rek_http_request',
    description: 'Perform an HTTP request to any URL using Recker\'s robust client. Supports all methods, headers, and automatic JSON parsing.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Target URL' },
        method: { type: 'string', description: 'HTTP method (GET, POST, PUT, DELETE, etc.)', default: 'GET' },
        headers: { type: 'object', description: 'Request headers' },
        body: { type: 'object', description: 'JSON body for POST/PUT/PATCH' },
        timeout: { type: 'number', description: 'Timeout in ms', default: 10000 },
        retries: { type: 'number', description: 'Number of retries', default: 0 },
      },
      required: ['url'],
    },
  },
  {
    name: 'rek_dns_lookup',
    description: 'Resolve DNS records for a domain. Supports A, AAAA, MX, TXT, NS, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Domain name to resolve' },
        type: { type: 'string', description: 'Record type (A, AAAA, MX, TXT, NS, ALL)', default: 'A' },
      },
      required: ['domain'],
    },
  },
  {
    name: 'rek_whois_lookup',
    description: 'Perform a WHOIS lookup for a domain or IP address to find registration info.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Domain or IP to lookup' },
      },
      required: ['query'],
    },
  },
  {
    name: 'rek_network_ping',
    description: 'Check TCP connectivity to a host and port. Measures latency.',
    inputSchema: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'Hostname or IP' },
        port: { type: 'number', description: 'Target port', default: 80 },
        count: { type: 'number', description: 'Number of pings', default: 3 },
        timeout: { type: 'number', description: 'Timeout per ping in ms', default: 5000 },
      },
      required: ['host'],
    },
  },
];

export const networkToolHandlers: Record<string, (args: Record<string, unknown>) => Promise<MCPToolResult>> = {
  rek_http_request: httpRequest,
  rek_dns_lookup: dnsLookup,
  rek_whois_lookup: whoisLookup,
  rek_network_ping: ping,
};
