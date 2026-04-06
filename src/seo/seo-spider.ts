/**
 * SEO Spider - Web Crawler with SEO Analysis
 *
 * Crawls websites and performs SEO analysis on each page,
 * then detects site-wide SEO conflicts like duplicate titles.
 */

import { Spider, SpiderOptions, SpiderResult, SpiderPageResult } from '../scrape/spider.js';
import { analyzeSeo } from './analyzer.js';
import type { SeoReport } from './types.js';
import { type RuleCategory } from './rules/index.js';
import { createClient } from '../core/client.js';
import { discoverFeeds } from './validators/rss.js';
import { fetchAndValidateSitemap, type SitemapValidationResult } from './validators/sitemap.js';
import * as fs from 'fs/promises';

// ============================================================================
// Types
// ============================================================================

export interface SeoSpiderOptions extends SpiderOptions {
  /** Enable SEO analysis for each page (default: false) */
  seo?: boolean;
  /** Output file path for JSON report */
  output?: string;
  /** Callback for each page's SEO analysis (includes full SEO report + timings) */
  onSeoAnalysis?: (result: SeoPageResult) => void;
  /** Callback when a page is blocked (includes SEO report if analysis was possible) */
  onBlocked?: (result: SeoPageResult) => void | Promise<void>;
  /** Callback when a fetch fails (includes page result with timings) */
  onError?: (result: SeoPageResult) => void | Promise<void>;
  /** Focus on specific rule categories (empty array = all categories) */
  focusCategories?: string[];
  /** Focus mode name for display purposes */
  focusMode?: 'all' | 'links' | 'duplicates' | 'security' | 'ai' | 'resources';
}

export interface SeoPageResult extends SpiderPageResult {
  /** SEO analysis report for this page */
  seoReport?: SeoReport;
}

export interface SiteWideIssue {
  /** Issue type identifier */
  type: 'duplicate-title' | 'duplicate-description' | 'duplicate-h1' | 'missing-canonical' | 'orphan-page';
  /** Severity level */
  severity: 'error' | 'warning' | 'info';
  /** Human-readable message */
  message: string;
  /** URLs affected by this issue */
  affectedUrls: string[];
  /** The duplicated value (for duplicate issues) */
  value?: string;
}

export interface SeoSpiderResult extends Omit<SpiderResult, 'pages'> {
  /** Pages with SEO analysis */
  pages: SeoPageResult[];
  /** Site-wide SEO issues detected across multiple pages */
  siteWideIssues: SiteWideIssue[];
  /** Discovery of important site files */
  discovery?: {
    humans: { found: boolean; content?: string; url: string };
    llms: { found: boolean; content?: string; url: string };
    sitemap: { found: boolean; url: string; urlCount?: number };
    manifest: { found: boolean; url: string; content?: Record<string, unknown>; valid?: boolean; issues?: string[] };
  };
  /** Discovered RSS/Atom feeds */
  rssFeeds?: Array<{
    url: string;
    type: 'rss' | 'atom' | 'unknown';
    title?: string;
    itemCount: number;
  }>;
  /** Sitemap validation results (validated once per crawl) */
  sitemapValidation?: SitemapValidationResult;
  /** Summary statistics */
  summary: {
    totalPages: number;
    pagesWithErrors: number;
    pagesWithWarnings: number;
    avgScore: number;
    duplicateTitles: number;
    duplicateDescriptions: number;
    duplicateH1s: number;
    orphanPages: number;
  };
}

// ============================================================================
// SEO Spider Class
// ============================================================================

export class SeoSpider {
  private spider: Spider;
  private options: SeoSpiderOptions;
  private seoPages: SeoPageResult[] = [];
  private homeHtml: string = '';
  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.hash = '';
      parsed.searchParams.sort();
      if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }
      return parsed.toString();
    } catch {
      return url;
    }
  }
  private toHeaderRecord(headers: Headers): Record<string, string> {
    const headerRecord: Record<string, string> = {};
    headers.forEach((value, key) => {
      headerRecord[key] = value;
    });
    return headerRecord;
  }

  constructor(options: SeoSpiderOptions = {}) {
    this.options = options;

    // Create spider with unified onPage hook for SEO analysis + user callbacks
    const userOnPage = options.onPage;
    this.spider = new Spider({
      ...options,
      onPage: async (event) => {
        // SEO analysis during crawl (uses lazy document parser)
        if (this.options.seo && event.html) {
          await this.analyzePageDuringCrawl(event.result, event.html);
        }
        // Forward to user's onPage callback
        if (userOnPage) {
          await userOnPage(event);
        }
      },
      onBlocked: this.options.onBlocked
        ? async (pageResult) => {
            await this.options.onBlocked!({ ...pageResult } as SeoPageResult);
          }
        : undefined,
      onError: this.options.onError
        ? async (pageResult) => {
            await this.options.onError!({ ...pageResult } as SeoPageResult);
          }
        : undefined,
    });
  }

  /**
   * Analyze a single page during crawling (not after)
   */
  private async analyzePageDuringCrawl(
    pageResult: SpiderPageResult,
    html: string
  ): Promise<void> {
    // Skip only hard failures (no HTML to analyze)
    if (pageResult.status >= 400 || !html) {
      const seoPage: SeoPageResult = { ...pageResult, seoReport: undefined };
      this.seoPages.push(seoPage);
      return;
    }

    // Store home page HTML for RSS discovery later
    if (pageResult.depth === 0) {
      this.homeHtml = html;
    }

    try {
      // Build rules options based on focus categories
      const rulesOptions = this.options.focusCategories?.length
        ? { categories: this.options.focusCategories as RuleCategory[] }
        : undefined;

      // Run full SEO analysis on the HTML we already have
      const seoReport = await analyzeSeo(html, {
        baseUrl: pageResult.url,
        timings: pageResult.timings,
        htmlSize: pageResult.metrics?.htmlSize,
        rules: rulesOptions,
      });

      const seoPage: SeoPageResult = { ...pageResult, seoReport };
      this.seoPages.push(seoPage);
      // Call callback if provided
      this.options.onSeoAnalysis?.(seoPage);
    } catch {
      // SEO analysis failed for this page — record it without a report and continue crawl
      const seoPage: SeoPageResult = { ...pageResult, seoReport: undefined };
      this.seoPages.push(seoPage);
    }
  }

  /**
   * Crawl a website with optional SEO analysis
   */
  async crawl(startUrl: string): Promise<SeoSpiderResult> {
    // Reset state
    this.seoPages = [];
    this.homeHtml = '';

    // Crawl with SEO analysis happening during crawl (via onPage)
    const result = await this.spider.crawl(startUrl);

    // If SEO is disabled, return basic result
    if (!this.options.seo) {
      return {
        ...result,
        pages: result.pages as SeoPageResult[],
        siteWideIssues: [],
        summary: {
          totalPages: result.pages.length,
          pagesWithErrors: 0,
          pagesWithWarnings: 0,
          avgScore: 0,
          duplicateTitles: 0,
          duplicateDescriptions: 0,
          duplicateH1s: 0,
          orphanPages: 0,
        },
      };
    }

    // SEO pages were analyzed during crawl - use them directly
    const seoPages = this.seoPages;

    // Detect site-wide issues (fast - just aggregation)
    const siteWideIssues = this.detectSiteWideIssues(seoPages);

    // Calculate summary
    const summary = this.calculateSummary(seoPages, siteWideIssues);

    // Check for site files (humans.txt, llms.txt, sitemap.xml, manifest.json)
    const discovery = await this.checkSiteFiles(startUrl);

    // Discover RSS feeds using home page HTML we captured during crawl
    const rssFeeds = await discoverFeeds(new URL(startUrl).origin, this.homeHtml);

    // Validate sitemap (once per crawl)
    const sitemapValidation = await this.validateSitemap(startUrl);

    const seoResult: SeoSpiderResult = {
      ...result,
      pages: seoPages,
      siteWideIssues,
      discovery,
      rssFeeds,
      sitemapValidation,
      summary,
    };

    // Save to file if output path specified
    if (this.options.output) {
      await this.saveReport(seoResult);
    }

    return seoResult;
  }

  /**
   * Check for site discovery files: humans.txt, llms.txt, sitemap.xml, manifest.json
   */
  private async checkSiteFiles(startUrl: string): Promise<SeoSpiderResult['discovery']> {
    try {
      const baseUrl = new URL(startUrl).origin;
      const client = createClient({ timeout: 5000 });
      const results: NonNullable<SeoSpiderResult['discovery']> = {
        humans: { found: false, content: undefined, url: `${baseUrl}/humans.txt` },
        llms: { found: false, content: undefined, url: `${baseUrl}/llms.txt` },
        sitemap: { found: false, url: `${baseUrl}/sitemap.xml`, urlCount: undefined },
        manifest: { found: false, url: `${baseUrl}/manifest.json`, content: undefined, valid: undefined, issues: undefined },
      };

      // Check humans.txt
      try {
        const res = await client.get(results.humans.url);
        if (res.status === 200) {
          results.humans.found = true;
          results.humans.content = await res.text();
        }
      } catch {
        // Best effort — continue without it
      }

      // Check llms.txt
      try {
        const res = await client.get(results.llms.url);
        if (res.status === 200) {
          results.llms.found = true;
          results.llms.content = await res.text();
        }
      } catch {
        // Best effort — continue without it
      }

      // Check sitemap.xml
      try {
        const res = await client.get(results.sitemap.url);
        if (res.status === 200) {
          results.sitemap.found = true;
          const content = await res.text();
          // Count URLs in sitemap
          const urlMatches = content.match(/<loc>/g);
          results.sitemap.urlCount = urlMatches ? urlMatches.length : 0;
        }
      } catch {
        // Best effort — continue without it
      }

      // Check manifest.json (also try /site.webmanifest)
      try {
        let res = await client.get(results.manifest.url);
        if (res.status !== 200) {
          // Try alternate location
          results.manifest.url = `${baseUrl}/site.webmanifest`;
          res = await client.get(results.manifest.url);
        }
        if (res.status === 200) {
          results.manifest.found = true;
          const text = await res.text();
          try {
            const manifest = JSON.parse(text);
            results.manifest.content = manifest;
            results.manifest.valid = true;
            results.manifest.issues = this.validateManifest(manifest);
          } catch {
            results.manifest.valid = false;
            results.manifest.issues = ['Invalid JSON format'];
          }
        }
      } catch {
        // Best effort — continue without it
      }

      return results;
    } catch {
      // Best effort — return undefined if base URL parsing fails
      return undefined;
    }
  }

  /**
   * Validate manifest.json structure
   */
  private validateManifest(manifest: Record<string, unknown>): string[] {
    const issues: string[] = [];

    // Required fields
    if (!manifest.name && !manifest.short_name) {
      issues.push('Missing required field: name or short_name');
    }

    // Icons validation
    if (!manifest.icons || !Array.isArray(manifest.icons) || manifest.icons.length === 0) {
      issues.push('Missing icons array');
    } else {
      const icons = manifest.icons as Array<{ src?: string; sizes?: string; type?: string; purpose?: string }>;
      const sizes = icons.map(i => i.sizes).filter(Boolean);

      // Check for required sizes
      const has192 = sizes.some(s => s?.includes('192'));
      const has512 = sizes.some(s => s?.includes('512'));

      if (!has192) issues.push('Missing 192x192 icon (required for Add to Home Screen)');
      if (!has512) issues.push('Missing 512x512 icon (required for splash screen)');

      // Check for maskable icon
      const hasMaskable = icons.some(i => i.purpose?.includes('maskable'));
      if (!hasMaskable) issues.push('No maskable icon found (recommended for Android adaptive icons)');
    }

    // Display mode
    if (!manifest.display) {
      issues.push('Missing display mode (recommended: standalone)');
    }

    // Start URL
    if (!manifest.start_url) {
      issues.push('Missing start_url');
    }

    // Colors
    if (!manifest.theme_color) {
      issues.push('Missing theme_color');
    }
    if (!manifest.background_color) {
      issues.push('Missing background_color');
    }

    // Scope
    if (!manifest.scope) {
      issues.push('Missing scope (defines navigation boundaries)');
    }

    // Short name length
    if (manifest.short_name && typeof manifest.short_name === 'string' && manifest.short_name.length > 12) {
      issues.push(`short_name too long (${manifest.short_name.length} chars, max 12)`);
    }

    return issues;
  }

  /**
   * Validate sitemap (runs once per crawl)
   * Checks /sitemap.xml by default
   */
  private async validateSitemap(startUrl: string): Promise<SitemapValidationResult | undefined> {
    try {
      const baseUrl = new URL(startUrl).origin;
      const sitemapUrl = `${baseUrl}/sitemap.xml`;

      // Create a fetcher using our client with timeout
      const client = createClient({ timeout: this.options.timeout || 15000 });
      const fetcher = async (url: string) => {
        const res = await client.get(url);
        const text = await res.text();
        return {
          status: res.status,
          text,
          headers: this.toHeaderRecord(res.headers),
        };
      };

      const result = await fetchAndValidateSitemap(sitemapUrl, fetcher);
      return result;
    } catch {
      // Best effort — sitemap validation is optional
      return undefined;
    }
  }

  /**
   * Detect site-wide SEO issues across all pages
   */
  private detectSiteWideIssues(pages: SeoPageResult[]): SiteWideIssue[] {
    const issues: SiteWideIssue[] = [];

    // Group pages by title
    const titleGroups = new Map<string, string[]>();
    const descriptionGroups = new Map<string, string[]>();
    const h1Groups = new Map<string, string[]>();

    for (const page of pages) {
      if (!page.seoReport) continue;

      // Group by title
      const title = page.seoReport.title?.text?.trim();
      if (title) {
        const urls = titleGroups.get(title) || [];
        urls.push(page.url);
        titleGroups.set(title, urls);
      }

      // Group by meta description
      const desc = page.seoReport.metaDescription?.text?.trim();
      if (desc) {
        const urls = descriptionGroups.get(desc) || [];
        urls.push(page.url);
        descriptionGroups.set(desc, urls);
      }

      // Group by H1 (using first heading if available)
      const h1 = page.seoReport.headings?.structure?.find(h => h.level === 1)?.text?.trim();
      if (h1) {
        const urls = h1Groups.get(h1) || [];
        urls.push(page.url);
        h1Groups.set(h1, urls);
      }
    }

    // Detect duplicate titles
    for (const [title, urls] of titleGroups) {
      if (urls.length > 1) {
        issues.push({
          type: 'duplicate-title',
          severity: 'error',
          message: `${urls.length} pages share the same title`,
          affectedUrls: urls,
          value: title,
        });
      }
    }

    // Detect duplicate descriptions
    for (const [desc, urls] of descriptionGroups) {
      if (urls.length > 1) {
        issues.push({
          type: 'duplicate-description',
          severity: 'warning',
          message: `${urls.length} pages share the same meta description`,
          affectedUrls: urls,
          value: desc,
        });
      }
    }

    // Detect duplicate H1s
    for (const [h1, urls] of h1Groups) {
      if (urls.length > 1) {
        issues.push({
          type: 'duplicate-h1',
          severity: 'warning',
          message: `${urls.length} pages share the same H1 heading`,
          affectedUrls: urls,
          value: h1,
        });
      }
    }

    // Detect orphan pages (pages with no internal links pointing to them)
    const linkedUrls = new Set<string>();
    for (const page of pages) {
      for (const link of page.links) {
        if (link.type === 'internal' && link.href) {
          linkedUrls.add(this.normalizeUrl(link.href));
        }
      }
    }

    const orphanPages = pages
      .filter(p => p.depth > 0 && !linkedUrls.has(this.normalizeUrl(p.url))) // depth 0 is the start URL
      .map(p => p.url);

    if (orphanPages.length > 0) {
      issues.push({
        type: 'orphan-page',
        severity: 'warning',
        message: `${orphanPages.length} page(s) have no internal links pointing to them`,
        affectedUrls: orphanPages,
      });
    }

    return issues;
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(
    pages: SeoPageResult[],
    issues: SiteWideIssue[]
  ): SeoSpiderResult['summary'] {
    const pagesWithSeo = pages.filter(p => p.seoReport);
    const scores = pagesWithSeo.map(p => p.seoReport!.score);
    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    const pagesWithErrors = pagesWithSeo.filter(
      p => p.seoReport!.checks.some(c => c.status === 'fail')
    ).length;

    const pagesWithWarnings = pagesWithSeo.filter(
      p => p.seoReport!.checks.some(c => c.status === 'warn')
    ).length;

    const duplicateTitles = issues.filter(i => i.type === 'duplicate-title').length;
    const duplicateDescriptions = issues.filter(i => i.type === 'duplicate-description').length;
    const duplicateH1s = issues.filter(i => i.type === 'duplicate-h1').length;
    const orphanPages = issues
      .filter(i => i.type === 'orphan-page')
      .reduce((sum, i) => sum + i.affectedUrls.length, 0);

    return {
      totalPages: pages.length,
      pagesWithErrors,
      pagesWithWarnings,
      avgScore,
      duplicateTitles,
      duplicateDescriptions,
      duplicateH1s,
      orphanPages,
    };
  }

  /**
   * Save report to JSON file
   */
  private async saveReport(result: SeoSpiderResult): Promise<void> {
    if (!this.options.output) return;

    const reportData = {
      ...result,
      // Convert Set to Array for JSON serialization
      visited: Array.from(result.visited),
      generatedAt: new Date().toISOString(),
    };

    await fs.writeFile(
      this.options.output,
      JSON.stringify(reportData, null, 2),
      'utf-8'
    );
  }

  /**
   * Stop the crawler
   */
  abort(): void {
    this.spider.abort();
  }

  /**
   * Check if crawler is running
   */
  isRunning(): boolean {
    return this.spider.isRunning();
  }
}

/**
 * Quick SEO spider function for simple use cases
 */
export async function seoSpider(
  url: string,
  options?: SeoSpiderOptions
): Promise<SeoSpiderResult> {
  const spider = new SeoSpider(options);
  return spider.crawl(url);
}
