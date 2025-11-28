import { request } from 'undici';
import { ReckerError } from '../core/errors.js';

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
        throw new ReckerError(
          `DoH request failed with status ${statusCode}`,
          undefined,
          undefined,
          [
            'Verify the DNS-over-HTTPS endpoint URL.',
            'Check network connectivity and TLS settings for the DoH provider.',
            'Retry the request; some providers throttle bursts.'
          ]
        );
      }

      const data = await body.json() as DoHResponse;

      if (data.Status !== 0 || !data.Answer || data.Answer.length === 0) {
        return callback(
          new ReckerError(
            `DNS lookup failed for ${hostname}`,
            undefined,
            undefined,
            [
              'Confirm the hostname is correct.',
              'Check that the DoH provider is reachable.',
              'Retry or fall back to system DNS if the provider is down.'
            ]
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
        new ReckerError(
          `No A record found for ${hostname}`,
          undefined,
          undefined,
          [
            'Verify the domain has an A record (or use AAAA for IPv6).',
            'Check DNS propagation if the record was recently added.',
            'Try an alternate resolver to rule out stale caches.'
          ]
        ),
        '',
        4
      );

    } catch (err) {
      callback(err as Error, '', 0);
    }
  };
}
