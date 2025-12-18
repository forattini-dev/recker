/**
 * SEO MCP Tools
 *
 * Provides AI agents with SEO analysis capabilities:
 * - Single page analysis with 400+ rules
 * - Site-wide crawling with duplicate detection
 * - Prioritized quick wins for immediate action
 */

import { createClient } from '../../core/client.js';
import { analyzeSeo } from '../../seo/analyzer.js';
import { seoSpider } from '../../seo/seo-spider.js';
import type { SeoReport, SeoCheckResult } from '../../seo/types.js';
import type { SeoSpiderResult, SiteWideIssue } from '../../seo/seo-spider.js';
import type { MCPTool, MCPToolResult } from '../types.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a single SEO check result for display
 */
function formatCheck(check: SeoCheckResult): string {
  const icon = check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : '⚠';
  let line = `${icon} [${check.status.toUpperCase()}] ${check.name}: ${check.message}`;
  if (check.recommendation) {
    line += `\n   → ${check.recommendation}`;
  }
  return line;
}

/**
 * Create a summary of SEO issues for AI consumption
 */
function createIssueSummary(checks: SeoCheckResult[]): {
  critical: SeoCheckResult[];
  warnings: SeoCheckResult[];
  passed: number;
  total: number;
} {
  const critical = checks.filter(c => c.status === 'fail');
  const warnings = checks.filter(c => c.status === 'warn');
  const passed = checks.filter(c => c.status === 'pass').length;

  return { critical, warnings, passed, total: checks.length };
}

/**
 * Extract category from rule/check name (e.g., "meta-title" -> "meta")
 */
function extractCategory(name: string): string {
  const lowerName = name.toLowerCase();
  // Common category prefixes based on rule naming convention
  const categories = [
    'meta', 'content', 'links', 'images', 'technical', 'security',
    'performance', 'mobile', 'accessibility', 'schema', 'structural',
    'i18n', 'pwa', 'social', 'ecommerce', 'local', 'cwv',
    'readability', 'crawl', 'internal-linking', 'best-practices'
  ];

  for (const cat of categories) {
    if (lowerName.startsWith(cat) || lowerName.includes(cat)) {
      return cat;
    }
  }
  return 'general';
}

/**
 * Generate actionable quick wins from SEO report
 */
function generateQuickWins(report: SeoReport): Array<{
  priority: 'high' | 'medium' | 'low';
  category: string;
  issue: string;
  action: string;
  impact: string;
}> {
  const quickWins: Array<{
    priority: 'high' | 'medium' | 'low';
    category: string;
    issue: string;
    action: string;
    impact: string;
  }> = [];

  for (const check of report.checks) {
    if (check.status === 'pass') continue;

    const category = extractCategory(check.name);

    // Determine priority based on severity and category
    let priority: 'high' | 'medium' | 'low' = 'medium';
    if (check.status === 'fail') {
      priority = 'high';
    } else if (['meta', 'title', 'content'].includes(category)) {
      priority = 'medium';
    } else {
      priority = 'low';
    }

    // High priority issues (critical for SEO)
    if (check.name.toLowerCase().includes('title') && check.status === 'fail') {
      priority = 'high';
    }
    if (check.name.toLowerCase().includes('meta description') && check.status === 'fail') {
      priority = 'high';
    }
    if (check.name.toLowerCase().includes('h1') && check.status === 'fail') {
      priority = 'high';
    }
    if (check.name.toLowerCase().includes('canonical') && check.status === 'fail') {
      priority = 'high';
    }
    if (check.name.toLowerCase().includes('https') && check.status === 'fail') {
      priority = 'high';
    }

    quickWins.push({
      priority,
      category,
      issue: check.name,
      action: check.recommendation || check.message,
      impact: check.evidence?.impact || 'Improves SEO ranking and user experience',
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  quickWins.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return quickWins;
}

// ============================================================================
// Tool Handlers
// ============================================================================

/**
 * Analyze a single URL for SEO issues
 */
async function seoAnalyze(args: Record<string, unknown>): Promise<MCPToolResult> {
  const url = String(args.url || '');
  const categories = args.categories as string[] | undefined;

  if (!url) {
    return {
      content: [{ type: 'text', text: 'Error: url is required' }],
      isError: true,
    };
  }

  try {
    // Fetch the page
    const client = createClient({ timeout: 30000 });
    const response = await client.get(url);
    const html = await response.text();

    // Get response headers for security analysis
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    // Run SEO analysis
    const report = await analyzeSeo(html, {
      baseUrl: url,
      responseHeaders,
      rules: categories ? { categories: categories as any } : undefined,
    });

    // Build summary
    const summary = createIssueSummary(report.checks);

    // Format output for AI consumption
    const output: Record<string, unknown> = {
      url,
      score: report.score,
      grade: report.grade,
      summary: {
        critical: summary.critical.length,
        warnings: summary.warnings.length,
        passed: summary.passed,
        total: summary.total,
      },
      timing: report.timing,
    };

    // Add OpenGraph info if available
    if (report.openGraph) {
      output.openGraph = report.openGraph;
    }

    // Add critical issues (always shown)
    if (summary.critical.length > 0) {
      output.criticalIssues = summary.critical.map(c => ({
        name: c.name,
        message: c.message,
        recommendation: c.recommendation,
        evidence: c.evidence,
      }));
    }

    // Add warnings
    if (summary.warnings.length > 0) {
      output.warnings = summary.warnings.map(c => ({
        name: c.name,
        message: c.message,
        recommendation: c.recommendation,
      }));
    }

    // Always include detailed analysis
    output.detailedAnalysis = {
      title: report.title,
      metaDescription: report.metaDescription,
      headings: report.headings,
      content: report.content,
      links: report.links,
      images: report.images,
      technical: report.technical,
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(output, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `SEO analysis failed: ${(error as Error).message}`,
      }],
      isError: true,
    };
  }
}

/**
 * Crawl a website and analyze SEO across all pages
 */
async function seoSpiderCrawl(args: Record<string, unknown>): Promise<MCPToolResult> {
  const url = String(args.url || '');
  const maxPages = Number(args.maxPages) || 100;
  const maxDepth = Number(args.maxDepth) || 5;
  const concurrency = Number(args.concurrency) || 3;
  const transport = (args.transport as 'auto' | 'undici' | 'curl') || 'auto';

  if (!url) {
    return {
      content: [{ type: 'text', text: 'Error: url is required' }],
      isError: true,
    };
  }

  try {
    const result = await seoSpider(url, {
      seo: true,
      maxPages,
      maxDepth,
      concurrency,
      delay: 200, // Be respectful to servers
      transport,
    });

    // Build output
    const output: Record<string, unknown> = {
      url,
      crawlDuration: result.duration,
      summary: result.summary,
    };

    // Site-wide issues (duplicates, orphans)
    if (result.siteWideIssues.length > 0) {
      output.siteWideIssues = result.siteWideIssues.map(issue => ({
        type: issue.type,
        severity: issue.severity,
        message: issue.message,
        affectedUrls: issue.affectedUrls.slice(0, 5), // Limit URLs shown
        affectedCount: issue.affectedUrls.length,
        value: issue.value,
      }));
    }

    // Per-page results (sorted by score, worst first)
    const pageResults = result.pages
      .filter(p => p.seoReport)
      .map(p => ({
        url: p.url,
        status: p.status,
        score: p.seoReport?.score,
        grade: p.seoReport?.grade,
        criticalIssues: p.seoReport?.checks.filter(c => c.status === 'fail').length || 0,
        warnings: p.seoReport?.checks.filter(c => c.status === 'warn').length || 0,
      }))
      .sort((a, b) => (a.score || 0) - (b.score || 0));

    output.pages = pageResults;

    // Pages with errors (failed to crawl)
    const errorPages = result.pages.filter(p => p.error);
    if (errorPages.length > 0) {
      output.crawlErrors = errorPages.map(p => ({
        url: p.url,
        error: p.error,
      }));
    }

    // Quick recommendations based on site-wide analysis
    const recommendations: string[] = [];

    if (result.summary.duplicateTitles > 0) {
      recommendations.push(`Fix ${result.summary.duplicateTitles} pages with duplicate titles - each page should have a unique title`);
    }
    if (result.summary.duplicateDescriptions > 0) {
      recommendations.push(`Fix ${result.summary.duplicateDescriptions} pages with duplicate meta descriptions`);
    }
    if (result.summary.duplicateH1s > 0) {
      recommendations.push(`Fix ${result.summary.duplicateH1s} pages with duplicate H1 headings`);
    }
    if (result.summary.orphanPages > 0) {
      recommendations.push(`Add internal links to ${result.summary.orphanPages} orphan pages that have no incoming links`);
    }
    if (result.summary.avgScore < 70) {
      recommendations.push(`Overall site SEO score is ${result.summary.avgScore}/100 - focus on pages with lowest scores first`);
    }

    if (recommendations.length > 0) {
      output.recommendations = recommendations;
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(output, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `SEO spider failed: ${(error as Error).message}`,
      }],
      isError: true,
    };
  }
}

/**
 * Get prioritized quick wins from SEO analysis
 */
async function seoQuickWins(args: Record<string, unknown>): Promise<MCPToolResult> {
  const url = String(args.url || '');
  const limit = Number(args.limit) || 10;

  if (!url) {
    return {
      content: [{ type: 'text', text: 'Error: url is required' }],
      isError: true,
    };
  }

  try {
    // Fetch and analyze the page
    const client = createClient({ timeout: 30000 });
    const response = await client.get(url);
    const html = await response.text();

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    const report = await analyzeSeo(html, {
      baseUrl: url,
      responseHeaders,
    });

    // Generate quick wins
    const quickWins = generateQuickWins(report).slice(0, limit);

    // Group by priority
    const high = quickWins.filter(w => w.priority === 'high');
    const medium = quickWins.filter(w => w.priority === 'medium');
    const low = quickWins.filter(w => w.priority === 'low');

    const output = {
      url,
      score: report.score,
      grade: report.grade,
      quickWins: {
        high: high.map(w => ({
          issue: w.issue,
          action: w.action,
          impact: w.impact,
          category: w.category,
        })),
        medium: medium.map(w => ({
          issue: w.issue,
          action: w.action,
          category: w.category,
        })),
        low: low.map(w => ({
          issue: w.issue,
          action: w.action,
          category: w.category,
        })),
      },
      summary: {
        totalIssues: quickWins.length,
        highPriority: high.length,
        mediumPriority: medium.length,
        lowPriority: low.length,
      },
      advice: high.length > 0
        ? `Start with the ${high.length} high-priority issues first. These have the biggest impact on SEO.`
        : medium.length > 0
          ? `Good job! No critical issues. Focus on the ${medium.length} medium-priority improvements.`
          : 'Excellent! Your page is well-optimized. Consider the minor improvements listed.',
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(output, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Quick wins analysis failed: ${(error as Error).message}`,
      }],
      isError: true,
    };
  }
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const seoTools: MCPTool[] = [
  {
    name: 'rek_seo_analyze',
    description: `Analyze a single web page for SEO issues using 400+ rules across 19 categories.

Returns:
- SEO score (0-100) and grade (A-F)
- Critical issues that must be fixed
- Warnings and recommendations
- OpenGraph/social meta analysis
- Request timing breakdown

Perfect for analyzing your localhost dev server or any public URL. Categories include: meta, content, links, images, technical, security, performance, mobile, accessibility, schema, structural, i18n, PWA, social, e-commerce, local SEO, Core Web Vitals, readability, crawlability, internal linking, and best practices.`,
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to analyze (e.g., http://localhost:3000 or https://example.com)',
        },
        categories: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by specific categories (e.g., ["meta", "security", "performance"]). Leave empty for all.',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'rek_seo_spider',
    description: `Crawl an entire website and analyze SEO across all pages.

Detects site-wide issues:
- Duplicate titles, descriptions, and H1s
- Orphan pages (no internal links pointing to them)
- Pages with low SEO scores

Returns per-page scores and prioritized recommendations for improving overall site SEO. Great for auditing a full site before launch or finding issues across your dev environment.`,
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Starting URL to crawl (e.g., http://localhost:3000)',
        },
        maxPages: {
          type: 'number',
          description: 'Maximum pages to crawl',
          default: 100,
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum link depth to follow',
          default: 5,
        },
        concurrency: {
          type: 'number',
          description: 'Parallel requests (be respectful to servers)',
          default: 3,
        },
        transport: {
          type: 'string',
          enum: ['auto', 'undici', 'curl'],
          description: 'HTTP transport: auto (try undici, fallback to curl on WAF block), undici (fast), curl (curl-impersonate for protected sites)',
          default: 'auto',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'rek_seo_quick_wins',
    description: `Get prioritized, actionable SEO improvements for a page.

Returns issues sorted by priority (high/medium/low) with:
- What to fix
- How to fix it
- Expected impact

Use this when you want a focused list of what to work on next, rather than a full audit.`,
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to analyze',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of quick wins to return',
          default: 10,
        },
      },
      required: ['url'],
    },
  },
];

export const seoToolHandlers: Record<string, (args: Record<string, unknown>) => Promise<MCPToolResult>> = {
  rek_seo_analyze: seoAnalyze,
  rek_seo_spider: seoSpiderCrawl,
  rek_seo_quick_wins: seoQuickWins,
};
