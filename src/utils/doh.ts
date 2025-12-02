import { request } from 'undici';
import { ProtocolError, NotFoundError } from '../core/errors.js';

export type DoHProvider = 'cloudflare' | 'google' | 'quad9' | string;

const PROVIDERS: Record<string, string> = {
  cloudflare: 'https://1.1.1.1/dns-query',
  google: 'https://8.8.8.8/resolve',
  quad9: 'https://9.9.9.9:5053/dns-query',
};

interface DoHResponse {
  Status: number; // 0 = No Error
  Answer?: {
    name: string;
    type: number;
    TTL: number;
    data: string;
  }[];
}

/**
 * Creates a custom lookup function that uses DNS over HTTPS.
 * Can be passed to `createClient({ dns: { override: ... } })` logic or directly to Agent.
 */
export function createDoHLookup(provider: DoHProvider = 'cloudflare') {
  const endpoint = PROVIDERS[provider] || provider;

  return async (hostname: string, opts: any, callback: (err: Error | null, address: string, family: number) => void) => {
    try {
      // Google uses JSON API, Cloudflare supports DNS-wireformat but also JSON.
      // Let's use the JSON format which is widely supported for simple A/AAAA lookups.
      // Cloudflare: Accept: application/dns-json
      
      const url = new URL(endpoint);
      url.searchParams.set('name', hostname);
      url.searchParams.set('type', 'A'); // IPv4 preferred for now

      const { body, statusCode } = await request(url, {
        method: 'GET',
        headers: { 'Accept': 'application/dns-json' }
      });

      if (statusCode !== 200) {
        throw new ProtocolError(
          `DoH request failed with status ${statusCode}`,
          {
            protocol: 'dns',
            code: statusCode,
            phase: 'doh-request',
            retriable: statusCode >= 500 || statusCode === 429,
          }
        );
      }

      const data = await body.json() as DoHResponse;

      if (data.Status !== 0 || !data.Answer || data.Answer.length === 0) {
        return callback(
          new NotFoundError(
            `DNS lookup failed for ${hostname}`,
            {
              resource: hostname,
            }
          ),
          '',
          4
        );
      }

      // Find first A record
      const record = data.Answer.find(r => r.type === 1); // 1 = A
      if (record) {
        return callback(null, record.data, 4);
      }

      callback(
        new NotFoundError(
          `No A record found for ${hostname}`,
          {
            resource: `A:${hostname}`,
          }
        ),
        '',
        4
      );

    } catch (err) {
      callback(err as Error, '', 0);
    }
  };
}
