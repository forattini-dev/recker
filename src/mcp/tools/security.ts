/**
 * Security & Intelligence MCP Tools
 *
 * Provides AI agents with security analysis and network intelligence:
 * - TLS certificate inspection
 * - RDAP lookup (modern WHOIS)
 * - GeoIP lookup with bogon detection
 * - Security headers analysis
 * - DNS security toolkit (SPF, DMARC, DKIM)
 */

import { createClient } from '../../core/client.js';
import { inspectTLS } from '../../utils/tls-inspector.js';
import { rdap, supportsRDAP } from '../../utils/rdap.js';
import { getIpInfo, isValidIP, isBogon } from '../ip-intel.js';
import { analyzeSecurityHeaders, quickSecurityCheck, analyzeCSP } from '../../utils/security-grader.js';
import {
  validateSpf,
  validateDmarc,
  checkDkim,
  checkDnsHealth,
  getSecurityRecords,
} from '../../utils/dns-toolkit.js';
import type { MCPTool, MCPToolResult } from '../types.js';

// ============================================================================
// TLS Inspection
// ============================================================================

async function tlsInspect(args: Record<string, unknown>): Promise<MCPToolResult> {
  const host = String(args.host || '');
  const port = Number(args.port) || 443;

  if (!host) {
    return {
      content: [{ type: 'text', text: 'Error: host is required' }],
      isError: true,
    };
  }

  try {
    const info = await inspectTLS(host, port);

    const output = {
      host,
      port,
      valid: info.valid,
      authorized: info.authorized,
      certificate: {
        subject: info.subject,
        issuer: info.issuer,
        validFrom: info.validFrom.toISOString(),
        validTo: info.validTo.toISOString(),
        daysRemaining: info.daysRemaining,
        serialNumber: info.serialNumber,
        fingerprint256: info.fingerprint256,
      },
      connection: {
        protocol: info.protocol,
        cipher: info.cipher,
      },
      subjectAltNames: info.altNames,
      publicKey: info.pubkey,
      extendedKeyUsage: info.extKeyUsage,
      warnings: [] as string[],
    };

    // Add warnings
    if (info.daysRemaining <= 30) {
      output.warnings.push(`Certificate expires in ${info.daysRemaining} days!`);
    }
    if (!info.authorized) {
      output.warnings.push(`Certificate not trusted: ${info.authorizationError?.message || 'unknown reason'}`);
    }
    if (info.pubkey && info.pubkey.algo === 'rsa' && info.pubkey.size < 2048) {
      output.warnings.push(`RSA key size ${info.pubkey.size} bits is considered weak`);
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `TLS inspection failed: ${(error as Error).message}` }],
      isError: true,
    };
  }
}

// ============================================================================
// RDAP Lookup
// ============================================================================

async function rdapLookup(args: Record<string, unknown>): Promise<MCPToolResult> {
  const query = String(args.query || '');

  if (!query) {
    return {
      content: [{ type: 'text', text: 'Error: query (domain or IP) is required' }],
      isError: true,
    };
  }

  // Check if it's a domain and warn about unsupported TLDs
  if (!query.includes(':') && !/^\d+\.\d+\.\d+\.\d+$/.test(query)) {
    const tld = query.split('.').pop()?.toLowerCase() || '';
    if (!supportsRDAP(tld)) {
      return {
        content: [{
          type: 'text',
          text: `RDAP is not available for .${tld} domains. Use rek_whois instead for traditional WHOIS data.`,
        }],
        isError: true,
      };
    }
  }

  try {
    const client = createClient({ timeout: 15000 });
    const result = await rdap(client, query);

    const output: Record<string, unknown> = {
      query,
      ldhName: result.ldhName,
      handle: result.handle,
      status: result.status,
    };

    // Parse events (creation, expiration, last update)
    if (result.events) {
      output.events = {};
      for (const event of result.events) {
        (output.events as Record<string, string>)[event.eventAction] = event.eventDate;
      }
    }

    // Parse nameservers
    if (result.nameservers) {
      output.nameservers = result.nameservers.map(ns => ns.ldhName);
    }

    // Parse entities (registrar, registrant, etc.)
    if (result.entities) {
      output.entities = result.entities.map(entity => ({
        handle: entity.handle,
        roles: entity.roles,
      }));
    }

    // DNSSEC status
    if (result.secureDNS) {
      output.dnssec = result.secureDNS.delegationSigned ? 'signed' : 'unsigned';
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `RDAP lookup failed: ${(error as Error).message}` }],
      isError: true,
    };
  }
}

// ============================================================================
// GeoIP Lookup
// ============================================================================

async function geoipLookup(args: Record<string, unknown>): Promise<MCPToolResult> {
  const ip = String(args.ip || '');

  if (!ip) {
    return {
      content: [{ type: 'text', text: 'Error: ip address is required' }],
      isError: true,
    };
  }

  if (!isValidIP(ip)) {
    return {
      content: [{ type: 'text', text: `Invalid IP address: ${ip}` }],
      isError: true,
    };
  }

  try {
    const info = await getIpInfo(ip);

    const output: Record<string, unknown> = {
      ip: info.ip,
      isIPv6: info.isIPv6,
    };

    if (info.bogon) {
      output.bogon = true;
      output.bogonType = info.bogonType;
      output.note = 'This is a private/reserved IP address. No geolocation available.';
    } else {
      output.location = {
        city: info.city,
        region: info.region,
        country: info.country,
        countryCode: info.countryCode,
        continent: info.continent,
        coordinates: info.loc,
        timezone: info.timezone,
        postalCode: info.postal,
        accuracyRadius: info.accuracy ? `${info.accuracy} km` : undefined,
      };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `GeoIP lookup failed: ${(error as Error).message}` }],
      isError: true,
    };
  }
}

// ============================================================================
// Security Headers Analysis
// ============================================================================

async function securityHeadersAnalyze(args: Record<string, unknown>): Promise<MCPToolResult> {
  const url = String(args.url || '');
  const quick = Boolean(args.quick);

  if (!url) {
    return {
      content: [{ type: 'text', text: 'Error: url is required' }],
      isError: true,
    };
  }

  try {
    const client = createClient({ timeout: 15000 });
    const response = await client.head(url);

    if (quick) {
      const result = quickSecurityCheck(response.headers);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            url,
            secure: result.secure,
            criticalIssues: result.criticalIssues,
          }, null, 2),
        }],
      };
    }

    const report = analyzeSecurityHeaders(response.headers);

    const output: Record<string, unknown> = {
      url,
      grade: report.grade,
      score: report.score,
      summary: report.summary,
    };

    // Group by status
    const failed = report.details.filter(d => d.status === 'fail');
    const warnings = report.details.filter(d => d.status === 'warn');
    const passed = report.details.filter(d => d.status === 'pass');

    if (failed.length > 0) {
      output.failed = failed.map(d => ({
        header: d.header,
        message: d.message,
        recommendation: d.recommendation,
      }));
    }

    if (warnings.length > 0) {
      output.warnings = warnings.map(d => ({
        header: d.header,
        message: d.message,
        recommendation: d.recommendation,
      }));
    }

    output.passed = passed.map(d => d.header);

    // CSP analysis if present
    if (report.csp) {
      output.csp = {
        score: report.csp.score,
        issues: report.csp.issues,
        missingDirectives: report.csp.missingDirectives,
        hasUnsafeInline: report.csp.hasUnsafeInline,
        hasUnsafeEval: report.csp.hasUnsafeEval,
      };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Security headers analysis failed: ${(error as Error).message}` }],
      isError: true,
    };
  }
}

// ============================================================================
// DNS Toolkit
// ============================================================================

async function dnsToolkit(args: Record<string, unknown>): Promise<MCPToolResult> {
  const domain = String(args.domain || '');
  const check = String(args.check || 'all');
  const dkimSelector = args.dkimSelector as string | undefined;

  if (!domain) {
    return {
      content: [{ type: 'text', text: 'Error: domain is required' }],
      isError: true,
    };
  }

  try {
    const output: Record<string, unknown> = { domain };

    if (check === 'all' || check === 'health') {
      const healthReport = await checkDnsHealth(domain);
      output.health = {
        score: healthReport.score,
        grade: healthReport.grade,
        checks: healthReport.checks,
      };
    }

    if (check === 'all' || check === 'spf') {
      const spfResult = await validateSpf(domain);
      output.spf = {
        valid: spfResult.valid,
        record: spfResult.record,
        mechanisms: spfResult.mechanisms,
        lookupCount: spfResult.lookupCount,
        warnings: spfResult.warnings,
        errors: spfResult.errors,
      };
    }

    if (check === 'all' || check === 'dmarc') {
      const dmarcResult = await validateDmarc(domain);
      output.dmarc = {
        valid: dmarcResult.valid,
        record: dmarcResult.record,
        policy: dmarcResult.policy,
        subdomainPolicy: dmarcResult.subdomainPolicy,
        percentage: dmarcResult.percentage,
        reportingUris: dmarcResult.rua,
        warnings: dmarcResult.warnings,
      };
    }

    if (check === 'all' || check === 'dkim') {
      // Try common DKIM selectors if not specified
      const selectors = dkimSelector
        ? [dkimSelector]
        : ['default', 'google', 'selector1', 'selector2', 'k1', 's1', 'dkim'];

      const dkimResults: Array<{ selector: string; found: boolean; publicKey?: string }> = [];

      for (const sel of selectors) {
        const result = await checkDkim(domain, sel);
        if (result.found) {
          dkimResults.push({
            selector: sel,
            found: true,
            publicKey: result.publicKey?.slice(0, 50) + '...',
          });
        }
      }

      output.dkim = {
        found: dkimResults.length > 0,
        selectors: dkimResults,
        note: dkimResults.length === 0
          ? 'No DKIM records found with common selectors. Specify dkimSelector parameter if you know the selector.'
          : undefined,
      };
    }

    if (check === 'all' || check === 'records') {
      const records = await getSecurityRecords(domain);
      output.securityRecords = {
        spf: records.spf,
        dmarc: records.dmarc,
        caa: records.caa,
        mx: records.mx,
      };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `DNS toolkit failed: ${(error as Error).message}` }],
      isError: true,
    };
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const securityTools: MCPTool[] = [
  {
    name: 'rek_tls_inspect',
    description: `Inspect SSL/TLS certificate and connection details for a host.

Returns:
- Certificate validity and expiration
- Subject and issuer details
- Subject Alternative Names (SANs)
- TLS protocol version and cipher suite
- Public key algorithm and size
- Warnings for expiring certs, weak keys, or trust issues

Use this to check certificate health, debug TLS issues, or audit HTTPS configuration.`,
    inputSchema: {
      type: 'object',
      properties: {
        host: {
          type: 'string',
          description: 'Hostname to inspect (e.g., "example.com")',
        },
        port: {
          type: 'number',
          description: 'Port number (default: 443)',
          default: 443,
        },
      },
      required: ['host'],
    },
  },
  {
    name: 'rek_rdap_lookup',
    description: `Perform RDAP lookup (modern WHOIS) for a domain or IP address.

RDAP provides structured JSON data including:
- Registration dates (created, updated, expires)
- Status (active, locked, etc.)
- Nameservers
- DNSSEC status
- Registrar/Registrant info

Note: Some TLDs (.io, .ai, etc.) don't support RDAP yet - use rek_whois for those.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Domain name or IP address to lookup',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'rek_geoip_lookup',
    description: `Get geolocation data for an IP address using MaxMind GeoLite2 database.

Returns:
- City, region, country, continent
- Coordinates (latitude, longitude)
- Timezone
- Accuracy radius
- Bogon detection (identifies private/reserved IPs)

Database is cached locally and updated automatically.`,
    inputSchema: {
      type: 'object',
      properties: {
        ip: {
          type: 'string',
          description: 'IPv4 or IPv6 address to lookup',
        },
      },
      required: ['ip'],
    },
  },
  {
    name: 'rek_security_headers',
    description: `Analyze HTTP security headers for a URL.

Grades (A+ to F) based on:
- HSTS (Strict-Transport-Security)
- CSP (Content-Security-Policy) with detailed analysis
- X-Frame-Options / frame-ancestors
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy
- Cross-Origin policies (COOP, COEP, CORP)
- Information leakage (Server, X-Powered-By)

Use quick=true for a fast critical issues check.`,
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to analyze',
        },
        quick: {
          type: 'boolean',
          description: 'Quick mode - only check critical security issues',
          default: false,
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'rek_dns_toolkit',
    description: `Advanced DNS security analysis for email authentication and DNS health.

Checks:
- SPF validation (syntax, lookup count, mechanisms)
- DMARC validation (policy, reporting, alignment)
- DKIM discovery (tries common selectors)
- CAA records (certificate authority authorization)
- MX records
- Overall DNS health score

Use check parameter to run specific checks: "all", "health", "spf", "dmarc", "dkim", "records"`,
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description: 'Domain to analyze',
        },
        check: {
          type: 'string',
          description: 'Which check to run: all, health, spf, dmarc, dkim, records',
          default: 'all',
        },
        dkimSelector: {
          type: 'string',
          description: 'Specific DKIM selector to check (if known)',
        },
      },
      required: ['domain'],
    },
  },
];

export const securityToolHandlers: Record<string, (args: Record<string, unknown>) => Promise<MCPToolResult>> = {
  rek_tls_inspect: tlsInspect,
  rek_rdap_lookup: rdapLookup,
  rek_geoip_lookup: geoipLookup,
  rek_security_headers: securityHeadersAnalyze,
  rek_dns_toolkit: dnsToolkit,
};
