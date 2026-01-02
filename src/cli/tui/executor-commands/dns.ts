/**
 * DNS Commands
 *
 * Commands for DNS lookups and domain registration:
 * - dns: DNS record lookup
 * - whois: WHOIS lookup
 * - rdap: RDAP lookup (modern WHOIS)
 */

import { whois } from '../../../utils/whois.js';
import { rdap } from '../../../utils/rdap.js';
import { isHelpArg } from './parser.js';
import type { CommandContext, CommandResult } from './types.js';

// =============================================================================
// DNS Command
// =============================================================================

export async function cmdDns(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  let domain = args[0];

  // Show help if help flag or no args
  if (isHelpArg(domain) || !domain) {
    const base = ctx.baseUrl();
    if (!isHelpArg(domain) && base) {
      try {
        const url = new URL(base);
        domain = url.hostname;
      } catch {
        // Invalid URL, show help
      }
    }

    if (!domain || isHelpArg(domain)) {
      ctx.addHistoryItem({
        type: 'info',
        content: `DNS Lookup - Query DNS records

Usage: dns <domain> [type]

Record types:
  A        IPv4 address (default)
  AAAA     IPv6 address
  MX       Mail exchange
  TXT      Text records
  NS       Name servers
  CNAME    Canonical name
  SOA      Start of authority
  PTR      Pointer (reverse DNS)

Examples:
  dns google.com
  dns google.com MX
  dns example.com TXT
  dns 8.8.8.8 PTR`,
      });
      return { success: true };
    }
  }

  const recordType = (args[1] || 'A').toUpperCase();

  ctx.setIsLoading(true);
  try {
    const dns = await import('node:dns/promises');
    let result: any;

    switch (recordType) {
      case 'A':
        result = await dns.resolve4(domain);
        break;
      case 'AAAA':
        result = await dns.resolve6(domain);
        break;
      case 'MX':
        result = await dns.resolveMx(domain);
        break;
      case 'TXT':
        result = await dns.resolveTxt(domain);
        break;
      case 'NS':
        result = await dns.resolveNs(domain);
        break;
      case 'CNAME':
        result = await dns.resolveCname(domain);
        break;
      case 'SOA':
        result = await dns.resolveSoa(domain);
        break;
      default:
        result = await dns.resolve(domain, recordType);
    }

    // Format records for rich display
    const formattedRecords = Array.isArray(result)
      ? result.map((r: any) => ({
          type: recordType,
          value: typeof r === 'string' ? r : (r.exchange || r.value || JSON.stringify(r)),
          priority: r.priority,
        }))
      : [{ type: recordType, value: JSON.stringify(result) }];

    // Track in Domain Intelligence
    ctx.trackDns(domain, formattedRecords.map(r => ({
      type: r.type as any,
      value: r.value,
      priority: 'priority' in r ? r.priority : undefined,
    })));

    ctx.addHistoryItem({
      type: 'response',
      content: { domain, records: formattedRecords },
      meta: { responseType: 'dns' },
    });
    return { success: true, data: result };

  } catch (err: any) {
    ctx.addHistoryItem({ type: 'error', content: `DNS lookup failed: ${err.message}` });
    return { success: false, error: err.message };

  } finally {
    ctx.setIsLoading(false);
  }
}

// =============================================================================
// WHOIS Command
// =============================================================================

export async function cmdWhois(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  let domain = args[0];

  // Show help if help flag or no args
  if (isHelpArg(domain) || !domain) {
    const base = ctx.baseUrl();
    if (!isHelpArg(domain) && base) {
      try {
        const url = new URL(base);
        domain = url.hostname;
      } catch {
        // Invalid URL, show help
      }
    }

    if (!domain || isHelpArg(domain)) {
      ctx.addHistoryItem({
        type: 'info',
        content: `WHOIS Lookup - Domain registration info

Usage: whois <domain>

Returns:
  - Registrar information
  - Registration dates
  - Expiration date
  - Name servers
  - Contact info (if public)

Examples:
  whois google.com
  whois example.org`,
      });
      return { success: true };
    }
  }

  // Strip www. prefix for WHOIS lookup
  domain = domain.replace(/^www\./i, '');

  ctx.setIsLoading(true);
  try {
    const result = await whois(domain);

    // Track in Domain Intelligence (WHOIS data)
    const getData = (keys: string[]): string | undefined => {
      for (const key of keys) {
        const val = result.data[key];
        if (val) return Array.isArray(val) ? val[0] : val;
      }
      return undefined;
    };
    const getDataArray = (keys: string[]): string[] | undefined => {
      for (const key of keys) {
        const val = result.data[key];
        if (val) return Array.isArray(val) ? val : [val];
      }
      return undefined;
    };

    ctx.trackDns(domain, [], {
      registrar: getData(['Registrar', 'registrar', 'Sponsoring Registrar']),
      createdDate: getData(['Creation Date', 'created', 'Registration Date', 'Created On']),
      expiresDate: getData(['Registry Expiry Date', 'Expiration Date', 'expires', 'Expiry Date']),
      nameServers: getDataArray(['Name Server', 'nserver', 'Name Servers']),
    });

    ctx.addHistoryItem({
      type: 'response',
      content: { domain, ...result },
      meta: { responseType: 'whois' },
    });
    return { success: true, data: result };

  } catch (err: any) {
    ctx.addHistoryItem({ type: 'error', content: `WHOIS lookup failed: ${err.message}` });
    return { success: false, error: err.message };

  } finally {
    ctx.setIsLoading(false);
  }
}

// =============================================================================
// RDAP Command
// =============================================================================

export async function cmdRdap(ctx: CommandContext, args: string[]): Promise<CommandResult> {
  let domain = args[0];

  // Show help if help flag or no args
  if (isHelpArg(domain) || !domain) {
    const base = ctx.baseUrl();
    if (!isHelpArg(domain) && base) {
      try {
        const url = new URL(base);
        domain = url.hostname;
      } catch {
        // Invalid URL, show help
      }
    }

    if (!domain || isHelpArg(domain)) {
      ctx.addHistoryItem({
        type: 'info',
        content: `RDAP Lookup - Modern WHOIS (RFC 9082/9083)

Usage: rdap <domain>

Returns:
  - Domain status
  - Registration dates
  - Registrar info
  - Name servers
  - Contact entities

RDAP advantages over WHOIS:
  - Standardized JSON format
  - HTTPS transport
  - Better internationalization
  - Machine-readable

Examples:
  rdap google.com
  rdap example.org`,
      });
      return { success: true };
    }
  }

  // Strip www. prefix for RDAP lookup
  domain = domain.replace(/^www\./i, '');

  ctx.setIsLoading(true);
  try {
    const result = await rdap(ctx.client, domain);
    ctx.addHistoryItem({
      type: 'response',
      content: { domain, ...result },
      meta: { responseType: 'rdap' },
    });
    return { success: true, data: result };

  } catch (err: any) {
    ctx.addHistoryItem({ type: 'error', content: `RDAP lookup failed: ${err.message}` });
    return { success: false, error: err.message };

  } finally {
    ctx.setIsLoading(false);
  }
}
