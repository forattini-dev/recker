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

  lines.push(` ${icon} ${check.message}`);

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
  lines.push(` ${colors.green('✔ Passed:')} ${s.passed}   ${colors.yellow('⚠ Warnings:')} ${s.warnings}   ${colors.red('✖ Errors:')} ${s.errors}   ${colors.blue('ℹ Info:')} ${s.infos}`);

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
 * Format SEO report as JSON
 */
export function formatSeoReportJson(report: SeoReport, url: string): object {
  return {
    url,
    analyzedAt: new Date().toISOString(),
    timing: report.timing,
    score: report.score,
    grade: report.grade,
    title: report.title,
    metaDescription: report.metaDescription,
    content: report.content,
    headings: report.headings,
    links: report.links,
    images: report.images,
    openGraph: report.openGraph,
    twitterCard: report.twitterCard,
    social: report.social,
    structuredData: report.structuredData,
    technical: report.technical,
    keywords: report.keywords,
    checks: report.checks,
    summary: {
      total: report.checks.length,
      passed: report.checks.filter(c => c.status === 'pass').length,
      warnings: report.checks.filter(c => c.status === 'warn').length,
      errors: report.checks.filter(c => c.status === 'fail').length,
      info: report.checks.filter(c => c.status === 'info').length,
      passRate: report.summary.passRate,
      completeness: report.summary.completeness,
      quickWins: report.summary.quickWins,
    },
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
