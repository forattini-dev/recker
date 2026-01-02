/**
 * Unified MCP Tools
 *
 * New consolidated tools that combine functionality and fill gaps.
 * These are the recommended tools for new integrations.
 */

import { createClient } from '../../core/client.js';
import { inspectTLS } from '../../utils/tls-inspector.js';
import { rdap } from '../../utils/rdap.js';
import { dnsLookup, checkDnsHealth, validateSpf, validateDmarc } from '../../utils/dns-toolkit.js';
import { analyzeSecurityHeaders } from '../../utils/security-grader.js';
import type { MCPTool, MCPToolResult } from '../types.js';

// ─────────────────────────────────────────────────────────────────
// Domain Audit - All-in-one domain analysis
// ─────────────────────────────────────────────────────────────────

async function domainAudit(args: Record<string, unknown>): Promise<MCPToolResult> {
  const domain = String(args.domain || '').replace(/^https?:\/\//, '').split('/')[0];
  const checks = (args.checks as string[]) || ['dns', 'tls', 'http', 'whois'];

  if (!domain) {
    return { content: [{ type: 'text', text: 'Error: domain is required' }], isError: true };
  }

  const results: Record<string, any> = {
    domain,
    timestamp: new Date().toISOString(),
    summary: { passed: 0, failed: 0, warnings: 0 },
    checks: {},
  };

  // DNS Check
  if (checks.includes('dns')) {
    try {
      const [a, aaaa, mx, ns] = await Promise.allSettled([
        dnsLookup(domain, 'A'),
        dnsLookup(domain, 'AAAA'),
        dnsLookup(domain, 'MX'),
        dnsLookup(domain, 'NS'),
      ]);

      const health = await checkDnsHealth(domain).catch(() => null);
      const spf = await validateSpf(domain).catch(() => null);
      const dmarc = await validateDmarc(domain).catch(() => null);

      results.checks.dns = {
        status: 'ok',
        records: {
          A: a.status === 'fulfilled' ? a.value : null,
          AAAA: aaaa.status === 'fulfilled' ? aaaa.value : null,
          MX: mx.status === 'fulfilled' ? mx.value : null,
          NS: ns.status === 'fulfilled' ? ns.value : null,
        },
        health: health?.grade || 'unknown',
        email: {
          spf: spf?.valid ? '✓' : '✗',
          dmarc: dmarc?.valid ? '✓' : '✗',
        },
      };
      results.summary.passed++;
    } catch (e) {
      results.checks.dns = { status: 'error', error: (e as Error).message };
      results.summary.failed++;
    }
  }

  // TLS Check
  if (checks.includes('tls')) {
    try {
      const tls = await inspectTLS(domain);
      const issues: string[] = [];

      if (!tls.valid) issues.push('Certificate invalid');
      if (tls.daysRemaining && tls.daysRemaining < 30) issues.push(`Expires in ${tls.daysRemaining} days`);
      if (tls.protocol && !['TLSv1.2', 'TLSv1.3'].includes(tls.protocol)) issues.push('Old TLS version');

      results.checks.tls = {
        status: issues.length === 0 ? 'ok' : 'warning',
        valid: tls.valid,
        issuer: tls.issuer,
        subject: tls.subject,
        protocol: tls.protocol,
        cipher: tls.cipher,
        validFrom: tls.validFrom,
        validTo: tls.validTo,
        daysRemaining: tls.daysRemaining,
        issues,
      };

      if (issues.length > 0) results.summary.warnings++;
      else results.summary.passed++;
    } catch (e) {
      results.checks.tls = { status: 'error', error: (e as Error).message };
      results.summary.failed++;
    }
  }

  // HTTP Check (Security Headers)
  if (checks.includes('http')) {
    try {
      const client = createClient({ timeout: 10000 });
      const response = await client.get(`https://${domain}`);
      const headers = Object.fromEntries(response.headers.entries());

      // Analyze security headers
      const securityAnalysis = analyzeSecurityHeaders(response.headers);

      const securityHeaders = {
        'strict-transport-security': headers['strict-transport-security'] ? '✓' : '✗',
        'content-security-policy': headers['content-security-policy'] ? '✓' : '✗',
        'x-frame-options': headers['x-frame-options'] ? '✓' : '✗',
        'x-content-type-options': headers['x-content-type-options'] ? '✓' : '✗',
        'x-xss-protection': headers['x-xss-protection'] ? '✓' : '✗',
        'referrer-policy': headers['referrer-policy'] ? '✓' : '✗',
      };

      const missing = Object.entries(securityHeaders).filter(([_, v]) => v === '✗').length;

      results.checks.http = {
        status: missing > 2 ? 'warning' : 'ok',
        statusCode: response.status,
        server: headers['server'],
        securityGrade: securityAnalysis?.grade || 'unknown',
        securityHeaders,
        missingHeaders: missing,
      };

      if (missing > 2) results.summary.warnings++;
      else results.summary.passed++;
    } catch (e) {
      results.checks.http = { status: 'error', error: (e as Error).message };
      results.summary.failed++;
    }
  }

  // WHOIS/RDAP Check
  if (checks.includes('whois')) {
    try {
      const client = createClient({ timeout: 15000 });
      const whoisData = await rdap(client, domain);

      // Check expiration
      const expirationDate = whoisData.events?.find((e: any) => e.eventAction === 'expiration')?.eventDate;
      const daysToExpire = expirationDate
        ? Math.ceil((new Date(expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;

      results.checks.whois = {
        status: daysToExpire && daysToExpire < 30 ? 'warning' : 'ok',
        registrar: whoisData.entities?.find((e: any) => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find((v: any) => v[0] === 'fn')?.[3],
        created: whoisData.events?.find((e: any) => e.eventAction === 'registration')?.eventDate,
        expires: expirationDate,
        daysToExpire,
        nameservers: whoisData.nameservers?.map((ns: any) => ns.ldhName) || [],
        dnssec: whoisData.secureDNS?.delegationSigned ? '✓' : '✗',
      };

      if (daysToExpire && daysToExpire < 30) results.summary.warnings++;
      else results.summary.passed++;
    } catch (e) {
      results.checks.whois = { status: 'error', error: (e as Error).message };
      results.summary.failed++;
    }
  }

  // Generate overall grade
  const { passed, failed, warnings } = results.summary;
  const total = passed + failed + warnings;
  if (failed > 0) results.summary.grade = 'F';
  else if (warnings > total / 2) results.summary.grade = 'C';
  else if (warnings > 0) results.summary.grade = 'B';
  else results.summary.grade = 'A';

  return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
}

// ─────────────────────────────────────────────────────────────────
// Site Audit - Quick website analysis without crawling
// ─────────────────────────────────────────────────────────────────

async function siteAudit(args: Record<string, unknown>): Promise<MCPToolResult> {
  const urlInput = String(args.url || '');

  if (!urlInput) {
    return { content: [{ type: 'text', text: 'Error: url is required' }], isError: true };
  }

  // Normalize URL
  let url = urlInput;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }
  const urlObj = new URL(url);
  const domain = urlObj.hostname;

  const results: Record<string, any> = {
    url,
    domain,
    timestamp: new Date().toISOString(),
  };

  const client = createClient({ timeout: 15000 });

  // 1. Connectivity Check (TCP ping)
  try {
    const pingStart = Date.now();
    const { createConnection } = await import('net');
    await new Promise<void>((resolve, reject) => {
      const socket = createConnection({ host: domain, port: 443, timeout: 5000 });
      socket.on('connect', () => { socket.destroy(); resolve(); });
      socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout')); });
      socket.on('error', (e) => { socket.destroy(); reject(e); });
    });
    results.connectivity = {
      status: 'ok',
      latency: Date.now() - pingStart,
    };
  } catch (e) {
    results.connectivity = { status: 'error', error: (e as Error).message };
  }

  // 2. HTTP Request + Performance + SEO
  try {
    const httpStart = Date.now();
    const response = await client.get(url);
    const ttfb = Date.now() - httpStart;
    const html = await response.text();
    const totalTime = Date.now() - httpStart;
    const headers = Object.fromEntries(response.headers.entries());

    results.http = {
      status: response.status,
      statusText: response.statusText,
      ttfb: `${ttfb}ms`,
      totalTime: `${totalTime}ms`,
      contentLength: headers['content-length'] || html.length,
      server: headers['server'],
      poweredBy: headers['x-powered-by'],
    };

    // Extract SEO meta tags
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
    const robotsMatch = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)["']/i);

    // OG tags
    const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
    const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    const ogType = html.match(/<meta[^>]*property=["']og:type["'][^>]*content=["']([^"']+)["']/i);

    // Twitter cards
    const twitterCard = html.match(/<meta[^>]*name=["']twitter:card["'][^>]*content=["']([^"']+)["']/i);

    const seoIssues: string[] = [];
    const title = titleMatch?.[1]?.trim();
    const description = descMatch?.[1]?.trim();
    const h1 = h1Match?.[1]?.trim();

    if (!title) seoIssues.push('Missing <title> tag');
    else if (title.length < 30) seoIssues.push(`Title too short (${title.length} chars, recommended 50-60)`);
    else if (title.length > 60) seoIssues.push(`Title too long (${title.length} chars, recommended 50-60)`);

    if (!description) seoIssues.push('Missing meta description');
    else if (description.length < 120) seoIssues.push(`Description too short (${description.length} chars, recommended 150-160)`);
    else if (description.length > 160) seoIssues.push(`Description too long (${description.length} chars, recommended 150-160)`);

    if (!h1) seoIssues.push('Missing <h1> tag');

    if (!ogTitle && !ogDesc) seoIssues.push('Missing Open Graph tags (og:title, og:description)');
    if (!ogImage) seoIssues.push('Missing og:image (recommended for social sharing)');

    results.seo = {
      title: title || null,
      titleLength: title?.length || 0,
      description: description?.slice(0, 160) || null,
      descriptionLength: description?.length || 0,
      h1: h1 || null,
      canonical: canonicalMatch?.[1] || null,
      robots: robotsMatch?.[1] || null,
      openGraph: {
        title: ogTitle?.[1] || null,
        description: ogDesc?.[1]?.slice(0, 100) || null,
        image: ogImage?.[1] || null,
        type: ogType?.[1] || null,
      },
      twitterCard: twitterCard?.[1] || null,
      issues: seoIssues,
      score: Math.max(0, 100 - seoIssues.length * 15),
    };

    // Security headers quick check
    const securityHeaders = {
      hsts: headers['strict-transport-security'] ? '✓' : '✗',
      csp: headers['content-security-policy'] ? '✓' : '✗',
      xfo: headers['x-frame-options'] ? '✓' : '✗',
      xcto: headers['x-content-type-options'] ? '✓' : '✗',
      referrer: headers['referrer-policy'] ? '✓' : '✗',
    };
    const missingSecurityHeaders = Object.values(securityHeaders).filter(v => v === '✗').length;

    results.security = {
      https: url.startsWith('https://'),
      headers: securityHeaders,
      missingCount: missingSecurityHeaders,
      grade: missingSecurityHeaders === 0 ? 'A' :
             missingSecurityHeaders <= 2 ? 'B' :
             missingSecurityHeaders <= 3 ? 'C' : 'D',
    };

  } catch (e) {
    results.http = { status: 'error', error: (e as Error).message };
  }

  // 3. Discovery Files (parallel)
  const discoveryFiles = [
    { name: 'robots', path: '/robots.txt' },
    { name: 'sitemap', path: '/sitemap.xml' },
    { name: 'humans', path: '/humans.txt' },
    { name: 'llms', path: '/llms.txt' },
    { name: 'manifest', path: '/manifest.json' },
    { name: 'securityTxt', path: '/.well-known/security.txt' },
  ];

  const discoveryResults = await Promise.allSettled(
    discoveryFiles.map(async (file) => {
      try {
        const res = await client.head(`${urlObj.origin}${file.path}`);
        return { name: file.name, found: res.ok, url: `${urlObj.origin}${file.path}` };
      } catch {
        return { name: file.name, found: false };
      }
    })
  );

  results.discovery = {};
  for (const result of discoveryResults) {
    if (result.status === 'fulfilled') {
      results.discovery[result.value.name] = {
        found: result.value.found,
        url: result.value.found ? result.value.url : undefined,
      };
    }
  }

  // 4. DNS Quick Check
  try {
    const aRecords = await dnsLookup(domain, 'A');
    const ips = aRecords.map((r: any) => String(r.data || r.address || ''));
    const serverHeader = results.http?.server?.toLowerCase() || '';
    results.dns = {
      aRecords: ips,
      provider: serverHeader.includes('cloudflare') ? 'Cloudflare' :
                serverHeader.includes('nginx') ? 'Nginx' :
                serverHeader.includes('apache') ? 'Apache' : 'Unknown',
    };
  } catch (e) {
    results.dns = { error: (e as Error).message };
  }

  // 5. TLS Quick Check
  try {
    const tlsInfo = await inspectTLS(domain);
    results.tls = {
      valid: tlsInfo.valid,
      issuer: tlsInfo.issuer,
      daysRemaining: tlsInfo.daysRemaining,
      protocol: tlsInfo.protocol,
      warning: tlsInfo.daysRemaining && tlsInfo.daysRemaining < 30
        ? `Certificate expires in ${tlsInfo.daysRemaining} days`
        : null,
    };
  } catch (e) {
    results.tls = { error: (e as Error).message };
  }

  // 6. RDAP/WHOIS Check
  try {
    const rdapData = await rdap(client, domain);

    // Extract registration dates
    const created = rdapData.events?.find((e: any) => e.eventAction === 'registration')?.eventDate;
    const expires = rdapData.events?.find((e: any) => e.eventAction === 'expiration')?.eventDate;
    const updated = rdapData.events?.find((e: any) => e.eventAction === 'last changed')?.eventDate;

    // Calculate days to expiration
    const daysToExpire = expires
      ? Math.ceil((new Date(expires).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;

    // Extract registrar info
    const registrarEntity = rdapData.entities?.find((e: any) => e.roles?.includes('registrar'));
    const registrar = registrarEntity?.vcardArray?.[1]?.find((v: any) => v[0] === 'fn')?.[3] ||
                      registrarEntity?.handle;

    results.whois = {
      status: 'ok',
      registrar: registrar || 'Unknown',
      created: created || null,
      expires: expires || null,
      updated: updated || null,
      daysToExpire,
      nameservers: rdapData.nameservers?.map((ns: any) => ns.ldhName).slice(0, 4) || [],
      dnssec: rdapData.secureDNS?.delegationSigned ? '✓' : '✗',
      domainStatus: rdapData.status?.slice(0, 3) || [],
      warning: daysToExpire && daysToExpire < 30
        ? `Domain expires in ${daysToExpire} days!`
        : daysToExpire && daysToExpire < 90
        ? `Domain expires in ${daysToExpire} days`
        : null,
    };
  } catch (e) {
    // RDAP might not be available for some TLDs, try to provide useful info
    results.whois = {
      status: 'limited',
      error: (e as Error).message,
      note: 'RDAP not available for this TLD. Use rek_whois for traditional WHOIS lookup.',
    };
  }

  // Calculate overall grade
  let score = 100;
  if (results.connectivity?.status !== 'ok') score -= 30;
  if (results.http?.status !== 200) score -= 20;
  if (results.seo?.issues?.length > 0) score -= results.seo.issues.length * 5;
  if (results.security?.missingCount > 0) score -= results.security.missingCount * 5;
  if (results.tls?.valid === false) score -= 20;
  if (!results.discovery?.sitemap?.found) score -= 5;
  if (!results.discovery?.robots?.found) score -= 5;
  if (results.whois?.daysToExpire && results.whois.daysToExpire < 30) score -= 15;
  else if (results.whois?.daysToExpire && results.whois.daysToExpire < 90) score -= 5;

  results.summary = {
    score: Math.max(0, score),
    grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F',
    highlights: [
      results.connectivity?.status === 'ok' ? `✓ Fast response (${results.connectivity.latency}ms)` : '✗ Connectivity issues',
      results.http?.status === 200 ? '✓ Site accessible' : '✗ HTTP errors',
      results.security?.grade === 'A' || results.security?.grade === 'B' ? '✓ Good security headers' : '⚠ Missing security headers',
      results.seo?.issues?.length === 0 ? '✓ SEO basics covered' : `⚠ ${results.seo?.issues?.length || 0} SEO issues`,
      results.tls?.valid ? '✓ Valid TLS certificate' : '✗ TLS issues',
      results.whois?.status === 'ok' ? (results.whois?.warning ? `⚠ ${results.whois.warning}` : '✓ Domain registration OK') : '⚠ WHOIS unavailable',
    ].filter(Boolean),
  };

  return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
}

// ─────────────────────────────────────────────────────────────────
// Curl Converter - Convert curl commands to Recker code
// ─────────────────────────────────────────────────────────────────

function parseCurlCommand(curlCmd: string): {
  url: string;
  method: string;
  headers: Record<string, string>;
  data?: string;
  dataJson?: object;
} {
  const result = {
    url: '',
    method: 'GET',
    headers: {} as Record<string, string>,
    data: undefined as string | undefined,
    dataJson: undefined as object | undefined,
  };

  // Remove 'curl' prefix and normalize
  let cmd = curlCmd.trim();
  if (cmd.startsWith('curl ')) cmd = cmd.slice(5);

  // Extract URL (usually last argument without flag, or after certain flags)
  const urlMatch = cmd.match(/['"]?(https?:\/\/[^\s'"]+)['"]?/);
  if (urlMatch) result.url = urlMatch[1];

  // Extract method
  const methodMatch = cmd.match(/-X\s+['"]?(\w+)['"]?/i);
  if (methodMatch) result.method = methodMatch[1].toUpperCase();

  // Extract headers
  const headerMatches = cmd.matchAll(/-H\s+['"]([^'"]+)['"]/gi);
  for (const match of headerMatches) {
    const [key, ...valueParts] = match[1].split(':');
    if (key && valueParts.length > 0) {
      result.headers[key.trim()] = valueParts.join(':').trim();
    }
  }

  // Extract data
  const dataMatch = cmd.match(/(?:-d|--data|--data-raw)\s+['"](.+?)['"]/s);
  if (dataMatch) {
    result.data = dataMatch[1];
    result.method = result.method === 'GET' ? 'POST' : result.method;

    // Try to parse as JSON
    try {
      result.dataJson = JSON.parse(dataMatch[1]);
    } catch {
      // Not JSON, keep as string
    }
  }

  return result;
}

async function curlConvert(args: Record<string, unknown>): Promise<MCPToolResult> {
  const curlCmd = String(args.curl || args.command || '');
  const format = String(args.format || 'typescript');

  if (!curlCmd) {
    return { content: [{ type: 'text', text: 'Error: curl command is required' }], isError: true };
  }

  try {
    const parsed = parseCurlCommand(curlCmd);

    if (!parsed.url) {
      return { content: [{ type: 'text', text: 'Error: Could not extract URL from curl command' }], isError: true };
    }

    let code = '';
    const hasHeaders = Object.keys(parsed.headers).length > 0;
    const hasBody = parsed.data || parsed.dataJson;

    if (format === 'typescript' || format === 'ts') {
      code = `import { ${hasHeaders || hasBody ? 'createClient' : 'recker'} } from 'recker';

`;
      if (hasHeaders || hasBody) {
        code += `const client = createClient({
  headers: ${JSON.stringify(parsed.headers, null, 4).replace(/\n/g, '\n  ')},
});

`;
      }

      const clientVar = hasHeaders || hasBody ? 'client' : 'recker';
      const method = parsed.method.toLowerCase();

      if (parsed.dataJson) {
        code += `const response = await ${clientVar}
  .${method}('${parsed.url}')
  .json(${JSON.stringify(parsed.dataJson, null, 2).replace(/\n/g, '\n  ')})
  .json();`;
      } else if (parsed.data) {
        code += `const response = await ${clientVar}
  .${method}('${parsed.url}')
  .body('${parsed.data}')
  .json();`;
      } else {
        code += `const response = await ${clientVar}.${method}('${parsed.url}').json();`;
      }

      code += `

console.log(response);`;
    } else if (format === 'cli' || format === 'rek') {
      // Generate rek CLI command
      code = `rek ${parsed.method !== 'GET' ? parsed.method + ' ' : ''}${parsed.url}`;

      for (const [key, value] of Object.entries(parsed.headers)) {
        code += ` "${key}:${value}"`;
      }

      if (parsed.dataJson) {
        for (const [key, value] of Object.entries(parsed.dataJson)) {
          if (typeof value === 'string') {
            code += ` ${key}="${value}"`;
          } else {
            code += ` ${key}:=${JSON.stringify(value)}`;
          }
        }
      }
    }

    const result = {
      original: curlCmd,
      parsed: {
        url: parsed.url,
        method: parsed.method,
        headers: parsed.headers,
        body: parsed.dataJson || parsed.data,
      },
      code,
      format,
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error parsing curl: ${(e as Error).message}` }], isError: true };
  }
}

// ─────────────────────────────────────────────────────────────────
// API Compare - Compare two API responses
// ─────────────────────────────────────────────────────────────────

function deepCompare(a: any, b: any, path = ''): Array<{ path: string; type: string; a?: any; b?: any }> {
  const diffs: Array<{ path: string; type: string; a?: any; b?: any }> = [];

  if (typeof a !== typeof b) {
    diffs.push({ path: path || 'root', type: 'type_mismatch', a: typeof a, b: typeof b });
    return diffs;
  }

  if (a === null || b === null) {
    if (a !== b) diffs.push({ path: path || 'root', type: 'value_diff', a, b });
    return diffs;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      diffs.push({ path: path || 'root', type: 'array_length', a: a.length, b: b.length });
    }
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      diffs.push(...deepCompare(a[i], b[i], `${path}[${i}]`));
    }
    return diffs;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    const allKeys = new Set([...keysA, ...keysB]);

    for (const key of allKeys) {
      const newPath = path ? `${path}.${key}` : key;
      if (!(key in a)) {
        diffs.push({ path: newPath, type: 'missing_in_a', b: b[key] });
      } else if (!(key in b)) {
        diffs.push({ path: newPath, type: 'missing_in_b', a: a[key] });
      } else {
        diffs.push(...deepCompare(a[key], b[key], newPath));
      }
    }
    return diffs;
  }

  if (a !== b) {
    diffs.push({ path: path || 'root', type: 'value_diff', a, b });
  }

  return diffs;
}

async function apiCompare(args: Record<string, unknown>): Promise<MCPToolResult> {
  const urlA = String(args.url_a || args.urlA || '');
  const urlB = String(args.url_b || args.urlB || '');
  const method = String(args.method || 'GET').toUpperCase();
  const headers = (args.headers as Record<string, string>) || {};
  const ignoreFields = (args.ignore_fields || args.ignoreFields || []) as string[];

  if (!urlA || !urlB) {
    return { content: [{ type: 'text', text: 'Error: url_a and url_b are required' }], isError: true };
  }

  try {
    const client = createClient({ headers, timeout: 30000 });

    // Fetch both URLs in parallel
    const [responseA, responseB] = await Promise.all([
      client[method.toLowerCase() as 'get'](urlA),
      client[method.toLowerCase() as 'get'](urlB),
    ]);

    const [dataA, dataB] = await Promise.all([
      responseA.json().catch(() => responseA.text()),
      responseB.json().catch(() => responseB.text()),
    ]);

    // Remove ignored fields
    const cleanData = (data: any): any => {
      if (typeof data !== 'object' || data === null) return data;
      const cleaned = Array.isArray(data) ? [...data] : { ...data };
      for (const field of ignoreFields) {
        const parts = field.split('.');
        let obj = cleaned;
        for (let i = 0; i < parts.length - 1; i++) {
          if (obj && typeof obj === 'object') obj = obj[parts[i]];
        }
        if (obj && typeof obj === 'object') delete obj[parts[parts.length - 1]];
      }
      return cleaned;
    };

    const cleanA = cleanData(dataA);
    const cleanB = cleanData(dataB);

    const diffs = deepCompare(cleanA, cleanB);

    const result = {
      urls: { a: urlA, b: urlB },
      status: { a: responseA.status, b: responseB.status },
      identical: diffs.length === 0,
      differenceCount: diffs.length,
      differences: diffs.slice(0, 50), // Limit to first 50 diffs
      summary: {
        typeMismatches: diffs.filter(d => d.type === 'type_mismatch').length,
        valueDiffs: diffs.filter(d => d.type === 'value_diff').length,
        missingInA: diffs.filter(d => d.type === 'missing_in_a').length,
        missingInB: diffs.filter(d => d.type === 'missing_in_b').length,
        arrayLengthDiffs: diffs.filter(d => d.type === 'array_length').length,
      },
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error comparing APIs: ${(e as Error).message}` }], isError: true };
  }
}

// ─────────────────────────────────────────────────────────────────
// Load Test - Simple performance benchmark
// ─────────────────────────────────────────────────────────────────

async function loadTest(args: Record<string, unknown>): Promise<MCPToolResult> {
  const url = String(args.url || '');
  const requests = Math.min(Number(args.requests) || 10, 100); // Cap at 100
  const concurrency = Math.min(Number(args.concurrency) || 5, 20); // Cap at 20
  const method = String(args.method || 'GET').toUpperCase();
  const headers = (args.headers as Record<string, string>) || {};
  const timeout = Number(args.timeout) || 10000;

  if (!url) {
    return { content: [{ type: 'text', text: 'Error: url is required' }], isError: true };
  }

  const client = createClient({ headers, timeout });
  const results: Array<{ status: number; latency: number; error?: string }> = [];
  const startTime = Date.now();

  // Run requests in batches
  const batches = Math.ceil(requests / concurrency);

  for (let batch = 0; batch < batches; batch++) {
    const batchSize = Math.min(concurrency, requests - batch * concurrency);
    const batchPromises = [];

    for (let i = 0; i < batchSize; i++) {
      const reqStart = Date.now();
      batchPromises.push(
        client[method.toLowerCase() as 'get'](url)
          .then(res => ({
            status: res.status,
            latency: Date.now() - reqStart,
          }))
          .catch(e => ({
            status: 0,
            latency: Date.now() - reqStart,
            error: (e as Error).message,
          }))
      );
    }

    results.push(...await Promise.all(batchPromises));
  }

  const totalTime = Date.now() - startTime;
  const successful = results.filter(r => r.status >= 200 && r.status < 400);
  const failed = results.filter(r => r.status === 0 || r.status >= 400);
  const latencies = successful.map(r => r.latency).sort((a, b) => a - b);

  const percentile = (arr: number[], p: number) => {
    if (arr.length === 0) return 0;
    const idx = Math.ceil(arr.length * p / 100) - 1;
    return arr[Math.max(0, idx)];
  };

  const result = {
    url,
    config: { requests, concurrency, method, timeout },
    summary: {
      totalRequests: requests,
      successful: successful.length,
      failed: failed.length,
      successRate: `${((successful.length / requests) * 100).toFixed(1)}%`,
      totalTime: `${totalTime}ms`,
      requestsPerSecond: ((requests / totalTime) * 1000).toFixed(2),
    },
    latency: latencies.length > 0 ? {
      min: `${Math.min(...latencies)}ms`,
      max: `${Math.max(...latencies)}ms`,
      avg: `${Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)}ms`,
      p50: `${percentile(latencies, 50)}ms`,
      p90: `${percentile(latencies, 90)}ms`,
      p99: `${percentile(latencies, 99)}ms`,
    } : null,
    errors: failed.length > 0 ? {
      count: failed.length,
      samples: failed.slice(0, 5).map(r => r.error || `HTTP ${r.status}`),
    } : null,
  };

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

// ─────────────────────────────────────────────────────────────────
// SEO Sitemap - Analyze or generate sitemap
// ─────────────────────────────────────────────────────────────────

async function seoSitemap(args: Record<string, unknown>): Promise<MCPToolResult> {
  const url = String(args.url || '');
  const action = String(args.action || 'analyze');

  if (!url) {
    return { content: [{ type: 'text', text: 'Error: url is required' }], isError: true };
  }

  const client = createClient({ timeout: 30000 });

  try {
    // Normalize base URL
    const baseUrl = url.replace(/\/+$/, '');
    const sitemapUrls = [
      `${baseUrl}/sitemap.xml`,
      `${baseUrl}/sitemap_index.xml`,
      `${baseUrl}/sitemap/sitemap.xml`,
    ];

    let sitemapContent: string | null = null;
    let sitemapUrl = '';

    // Try to find sitemap
    for (const tryUrl of sitemapUrls) {
      try {
        const response = await client.get(tryUrl);
        if (response.ok) {
          sitemapContent = await response.text();
          sitemapUrl = tryUrl;
          break;
        }
      } catch {
        // Continue to next URL
      }
    }

    // Try robots.txt for sitemap location
    if (!sitemapContent) {
      try {
        const robotsResponse = await client.get(`${baseUrl}/robots.txt`);
        if (robotsResponse.ok) {
          const robotsTxt = await robotsResponse.text();
          const sitemapMatch = robotsTxt.match(/Sitemap:\s*(.+)/i);
          if (sitemapMatch) {
            const robotsSitemapUrl = sitemapMatch[1].trim();
            const response = await client.get(robotsSitemapUrl);
            if (response.ok) {
              sitemapContent = await response.text();
              sitemapUrl = robotsSitemapUrl;
            }
          }
        }
      } catch {
        // No robots.txt or no sitemap in it
      }
    }

    if (!sitemapContent) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'not_found',
            message: 'No sitemap found',
            triedUrls: sitemapUrls,
            recommendation: 'Create a sitemap.xml at the root of your domain',
            example: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <priority>1.0</priority>
  </url>
</urlset>`,
          }, null, 2),
        }],
      };
    }

    // Parse and analyze sitemap
    const urlMatches = sitemapContent.matchAll(/<loc>([^<]+)<\/loc>/g);
    const urls: string[] = [];
    for (const match of urlMatches) {
      urls.push(match[1]);
    }

    // Check for sitemap index
    const isSitemapIndex = sitemapContent.includes('<sitemapindex');
    const sitemapMatches = sitemapContent.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/g);
    const childSitemaps: string[] = [];
    for (const match of sitemapMatches) {
      childSitemaps.push(match[1]);
    }

    // Analyze URLs
    const analysis = {
      sitemapUrl,
      type: isSitemapIndex ? 'sitemap_index' : 'urlset',
      stats: {
        totalUrls: urls.length,
        childSitemaps: childSitemaps.length,
      },
      issues: [] as string[],
      recommendations: [] as string[],
    };

    // Check for common issues
    if (urls.length === 0 && childSitemaps.length === 0) {
      analysis.issues.push('Sitemap is empty');
    }

    if (urls.length > 50000) {
      analysis.issues.push(`Sitemap exceeds 50,000 URL limit (${urls.length} URLs)`);
      analysis.recommendations.push('Split into multiple sitemaps using a sitemap index');
    }

    // Check URL patterns
    const httpUrls = urls.filter(u => u.startsWith('http://'));
    if (httpUrls.length > 0) {
      analysis.issues.push(`${httpUrls.length} URLs using HTTP instead of HTTPS`);
      analysis.recommendations.push('Update all URLs to use HTTPS');
    }

    // Check for trailing slashes consistency
    const withSlash = urls.filter(u => u.endsWith('/')).length;
    const withoutSlash = urls.filter(u => !u.endsWith('/') && !u.match(/\.\w+$/)).length;
    if (withSlash > 0 && withoutSlash > 0) {
      analysis.issues.push('Inconsistent trailing slashes in URLs');
      analysis.recommendations.push('Standardize URL format (with or without trailing slashes)');
    }

    // Check for lastmod dates
    const hasLastmod = sitemapContent.includes('<lastmod>');
    if (!hasLastmod) {
      analysis.recommendations.push('Add <lastmod> dates to help search engines prioritize crawling');
    }

    const result = {
      ...analysis,
      sampleUrls: urls.slice(0, 10),
      childSitemaps: childSitemaps.slice(0, 5),
      grade: analysis.issues.length === 0 ? 'A' :
             analysis.issues.length <= 2 ? 'B' :
             analysis.issues.length <= 4 ? 'C' : 'D',
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error analyzing sitemap: ${(e as Error).message}` }], isError: true };
  }
}

// ─────────────────────────────────────────────────────────────────
// SEO Schema - Extract and validate JSON-LD structured data
// ─────────────────────────────────────────────────────────────────

async function seoSchema(args: Record<string, unknown>): Promise<MCPToolResult> {
  const url = String(args.url || '');
  const validate = args.validate !== false;

  if (!url) {
    return { content: [{ type: 'text', text: 'Error: url is required' }], isError: true };
  }

  try {
    const client = createClient({ timeout: 30000 });
    const response = await client.get(url);
    const html = await response.text();

    // Extract JSON-LD scripts
    const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    const schemas: Array<{ raw: string; parsed: any; valid: boolean; errors: string[] }> = [];

    for (const match of jsonLdMatches) {
      const raw = match[1].trim();
      let parsed: any = null;
      let valid = false;
      const errors: string[] = [];

      try {
        parsed = JSON.parse(raw);
        valid = true;

        // Validate common issues
        if (validate && parsed) {
          const schemaType = parsed['@type'] || (Array.isArray(parsed) ? parsed[0]?.['@type'] : null);

          if (!parsed['@context']) {
            errors.push('Missing @context (should be "https://schema.org")');
          } else if (!parsed['@context'].includes('schema.org')) {
            errors.push('@context should reference schema.org');
          }

          if (!schemaType) {
            errors.push('Missing @type');
          }

          // Type-specific validation
          if (schemaType === 'Article' || schemaType === 'NewsArticle' || schemaType === 'BlogPosting') {
            if (!parsed.headline) errors.push('Article: missing headline');
            if (!parsed.author) errors.push('Article: missing author');
            if (!parsed.datePublished) errors.push('Article: missing datePublished');
            if (!parsed.image) errors.push('Article: missing image (recommended)');
          }

          if (schemaType === 'Product') {
            if (!parsed.name) errors.push('Product: missing name');
            if (!parsed.offers) errors.push('Product: missing offers');
            if (parsed.offers && !parsed.offers.price) errors.push('Product: offers missing price');
            if (parsed.offers && !parsed.offers.priceCurrency) errors.push('Product: offers missing priceCurrency');
          }

          if (schemaType === 'LocalBusiness' || schemaType === 'Organization') {
            if (!parsed.name) errors.push(`${schemaType}: missing name`);
            if (!parsed.address) errors.push(`${schemaType}: missing address (recommended)`);
          }

          if (schemaType === 'FAQPage') {
            if (!parsed.mainEntity || !Array.isArray(parsed.mainEntity)) {
              errors.push('FAQPage: missing or invalid mainEntity array');
            }
          }

          if (schemaType === 'BreadcrumbList') {
            if (!parsed.itemListElement || !Array.isArray(parsed.itemListElement)) {
              errors.push('BreadcrumbList: missing itemListElement array');
            }
          }
        }
      } catch (e) {
        errors.push(`Invalid JSON: ${(e as Error).message}`);
      }

      schemas.push({ raw: raw.slice(0, 500), parsed, valid, errors });
    }

    // Analyze what's present and what's missing
    const presentTypes = schemas
      .filter(s => s.parsed)
      .map(s => s.parsed['@type'] || (Array.isArray(s.parsed) ? 'Multiple' : 'Unknown'))
      .filter(Boolean);

    const recommendations: string[] = [];

    if (schemas.length === 0) {
      recommendations.push('Add JSON-LD structured data for better search visibility');
      recommendations.push('Start with Organization or WebSite schema for branding');
    }

    if (!presentTypes.includes('Organization') && !presentTypes.includes('WebSite')) {
      recommendations.push('Add Organization or WebSite schema for knowledge panel eligibility');
    }

    if (!presentTypes.includes('BreadcrumbList')) {
      recommendations.push('Add BreadcrumbList for enhanced navigation in search results');
    }

    const allErrors = schemas.flatMap(s => s.errors);

    const result = {
      url,
      schemasFound: schemas.length,
      types: presentTypes,
      schemas: schemas.map(s => ({
        type: s.parsed?.['@type'] || 'Invalid',
        valid: s.valid && s.errors.length === 0,
        errors: s.errors,
        preview: s.parsed ? JSON.stringify(s.parsed).slice(0, 200) + '...' : s.raw.slice(0, 200),
      })),
      summary: {
        totalIssues: allErrors.length,
        hasValidSchema: schemas.some(s => s.valid && s.errors.length === 0),
      },
      recommendations,
      grade: schemas.length === 0 ? 'F' :
             allErrors.length === 0 ? 'A' :
             allErrors.length <= 2 ? 'B' :
             allErrors.length <= 5 ? 'C' : 'D',
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error extracting schema: ${(e as Error).message}` }], isError: true };
  }
}

// ─────────────────────────────────────────────────────────────────
// AI Compare - Compare responses from different AI providers
// ─────────────────────────────────────────────────────────────────

async function aiCompare(args: Record<string, unknown>): Promise<MCPToolResult> {
  const prompt = String(args.prompt || '');
  const providers = (args.providers as string[]) || ['openai', 'anthropic'];
  const maxTokens = Number(args.max_tokens) || 500;

  if (!prompt) {
    return { content: [{ type: 'text', text: 'Error: prompt is required' }], isError: true };
  }

  // Check for API keys
  const apiKeys: Record<string, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
    groq: process.env.GROQ_API_KEY,
    mistral: process.env.MISTRAL_API_KEY,
  };

  const availableProviders = providers.filter(p => apiKeys[p]);
  const unavailableProviders = providers.filter(p => !apiKeys[p]);

  if (availableProviders.length === 0) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'No API keys found for requested providers',
          requestedProviders: providers,
          missingEnvVars: providers.map(p => {
            switch (p) {
              case 'openai': return 'OPENAI_API_KEY';
              case 'anthropic': return 'ANTHROPIC_API_KEY';
              case 'google': return 'GOOGLE_API_KEY or GEMINI_API_KEY';
              case 'groq': return 'GROQ_API_KEY';
              case 'mistral': return 'MISTRAL_API_KEY';
              default: return `${p.toUpperCase()}_API_KEY`;
            }
          }),
        }, null, 2),
      }],
      isError: true,
    };
  }

  const results: Array<{
    provider: string;
    model: string;
    response: string | null;
    latency: number;
    tokens?: { input?: number; output?: number };
    error?: string;
  }> = [];

  // Provider configurations
  const providerConfigs: Record<string, { url: string; model: string; transform: (p: string, m: number) => any; parseResponse: (data: any) => { text: string; tokens?: any } }> = {
    openai: {
      url: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      transform: (p, m) => ({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: p }],
        max_tokens: m,
      }),
      parseResponse: (data) => ({
        text: data.choices?.[0]?.message?.content || '',
        tokens: { input: data.usage?.prompt_tokens, output: data.usage?.completion_tokens },
      }),
    },
    anthropic: {
      url: 'https://api.anthropic.com/v1/messages',
      model: 'claude-3-haiku-20240307',
      transform: (p, m) => ({
        model: 'claude-3-haiku-20240307',
        messages: [{ role: 'user', content: p }],
        max_tokens: m,
      }),
      parseResponse: (data) => ({
        text: data.content?.[0]?.text || '',
        tokens: { input: data.usage?.input_tokens, output: data.usage?.output_tokens },
      }),
    },
    groq: {
      url: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.1-8b-instant',
      transform: (p, m) => ({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: p }],
        max_tokens: m,
      }),
      parseResponse: (data) => ({
        text: data.choices?.[0]?.message?.content || '',
        tokens: { input: data.usage?.prompt_tokens, output: data.usage?.completion_tokens },
      }),
    },
    mistral: {
      url: 'https://api.mistral.ai/v1/chat/completions',
      model: 'mistral-small-latest',
      transform: (p, m) => ({
        model: 'mistral-small-latest',
        messages: [{ role: 'user', content: p }],
        max_tokens: m,
      }),
      parseResponse: (data) => ({
        text: data.choices?.[0]?.message?.content || '',
        tokens: { input: data.usage?.prompt_tokens, output: data.usage?.completion_tokens },
      }),
    },
  };

  // Run requests in parallel
  const promises = availableProviders.map(async (provider) => {
    const config = providerConfigs[provider];
    if (!config) {
      return { provider, model: 'unknown', response: null, latency: 0, error: `Unknown provider: ${provider}` };
    }

    const startTime = Date.now();
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (provider === 'openai' || provider === 'groq' || provider === 'mistral') {
        headers['Authorization'] = `Bearer ${apiKeys[provider]}`;
      } else if (provider === 'anthropic') {
        headers['x-api-key'] = apiKeys[provider]!;
        headers['anthropic-version'] = '2023-06-01';
      }

      // Create a client with the specific headers for this provider
      const providerClient = createClient({
        timeout: 60000,
        headers,
      });

      const response = await providerClient.post(config.url, {
        json: config.transform(prompt, maxTokens),
      });

      const data = await response.json() as any;
      const parsed = config.parseResponse(data);

      return {
        provider,
        model: config.model,
        response: parsed.text,
        latency: Date.now() - startTime,
        tokens: parsed.tokens,
      };
    } catch (e) {
      return {
        provider,
        model: config.model,
        response: null,
        latency: Date.now() - startTime,
        error: (e as Error).message,
      };
    }
  });

  const responses = await Promise.all(promises);
  results.push(...responses);

  // Calculate comparison metrics
  const successful = results.filter(r => r.response);
  const avgLatency = successful.length > 0
    ? Math.round(successful.reduce((a, b) => a + b.latency, 0) / successful.length)
    : 0;

  const fastestProvider = successful.length > 0
    ? successful.reduce((a, b) => a.latency < b.latency ? a : b).provider
    : null;

  const result = {
    prompt: prompt.slice(0, 200) + (prompt.length > 200 ? '...' : ''),
    comparison: {
      providersRequested: providers,
      providersAvailable: availableProviders,
      providersMissing: unavailableProviders,
      successfulResponses: successful.length,
    },
    metrics: {
      averageLatency: `${avgLatency}ms`,
      fastestProvider,
      latencyRanking: successful
        .sort((a, b) => a.latency - b.latency)
        .map(r => ({ provider: r.provider, latency: `${r.latency}ms` })),
    },
    responses: results.map(r => ({
      provider: r.provider,
      model: r.model,
      latency: `${r.latency}ms`,
      tokens: r.tokens,
      response: r.response ? r.response.slice(0, 500) + (r.response.length > 500 ? '...' : '') : null,
      error: r.error,
    })),
  };

  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

// ─────────────────────────────────────────────────────────────────
// Tool Definitions
// ─────────────────────────────────────────────────────────────────

export const unifiedTools: MCPTool[] = [
  {
    name: 'rek_site_audit',
    description: `Quick website audit without crawling. Analyzes a single URL and returns:
- Connectivity: TCP latency, HTTP status, TTFB
- SEO: title, description, h1, Open Graph tags, issues
- Security: HTTPS, security headers grade
- TLS: certificate validity, expiration, protocol
- DNS: A records, CDN/server detection
- WHOIS/RDAP: registrar, registration dates, expiration, nameservers, DNSSEC
- Discovery: robots.txt, sitemap.xml, llms.txt, humans.txt, manifest.json, security.txt

Returns an overall score (0-100) and grade (A-F). Use this for quick site health checks.`,
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to audit (e.g., "https://example.com" or just "example.com")' },
      },
      required: ['url'],
    },
  },
  {
    name: 'rek_domain_audit',
    description: 'Comprehensive domain audit: DNS records, TLS certificate, HTTP security headers, and WHOIS/RDAP registration info. Returns a grade (A-F) and actionable findings.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Domain to audit (e.g., "example.com")' },
        checks: {
          type: 'array',
          items: { type: 'string', enum: ['dns', 'tls', 'http', 'whois'] },
          description: 'Specific checks to run (default: all)',
        },
      },
      required: ['domain'],
    },
  },
  {
    name: 'rek_curl_convert',
    description: 'Convert a curl command to Recker TypeScript code or CLI command. Useful for migrating existing API calls.',
    inputSchema: {
      type: 'object',
      properties: {
        curl: { type: 'string', description: 'The curl command to convert' },
        format: {
          type: 'string',
          enum: ['typescript', 'ts', 'cli', 'rek'],
          description: 'Output format (default: typescript)',
        },
      },
      required: ['curl'],
    },
  },
  {
    name: 'rek_api_compare',
    description: 'Compare responses from two API endpoints. Useful for testing API migrations, A/B testing, or verifying deployments.',
    inputSchema: {
      type: 'object',
      properties: {
        url_a: { type: 'string', description: 'First URL to compare' },
        url_b: { type: 'string', description: 'Second URL to compare' },
        method: { type: 'string', description: 'HTTP method (default: GET)' },
        headers: { type: 'object', description: 'Headers to send with both requests' },
        ignore_fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to ignore in comparison (e.g., ["timestamp", "requestId"])',
        },
      },
      required: ['url_a', 'url_b'],
    },
  },
  {
    name: 'rek_load_test',
    description: 'Simple load test for an API endpoint. Returns latency percentiles and success rate. Max 100 requests, 20 concurrency.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to test' },
        requests: { type: 'number', description: 'Number of requests (default: 10, max: 100)' },
        concurrency: { type: 'number', description: 'Concurrent requests (default: 5, max: 20)' },
        method: { type: 'string', description: 'HTTP method (default: GET)' },
        headers: { type: 'object', description: 'Headers to send' },
        timeout: { type: 'number', description: 'Request timeout in ms (default: 10000)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'rek_seo_sitemap',
    description: 'Analyze a website sitemap.xml for SEO issues. Checks URL count, HTTPS usage, trailing slashes, lastmod dates, and sitemap structure.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Base URL of the website (e.g., "https://example.com")' },
        action: {
          type: 'string',
          enum: ['analyze'],
          description: 'Action to perform (default: analyze)',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'rek_seo_schema',
    description: 'Extract and validate JSON-LD structured data (Schema.org) from a webpage. Checks for common schema types and validates required properties.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to analyze' },
        validate: { type: 'boolean', description: 'Validate schema properties (default: true)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'rek_ai_compare',
    description: 'Compare responses from multiple AI providers for the same prompt. Compares latency, token usage, and response quality. Requires API keys in environment.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt to send to all providers' },
        providers: {
          type: 'array',
          items: { type: 'string', enum: ['openai', 'anthropic', 'groq', 'mistral'] },
          description: 'Providers to compare (default: ["openai", "anthropic"])',
        },
        max_tokens: { type: 'number', description: 'Max tokens for responses (default: 500)' },
      },
      required: ['prompt'],
    },
  },
];

export const unifiedToolHandlers: Record<string, (args: Record<string, unknown>) => Promise<MCPToolResult>> = {
  rek_site_audit: siteAudit,
  rek_domain_audit: domainAudit,
  rek_curl_convert: curlConvert,
  rek_api_compare: apiCompare,
  rek_load_test: loadTest,
  rek_seo_sitemap: seoSitemap,
  rek_seo_schema: seoSchema,
  rek_ai_compare: aiCompare,
};
