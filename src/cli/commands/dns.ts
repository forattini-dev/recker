/**
 * DNS CLI Commands
 *
 * This file registers DNS commands with the CLI router.
 * All handlers delegate to unified handlers via the adapter.
 */

import { RekCommand as Command } from '../router.js';
import { createCliAction, createCliActionWithOptions } from '../cli-adapter.js';
import {
  lookupHandler,
  reverseHandler,
  propagateHandler,
  healthHandler,
  spfHandler,
  dmarcHandler,
  dkimHandler,
  systemHandler,
  digHandler,
  emailAuditHandler,
} from '../handlers/dns.js';

export function registerDnsCommands(program: Command) {
  const dns = program.command('dns').description('DNS tools and diagnostics');

  // Propagate
  dns.command('propagate')
    .description('Check global DNS propagation across multiple providers')
    .argument('<domain>', {
      type: 'string',
      description: 'Domain to check propagation',
      example: 'example.com',
    })
    .argument('[type]', {
      type: 'string',
      description: 'DNS record type',
      default: 'A',
      example: 'MX',
    })
    .example('rek dns propagate example.com', 'Check A record propagation')
    .example('rek dns propagate example.com MX', 'Check MX record propagation')
    .action(createCliAction(propagateHandler, {
      positional: ['domain', 'type'],
      defaults: { type: 'A' }
    }));

  // Lookup
  dns.command('lookup')
    .alias('resolve')
    .description('Look up DNS records (A, MX, TXT, etc)')
    .argument('<domain>', {
      type: 'string',
      description: 'Domain to lookup',
      example: 'google.com',
    })
    .argument('[type]', {
      type: 'string',
      description: 'Record type (A, AAAA, MX, TXT, NS, CNAME, SOA, ANY)',
      default: 'A',
      example: 'MX',
    })
    .example('rek dns lookup google.com', 'Get A records')
    .example('rek dns lookup google.com MX', 'Get MX records')
    .example('rek dns lookup google.com ANY', 'Get all records')
    .action(createCliAction(lookupHandler, {
      positional: ['domain', 'type'],
      defaults: { type: 'A' }
    }));

  // Reverse
  dns.command('reverse')
    .description('Perform reverse DNS lookup (IP to hostname)')
    .argument('<ip>', {
      type: 'string',
      description: 'IP address to lookup',
      example: '8.8.8.8',
    })
    .example('rek dns reverse 8.8.8.8', 'Lookup Google DNS IP')
    .example('rek dns reverse 1.1.1.1', 'Lookup Cloudflare IP')
    .action(createCliAction(reverseHandler, {
      positional: ['ip']
    }));

  // Health
  dns.command('health')
    .description('Comprehensive DNS health check with scoring')
    .argument('<domain>', {
      type: 'string',
      description: 'Domain to check',
      example: 'example.com',
    })
    .example('rek dns health example.com', 'Run full DNS health check')
    .action(createCliAction(healthHandler, {
      positional: ['domain']
    }));

  // SPF
  dns.command('spf')
    .description('Validate SPF record for email authentication')
    .argument('<domain>', {
      type: 'string',
      description: 'Domain to validate',
      example: 'example.com',
    })
    .example('rek dns spf example.com', 'Validate SPF record')
    .action(createCliAction(spfHandler, {
      positional: ['domain']
    }));

  // DMARC
  dns.command('dmarc')
    .description('Validate DMARC record for email authentication')
    .argument('<domain>', {
      type: 'string',
      description: 'Domain to validate',
      example: 'example.com',
    })
    .example('rek dns dmarc example.com', 'Validate DMARC record')
    .action(createCliAction(dmarcHandler, {
      positional: ['domain']
    }));

  // DKIM
  dns.command('dkim')
    .description('Check DKIM record for email signing')
    .argument('<domain>', {
      type: 'string',
      description: 'Domain to check',
      example: 'example.com',
    })
    .option('selector', {
      type: 'string',
      short: 's',
      default: 'default',
      description: 'DKIM selector',
      example: 'google',
    })
    .example('rek dns dkim example.com', 'Check with default selector')
    .example('rek dns dkim example.com -s google', 'Check Google selector')
    .action(createCliActionWithOptions(dkimHandler, {
      positional: ['domain'],
      options: ['selector']
    }));

  // System DNS
  dns.command('system')
    .alias('status')
    .description('Show system DNS configuration (OS-level)')
    .example('rek dns system', 'Show current DNS servers')
    .action(createCliAction(systemHandler, {
      positional: []
    }));

  // Dig - uses unified handler with @server syntax support
  dns.command('dig')
    .description('DNS lookup utility (like the real dig)')
    .argument('[args...]', {
      type: 'string',
      description: 'Query arguments (@server domain type)',
      example: 'google.com A',
    })
    .allowUnknownOption()
    .example('rek dns dig google.com', 'Simple A lookup')
    .example('rek dns dig google.com MX', 'MX record lookup')
    .example('rek dns dig @8.8.8.8 google.com', 'Query specific server')
    .action(createCliAction(digHandler, {
      positional: ['domain']
    }));

  // Email audit - uses unified handler
  dns.command('email')
    .description('Full email security audit (SPF + DMARC + DKIM + MX)')
    .argument('<domain>', {
      type: 'string',
      description: 'Domain to audit',
      example: 'example.com',
    })
    .option('selector', {
      type: 'string',
      short: 's',
      default: 'default',
      description: 'DKIM selector',
      example: 'google',
    })
    .example('rek dns email example.com', 'Full email security audit')
    .example('rek dns email example.com -s google', 'Audit with Google DKIM selector')
    .action(createCliActionWithOptions(emailAuditHandler, {
      positional: ['domain'],
      options: ['selector']
    }));
}
