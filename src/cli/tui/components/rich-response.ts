/**
 * RichResponseRenderer - Visual response rendering using tuiuiu components
 *
 * Renders command responses with appropriate visual components:
 * - HTTP: Status badges, header tables, timing gauges
 * - DNS: Record tables with colored types
 * - Ping: Latency gauges and sparklines
 * - WHOIS: Hierarchical tree views
 * - Generic: Formatted tables and key-value displays
 */

import {
  Box,
  Text,
  Table,
  Gauge,
  Sparkline,
  BarChart,
  Tree,
  BigText,
  Divider,
  type TableColumn,
  type TreeNode,
} from 'tuiuiu.js';
import { themeColor } from '../shared/theme-helper.js';
import type { VNode } from 'tuiuiu.js';

// =============================================================================
// Types
// =============================================================================

export type ResponseType =
  | 'http'
  | 'dns'
  | 'ping'
  | 'whois'
  | 'rdap'
  | 'tls'
  | 'geoip'
  | 'seo'
  | 'spider'
  | 'seo-spider'
  | 'headers'
  | 'json'
  | 'text'
  | 'error';

export interface RichResponseProps {
  type: ResponseType;
  data: unknown;
  width?: number;
  forceJson?: boolean;
}

// =============================================================================
// Status Badge Component
// =============================================================================

function StatusBadge(props: { status: number; statusText?: string }): VNode {
  const { status, statusText } = props;

  let color: string;
  let icon: string;

  if (status >= 200 && status < 300) {
    color = themeColor('success');
    icon = '✓';
  } else if (status >= 300 && status < 400) {
    color = themeColor('accent');
    icon = '→';
  } else if (status >= 400 && status < 500) {
    color = themeColor('warning');
    icon = '⚠';
  } else if (status >= 500) {
    color = themeColor('error');
    icon = '✗';
  } else {
    color = themeColor('mutedForeground');
    icon = '•';
  }

  return Box(
    { flexDirection: 'row' },
    Text({ color, bold: true }, `${icon} `),
    Text({ color, bold: true }, `${status}`),
    statusText ? Text({ color, dim: true }, ` ${statusText}`) : null,
  );
}

// =============================================================================
// HTTP Response Renderer
// =============================================================================

interface HttpResponseData {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: unknown;
  time?: number;
  size?: number;
  url?: string;
  method?: string;
}

function renderHttpResponse(data: HttpResponseData, width: number): VNode {
  const children: VNode[] = [];

  // Status line (first item - no margin)
  if (data.status !== undefined) {
    children.push(
      Box(
        { flexDirection: 'row' },
        StatusBadge({ status: data.status, statusText: data.statusText }),
        data.time !== undefined
          ? Text({ color: themeColor('mutedForeground'), dim: true }, `  ${data.time}ms`)
          : null,
        data.size !== undefined
          ? Text({ color: themeColor('mutedForeground'), dim: true }, `  ${formatBytes(data.size)}`)
          : null,
      )
    );
  }

  // Timing gauge if we have time data
  if (data.time !== undefined) {
    const maxTime = 5000; // 5s max for gauge
    const gaugeValue = Math.min(data.time, maxTime);

    children.push(
      Box(
        { marginTop: 1 },
        Text({ color: themeColor('mutedForeground'), dim: true }, '⏱ Response Time'),
      )
    );
    children.push(
      Gauge({
        value: gaugeValue,
        max: maxTime,
        width: Math.min(40, width - 4),
        showValue: true,
        zones: [
          { start: 0, end: 4, color: 'green' },
          { start: 4, end: 20, color: 'yellow' },
          { start: 20, end: 100, color: 'red' },
        ],
      })
    );
  }

  // Headers as table
  if (data.headers && Object.keys(data.headers).length > 0) {
    const headerData = Object.entries(data.headers)
      .slice(0, 10)
      .map(([key, value]) => ({
        header: key,
        value: String(value).slice(0, 50) + (String(value).length > 50 ? '...' : ''),
      }));

    children.push(
      Box(
        { marginTop: 1 },
        Text({ color: themeColor('accent'), bold: true }, '📋 Headers'),
      )
    );
    children.push(
      Table({
        columns: [
          { key: 'header', header: 'Header', width: 25 },
          { key: 'value', header: 'Value', width: Math.max(30, width - 35) },
        ],
        data: headerData,
        borderStyle: 'single',
      })
    );
  }

  // Body preview (limited)
  if (data.body !== undefined && data.body !== null) {
    const bodyPreview = typeof data.body === 'string'
      ? data.body.slice(0, 200)
      : JSON.stringify(data.body, null, 2).slice(0, 200);

    children.push(
      Box(
        { marginTop: 1 },
        Text({ color: themeColor('accent'), bold: true }, '📄 Body Preview'),
      )
    );
    children.push(
      Text({ color: themeColor('success') }, bodyPreview + (bodyPreview.length >= 200 ? '...' : ''))
    );
  }

  return Box({ flexDirection: 'column', width }, ...children);
}

// =============================================================================
// DNS Response Renderer
// =============================================================================

interface DnsRecord {
  type: string;
  name?: string;
  value?: string;
  ttl?: number;
  priority?: number;
}

interface DnsResponseData {
  domain?: string;
  records?: DnsRecord[];
  answers?: DnsRecord[];
  time?: number;
}

function getDnsTypeColor(type: string): string {
  const colors: Record<string, string> = {
    A: 'green',
    AAAA: 'cyan',
    CNAME: 'yellow',
    MX: 'magenta',
    TXT: 'blue',
    NS: 'orange',
    SOA: 'red',
    PTR: 'gray',
  };
  return colors[type] || themeColor('foreground');
}

function renderDnsResponse(data: DnsResponseData, width: number): VNode {
  const children: VNode[] = [];
  const records = data.records || data.answers || [];

  // Domain header (first item - no margin)
  if (data.domain) {
    children.push(
      Box(
        { flexDirection: 'row' },
        Text({ color: themeColor('primary'), bold: true }, '🌐 '),
        Text({ color: themeColor('primary'), bold: true }, data.domain),
        data.time !== undefined
          ? Text({ color: themeColor('mutedForeground'), dim: true }, `  (${data.time}ms)`)
          : null,
      )
    );
  }

  // Records as colored table
  if (records.length > 0) {
    const tableData = records.map((r) => ({
      type: r.type,
      value: r.value || r.name || '',
      ttl: r.ttl !== undefined ? `${r.ttl}s` : '-',
    }));

    children.push(
      Box(
        { marginTop: 1 },
        Table({
          columns: [
            { key: 'type', header: 'Type', width: 8 },
            { key: 'value', header: 'Value', width: Math.max(40, width - 25) },
            { key: 'ttl', header: 'TTL', width: 10 },
          ],
          data: tableData,
          borderStyle: 'single',
        }),
      )
    );

    // Record type distribution as bar chart
    const typeCounts: Record<string, number> = {};
    records.forEach((r) => {
      typeCounts[r.type] = (typeCounts[r.type] || 0) + 1;
    });

    if (Object.keys(typeCounts).length > 1) {
      const barData = Object.entries(typeCounts).map(([label, value]) => ({
        label,
        value,
        color: getDnsTypeColor(label),
      }));

      children.push(
        Box(
          { marginTop: 1 },
          Text({ color: themeColor('mutedForeground'), dim: true }, '📊 Record Distribution'),
        )
      );
      children.push(
        BarChart({
          data: barData,
          orientation: 'horizontal',
          width: Math.min(40, width - 4),
          showValues: true,
        })
      );
    }
  }

  return Box({ flexDirection: 'column', width }, ...children);
}

// =============================================================================
// Ping Response Renderer
// =============================================================================

interface PingResponseData {
  host?: string;
  port?: number;
  success?: boolean;
  time?: number;
  times?: number[];
  avg?: number;
  min?: number;
  max?: number;
}

function renderPingResponse(data: PingResponseData, width: number): VNode {
  const children: VNode[] = [];

  // Host header with success/fail indicator (first item - no margin)
  children.push(
    Box(
      { flexDirection: 'row' },
      Text(
        { color: data.success ? themeColor('success') : themeColor('error'), bold: true },
        data.success ? '✓ ' : '✗ '
      ),
      Text({ color: themeColor('primary'), bold: true }, data.host || 'unknown'),
      data.port ? Text({ color: themeColor('mutedForeground') }, `:${data.port}`) : null,
    )
  );

  // Latency gauge
  if (data.time !== undefined || data.avg !== undefined) {
    const latency = data.avg ?? data.time ?? 0;
    const maxLatency = 1000;

    children.push(
      Box(
        { marginTop: 1 },
        Text({ color: themeColor('mutedForeground'), dim: true }, '📶 Latency'),
      )
    );
    children.push(
      Gauge({
        value: Math.min(latency, maxLatency),
        max: maxLatency,
        width: Math.min(40, width - 4),
        showValue: true,
        zones: [
          { start: 0, end: 5, color: 'green' },
          { start: 5, end: 20, color: 'yellow' },
          { start: 20, end: 100, color: 'red' },
        ],
      })
    );
    children.push(
      Text({ color: themeColor('success'), bold: true }, `${latency.toFixed(1)}ms`)
    );
  }

  // Sparkline for multiple pings
  if (data.times && data.times.length > 1) {
    children.push(
      Box(
        { marginTop: 1 },
        Text({ color: themeColor('mutedForeground'), dim: true }, '📈 Ping History'),
      )
    );
    children.push(
      Sparkline({
        data: data.times,
        width: Math.min(40, width - 4),
        color: themeColor('primary'),
      })
    );
    children.push(
      Box(
        { flexDirection: 'row' },
        Text({ color: themeColor('mutedForeground'), dim: true }, `min: ${data.min?.toFixed(1)}ms `),
        Text({ color: themeColor('mutedForeground'), dim: true }, `avg: ${data.avg?.toFixed(1)}ms `),
        Text({ color: themeColor('mutedForeground'), dim: true }, `max: ${data.max?.toFixed(1)}ms`),
      )
    );
  }

  return Box({ flexDirection: 'column', width }, ...children);
}

// =============================================================================
// WHOIS/RDAP Response Renderer
// =============================================================================

interface WhoisResponseData {
  domain?: string;
  registrar?: string;
  createdDate?: string;
  expiresDate?: string;
  updatedDate?: string;
  status?: string[];
  nameservers?: string[];
  registrant?: Record<string, string>;
  raw?: string;
  data?: Record<string, string>;
  server?: string;
  query?: string;
}

function renderWhoisResponse(data: WhoisResponseData, width: number): VNode {
  const children: VNode[] = [];

  // Domain header (first item - no margin)
  if (data.domain) {
    children.push(
      Box(
        { flexDirection: 'row' },
        Text({ color: themeColor('primary'), bold: true }, '🔍 '),
        Text({ color: themeColor('primary'), bold: true }, data.domain),
        data.server ? Text({ color: themeColor('mutedForeground'), dim: true }, ` (via ${data.server})`) : null,
      )
    );
  }

  // Key info as table (structured fields)
  const infoData: { field: string; value: string }[] = [];

  if (data.registrar) infoData.push({ field: 'Registrar', value: data.registrar });
  if (data.createdDate) infoData.push({ field: 'Created', value: data.createdDate });
  if (data.expiresDate) infoData.push({ field: 'Expires', value: data.expiresDate });
  if (data.updatedDate) infoData.push({ field: 'Updated', value: data.updatedDate });

  // If no structured fields, try to extract from data object
  if (infoData.length === 0 && data.data) {
    // Priority ordered field mappings (first match wins for each label)
    const fieldPriority: { pattern: RegExp; label: string }[] = [
      { pattern: /^registrar$/i, label: 'Registrar' },
      { pattern: /registrar name/i, label: 'Registrar' },
      { pattern: /creation date/i, label: 'Created' },
      { pattern: /created/i, label: 'Created' },
      { pattern: /registry expiry/i, label: 'Expires' },
      { pattern: /expir/i, label: 'Expires' },
      { pattern: /updated date/i, label: 'Updated' },
      { pattern: /^updated$/i, label: 'Updated' },
      { pattern: /registrant org/i, label: 'Organization' },
      { pattern: /registrant country/i, label: 'Country' },
      { pattern: /name server/i, label: 'Nameserver' },
      { pattern: /dnssec/i, label: 'DNSSEC' },
      { pattern: /domain status/i, label: 'Status' },
    ];

    const usedLabels = new Set<string>();

    for (const [key, val] of Object.entries(data.data)) {
      const lowerKey = key.toLowerCase();

      // Skip very long values (like terms of use)
      if (String(val).length > 200) continue;

      for (const { pattern, label } of fieldPriority) {
        if (pattern.test(lowerKey) && !usedLabels.has(label)) {
          const truncatedVal = String(val).length > 60 ? String(val).slice(0, 57) + '...' : String(val);
          infoData.push({ field: label, value: truncatedVal });
          usedLabels.add(label);
          break;
        }
      }
      if (infoData.length >= 8) break; // Limit to 8 fields
    }
  }

  if (infoData.length > 0) {
    children.push(
      Table({
        columns: [
          { key: 'field', header: 'Field', width: 18 },
          { key: 'value', header: 'Value', width: Math.max(30, width - 28) },
        ],
        data: infoData,
        borderStyle: 'single',
      })
    );
  }

  // Status badges
  if (data.status && data.status.length > 0) {
    children.push(
      Box(
        { flexDirection: 'column', marginTop: 1 },
        Text({ color: themeColor('accent'), bold: true }, '📋 Status'),
        ...data.status.slice(0, 5).map((s) =>
          Text({ color: themeColor('success') }, `  • ${s}`)
        ),
      )
    );
  }

  // Nameservers
  if (data.nameservers && data.nameservers.length > 0) {
    children.push(
      Box(
        { flexDirection: 'column', marginTop: 1 },
        Text({ color: themeColor('accent'), bold: true }, '🌐 Nameservers'),
        ...data.nameservers.slice(0, 5).map((ns) =>
          Text({ color: themeColor('primary') }, `  • ${ns}`)
        ),
      )
    );
  }

  // If no structured data at all, show raw preview
  if (children.length === 1 && data.raw) {
    const rawLines = data.raw.split('\n').filter(l => l.trim()).slice(0, 10);
    children.push(
      Box(
        { flexDirection: 'column', marginTop: 1 },
        Text({ color: themeColor('mutedForeground'), dim: true }, '📄 Raw Data'),
        ...rawLines.map(line =>
          Text({ color: themeColor('foreground') }, `  ${line.slice(0, width - 4)}`)
        ),
      )
    );
  }

  return Box({ flexDirection: 'column', width }, ...children);
}

// =============================================================================
// GeoIP Response Renderer
// =============================================================================

interface GeoIpResponseData {
  ip?: string;
  country?: string;
  countryCode?: string;
  city?: string;
  region?: string;
  isp?: string;
  org?: string;
  asn?: string;
  timezone?: string;
  lat?: number;
  lon?: number;
}

function renderGeoIpResponse(data: GeoIpResponseData, width: number): VNode {
  const children: VNode[] = [];

  // IP header with flag emoji (first item - no margin)
  const flagEmoji = data.countryCode ? getFlagEmoji(data.countryCode) : '🌍';

  children.push(
    Box(
      { flexDirection: 'row' },
      Text({ color: themeColor('primary'), bold: true }, `${flagEmoji} `),
      Text({ color: themeColor('primary'), bold: true }, data.ip || 'Unknown IP'),
    )
  );

  // Location info as table
  const locationData: { field: string; value: string }[] = [];

  if (data.country) locationData.push({ field: 'Country', value: `${data.country} (${data.countryCode || ''})` });
  if (data.city) locationData.push({ field: 'City', value: data.city });
  if (data.region) locationData.push({ field: 'Region', value: data.region });
  if (data.timezone) locationData.push({ field: 'Timezone', value: data.timezone });
  if (data.isp) locationData.push({ field: 'ISP', value: data.isp });
  if (data.org) locationData.push({ field: 'Organization', value: data.org });
  if (data.asn) locationData.push({ field: 'ASN', value: data.asn });

  if (locationData.length > 0) {
    children.push(
      Table({
        columns: [
          { key: 'field', header: 'Field', width: 15 },
          { key: 'value', header: 'Value', width: Math.max(30, width - 25) },
        ],
        data: locationData,
        borderStyle: 'single',
      })
    );
  }

  // Coordinates
  if (data.lat !== undefined && data.lon !== undefined) {
    children.push(
      Box(
        { flexDirection: 'row', marginTop: 1 },
        Text({ color: themeColor('mutedForeground'), dim: true }, '📍 '),
        Text({ color: themeColor('foreground') }, `${data.lat.toFixed(4)}, ${data.lon.toFixed(4)}`),
      )
    );
  }

  return Box({ flexDirection: 'column', width }, ...children);
}

// =============================================================================
// TLS Response Renderer
// =============================================================================

interface TlsResponseData {
  host?: string;
  valid?: boolean;
  issuer?: string;
  subject?: string;
  validFrom?: string;
  validTo?: string;
  daysRemaining?: number;
  protocol?: string;
  cipher?: string;
  fingerprint?: string;
}

function renderTlsResponse(data: TlsResponseData, width: number): VNode {
  const children: VNode[] = [];

  // Certificate validity header (first item - no margin)
  const isValid = data.valid ?? (data.daysRemaining !== undefined && data.daysRemaining > 0);

  children.push(
    Box(
      { flexDirection: 'row' },
      Text(
        { color: isValid ? themeColor('success') : themeColor('error'), bold: true },
        isValid ? '🔒 ' : '🔓 '
      ),
      Text({ color: themeColor('primary'), bold: true }, data.host || 'Certificate'),
      Text(
        { color: isValid ? themeColor('success') : themeColor('error'), bold: true },
        isValid ? ' VALID' : ' INVALID'
      ),
    )
  );

  // Days remaining gauge
  if (data.daysRemaining !== undefined) {
    const maxDays = 365;
    children.push(
      Box(
        { marginTop: 1 },
        Text({ color: themeColor('mutedForeground'), dim: true }, '📅 Days Until Expiry'),
      )
    );
    children.push(
      Gauge({
        value: Math.max(0, Math.min(data.daysRemaining, maxDays)),
        max: maxDays,
        width: Math.min(40, width - 4),
        showValue: true,
        zones: [
          { start: 0, end: 8, color: 'red' },
          { start: 8, end: 25, color: 'yellow' },
          { start: 25, end: 100, color: 'green' },
        ],
      })
    );
    children.push(
      Text(
        { color: data.daysRemaining < 30 ? themeColor('error') : themeColor('success'), bold: true },
        `${data.daysRemaining} days`
      )
    );
  }

  // Certificate details table
  const certData: { field: string; value: string }[] = [];

  if (data.issuer) certData.push({ field: 'Issuer', value: data.issuer });
  if (data.subject) certData.push({ field: 'Subject', value: data.subject });
  if (data.validFrom) certData.push({ field: 'Valid From', value: data.validFrom });
  if (data.validTo) certData.push({ field: 'Valid To', value: data.validTo });
  if (data.protocol) certData.push({ field: 'Protocol', value: data.protocol });
  if (data.cipher) certData.push({ field: 'Cipher', value: data.cipher });

  if (certData.length > 0) {
    children.push(
      Table({
        columns: [
          { key: 'field', header: 'Field', width: 15 },
          { key: 'value', header: 'Value', width: Math.max(30, width - 25) },
        ],
        data: certData,
        borderStyle: 'single',
      })
    );
  }

  return Box({ flexDirection: 'column', width }, ...children);
}

// =============================================================================
// SEO Response Renderer
// =============================================================================

interface SeoCheck {
  name: string;
  message: string;
  status: 'pass' | 'warn' | 'fail' | 'info';
  category: string;
  value?: string | number;
  recommendation?: string;
  evidence?: {
    found?: string;
    expected?: string;
    impact?: string;
  };
}

interface SeoResponseData {
  url?: string;
  score?: number;
  grade?: string;
  title?: { text: string; length: number };
  metaDescription?: { text: string; length: number };
  timing?: { total?: number; ttfb?: number; dns?: number; tcp?: number; tls?: number };
  openGraph?: {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
  };
  twitterCard?: {
    card?: string;
    site?: string;
    creator?: string;
    title?: string;
    description?: string;
    image?: string;
  };
  keywords?: { topKeywords?: { word: string; count: number }[] };
  summary?: {
    passed?: number;
    warnings?: number;
    errors?: number;
    infos?: number;
    vitals?: { wordCount?: number; imageCount?: number; linkCount?: number; htmlSize?: number };
    topIssues?: { name: string; message: string; severity: string; category?: string }[];
    quickWins?: string[];
    completeness?: {
      meta?: number;
      social?: number;
      technical?: number;
      content?: number;
      images?: number;
      links?: number;
    };
  };
  technical?: {
    hasCanonical?: boolean;
    canonicalUrl?: string;
    hasRobotsMeta?: boolean;
    robotsContent?: string[];
    hasViewport?: boolean;
    hasCharset?: boolean;
    hasLang?: boolean;
    langValue?: string;
  };
  content?: {
    wordCount?: number;
    readingTimeMinutes?: number;
    fleschReadingEase?: number;
    paragraphCount?: number;
    listCount?: number;
    strongTagCount?: number;
  };
  headings?: {
    h1Count?: number;
    hasProperHierarchy?: boolean;
    structure?: { level: number; text: string }[];
  };
  links?: {
    total?: number;
    internal?: number;
    external?: number;
    broken?: number;
    withoutText?: number;
    nofollow?: number;
    internalHttpLinks?: number;
  };
  structuredData?: {
    count?: number;
    types?: string[];
  };
  // Full checks array for categorized display
  checks?: SeoCheck[];
  // Legacy format support
  topIssues?: string[];
}

/**
 * SEO Response Renderer
 *
 * Comprehensive SEO report renderer that matches CLI output.
 * Displays all categorized checks with pass/fail counts.
 *
 * IMPORTANT: This renderer follows tuiuiu ScrollList height estimation rules:
 * 1. Use ONLY marginTop for spacing (never marginBottom)
 * 2. Keep structure flat - avoid nested boxes with margins
 * 3. First item has no margin, subsequent items use marginTop
 * 4. Last item has no marginBottom (would cause extra space)
 */
function renderSeoResponse(data: SeoResponseData, width: number): VNode {
  try {
    const children: VNode[] = [];
    const contentWidth = Math.max(40, width - 4);

    // ─────────────────────────────────────────────────────────────────────────
    // Header
    // ─────────────────────────────────────────────────────────────────────────
    children.push(
      Box(
        { flexDirection: 'row' },
        Text({ color: themeColor('primary'), bold: true }, '🔍 SEO Analysis Report'),
      )
    );

    if (data.url) {
      children.push(
        Text({ color: themeColor('mutedForeground') }, `URL: ${data.url}`)
      );
    }

    // Timing
    if (data.timing?.total) {
      const timingParts: string[] = [`Time: ${data.timing.total}ms`];
      if (data.timing.ttfb) timingParts.push(`TTFB: ${data.timing.ttfb}ms`);
      children.push(
        Text({ color: themeColor('mutedForeground'), dim: true }, timingParts.join(' | '))
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Score and Grade
    // ─────────────────────────────────────────────────────────────────────────
    if (data.score !== undefined) {
      const scoreNum = data.score;
      const gradeColor = data.grade === 'A' ? themeColor('success') :
                         data.grade === 'B' ? themeColor('accent') :
                         data.grade === 'C' ? themeColor('warning') : themeColor('error');

      children.push(
        Box(
          { flexDirection: 'row', marginTop: 1 },
          Text({ color: themeColor('foreground'), bold: true }, 'Grade: '),
          Text({ color: gradeColor, bold: true }, data.grade || '?'),
          Text({ color: themeColor('foreground') }, '  Score: '),
          Text({ color: scoreNum >= 80 ? themeColor('success') : scoreNum >= 60 ? themeColor('warning') : themeColor('error'), bold: true }, `${scoreNum}/100`),
        )
      );

      // Score bar
      const barWidth = Math.min(40, contentWidth - 10);
      const filledWidth = Math.round((scoreNum / 100) * barWidth);
      const emptyWidth = barWidth - filledWidth;
      const barColor = scoreNum >= 80 ? themeColor('success') : scoreNum >= 60 ? themeColor('warning') : themeColor('error');

      children.push(
        Box(
          { flexDirection: 'row' },
          Text({ color: barColor }, '█'.repeat(filledWidth)),
          Text({ color: themeColor('muted') }, '░'.repeat(emptyWidth)),
        )
      );

      children.push(
        Text({ color: themeColor('mutedForeground'), dim: true }, '──────────────────────────────────────────────────')
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Summary
    // ─────────────────────────────────────────────────────────────────────────
    if (data.summary) {
      const s = data.summary;

      children.push(
        Box(
          { marginTop: 1 },
          Text({ color: themeColor('foreground'), bold: true }, 'Summary'),
        )
      );

      children.push(
        Box(
          { flexDirection: 'row' },
          Text({ color: themeColor('success') }, `✔ Passed: ${s.passed || 0}   `),
          Text({ color: themeColor('warning') }, `⚠ Warnings: ${s.warnings || 0}   `),
          Text({ color: themeColor('error') }, `✖ Errors: ${s.errors || 0}   `),
          Text({ color: themeColor('accent') }, `ℹ Info: ${s.infos || 0}`),
        )
      );

      if (s.vitals) {
        children.push(
          Text(
            { color: themeColor('mutedForeground') },
            `Words: ${s.vitals.wordCount || 0} | Images: ${s.vitals.imageCount || 0} | Links: ${s.vitals.linkCount || 0}${s.vitals.htmlSize ? ` | HTML: ${Math.round(s.vitals.htmlSize / 1024)}KB` : ''}`
          )
        );
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Title and Description
    // ─────────────────────────────────────────────────────────────────────────
    if (data.title) {
      const titleObj = data.title as { text: string; length: number } | string;
      const titleText = typeof titleObj === 'string' ? titleObj : titleObj.text;
      const titleLength = typeof titleObj === 'string' ? titleObj.length : titleObj.length;
      const titleOk = titleLength >= 30 && titleLength <= 60;

      children.push(
        Box(
          { flexDirection: 'row', marginTop: 1 },
          Text({ color: themeColor('foreground'), bold: true }, 'Title: '),
          Text({ color: themeColor('foreground') }, titleText?.slice(0, contentWidth - 20) || ''),
          Text({ color: themeColor('mutedForeground'), dim: true }, ` (${titleLength} chars) `),
          Text({ color: titleOk ? themeColor('success') : themeColor('warning') }, titleOk ? '✔' : '⚠'),
        )
      );
    }

    if (data.metaDescription) {
      const descObj = data.metaDescription as { text: string; length: number } | string;
      const descText = typeof descObj === 'string' ? descObj : descObj.text;
      const descLength = typeof descObj === 'string' ? descObj.length : descObj.length;
      const descOk = descLength >= 120 && descLength <= 160;
      const truncatedDesc = (descText?.length || 0) > 80 ? descText?.slice(0, 77) + '...' : descText;

      children.push(
        Box(
          { flexDirection: 'row' },
          Text({ color: themeColor('foreground'), bold: true }, 'Description: '),
          Text({ color: themeColor('foreground') }, truncatedDesc || ''),
          Text({ color: themeColor('mutedForeground'), dim: true }, ` (${descLength} chars) `),
          Text({ color: descOk ? themeColor('success') : themeColor('warning') }, descOk ? '✔' : '⚠'),
        )
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Top Issues
    // ─────────────────────────────────────────────────────────────────────────
    const topIssues = data.summary?.topIssues || data.topIssues;
    if (topIssues && topIssues.length > 0) {
      children.push(
        Box(
          { marginTop: 1 },
          Text({ color: themeColor('foreground'), bold: true }, 'Top Issues'),
        )
      );

      const issueItems = Array.isArray(topIssues) ? topIssues.slice(0, 5) : [];
      for (const issue of issueItems) {
        if (typeof issue === 'string') {
          const isError = issue.startsWith('✗');
          children.push(Text({ color: isError ? themeColor('error') : themeColor('warning') }, ` ${issue}`));
        } else {
          const icon = issue.severity === 'error' ? '✖' : '⚠';
          const color = issue.severity === 'error' ? themeColor('error') : themeColor('warning');
          children.push(Text({ color }, ` ${icon} ${issue.name}: ${issue.message}`));
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Keywords
    // ─────────────────────────────────────────────────────────────────────────
    if (data.keywords?.topKeywords && data.keywords.topKeywords.length > 0) {
      children.push(
        Box(
          { marginTop: 1 },
          Text({ color: themeColor('foreground'), bold: true }, 'Top Keywords'),
        )
      );
      const kws = data.keywords.topKeywords.slice(0, 8).map(k => `${k.word} (${k.count})`).join(', ');
      children.push(Text({ color: themeColor('mutedForeground') }, ` ${kws}`));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // OpenGraph
    // ─────────────────────────────────────────────────────────────────────────
    if (data.openGraph && Object.values(data.openGraph).some(v => v)) {
      children.push(
        Box(
          { marginTop: 1 },
          Text({ color: themeColor('foreground'), bold: true }, 'OpenGraph'),
        )
      );
      if (data.openGraph.title) {
        children.push(Text({ color: themeColor('accent') }, `   og:title       ${data.openGraph.title}`));
      }
      if (data.openGraph.description) {
        const ogDesc = data.openGraph.description.length > 60 ? data.openGraph.description.slice(0, 57) + '...' : data.openGraph.description;
        children.push(Text({ color: themeColor('accent') }, `   og:description ${ogDesc}`));
      }
      if (data.openGraph.image) {
        children.push(Text({ color: themeColor('accent') }, `   og:image       ${data.openGraph.image}`));
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Twitter Card
    // ─────────────────────────────────────────────────────────────────────────
    if (data.twitterCard && Object.values(data.twitterCard).some(v => v)) {
      children.push(
        Box(
          { marginTop: 1 },
          Text({ color: themeColor('foreground'), bold: true }, 'Twitter Card'),
        )
      );
      if (data.twitterCard.card) {
        children.push(Text({ color: themeColor('accent') }, `   twitter:card   ${data.twitterCard.card}`));
      }
      if (data.twitterCard.title) {
        children.push(Text({ color: themeColor('accent') }, `   twitter:title  ${data.twitterCard.title}`));
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Technical SEO
    // ─────────────────────────────────────────────────────────────────────────
    if (data.technical) {
      const tech = data.technical;
      children.push(
        Box(
          { marginTop: 1 },
          Text({ color: themeColor('foreground'), bold: true }, 'TECHNICAL SEO'),
        )
      );

      const canonicalIcon = tech.hasCanonical ? '✔' : '✖';
      const canonicalColor = tech.hasCanonical ? themeColor('success') : themeColor('error');
      children.push(Text({ color: canonicalColor }, `   Canonical: ${canonicalIcon} ${tech.canonicalUrl ? tech.canonicalUrl.slice(0, 50) : 'missing'}`));

      const viewportIcon = tech.hasViewport ? '✔' : '✖';
      const viewportColor = tech.hasViewport ? themeColor('success') : themeColor('error');
      children.push(Text({ color: viewportColor }, `   Viewport: ${viewportIcon} ${tech.hasViewport ? 'configured' : 'missing'}`));

      const langIcon = tech.hasLang ? '✔' : '⚠';
      const langColor = tech.hasLang ? themeColor('success') : themeColor('warning');
      children.push(Text({ color: langColor }, `   Language: ${langIcon} ${tech.langValue || 'not set'}`));

      const charsetIcon = tech.hasCharset ? '✔' : '⚠';
      const charsetColor = tech.hasCharset ? themeColor('success') : themeColor('warning');
      children.push(Text({ color: charsetColor }, `   Charset: ${charsetIcon} ${tech.hasCharset ? 'UTF-8' : 'not declared'}`));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Content Analysis
    // ─────────────────────────────────────────────────────────────────────────
    if (data.content && data.headings) {
      children.push(
        Box(
          { marginTop: 1 },
          Text({ color: themeColor('foreground'), bold: true }, 'CONTENT ANALYSIS'),
        )
      );

      const wordIcon = (data.content.wordCount || 0) >= 300 ? '✔' : '⚠';
      const wordColor = (data.content.wordCount || 0) >= 300 ? themeColor('success') : themeColor('warning');
      children.push(Text({ color: wordColor }, `   Word Count: ${data.content.wordCount || 0} ${wordIcon} (${data.content.readingTimeMinutes || 0} min read)`));

      if (data.content.fleschReadingEase !== undefined) {
        const readability = data.content.fleschReadingEase;
        const readIcon = readability >= 60 ? '✔' : readability >= 30 ? '⚠' : '✖';
        const readColor = readability >= 60 ? themeColor('success') : readability >= 30 ? themeColor('warning') : themeColor('error');
        const readLabel = readability >= 80 ? 'Easy' : readability >= 60 ? 'Moderate' : readability >= 30 ? 'Difficult' : 'Very Difficult';
        children.push(Text({ color: readColor }, `   Readability: ${readability.toFixed(0)} ${readIcon} (${readLabel})`));
      }

      children.push(Text({ color: themeColor('mutedForeground') }, `   Paragraphs: ${data.content.paragraphCount || 0} | Lists: ${data.content.listCount || 0} | Strong: ${data.content.strongTagCount || 0}`));

      // Heading structure
      children.push(Text({ color: themeColor('mutedForeground'), dim: true }, '   Heading Structure:'));
      const h1Icon = data.headings.h1Count === 1 ? '✔' : data.headings.h1Count === 0 ? '✖' : '⚠';
      const h1Color = data.headings.h1Count === 1 ? themeColor('success') : data.headings.h1Count === 0 ? themeColor('error') : themeColor('warning');
      children.push(Text({ color: h1Color }, `     H1: ${data.headings.h1Count || 0} ${h1Icon}`));

      if (data.headings.structure) {
        for (const h of data.headings.structure.slice(0, 4)) {
          const indent = '  '.repeat(h.level - 1);
          children.push(Text({ color: themeColor('mutedForeground'), dim: true }, `     ${indent}H${h.level}: ${h.text.slice(0, 40)}${h.text.length > 40 ? '...' : ''}`));
        }
        if (data.headings.structure.length > 4) {
          children.push(Text({ color: themeColor('mutedForeground'), dim: true }, `     ... and ${data.headings.structure.length - 4} more headings`));
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Link Profile
    // ─────────────────────────────────────────────────────────────────────────
    if (data.links) {
      const links = data.links;
      children.push(
        Box(
          { marginTop: 1 },
          Text({ color: themeColor('foreground'), bold: true }, 'LINK PROFILE'),
        )
      );

      children.push(Text({ color: themeColor('mutedForeground') }, `   Total Links: ${links.total || 0}`));

      const internalRatio = (links.total || 0) > 0 ? Math.round(((links.internal || 0) / links.total!) * 100) : 0;
      children.push(Text({ color: themeColor('mutedForeground') }, `   Internal: ${links.internal || 0} (${internalRatio}%) | External: ${links.external || 0} (${100 - internalRatio}%)`));

      if (links.broken && links.broken > 0) {
        children.push(Text({ color: themeColor('error') }, `   Broken Links: ${links.broken} ✖`));
      }
      if (links.withoutText && links.withoutText > 0) {
        children.push(Text({ color: themeColor('warning') }, `   Empty Link Text: ${links.withoutText} ⚠`));
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Structured Data
    // ─────────────────────────────────────────────────────────────────────────
    if (data.structuredData && data.structuredData.count && data.structuredData.count > 0) {
      children.push(
        Box(
          { marginTop: 1 },
          Text({ color: themeColor('foreground'), bold: true }, 'SCHEMA.ORG'),
        )
      );

      for (const type of (data.structuredData.types || []).slice(0, 5)) {
        children.push(Text({ color: themeColor('success') }, `   @type: ${type} ✔`));
      }
      if ((data.structuredData.types?.length || 0) > 5) {
        children.push(Text({ color: themeColor('mutedForeground'), dim: true }, `   ... and ${data.structuredData.types!.length - 5} more`));
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Checks by Category (THE KEY SECTION THAT WAS MISSING!)
    // ─────────────────────────────────────────────────────────────────────────
    if (data.checks && Array.isArray(data.checks) && data.checks.length > 0) {
      // Group checks by category
      const categories = [...new Set(data.checks.map(c => c.category).filter(Boolean))] as string[];

      for (const cat of categories) {
        const catChecks = data.checks.filter(c => c.category === cat);
        const issues = catChecks.filter(c => c.status !== 'pass' && c.status !== 'info');
        const passed = catChecks.filter(c => c.status === 'pass');

        // Skip categories with no issues (only show categories that have problems)
        if (issues.length === 0) continue;

        children.push(
          Box(
            { marginTop: 1 },
            Text(
              { color: themeColor('foreground'), bold: true },
              `${cat.toUpperCase()} `
            ),
            Text(
              { color: themeColor('mutedForeground') },
              `(${passed.length}/${catChecks.length} passed)`
            ),
          )
        );

        // Show up to 5 issues per category
        for (const check of issues.slice(0, 5)) {
          const icon = check.status === 'fail' ? '✖' : '⚠';
          const color = check.status === 'fail' ? themeColor('error') : themeColor('warning');
          children.push(Text({ color }, ` ${icon} ${check.message}`));

          if (check.recommendation) {
            children.push(Text({ color: themeColor('mutedForeground'), dim: true }, `    Fix: ${check.recommendation}`));
          }
        }

        if (issues.length > 5) {
          children.push(Text({ color: themeColor('mutedForeground'), dim: true }, `   ... and ${issues.length - 5} more`));
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Quick Wins
    // ─────────────────────────────────────────────────────────────────────────
    if (data.summary?.quickWins && data.summary.quickWins.length > 0) {
      children.push(
        Box(
          { marginTop: 1 },
          Text({ color: themeColor('foreground'), bold: true }, 'Quick Wins'),
        )
      );

      for (const win of data.summary.quickWins.slice(0, 5)) {
        children.push(Text({ color: themeColor('success') }, ` → ${win}`));
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Completeness Scores
    // ─────────────────────────────────────────────────────────────────────────
    if (data.summary?.completeness) {
      const comp = data.summary.completeness;

      children.push(
        Box(
          { marginTop: 1 },
          Text({ color: themeColor('foreground'), bold: true }, 'Completeness Scores'),
        )
      );

      const renderBar = (label: string, val: number) => {
        const filled = Math.round((val || 0) / 10);
        const empty = 10 - filled;
        const barColor = (val || 0) >= 80 ? themeColor('success') : (val || 0) >= 50 ? themeColor('warning') : themeColor('error');
        return Box(
          { flexDirection: 'row' },
          Box({ width: 14 }, Text({ color: themeColor('foreground') }, `   ${label}:`)),
          Text({ color: barColor }, '█'.repeat(filled)),
          Text({ color: themeColor('muted') }, '░'.repeat(empty)),
          Text({ color: themeColor('foreground') }, ` ${val || 0}%`),
        );
      };

      children.push(renderBar('Meta', comp.meta || 0));
      children.push(renderBar('Social', comp.social || 0));
      children.push(renderBar('Technical', comp.technical || 0));
      children.push(renderBar('Content', comp.content || 0));
      children.push(renderBar('Images', comp.images || 0));
      children.push(renderBar('Links', comp.links || 0));
    }

    return Box({ flexDirection: 'column', width }, ...children);
  } catch (err: any) {
    // If rendering fails, show error with raw data as JSON fallback
    return Box(
      { flexDirection: 'column', width },
      Text({ color: themeColor('error'), bold: true }, '⚠ SEO Response Render Error'),
      Text({ color: themeColor('error') }, err?.message || String(err)),
      Box({ marginTop: 1 }),
      Text({ color: themeColor('mutedForeground'), dim: true }, 'Raw data:'),
      Text({ color: themeColor('foreground') }, JSON.stringify(data, null, 2).slice(0, 500)),
    );
  }
}

// =============================================================================
// Spider Response Renderer
// =============================================================================

interface SpiderResponseData {
  url?: string;
  pages?: number;
  duration?: string;
  errors?: number;
  links?: {
    internal?: number;
    external?: number;
  };
  assets?: {
    images?: number;
    scripts?: number;
    stylesheets?: number;
  };
  topPages?: Array<{
    url: string;
    status: number;
    title?: string;
    seoScore?: number;
    seoGrade?: string;
    seoErrors?: number;
    seoWarnings?: number;
  }>;
  // SEO summary data (only when seo mode enabled)
  seo?: {
    avgScore?: number;
    pagesWithErrors?: number;
    pagesWithWarnings?: number;
    duplicateTitles?: number;
    duplicateDescriptions?: number;
    duplicateH1s?: number;
    orphanPages?: number;
    siteWideIssues?: Array<{
      type: string;
      severity: 'error' | 'warning' | 'info';
      message: string;
      affectedUrls?: string[];
    }>;
    discovery?: {
      humans?: { found: boolean; url: string };
      llms?: { found: boolean; url: string };
      sitemap?: { found: boolean; url: string; urlCount?: number };
      manifest?: { found: boolean; url: string; valid?: boolean };
    };
  };
}

function renderSpiderResponse(data: SpiderResponseData, width: number): VNode {
  const children: VNode[] = [];
  const hasSeo = !!data.seo;

  // ─────────────────────────────────────────────────────────────────────────
  // Header
  // ─────────────────────────────────────────────────────────────────────────
  children.push(
    Box(
      { flexDirection: 'row' },
      Text({ color: themeColor('primary'), bold: true }, hasSeo ? '🔍 SEO Spider Report' : '🕷️ Spider Crawl Report'),
    )
  );

  if (data.url) {
    children.push(
      Text({ color: themeColor('mutedForeground') }, `URL: ${data.url}`)
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Summary Stats
  // ─────────────────────────────────────────────────────────────────────────
  children.push(
    Box(
      { marginTop: 1 },
      Text({ color: themeColor('foreground'), bold: true }, 'Crawl Summary'),
    )
  );

  children.push(
    Box(
      { flexDirection: 'row' },
      Text({ color: themeColor('success') }, `📄 Pages: ${data.pages || 0}   `),
      Text({ color: themeColor('accent') }, `⏱ Duration: ${data.duration || '0s'}   `),
      Text({ color: data.errors ? themeColor('error') : themeColor('mutedForeground') }, `⚠ Errors: ${data.errors || 0}`),
    )
  );

  // Links stats
  if (data.links) {
    children.push(
      Box(
        { flexDirection: 'row' },
        Text({ color: themeColor('mutedForeground') }, `🔗 Internal: ${data.links.internal || 0}   `),
        Text({ color: themeColor('mutedForeground') }, `🌐 External: ${data.links.external || 0}`),
      )
    );
  }

  // Assets stats
  if (data.assets) {
    children.push(
      Box(
        { flexDirection: 'row' },
        Text({ color: themeColor('mutedForeground') }, `🖼 Images: ${data.assets.images || 0}   `),
        Text({ color: themeColor('mutedForeground') }, `📜 Scripts: ${data.assets.scripts || 0}   `),
        Text({ color: themeColor('mutedForeground') }, `🎨 Stylesheets: ${data.assets.stylesheets || 0}`),
      )
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SEO Summary (when seo mode enabled)
  // ─────────────────────────────────────────────────────────────────────────
  if (data.seo) {
    const seo = data.seo;

    children.push(
      Box(
        { marginTop: 1 },
        Text({ color: themeColor('foreground'), bold: true }, 'SEO Summary'),
      )
    );

    // Average score with visual bar
    if (seo.avgScore !== undefined) {
      const score = Math.round(seo.avgScore);
      const barWidth = Math.min(30, width - 30);
      const filledWidth = Math.round((score / 100) * barWidth);
      const emptyWidth = barWidth - filledWidth;
      const barColor = score >= 80 ? themeColor('success') : score >= 60 ? themeColor('warning') : themeColor('error');
      const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

      children.push(
        Box(
          { flexDirection: 'row' },
          Text({ color: themeColor('foreground'), bold: true }, 'Avg Score: '),
          Text({ color: barColor, bold: true }, `${score} (${grade})   `),
          Text({ color: barColor }, '█'.repeat(filledWidth)),
          Text({ color: themeColor('muted') }, '░'.repeat(emptyWidth)),
        )
      );
    }

    // Issues summary
    children.push(
      Box(
        { flexDirection: 'row' },
        Text({ color: themeColor('error') }, `✖ Pages with errors: ${seo.pagesWithErrors || 0}   `),
        Text({ color: themeColor('warning') }, `⚠ Pages with warnings: ${seo.pagesWithWarnings || 0}`),
      )
    );

    // Duplicates
    const hasDuplicates = (seo.duplicateTitles || 0) > 0 ||
                          (seo.duplicateDescriptions || 0) > 0 ||
                          (seo.duplicateH1s || 0) > 0;
    if (hasDuplicates) {
      children.push(
        Box(
          { flexDirection: 'row' },
          Text({ color: themeColor('mutedForeground') }, 'Duplicates: '),
          seo.duplicateTitles ? Text({ color: themeColor('warning') }, `Titles: ${seo.duplicateTitles}  `) : null,
          seo.duplicateDescriptions ? Text({ color: themeColor('warning') }, `Descriptions: ${seo.duplicateDescriptions}  `) : null,
          seo.duplicateH1s ? Text({ color: themeColor('warning') }, `H1s: ${seo.duplicateH1s}`) : null,
        )
      );
    }

    // Orphan pages
    if (seo.orphanPages && seo.orphanPages > 0) {
      children.push(
        Text({ color: themeColor('warning') }, `🔍 Orphan Pages: ${seo.orphanPages}`)
      );
    }

    // Site discovery
    if (seo.discovery) {
      const d = seo.discovery;
      children.push(
        Box(
          { marginTop: 1 },
          Text({ color: themeColor('foreground'), bold: true }, 'Site Discovery'),
        )
      );

      const discoveryItems = [
        { name: 'sitemap.xml', found: d.sitemap?.found, extra: d.sitemap?.urlCount ? `(${d.sitemap.urlCount} URLs)` : '' },
        { name: 'robots.txt', found: true }, // Assumed since spider ran
        { name: 'humans.txt', found: d.humans?.found },
        { name: 'llms.txt', found: d.llms?.found },
        { name: 'manifest.json', found: d.manifest?.found, extra: d.manifest?.valid ? '(valid)' : d.manifest?.found ? '(invalid)' : '' },
      ];

      for (const item of discoveryItems) {
        const icon = item.found ? '✔' : '✖';
        const color = item.found ? themeColor('success') : themeColor('mutedForeground');
        children.push(Text({ color }, `   ${icon} ${item.name} ${item.extra || ''}`));
      }
    }

    // Site-wide issues
    if (seo.siteWideIssues && seo.siteWideIssues.length > 0) {
      children.push(
        Box(
          { marginTop: 1 },
          Text({ color: themeColor('foreground'), bold: true }, 'Site-Wide Issues'),
        )
      );

      for (const issue of seo.siteWideIssues.slice(0, 8)) {
        const icon = issue.severity === 'error' ? '✖' : issue.severity === 'warning' ? '⚠' : 'ℹ';
        const color = issue.severity === 'error' ? themeColor('error') :
                      issue.severity === 'warning' ? themeColor('warning') : themeColor('accent');
        children.push(Text({ color }, ` ${icon} ${issue.message}`));

        if (issue.affectedUrls && issue.affectedUrls.length > 0) {
          const affectedCount = issue.affectedUrls.length;
          const sample = issue.affectedUrls.slice(0, 2).map(u => u.replace(data.url || '', ''));
          children.push(Text(
            { color: themeColor('mutedForeground'), dim: true },
            `    Affects ${affectedCount} pages: ${sample.join(', ')}${affectedCount > 2 ? '...' : ''}`
          ));
        }
      }

      if (seo.siteWideIssues.length > 8) {
        children.push(Text({ color: themeColor('mutedForeground'), dim: true }, `   ... and ${seo.siteWideIssues.length - 8} more issues`));
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Top Pages
  // ─────────────────────────────────────────────────────────────────────────
  if (data.topPages && data.topPages.length > 0) {
    children.push(
      Box(
        { marginTop: 1 },
        Text({ color: themeColor('foreground'), bold: true }, `Top ${Math.min(10, data.topPages.length)} Pages`),
      )
    );

    for (const page of data.topPages.slice(0, 10)) {
      const statusColor = page.status >= 200 && page.status < 300 ? themeColor('success') :
                          page.status >= 300 && page.status < 400 ? themeColor('accent') :
                          page.status >= 400 ? themeColor('error') : themeColor('mutedForeground');

      // Build page line
      let pageLine = ` ${page.status} ${page.url || '/'}`;
      if (page.title) {
        pageLine += ` - ${page.title.slice(0, 30)}${page.title.length > 30 ? '...' : ''}`;
      }

      // Add SEO score if available
      if (page.seoScore !== undefined) {
        const scoreColor = page.seoScore >= 80 ? themeColor('success') :
                          page.seoScore >= 60 ? themeColor('warning') : themeColor('error');
        children.push(
          Box(
            { flexDirection: 'row' },
            Text({ color: statusColor }, `   ${page.status} `),
            Text({ color: themeColor('foreground') }, page.url || '/'),
            Text({ color: scoreColor, bold: true }, ` [${page.seoGrade || '?'}: ${Math.round(page.seoScore)}]`),
            page.seoErrors ? Text({ color: themeColor('error') }, ` ✖${page.seoErrors}`) : null,
            page.seoWarnings ? Text({ color: themeColor('warning') }, ` ⚠${page.seoWarnings}`) : null,
          )
        );
      } else {
        children.push(
          Text({ color: statusColor }, pageLine)
        );
      }
    }

    if ((data.pages || 0) > 10) {
      children.push(Text({ color: themeColor('mutedForeground'), dim: true }, `   ... and ${(data.pages || 0) - 10} more pages`));
    }
  }

  return Box({ flexDirection: 'column', width }, ...children);
}

// =============================================================================
// Error Renderer
// =============================================================================

function renderError(data: { message?: string; code?: string }, width: number): VNode {
  return Box(
    { flexDirection: 'column', width },
    Box(
      { flexDirection: 'row' },
      Text({ color: themeColor('error'), bold: true }, '✗ Error'),
      data.code ? Text({ color: themeColor('error') }, ` [${data.code}]`) : null,
    ),
    Text({ color: themeColor('error') }, data.message || 'Unknown error'),
  );
}

// =============================================================================
// JSON Fallback Renderer
// =============================================================================

function renderJson(data: unknown, width: number): VNode {
  const json = JSON.stringify(data, null, 2);
  const lines = json.split('\n').slice(0, 30);

  return Box(
    { flexDirection: 'column', width },
    ...lines.map((line) => Text({ color: themeColor('success') }, line)),
    lines.length < json.split('\n').length
      ? Text({ color: themeColor('mutedForeground'), dim: true }, '... (truncated)')
      : null,
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// =============================================================================
// Main Dispatcher
// =============================================================================

/**
 * RichResponse - Renders response data with appropriate visual components
 */
export function RichResponse(props: RichResponseProps): VNode {
  const { type, data, width = 80, forceJson = false } = props;

  // Force JSON output if requested
  if (forceJson) {
    return renderJson(data, width);
  }

  // Dispatch to appropriate renderer
  switch (type) {
    case 'http':
      return renderHttpResponse(data as HttpResponseData, width);

    case 'dns':
      return renderDnsResponse(data as DnsResponseData, width);

    case 'ping':
      return renderPingResponse(data as PingResponseData, width);

    case 'whois':
    case 'rdap':
      return renderWhoisResponse(data as WhoisResponseData, width);

    case 'geoip':
      return renderGeoIpResponse(data as GeoIpResponseData, width);

    case 'tls':
      return renderTlsResponse(data as TlsResponseData, width);

    case 'seo':
      return renderSeoResponse(data as SeoResponseData, width);

    case 'spider':
    case 'seo-spider':
      return renderSpiderResponse(data as SpiderResponseData, width);

    case 'error':
      return renderError(data as { message?: string; code?: string }, width);

    case 'json':
      return renderJson(data, width);

    case 'text':
    default:
      if (typeof data === 'string') {
        return Text({ color: themeColor('foreground') }, data);
      }
      return renderJson(data, width);
  }
}

/**
 * Detect response type from data shape
 */
export function detectResponseType(data: unknown): ResponseType {
  if (data === null || data === undefined) return 'text';
  if (typeof data === 'string') return 'text';
  if (typeof data !== 'object') return 'json';

  const obj = data as Record<string, unknown>;

  // Error detection
  if (obj.error || obj.message && obj.code) return 'error';

  // HTTP response detection
  if (obj.status !== undefined && typeof obj.status === 'number') return 'http';

  // DNS detection
  if (obj.records || obj.answers || (obj.domain && (obj.A || obj.AAAA || obj.MX))) return 'dns';

  // Ping detection
  if (obj.host && (obj.time !== undefined || obj.times || obj.success !== undefined)) return 'ping';

  // WHOIS detection
  if (obj.registrar || obj.nameservers || obj.createdDate || obj.expiresDate) return 'whois';

  // GeoIP detection
  if (obj.ip && (obj.country || obj.city || obj.isp)) return 'geoip';

  // TLS detection
  if (obj.issuer || obj.validTo || obj.fingerprint || obj.cipher) return 'tls';

  // SEO detection
  if (obj.score !== undefined && (obj.topIssues || obj.checks || obj.timing)) return 'seo';

  // Spider detection (pages array + topPages or links structure)
  if (obj.pages !== undefined && (obj.topPages || (obj.links && typeof obj.links === 'object'))) {
    // Check if it has SEO data
    if (obj.seo) return 'seo-spider';
    return 'spider';
  }

  return 'json';
}

// =============================================================================
// Exports
// =============================================================================

export {
  renderHttpResponse,
  renderDnsResponse,
  renderPingResponse,
  renderWhoisResponse,
  renderGeoIpResponse,
  renderTlsResponse,
  renderSeoResponse,
  renderSpiderResponse,
  renderError,
  renderJson,
};
