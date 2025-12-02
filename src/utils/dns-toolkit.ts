import { promises as dns, Resolver, promises as dnsPromises } from 'node:dns';
import { promisify } from 'node:util';
import { ProtocolError, UnsupportedError } from '../core/errors.js';

// ============================================================================
// Types
// ============================================================================

export interface DigOptions {
  server?: string;      // @8.8.8.8
  short?: boolean;      // +short
  type?: string;        // A, MX, NS, etc.
  reverse?: boolean;    // -x (reverse lookup)
}

export interface DigResult {
  question: {
    name: string;
    type: string;
    class: string;
  };
  answer: Array<{
    name: string;
    type: string;
    class: string;
    ttl: number;
    data: string;
  }>;
  server: string;
  queryTime: number;
  when: Date;
}

export interface DnsSecurityRecords {
  spf?: string[];
  dmarc?: string;
  dkim?: string;
  caa?: { issue?: string[]; issuewild?: string[]; iodef?: string };
  mx?: Array<{ priority: number; exchange: string }>;
  txt?: string[];
}

export interface DnsLookupResult {
  type: string;
  ttl?: number;
  data: string | object;
}

export interface DnsHealthReport {
  domain: string;
  score: number;
  grade: string;
  checks: Array<{
    name: string;
    status: 'pass' | 'warn' | 'fail';
    message: string;
    details?: any;
  }>;
}

export interface SpfValidation {
  valid: boolean;
  record?: string;
  mechanisms: string[];
  includes: string[];
  lookupCount: number;
  warnings: string[];
  errors: string[];
}

export interface DmarcValidation {
  valid: boolean;
  record?: string;
  policy: string;
  subdomainPolicy?: string;
  percentage: number;
  rua?: string[];
  ruf?: string[];
  warnings: string[];
}

// ============================================================================
// Core DNS Lookup Functions
// ============================================================================

/**
 * Perform a comprehensive DNS lookup for any record type
 */
export async function dnsLookup(domain: string, type: string = 'A'): Promise<DnsLookupResult[]> {
  const results: DnsLookupResult[] = [];
  const recordType = type.toUpperCase();

  try {
    switch (recordType) {
      case 'A':
        const a = await dns.resolve4(domain, { ttl: true });
        return a.map(r => ({ type: 'A', ttl: r.ttl, data: r.address }));

      case 'AAAA':
        const aaaa = await dns.resolve6(domain, { ttl: true });
        return aaaa.map(r => ({ type: 'AAAA', ttl: r.ttl, data: r.address }));

      case 'CNAME':
        const cname = await dns.resolveCname(domain);
        return cname.map(r => ({ type: 'CNAME', data: r }));

      case 'MX':
        const mx = await dns.resolveMx(domain);
        return mx.map(r => ({ type: 'MX', data: { priority: r.priority, exchange: r.exchange } }));

      case 'NS':
        const ns = await dns.resolveNs(domain);
        return ns.map(r => ({ type: 'NS', data: r }));

      case 'TXT':
        const txt = await dns.resolveTxt(domain);
        return txt.map(chunks => ({ type: 'TXT', data: chunks.join('') }));

      case 'SOA':
        const soa = await dns.resolveSoa(domain);
        return [{ type: 'SOA', data: soa }];

      case 'PTR':
        const ptr = await dns.resolvePtr(domain);
        return ptr.map(r => ({ type: 'PTR', data: r }));

      case 'SRV':
        const srv = await dns.resolveSrv(domain);
        return srv.map(r => ({ type: 'SRV', data: r }));

      case 'CAA':
        const caa = await dns.resolveCaa(domain);
        return caa.map(r => ({ type: 'CAA', data: r }));

      case 'NAPTR':
        const naptr = await dns.resolveNaptr(domain);
        return naptr.map(r => ({ type: 'NAPTR', data: r }));

      case 'ANY':
        return dnsLookupAll(domain);

      default:
        throw new UnsupportedError(`Unsupported DNS record type: ${recordType}`, {
          feature: recordType,
        });
    }
  } catch (err: any) {
    if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') {
      return [];
    }
    throw err;
  }
}

/**
 * Get all common DNS record types for a domain
 */
export async function dnsLookupAll(domain: string): Promise<DnsLookupResult[]> {
  const types = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT', 'SOA', 'CAA'];
  const results: DnsLookupResult[] = [];

  await Promise.all(
    types.map(async (type) => {
      try {
        const records = await dnsLookup(domain, type);
        results.push(...records);
      } catch {
        // Skip failed lookups
      }
    })
  );

  return results;
}

/**
 * Reverse DNS lookup (IP to hostname)
 */
export async function reverseLookup(ip: string): Promise<string[]> {
  try {
    return await dns.reverse(ip);
  } catch (err: any) {
    if (err.code === 'ENOTFOUND') {
      return [];
    }
    throw err;
  }
}

// ============================================================================
// Email Security Functions
// ============================================================================

/**
 * Get all email-related security records
 */
export async function getSecurityRecords(domain: string): Promise<DnsSecurityRecords> {
  const results: DnsSecurityRecords = { txt: [] };

  try {
    const txtRecords = await dns.resolveTxt(domain);
    const flatTxt = txtRecords.map(chunks => chunks.join(''));
    results.txt = flatTxt;

    // Parse SPF
    results.spf = flatTxt.filter(txt => txt.startsWith('v=spf1'));

    // Parse DMARC (needs _dmarc subdomain)
    try {
      const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain}`);
      const dmarcTxt = dmarcRecords.map(chunks => chunks.join(''))[0];
      if (dmarcTxt && dmarcTxt.startsWith('v=DMARC1')) {
        results.dmarc = dmarcTxt;
      }
    } catch {
      // No DMARC
    }

    // Parse CAA
    try {
      const caaRecords = await dns.resolveCaa(domain);
      results.caa = {};
      caaRecords.forEach((r: any) => {
        if (r.issue) {
          results.caa!.issue = [...(results.caa!.issue || []), r.issue];
        }
        if (r.issuewild) {
          results.caa!.issuewild = [...(results.caa!.issuewild || []), r.issuewild];
        }
        if (r.iodef) {
          results.caa!.iodef = r.iodef;
        }
      });
    } catch {
      // No CAA
    }

    // Get MX
    try {
      const mx = await dns.resolveMx(domain);
      results.mx = mx.map(r => ({ priority: r.priority, exchange: r.exchange }));
    } catch {
      // No MX
    }
  } catch (error) {
    throw new ProtocolError(`Failed to resolve DNS for ${domain}: ${error}`, {
      protocol: 'dns',
    });
  }

  return results;
}

/**
 * Validate SPF record
 */
export async function validateSpf(domain: string): Promise<SpfValidation> {
  const result: SpfValidation = {
    valid: false,
    mechanisms: [],
    includes: [],
    lookupCount: 0,
    warnings: [],
    errors: [],
  };

  try {
    const txtRecords = await dns.resolveTxt(domain);
    const spfRecords = txtRecords
      .map(chunks => chunks.join(''))
      .filter(txt => txt.startsWith('v=spf1'));

    if (spfRecords.length === 0) {
      result.errors.push('No SPF record found');
      return result;
    }

    if (spfRecords.length > 1) {
      result.errors.push('Multiple SPF records found (should have only one)');
      return result;
    }

    result.record = spfRecords[0];
    const parts = result.record.split(' ').slice(1); // Skip v=spf1

    for (const part of parts) {
      if (part.startsWith('include:')) {
        result.includes.push(part.replace('include:', ''));
        result.lookupCount++;
      } else if (part.startsWith('redirect=')) {
        result.lookupCount++;
      } else if (part.startsWith('a') || part.startsWith('mx') || part.startsWith('ptr')) {
        result.lookupCount++;
      }
      result.mechanisms.push(part);
    }

    // Check for common issues
    if (result.lookupCount > 10) {
      result.errors.push(`Too many DNS lookups (${result.lookupCount}/10). SPF permerror will occur.`);
    } else if (result.lookupCount > 7) {
      result.warnings.push(`High DNS lookup count (${result.lookupCount}/10). Consider flattening.`);
    }

    if (!result.record.includes('~all') && !result.record.includes('-all') && !result.record.includes('?all')) {
      result.warnings.push('No "all" mechanism found. Consider adding -all or ~all');
    }

    if (result.record.includes('+all')) {
      result.errors.push('Using +all allows anyone to send as your domain!');
    }

    result.valid = result.errors.length === 0;
  } catch (err: any) {
    result.errors.push(`DNS lookup failed: ${err.message}`);
  }

  return result;
}

/**
 * Validate DMARC record
 */
export async function validateDmarc(domain: string): Promise<DmarcValidation> {
  const result: DmarcValidation = {
    valid: false,
    policy: 'none',
    percentage: 100,
    warnings: [],
  };

  try {
    const txtRecords = await dns.resolveTxt(`_dmarc.${domain}`);
    const dmarcRecord = txtRecords
      .map(chunks => chunks.join(''))
      .find(txt => txt.startsWith('v=DMARC1'));

    if (!dmarcRecord) {
      result.warnings.push('No DMARC record found');
      return result;
    }

    result.record = dmarcRecord;

    // Parse DMARC tags
    const tags = dmarcRecord.split(';').map(t => t.trim());
    for (const tag of tags) {
      const [key, value] = tag.split('=');
      switch (key?.toLowerCase()) {
        case 'p':
          result.policy = value;
          break;
        case 'sp':
          result.subdomainPolicy = value;
          break;
        case 'pct':
          result.percentage = parseInt(value) || 100;
          break;
        case 'rua':
          result.rua = value.split(',').map(v => v.trim());
          break;
        case 'ruf':
          result.ruf = value.split(',').map(v => v.trim());
          break;
      }
    }

    // Warnings
    if (result.policy === 'none') {
      result.warnings.push('DMARC policy is "none" - no emails will be rejected');
    }

    if (result.percentage < 100) {
      result.warnings.push(`Only ${result.percentage}% of emails are subject to DMARC policy`);
    }

    if (!result.rua) {
      result.warnings.push('No aggregate report (rua) recipients specified');
    }

    result.valid = true;
  } catch (err: any) {
    if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
      result.warnings.push(`DNS lookup failed: ${err.message}`);
    } else {
      result.warnings.push('No DMARC record found');
    }
  }

  return result;
}

/**
 * Check DKIM record for a domain with given selector
 */
export async function checkDkim(domain: string, selector: string = 'default'): Promise<{ found: boolean; record?: string; publicKey?: string }> {
  try {
    const dkimDomain = `${selector}._domainkey.${domain}`;
    const txtRecords = await dns.resolveTxt(dkimDomain);
    const record = txtRecords.map(chunks => chunks.join('')).find(txt => txt.includes('v=DKIM1'));

    if (record) {
      // Extract public key
      const pMatch = record.match(/p=([^;]+)/);
      return {
        found: true,
        record,
        publicKey: pMatch ? pMatch[1] : undefined,
      };
    }

    return { found: false };
  } catch {
    return { found: false };
  }
}

// ============================================================================
// DNS Health Check
// ============================================================================

/**
 * Perform a comprehensive DNS health check
 */
export async function checkDnsHealth(domain: string): Promise<DnsHealthReport> {
  const report: DnsHealthReport = {
    domain,
    score: 0,
    grade: 'F',
    checks: [],
  };

  let maxScore = 0;
  let earnedScore = 0;

  // Check: Has A/AAAA records
  maxScore += 10;
  try {
    const a = await dnsLookup(domain, 'A');
    const aaaa = await dnsLookup(domain, 'AAAA');
    if (a.length > 0 || aaaa.length > 0) {
      earnedScore += 10;
      report.checks.push({
        name: 'A/AAAA Records',
        status: 'pass',
        message: `Found ${a.length} A and ${aaaa.length} AAAA records`,
        details: { a: a.length, aaaa: aaaa.length },
      });
    } else {
      report.checks.push({
        name: 'A/AAAA Records',
        status: 'fail',
        message: 'No A or AAAA records found',
      });
    }
  } catch {
    report.checks.push({
      name: 'A/AAAA Records',
      status: 'fail',
      message: 'Failed to resolve A/AAAA records',
    });
  }

  // Check: Has NS records
  maxScore += 10;
  try {
    const ns = await dnsLookup(domain, 'NS');
    if (ns.length >= 2) {
      earnedScore += 10;
      report.checks.push({
        name: 'Nameservers',
        status: 'pass',
        message: `Found ${ns.length} nameservers (redundancy OK)`,
        details: ns.map(n => n.data),
      });
    } else if (ns.length === 1) {
      earnedScore += 5;
      report.checks.push({
        name: 'Nameservers',
        status: 'warn',
        message: 'Only 1 nameserver found. Consider adding redundancy.',
        details: ns.map(n => n.data),
      });
    } else {
      report.checks.push({
        name: 'Nameservers',
        status: 'fail',
        message: 'No nameservers found',
      });
    }
  } catch {
    report.checks.push({
      name: 'Nameservers',
      status: 'fail',
      message: 'Failed to resolve NS records',
    });
  }

  // Check: Has SOA record
  maxScore += 5;
  try {
    const soa = await dnsLookup(domain, 'SOA');
    if (soa.length > 0) {
      earnedScore += 5;
      report.checks.push({
        name: 'SOA Record',
        status: 'pass',
        message: 'SOA record present',
        details: soa[0].data,
      });
    }
  } catch {
    report.checks.push({
      name: 'SOA Record',
      status: 'warn',
      message: 'No SOA record found',
    });
  }

  // Check: SPF record
  maxScore += 15;
  const spf = await validateSpf(domain);
  if (spf.valid) {
    earnedScore += 15;
    report.checks.push({
      name: 'SPF Record',
      status: 'pass',
      message: 'Valid SPF record found',
      details: { record: spf.record, lookups: spf.lookupCount },
    });
  } else if (spf.record) {
    earnedScore += 7;
    report.checks.push({
      name: 'SPF Record',
      status: 'warn',
      message: spf.errors[0] || spf.warnings[0] || 'SPF has issues',
      details: { record: spf.record, errors: spf.errors, warnings: spf.warnings },
    });
  } else {
    report.checks.push({
      name: 'SPF Record',
      status: 'fail',
      message: 'No SPF record found. Email spoofing possible.',
    });
  }

  // Check: DMARC record
  maxScore += 15;
  const dmarc = await validateDmarc(domain);
  if (dmarc.valid && dmarc.policy !== 'none') {
    earnedScore += 15;
    report.checks.push({
      name: 'DMARC Record',
      status: 'pass',
      message: `DMARC policy: ${dmarc.policy}`,
      details: { policy: dmarc.policy, percentage: dmarc.percentage },
    });
  } else if (dmarc.valid) {
    earnedScore += 7;
    report.checks.push({
      name: 'DMARC Record',
      status: 'warn',
      message: 'DMARC exists but policy is "none"',
      details: dmarc,
    });
  } else {
    report.checks.push({
      name: 'DMARC Record',
      status: 'fail',
      message: 'No DMARC record found',
    });
  }

  // Check: MX records
  maxScore += 10;
  try {
    const mx = await dnsLookup(domain, 'MX');
    if (mx.length > 0) {
      earnedScore += 10;
      report.checks.push({
        name: 'MX Records',
        status: 'pass',
        message: `Found ${mx.length} mail server(s)`,
        details: mx.map(m => m.data),
      });
    } else {
      report.checks.push({
        name: 'MX Records',
        status: 'warn',
        message: 'No MX records found (domain cannot receive email)',
      });
    }
  } catch {
    report.checks.push({
      name: 'MX Records',
      status: 'warn',
      message: 'No MX records found',
    });
  }

  // Check: CAA records
  maxScore += 10;
  try {
    const caa = await dnsLookup(domain, 'CAA');
    if (caa.length > 0) {
      earnedScore += 10;
      report.checks.push({
        name: 'CAA Records',
        status: 'pass',
        message: 'CAA records configured (certificate issuance restricted)',
        details: caa.map(c => c.data),
      });
    } else {
      earnedScore += 3;
      report.checks.push({
        name: 'CAA Records',
        status: 'warn',
        message: 'No CAA records. Any CA can issue certificates for this domain.',
      });
    }
  } catch {
    report.checks.push({
      name: 'CAA Records',
      status: 'warn',
      message: 'No CAA records found',
    });
  }

  // Calculate score and grade
  report.score = Math.round((earnedScore / maxScore) * 100);

  if (report.score >= 90) report.grade = 'A';
  else if (report.score >= 80) report.grade = 'B';
  else if (report.score >= 70) report.grade = 'C';
  else if (report.score >= 60) report.grade = 'D';
  else report.grade = 'F';

  return report;
}

// ============================================================================
// DMARC Generator
// ============================================================================

export interface DmarcGeneratorOptions {
  policy: 'none' | 'quarantine' | 'reject';
  subdomainPolicy?: 'none' | 'quarantine' | 'reject';
  percentage?: number;
  aggregateReports?: string[];
  forensicReports?: string[];
  alignmentDkim?: 'relaxed' | 'strict';
  alignmentSpf?: 'relaxed' | 'strict';
  reportInterval?: number;
  failureOptions?: string;
}

/**
 * Generate a DMARC record based on options
 */
export function generateDmarc(options: DmarcGeneratorOptions): string {
  const parts = ['v=DMARC1', `p=${options.policy}`];

  if (options.subdomainPolicy && options.subdomainPolicy !== options.policy) {
    parts.push(`sp=${options.subdomainPolicy}`);
  }

  if (options.percentage !== undefined && options.percentage !== 100) {
    parts.push(`pct=${options.percentage}`);
  }

  if (options.aggregateReports && options.aggregateReports.length > 0) {
    parts.push(`rua=${options.aggregateReports.map(e => `mailto:${e}`).join(',')}`);
  }

  if (options.forensicReports && options.forensicReports.length > 0) {
    parts.push(`ruf=${options.forensicReports.map(e => `mailto:${e}`).join(',')}`);
  }

  if (options.alignmentDkim === 'strict') {
    parts.push('adkim=s');
  }

  if (options.alignmentSpf === 'strict') {
    parts.push('aspf=s');
  }

  if (options.reportInterval && options.reportInterval !== 86400) {
    parts.push(`ri=${options.reportInterval}`);
  }

  if (options.failureOptions) {
    parts.push(`fo=${options.failureOptions}`);
  }

  return parts.join('; ');
}

// ============================================================================
// Dig Command Implementation
// ============================================================================

/**
 * Get a promise-based DNS resolver
 * If server is specified, creates a custom Resolver with that server
 * Otherwise uses the default dns.promises
 */
function getResolver(server?: string): typeof dnsPromises {
  if (!server) {
    return dnsPromises;
  }

  // Create custom resolver with specified DNS server
  const resolver = new Resolver();
  const [host, port] = server.split(':');
  resolver.setServers([port ? `${host}:${port}` : host]);

  // Promisify resolver methods (Resolver doesn't have .promises in Node)
  return {
    resolve4: promisify(resolver.resolve4.bind(resolver)) as typeof dnsPromises.resolve4,
    resolve6: promisify(resolver.resolve6.bind(resolver)) as typeof dnsPromises.resolve6,
    resolveMx: promisify(resolver.resolveMx.bind(resolver)) as typeof dnsPromises.resolveMx,
    resolveNs: promisify(resolver.resolveNs.bind(resolver)) as typeof dnsPromises.resolveNs,
    resolveTxt: promisify(resolver.resolveTxt.bind(resolver)) as typeof dnsPromises.resolveTxt,
    resolveCname: promisify(resolver.resolveCname.bind(resolver)) as typeof dnsPromises.resolveCname,
    resolveSoa: promisify(resolver.resolveSoa.bind(resolver)) as typeof dnsPromises.resolveSoa,
    resolvePtr: promisify(resolver.resolvePtr.bind(resolver)) as typeof dnsPromises.resolvePtr,
    resolveSrv: promisify(resolver.resolveSrv.bind(resolver)) as typeof dnsPromises.resolveSrv,
    resolveCaa: promisify(resolver.resolveCaa.bind(resolver)) as typeof dnsPromises.resolveCaa,
    resolveNaptr: promisify(resolver.resolveNaptr.bind(resolver)) as typeof dnsPromises.resolveNaptr,
    reverse: promisify(resolver.reverse.bind(resolver)) as typeof dnsPromises.reverse,
  } as typeof dnsPromises;
}

/**
 * Format data for dig output based on record type
 */
function formatDigData(type: string, data: any): string {
  if (typeof data === 'string') return data;

  switch (type) {
    case 'MX':
      return `${data.priority} ${data.exchange}`;
    case 'SOA':
      return `${data.nsname} ${data.hostmaster} ${data.serial} ${data.refresh} ${data.retry} ${data.expire} ${data.minttl}`;
    case 'SRV':
      return `${data.priority} ${data.weight} ${data.port} ${data.name}`;
    case 'CAA':
      return `${data.critical} ${data.issue || data.issuewild || data.iodef || ''}`;
    case 'NAPTR':
      return `${data.order} ${data.preference} "${data.flags}" "${data.service}" "${data.regexp}" ${data.replacement}`;
    default:
      return JSON.stringify(data);
  }
}

/**
 * Perform a dig-like DNS query
 */
export async function dig(domain: string, options: DigOptions = {}): Promise<DigResult> {
  const startTime = performance.now();
  const type = (options.type || 'A').toUpperCase();
  const resolver = getResolver(options.server);
  const serverName = options.server || 'system-default';

  const result: DigResult = {
    question: {
      name: domain,
      type,
      class: 'IN',
    },
    answer: [],
    server: serverName,
    queryTime: 0,
    when: new Date(),
  };

  try {
    // Handle reverse lookup
    if (options.reverse) {
      const hostnames = await resolver.reverse(domain);
      result.question.type = 'PTR';
      result.answer = hostnames.map(hostname => ({
        name: domain,
        type: 'PTR',
        class: 'IN',
        ttl: 0,
        data: hostname,
      }));
      result.queryTime = Math.round(performance.now() - startTime);
      return result;
    }

    // Regular lookup by type
    switch (type) {
      case 'A': {
        const records = await resolver.resolve4(domain, { ttl: true });
        result.answer = records.map(r => ({
          name: domain,
          type: 'A',
          class: 'IN',
          ttl: r.ttl,
          data: r.address,
        }));
        break;
      }

      case 'AAAA': {
        const records = await resolver.resolve6(domain, { ttl: true });
        result.answer = records.map(r => ({
          name: domain,
          type: 'AAAA',
          class: 'IN',
          ttl: r.ttl,
          data: r.address,
        }));
        break;
      }

      case 'MX': {
        const records = await resolver.resolveMx(domain);
        result.answer = records.map(r => ({
          name: domain,
          type: 'MX',
          class: 'IN',
          ttl: 0,
          data: formatDigData('MX', r),
        }));
        break;
      }

      case 'NS': {
        const records = await resolver.resolveNs(domain);
        result.answer = records.map(r => ({
          name: domain,
          type: 'NS',
          class: 'IN',
          ttl: 0,
          data: r,
        }));
        break;
      }

      case 'TXT': {
        const records = await resolver.resolveTxt(domain);
        result.answer = records.map(chunks => ({
          name: domain,
          type: 'TXT',
          class: 'IN',
          ttl: 0,
          data: `"${chunks.join('')}"`,
        }));
        break;
      }

      case 'CNAME': {
        const records = await resolver.resolveCname(domain);
        result.answer = records.map(r => ({
          name: domain,
          type: 'CNAME',
          class: 'IN',
          ttl: 0,
          data: r,
        }));
        break;
      }

      case 'SOA': {
        const record = await resolver.resolveSoa(domain);
        result.answer = [{
          name: domain,
          type: 'SOA',
          class: 'IN',
          ttl: 0,
          data: formatDigData('SOA', record),
        }];
        break;
      }

      case 'PTR': {
        const records = await resolver.resolvePtr(domain);
        result.answer = records.map(r => ({
          name: domain,
          type: 'PTR',
          class: 'IN',
          ttl: 0,
          data: r,
        }));
        break;
      }

      case 'SRV': {
        const records = await resolver.resolveSrv(domain);
        result.answer = records.map(r => ({
          name: domain,
          type: 'SRV',
          class: 'IN',
          ttl: 0,
          data: formatDigData('SRV', r),
        }));
        break;
      }

      case 'CAA': {
        const records = await resolver.resolveCaa(domain);
        result.answer = records.map(r => ({
          name: domain,
          type: 'CAA',
          class: 'IN',
          ttl: 0,
          data: formatDigData('CAA', r),
        }));
        break;
      }

      case 'NAPTR': {
        const records = await resolver.resolveNaptr(domain);
        result.answer = records.map(r => ({
          name: domain,
          type: 'NAPTR',
          class: 'IN',
          ttl: 0,
          data: formatDigData('NAPTR', r),
        }));
        break;
      }

      case 'ANY': {
        // Query multiple types
        const types = ['A', 'AAAA', 'MX', 'NS', 'TXT', 'SOA', 'CAA'];
        for (const t of types) {
          try {
            const subResult = await dig(domain, { ...options, type: t });
            result.answer.push(...subResult.answer);
          } catch {
            // Skip failed lookups
          }
        }
        break;
      }

      default:
        throw new UnsupportedError(`Unsupported DNS record type: ${type}`, {
          feature: type,
        });
    }
  } catch (err: any) {
    if (err.code !== 'ENODATA' && err.code !== 'ENOTFOUND') {
      throw err;
    }
    // No records found - return empty answer
  }

  result.queryTime = Math.round(performance.now() - startTime);
  return result;
}

/**
 * Format dig result as a string (similar to real dig output)
 */
export function formatDigOutput(result: DigResult, short: boolean = false): string {
  if (short) {
    // +short mode: just the answers
    return result.answer.map(a => a.data).join('\n');
  }

  const lines: string[] = [];

  // Header
  lines.push(`; <<>> rek dig <<>> ${result.question.name} ${result.question.type}`);
  lines.push(`;; Got answer:`);
  lines.push('');

  // Question section
  lines.push(';; QUESTION SECTION:');
  lines.push(`;${result.question.name.padEnd(23)} ${result.question.class.padEnd(4)} ${result.question.type}`);
  lines.push('');

  // Answer section
  if (result.answer.length > 0) {
    lines.push(';; ANSWER SECTION:');
    for (const answer of result.answer) {
      const ttl = answer.ttl.toString().padStart(5);
      lines.push(`${answer.name.padEnd(23)} ${ttl} ${answer.class.padEnd(4)} ${answer.type.padEnd(6)} ${answer.data}`);
    }
    lines.push('');
  }

  // Footer
  lines.push(`;; Query time: ${result.queryTime} msec`);
  lines.push(`;; SERVER: ${result.server}`);
  lines.push(`;; WHEN: ${result.when.toUTCString()}`);

  return lines.join('\n');
}
