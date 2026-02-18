/**
 * SEO Report Formatter
 *
 * Unified output formatting for SEO reports in CLI and Shell.
 * Ensures consistent display across all interfaces.
 */

import colors from '../utils/colors.js';
import type { SeoReport, SeoCheckResult } from './types.js';

/**
 * Format options for the SEO report
 */
export interface SeoFormatOptions {
  /** Show all checks including passed ones */
  showAll?: boolean;
  /** Show detailed evidence for issues */
  showEvidence?: boolean;
  /** Maximum number of issues to show per category */
  maxIssuesPerCategory?: number;
  /** Show keywords cloud */
  showKeywords?: boolean;
  /** Show timing information */
  showTiming?: boolean;
  /** Compact mode (less verbose) */
  compact?: boolean;
  /** Verbose mode - show detailed technical sections */
  verbose?: boolean;
  /** HTTP response headers for security analysis */
  responseHeaders?: Record<string, string | string[]>;
}

/**
 * Get color function for grade
 */
export function gradeColor(grade: string): (text: string) => string {
  if (grade === 'A') return colors.green;
  if (grade === 'B') return colors.cyan;
  if (grade === 'C') return colors.yellow;
  if (grade === 'D') return colors.magenta;
  return colors.red;
}

/**
 * Get color function for score
 */
export function scoreColor(score: number): (text: string) => string {
  if (score >= 90) return colors.green;
  if (score >= 70) return colors.yellow;
  return colors.red;
}

/**
 * Get icon for check status
 */
export function statusIcon(status: string): string {
  switch (status) {
    case 'pass': return colors.green('✔');
    case 'warn': return colors.yellow('⚠');
    case 'fail': return colors.red('✖');
    case 'info': return colors.blue('ℹ');
    default: return '•';
  }
}

/**
 * Format a single check result
 */
export function formatCheck(check: SeoCheckResult, showEvidence = false): string[] {
  const lines: string[] = [];
  const icon = statusIcon(check.status);
  let infoLabel = '';
  if (check.status === 'info') {
    if (check.infoType === 'not_applicable') {
      infoLabel = colors.magenta(' [N/A]');
    } else if (check.infoType === 'suggestion') {
      infoLabel = colors.cyan(' [SUGGESTION]');
    }
  }

  lines.push(` ${icon} ${check.message}${infoLabel}`);

  if (check.value !== undefined) {
    lines.push(`    ${colors.gray('Value:')} ${check.value}`);
  }

  if (check.recommendation) {
    lines.push(`    ${colors.gray('Fix:')} ${check.recommendation}`);
  }

  if (showEvidence && check.evidence) {
    if (check.evidence.found) {
      lines.push(`    ${colors.gray('Found:')} ${check.evidence.found}`);
    }
    if (check.evidence.expected) {
      lines.push(`    ${colors.gray('Expected:')} ${check.evidence.expected}`);
    }
    if (check.evidence.impact) {
      lines.push(`    ${colors.gray('Impact:')} ${check.evidence.impact}`);
    }
    if (check.evidence.learnMore) {
      lines.push(`    ${colors.gray('Learn more:')} ${check.evidence.learnMore}`);
    }
  }

  return lines;
}

// =============================================================================
// Enhanced Sections (Verbose Mode)
// =============================================================================

/**
 * Format performance section with timing details
 */
export function formatPerformanceSection(
  report: SeoReport,
  responseHeaders?: Record<string, string | string[]>
): string[] {
  const lines: string[] = [];
  const timing = report.timing;

  lines.push('');
  lines.push(` ${colors.bold('PERFORMANCE')}`);

  // Timing metrics
  if (timing?.ttfb !== undefined) {
    const ttfbStatus = timing.ttfb < 200 ? colors.green('✔') : timing.ttfb < 500 ? colors.yellow('⚠') : colors.red('✖');
    lines.push(`   TTFB: ${timing.ttfb}ms ${ttfbStatus} ${colors.gray('(target: <200ms)')}`);
  }
  if (timing?.total !== undefined) {
    const totalStatus = timing.total < 1000 ? colors.green('✔') : timing.total < 3000 ? colors.yellow('⚠') : colors.red('✖');
    lines.push(`   Total Load: ${timing.total}ms ${totalStatus}`);
  }
  if (timing?.dns !== undefined || timing?.tcp !== undefined || timing?.tls !== undefined) {
    lines.push(`   ${colors.gray('Breakdown:')} DNS=${timing.dns || 0}ms TCP=${timing.tcp || 0}ms TLS=${timing.tls || 0}ms`);
  }

  // Resource counts
  const s = report.summary;
  if (s.vitals) {
    lines.push('');
    lines.push(`   ${colors.gray('Resources:')}`);
    lines.push(`     Images: ${s.vitals.imageCount}`);
    lines.push(`     Links: ${s.vitals.linkCount}`);
    if (s.vitals.htmlSize) {
      const sizeKb = Math.round(s.vitals.htmlSize / 1024);
      lines.push(`     HTML Size: ${sizeKb} KB`);
    }
  }

  // Compression and HTTP version from headers
  if (responseHeaders) {
    const encoding = responseHeaders['content-encoding'];
    if (encoding) {
      const enc = Array.isArray(encoding) ? encoding[0] : encoding;
      lines.push(`   Compression: ${enc} ${colors.green('✔')}`);
    }

    // Check for HTTP/2 indicators
    const altSvc = responseHeaders['alt-svc'];
    if (altSvc) {
      lines.push(`   HTTP/2+: ${colors.green('✔')} ${colors.gray('(Alt-Svc present)')}`);
    }
  }

  return lines;
}

/**
 * Format security headers section
 */
export function formatSecuritySection(
  responseHeaders?: Record<string, string | string[]>
): string[] {
  const lines: string[] = [];

  if (!responseHeaders) {
    return [];
  }

  lines.push('');
  lines.push(` ${colors.bold('SECURITY HEADERS')}`);

  const securityHeaders = [
    { name: 'content-security-policy', display: 'Content-Security-Policy', critical: true },
    { name: 'strict-transport-security', display: 'Strict-Transport-Security', critical: true },
    { name: 'x-content-type-options', display: 'X-Content-Type-Options', critical: false },
    { name: 'x-frame-options', display: 'X-Frame-Options', critical: false },
    { name: 'x-xss-protection', display: 'X-XSS-Protection', critical: false, deprecated: true },
    { name: 'referrer-policy', display: 'Referrer-Policy', critical: false },
    { name: 'permissions-policy', display: 'Permissions-Policy', critical: false },
  ];

  let score = 0;
  let total = 0;

  for (const header of securityHeaders) {
    if (header.deprecated) continue; // Skip deprecated headers for scoring

    total++;
    const value = responseHeaders[header.name];
    const shortValue = value
      ? (Array.isArray(value) ? value[0] : value).slice(0, 40)
      : null;

    if (value) {
      score++;
      lines.push(`   ${header.display}: ${colors.green('✔')} ${colors.gray(shortValue + (shortValue!.length >= 40 ? '...' : ''))}`);
    } else {
      const icon = header.critical ? colors.red('✖') : colors.yellow('⚠');
      lines.push(`   ${header.display}: ${icon} missing`);
    }
  }

  // Security score
  const percentage = Math.round((score / total) * 100);
  const scoreColor = percentage >= 80 ? colors.green : percentage >= 50 ? colors.yellow : colors.red;
  lines.push('');
  lines.push(`   ${colors.gray('Security Score:')} ${scoreColor(`${score}/${total} (${percentage}%)`)}`);

  return lines;
}

/**
 * Format technical SEO section
 */
export function formatTechnicalSection(report: SeoReport): string[] {
  const lines: string[] = [];
  const tech = report.technical;

  lines.push('');
  lines.push(` ${colors.bold('TECHNICAL SEO')}`);

  // Canonical
  const canonicalIcon = tech.hasCanonical ? colors.green('✔') : colors.red('✖');
  lines.push(`   Canonical: ${canonicalIcon} ${tech.canonicalUrl ? colors.gray(tech.canonicalUrl.slice(0, 50)) : 'missing'}`);

  // Robots meta
  const robotsIcon = tech.hasRobotsMeta ? colors.green('✔') : colors.yellow('⚠');
  const robotsValue = tech.robotsContent?.join(', ') || 'not set (defaults to index, follow)';
  lines.push(`   Robots Meta: ${robotsIcon} ${colors.gray(robotsValue)}`);

  // Viewport
  const viewportIcon = tech.hasViewport ? colors.green('✔') : colors.red('✖');
  lines.push(`   Viewport: ${viewportIcon} ${tech.hasViewport ? 'configured' : 'missing'}`);

  // Language
  const langIcon = tech.hasLang ? colors.green('✔') : colors.yellow('⚠');
  lines.push(`   Language: ${langIcon} ${tech.langValue || 'not set'}`);

  // Charset
  const charsetIcon = tech.hasCharset ? colors.green('✔') : colors.yellow('⚠');
  lines.push(`   Charset: ${charsetIcon} ${tech.hasCharset ? 'UTF-8' : 'not declared'}`);

  // Structured Data / Schema.org
  if (report.structuredData) {
    lines.push('');
    lines.push(`   ${colors.gray('Schema.org:')}`);
    if (report.structuredData.count > 0) {
      for (const type of report.structuredData.types.slice(0, 5)) {
        lines.push(`     @type: ${type} ${colors.green('✔')}`);
      }
      if (report.structuredData.types.length > 5) {
        lines.push(`     ${colors.gray(`... and ${report.structuredData.types.length - 5} more`)}`);
      }
    } else {
      lines.push(`     ${colors.yellow('⚠')} No JSON-LD structured data found`);
    }
  }

  return lines;
}

/**
 * Format content analysis section
 */
export function formatContentSection(report: SeoReport): string[] {
  const lines: string[] = [];
  const content = report.content;
  const headings = report.headings;

  lines.push('');
  lines.push(` ${colors.bold('CONTENT ANALYSIS')}`);

  // Word count and reading time
  const wordIcon = content.wordCount >= 300 ? colors.green('✔') : colors.yellow('⚠');
  lines.push(`   Word Count: ${content.wordCount} ${wordIcon} ${colors.gray(`(${content.readingTimeMinutes} min read)`)}`);

  // Readability
  if (content.fleschReadingEase !== undefined) {
    const readability = content.fleschReadingEase;
    const readIcon = readability >= 60 ? colors.green('✔') : readability >= 30 ? colors.yellow('⚠') : colors.red('✖');
    const readLabel = readability >= 80 ? 'Easy' : readability >= 60 ? 'Moderate' : readability >= 30 ? 'Difficult' : 'Very Difficult';
    lines.push(`   Readability: ${readability.toFixed(0)} ${readIcon} ${colors.gray(`(${readLabel})`)}`);
  }

  // Content structure
  lines.push(`   Paragraphs: ${content.paragraphCount} | Lists: ${content.listCount} | Strong: ${content.strongTagCount}`);

  // Heading structure
  lines.push('');
  lines.push(`   ${colors.gray('Heading Structure:')}`);
  const h1Icon = headings.h1Count === 1 ? colors.green('✔') : headings.h1Count === 0 ? colors.red('✖') : colors.yellow('⚠');
  lines.push(`     H1: ${headings.h1Count} ${h1Icon}`);

  // Show heading hierarchy
  for (const h of headings.structure.slice(0, 6)) {
    const indent = '  '.repeat(h.level - 1);
    lines.push(`     ${colors.gray(indent)}H${h.level}: ${h.text.slice(0, 40)}${h.text.length > 40 ? '...' : ''}`);
  }

  if (headings.structure.length > 6) {
    lines.push(`     ${colors.gray(`... and ${headings.structure.length - 6} more headings`)}`);
  }

  if (!headings.hasProperHierarchy) {
    lines.push(`     ${colors.yellow('⚠')} Heading hierarchy has issues`);
  }

  return lines;
}

/**
 * Format link profile section
 */
export function formatLinkSection(report: SeoReport): string[] {
  const lines: string[] = [];
  const links = report.links;

  lines.push('');
  lines.push(` ${colors.bold('LINK PROFILE')}`);

  // Overview
  lines.push(`   Total Links: ${links.total}`);

  // Internal vs External ratio
  const internalRatio = links.total > 0 ? Math.round((links.internal / links.total) * 100) : 0;
  lines.push(`   Internal: ${links.internal} (${internalRatio}%) | External: ${links.external} (${100 - internalRatio}%)`);

  // Link issues
  if (links.broken > 0) {
    lines.push(`   Broken Links: ${colors.red(`${links.broken} ✖`)}`);
  }
  if (links.withoutText > 0) {
    lines.push(`   Empty Link Text: ${colors.yellow(`${links.withoutText} ⚠`)}`);
  }
  if (links.nofollow > 0) {
    lines.push(`   Nofollow: ${links.nofollow}`);
  }
  if (links.sponsoredLinks > 0 || links.ugcLinks > 0) {
    lines.push(`   Sponsored: ${links.sponsoredLinks} | UGC: ${links.ugcLinks}`);
  }

  // Internal HTTP links warning
  if (links.internalHttpLinks && links.internalHttpLinks > 0) {
    lines.push(`   ${colors.yellow('⚠')} Internal HTTP links: ${links.internalHttpLinks} ${colors.gray('(should use HTTPS)')}`);
  }

  return lines;
}

/**
 * Format the SEO report for terminal output
 */
export function formatSeoReport(
  report: SeoReport,
  url: string,
  options: SeoFormatOptions = {}
): string {
  const {
    showAll = false,
    showEvidence = false,
    maxIssuesPerCategory = 10,
    showKeywords = true,
    showTiming = true,
    compact = false,
    verbose = false,
    responseHeaders,
  } = options;

  const lines: string[] = [];
  const s = report.summary;

  // Header
  lines.push('');
  lines.push(` ${colors.bold(colors.cyan('🔍 SEO Analysis Report'))}`);
  lines.push(` ${colors.gray('URL:')} ${url}`);

  // Timing if available
  if (showTiming && report.timing?.total) {
    lines.push(` ${colors.gray('Time:')} ${report.timing.total}ms`);
  }

  // Score line
  const gColor = gradeColor(report.grade);
  const sColor = scoreColor(report.score);
  lines.push('');
  lines.push(` ${colors.bold('Grade:')} ${gColor(colors.bold(report.grade))}  ${colors.bold('Score:')} ${sColor(report.score.toString())}/100`);
  lines.push(colors.gray(' ──────────────────────────────────────────────────'));

  // Summary counts
  lines.push('');
  lines.push(` ${colors.bold('Summary')}`);
  const infoSummary = (s.notApplicable !== undefined || s.suggestions !== undefined)
    ? ` (${s.notApplicable ?? 0} not applicable, ${s.suggestions ?? 0} suggestions)`
    : '';
  lines.push(
    ` ${colors.green('✔ Passed:')} ${s.passed}   ${colors.yellow('⚠ Warnings:')} ${s.warnings}   ${colors.red('✖ Errors:')} ${s.errors}   ${colors.blue('ℹ Info:')} ${s.infos}${infoSummary}`
  );

  // Vitals
  if (s.vitals) {
    lines.push(` ${colors.gray('Words:')} ${s.vitals.wordCount} | ${colors.gray('Images:')} ${s.vitals.imageCount} | ${colors.gray('Links:')} ${s.vitals.linkCount}`);
  }

  // Title and Description
  if (!compact) {
    if (report.title) {
      const titleStatus = report.title.length >= 30 && report.title.length <= 60 ? colors.green('✔') : colors.yellow('⚠');
      lines.push('');
      lines.push(` ${colors.bold('Title:')} ${report.title.text} ${colors.gray(`(${report.title.length} chars)`)} ${titleStatus}`);
    }
    if (report.metaDescription) {
      const desc = report.metaDescription.text.length > 80
        ? report.metaDescription.text.slice(0, 77) + '...'
        : report.metaDescription.text;
      const descStatus = report.metaDescription.length >= 120 && report.metaDescription.length <= 160 ? colors.green('✔') : colors.yellow('⚠');
      lines.push(` ${colors.bold('Description:')} ${desc} ${colors.gray(`(${report.metaDescription.length} chars)`)} ${descStatus}`);
    }
  }

  // Top Issues
  if (s.topIssues && s.topIssues.length > 0) {
    lines.push('');
    lines.push(` ${colors.bold('Top Issues')}`);
    s.topIssues.slice(0, 5).forEach(issue => {
      const icon = issue.severity === 'error' ? colors.red('✖') : colors.yellow('⚠');
      lines.push(` ${icon} ${colors.bold(issue.name)}: ${issue.message}`);
    });
  }

  // Keywords Cloud
  if (showKeywords && report.keywords && report.keywords.topKeywords.length > 0) {
    lines.push('');
    lines.push(` ${colors.bold('Top Keywords')}`);
    const kws = report.keywords.topKeywords.slice(0, 8).map(k => `${k.word} (${k.count})`).join(', ');
    lines.push(` ${colors.gray(kws)}`);
  }

  // OpenGraph
  if (!compact && report.openGraph && Object.values(report.openGraph).some(v => v)) {
    lines.push('');
    lines.push(` ${colors.bold('OpenGraph')}`);
    if (report.openGraph.title) lines.push(`   ${colors.cyan('og:title')}       ${report.openGraph.title}`);
    if (report.openGraph.description) {
      const ogDesc = report.openGraph.description.length > 60
        ? report.openGraph.description.slice(0, 57) + '...'
        : report.openGraph.description;
      lines.push(`   ${colors.cyan('og:description')} ${ogDesc}`);
    }
    if (report.openGraph.image) lines.push(`   ${colors.cyan('og:image')}       ${report.openGraph.image}`);
  }

  // Enhanced sections (verbose mode)
  if (verbose) {
    // Performance section
    formatPerformanceSection(report, responseHeaders).forEach(line => lines.push(line));

    // Security headers section (if headers available)
    formatSecuritySection(responseHeaders).forEach(line => lines.push(line));

    // Technical SEO section
    formatTechnicalSection(report).forEach(line => lines.push(line));

    // Content analysis section
    formatContentSection(report).forEach(line => lines.push(line));

    // Link profile section
    formatLinkSection(report).forEach(line => lines.push(line));
  }

  // Checks by Category
  const categories = [...new Set(report.checks.map(c => c.category))].filter(Boolean) as string[];

  categories.forEach(cat => {
    const catChecks = report.checks.filter(c => c.category === cat);
    const issues = catChecks.filter(c => c.status !== 'pass' && c.status !== 'info');
    const passed = catChecks.filter(c => c.status === 'pass');

    // Skip if no issues and not showing all
    if (issues.length === 0 && !showAll) return;

    lines.push('');
    lines.push(` ${colors.bold(cat.toUpperCase())} ${colors.gray(`(${passed.length}/${catChecks.length} passed)`)}`);

    // Show issues
    const checksToShow = showAll ? catChecks : issues;
    checksToShow.slice(0, maxIssuesPerCategory).forEach(check => {
      formatCheck(check, showEvidence).forEach(line => lines.push(line));
    });

    if (checksToShow.length > maxIssuesPerCategory) {
      lines.push(`   ${colors.gray(`... and ${checksToShow.length - maxIssuesPerCategory} more`)}`);
    }
  });

  // Quick Wins
  if (!compact && s.quickWins && s.quickWins.length > 0) {
    lines.push('');
    lines.push(` ${colors.bold('Quick Wins')}`);
    s.quickWins.slice(0, 5).forEach(win => {
      lines.push(` ${colors.green('→')} ${win}`);
    });
  }

  // Completeness scores
  if (!compact && s.completeness) {
    lines.push('');
    lines.push(` ${colors.bold('Completeness Scores')}`);
    const comp = s.completeness;
    const bar = (val: number) => {
      const filled = Math.round(val / 10);
      const empty = 10 - filled;
      const color = val >= 80 ? colors.green : val >= 50 ? colors.yellow : colors.red;
      return color('█'.repeat(filled)) + colors.gray('░'.repeat(empty));
    };
    lines.push(`   Meta:      ${bar(comp.meta)} ${comp.meta}%`);
    lines.push(`   Social:    ${bar(comp.social)} ${comp.social}%`);
    lines.push(`   Technical: ${bar(comp.technical)} ${comp.technical}%`);
    lines.push(`   Content:   ${bar(comp.content)} ${comp.content}%`);
    lines.push(`   Images:    ${bar(comp.images)} ${comp.images}%`);
    lines.push(`   Links:     ${bar(comp.links)} ${comp.links}%`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Analyze security headers and return structured data
 */
export function analyzeSecurityHeaders(
  headers?: Record<string, string | string[]>
): {
  score: number;
  maxScore: number;
  percentage: number;
  grade: string;
  headers: Array<{
    name: string;
    displayName: string;
    present: boolean;
    value?: string;
    critical: boolean;
    recommendation?: string;
  }>;
} {
  const securityHeaders = [
    { name: 'content-security-policy', display: 'Content-Security-Policy', critical: true, rec: 'Add CSP to prevent XSS attacks' },
    { name: 'strict-transport-security', display: 'Strict-Transport-Security', critical: true, rec: 'Add HSTS to enforce HTTPS' },
    { name: 'x-content-type-options', display: 'X-Content-Type-Options', critical: false, rec: 'Set to "nosniff" to prevent MIME sniffing' },
    { name: 'x-frame-options', display: 'X-Frame-Options', critical: false, rec: 'Set to prevent clickjacking attacks' },
    { name: 'referrer-policy', display: 'Referrer-Policy', critical: false, rec: 'Control referrer information leakage' },
    { name: 'permissions-policy', display: 'Permissions-Policy', critical: false, rec: 'Control browser features access' },
    { name: 'cross-origin-embedder-policy', display: 'Cross-Origin-Embedder-Policy', critical: false, rec: 'Enable cross-origin isolation' },
    { name: 'cross-origin-opener-policy', display: 'Cross-Origin-Opener-Policy', critical: false, rec: 'Prevent cross-origin attacks' },
  ];

  let score = 0;
  const headersResult = securityHeaders.map(h => {
    const value = headers?.[h.name];
    const present = !!value;
    if (present) score++;

    return {
      name: h.name,
      displayName: h.display,
      present,
      value: present ? (Array.isArray(value) ? value[0] : value)?.slice(0, 100) : undefined,
      critical: h.critical,
      recommendation: present ? undefined : h.rec,
    };
  });

  const maxScore = securityHeaders.length;
  const percentage = Math.round((score / maxScore) * 100);
  const grade = percentage >= 90 ? 'A' : percentage >= 75 ? 'B' : percentage >= 50 ? 'C' : percentage >= 25 ? 'D' : 'F';

  return { score, maxScore, percentage, grade, headers: headersResult };
}

/**
 * Group checks by category for structured output
 */
function groupChecksByCategory(checks: SeoCheckResult[]): Record<string, {
  passed: number;
  warnings: number;
  errors: number;
  infos: number;
  notApplicable: number;
  suggestions: number;
  passRate: number;
  checks: SeoCheckResult[];
}> {
  const categories: Record<string, SeoCheckResult[]> = {};

  for (const check of checks) {
    const cat = check.category || 'other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(check);
  }

  const result: Record<string, any> = {};
  for (const [cat, catChecks] of Object.entries(categories)) {
    const passed = catChecks.filter(c => c.status === 'pass').length;
    const warnings = catChecks.filter(c => c.status === 'warn').length;
    const errors = catChecks.filter(c => c.status === 'fail').length;
    const infos = catChecks.filter(c => c.status === 'info').length;
    const notApplicable = catChecks.filter(
      c => c.status === 'info' && c.infoType === 'not_applicable'
    ).length;
    const suggestions = catChecks.filter(
      c => c.status === 'info' && c.infoType !== 'not_applicable'
    ).length;
    const total = catChecks.length - infos; // Don't count info in pass rate

    result[cat] = {
      passed,
      warnings,
      errors,
      infos,
      notApplicable,
      suggestions,
      passRate: total > 0 ? Math.round((passed / total) * 100) : 100,
      checks: catChecks,
    };
  }

  return result;
}

/**
 * Format SEO report as JSON (comprehensive format)
 */
export function formatSeoReportJson(
  report: SeoReport,
  url: string,
  options?: { responseHeaders?: Record<string, string | string[]> }
): object {
  const securityAnalysis = options?.responseHeaders
    ? analyzeSecurityHeaders(options.responseHeaders)
    : undefined;

  const checksByCategory = groupChecksByCategory(report.checks);

  return {
    url,
    analyzedAt: new Date().toISOString(),

    // Overall scores
    score: report.score,
    grade: report.grade,

    // Timing metrics
    timing: report.timing,

    // Summary statistics
    summary: {
      totalChecks: report.checks.length,
      passed: report.checks.filter(c => c.status === 'pass').length,
      warnings: report.checks.filter(c => c.status === 'warn').length,
      errors: report.checks.filter(c => c.status === 'fail').length,
      infos: report.checks.filter(c => c.status === 'info').length,
      notApplicable: report.checks.filter(
        c => c.status === 'info' && c.infoType === 'not_applicable'
      ).length,
      suggestions: report.checks.filter(
        c => c.status === 'info' && c.infoType !== 'not_applicable'
      ).length,
      passRate: report.summary.passRate,
      completeness: report.summary.completeness,
      topIssues: report.summary.topIssues,
      quickWins: report.summary.quickWins,
      vitals: report.summary.vitals,
    },

    // Meta information
    meta: {
      title: report.title,
      description: report.metaDescription,
      canonical: report.technical.canonicalUrl,
      robots: report.technical.robotsContent,
      viewport: report.technical.hasViewport,
      charset: report.technical.hasCharset,
      language: report.technical.langValue,
    },

    // Content analysis
    content: {
      ...report.content,
      headings: report.headings,
      keywords: report.keywords,
    },

    // Social meta tags
    social: {
      openGraph: report.openGraph,
      twitterCard: report.twitterCard,
      analysis: report.social,
    },

    // Technical SEO
    technical: report.technical,

    // Structured data / Schema.org
    structuredData: report.structuredData,

    // Links analysis
    links: report.links,

    // Images analysis
    images: report.images,

    // Security headers (if available)
    security: securityAnalysis,

    // Checks organized by category
    checksByCategory,

    // All checks (flat list for compatibility)
    checks: report.checks,
  };
}

/**
 * Get scoring explanation
 */
export function getScoringExplanation(): string {
  return `
SEO Score Calculation
=====================

The SEO score is calculated as a weighted average of all rule checks:

  - Pass:    100 points (rule fully satisfied)
  - Warning:  50 points (partial compliance)
  - Fail:      0 points (rule violated)
  - Info:    N/A (informational, doesn't affect score)

Final Score = (Sum of rule points) / (Number of scored rules) × 100

Grade Scale:
  A: 90-100  Excellent SEO
  B: 80-89   Good SEO
  C: 70-79   Needs improvement
  D: 60-69   Poor SEO
  F: 0-59    Critical issues

Category Weights:
  All categories are weighted equally. Each rule within a category
  contributes equally to the final score.

Completeness Scores:
  Each category has a completeness score (0-100%) based on:
  - Meta: title, description, canonical, viewport, charset
  - Social: og:title, og:description, og:image, og:url, twitter:card, etc.
  - Technical: canonical, viewport, charset, lang, robots
  - Content: word count, paragraphs, lists, emphasis
  - Images: alt text, lazy loading, dimensions, modern formats
  - Links: internal, external, no broken links, text content
`;
}
