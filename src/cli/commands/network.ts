/**
 * Network CLI Commands
 *
 * This file registers network commands with the CLI router.
 * Simple commands delegate to unified handlers, complex ones (ping with count) stay inline.
 */

import { RekCommand as Command } from '../router.js';
import { createCliAction, createCliActionWithOptions } from '../cli-adapter.js';
import {
  pingHandler,
  ipHandler,
  tlsHandler,
  whoisHandler,
  rdapHandler,
} from '../handlers/network.js';

export function registerNetworkCommands(program: Command) {
  // IP Geolocation - uses unified handler
  program
    .command('ip')
    .alias('geo')
    .alias('geoip')
    .description('Look up geolocation and ISP info for an IP address using local MaxMind GeoLite2 database')
    .argument('<address>', {
      type: 'string',
      description: 'IPv4 or IPv6 address to lookup',
      example: '8.8.8.8',
    })
    .example('rek ip 8.8.8.8', 'Google DNS geolocation')
    .example('rek ip 1.1.1.1', 'Cloudflare DNS geolocation')
    .example('rek ip 2001:4860:4860::8888', 'IPv6 lookup')
    .action(createCliAction(ipHandler, {
      positional: ['ip']  // Note: unified handler expects 'ip', old CLI used 'address'
    }));

  // TLS Certificate Inspection - uses unified handler
  program
    .command('tls')
    .alias('ssl')
    .alias('cert')
    .description('Inspect TLS/SSL certificate of a host showing issuer, validity, fingerprints, and SANs')
    .argument('<host>', {
      type: 'string',
      description: 'Hostname or IP address to inspect',
      example: 'google.com',
    })
    .argument('[port]', {
      type: 'number',
      description: 'Port number (default: 443)',
      default: 443,
      example: '8443',
    })
    .example('rek tls google.com', 'Inspect Google certificate')
    .example('rek tls example.com 8443', 'Custom port')
    .example('rek tls 192.168.1.1', 'Check IP directly')
    .action(createCliAction(tlsHandler, {
      positional: ['host', 'port'],
      defaults: { port: 443 }
    }));

  // WHOIS Lookup - uses unified handler
  program
    .command('whois')
    .description('Look up domain registration and ownership info from WHOIS servers')
    .argument('<query>', {
      type: 'string',
      description: 'Domain name or IP address to lookup',
      example: 'github.com',
    })
    .option('raw', {
      short: 'r',
      description: 'Show raw WHOIS response instead of parsed data',
    })
    .example('rek whois github.com', 'Get domain registration info')
    .example('rek whois google.com --raw', 'Show raw WHOIS response')
    .example('rek whois 8.8.8.8', 'Lookup IP address owner')
    .action(createCliActionWithOptions(whoisHandler, {
      positional: ['domain'],  // unified handler expects 'domain'
      options: ['raw']
    }));

  // RDAP (Modern WHOIS) - uses unified handler
  program
    .command('rdap')
    .description('RDAP lookup - modern WHOIS replacement with structured JSON data')
    .argument('<domain>', {
      type: 'string',
      description: 'Domain name to lookup',
      example: 'github.com',
    })
    .example('rek rdap github.com', 'Get structured domain info')
    .example('rek rdap google.com --json', 'Get full JSON response')
    .action(createCliAction(rdapHandler, {
      positional: ['domain']
    }));

  // TCP Ping - uses unified handler
  program
    .command('ping')
    .description('Test TCP connectivity to host:port and measure connection latency (not ICMP)')
    .argument('<host>', {
      type: 'string',
      description: 'Hostname or IP address to ping',
      example: 'google.com',
    })
    .argument('[port]', {
      type: 'number',
      description: 'Port number to connect to',
      default: 443,
      example: '80',
    })
    .option('count', {
      type: 'number',
      short: 'c',
      default: 4,
      description: 'Number of pings to send',
      example: '10',
    })
    .option('timeout', {
      type: 'number',
      short: 't',
      default: 5000,
      description: 'Connection timeout in milliseconds',
      example: '3000',
    })
    .example('rek ping google.com', 'Test HTTPS connectivity (port 443)')
    .example('rek ping google.com 80', 'Test HTTP port')
    .example('rek ping redis.local 6379 -c 10', '10 pings to Redis')
    .action(createCliActionWithOptions(pingHandler, {
      positional: ['host', 'port'],
      options: ['count', 'timeout'],
      defaults: { port: 443 }
    }));
}
