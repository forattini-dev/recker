/**
 * SEO Spider - Web Crawler with SEO Analysis
 *
 * Crawls websites and performs SEO analysis on each page,
 * then detects site-wide SEO conflicts like duplicate titles.
 */

import { Spider, SpiderOptions, SpiderResult, SpiderPageResult } from '../scrape/spider.js';
import { analyzeSeo } from './analyzer.js';
import type { SeoReport, SeoCheckResult } from './types.js';
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
  /** Callback for each page's SEO analysis */
  onSeoAnalysis?: (result: SeoPageResult) => void;
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
  /** Discovery of text files (humans.txt, llms.txt) */
  txtFiles?: {
    humans: { found: boolean; content?: string; url: string };
    llms: { found: boolean; content?: string; url: string };
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
  private seoResults: Map<string, SeoReport> = new Map();

  constructor(options: SeoSpiderOptions = {}) {
    this.options = options;
    this.spider = new Spider(options);
  }

  /**
   * Crawl a website with optional SEO analysis
   */
  async crawl(startUrl: string): Promise<SeoSpiderResult> {
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

    // Perform SEO analysis on each page
    const seoPages = await this.analyzePages(result.pages);

    // Detect site-wide issues
    const siteWideIssues = this.detectSiteWideIssues(seoPages);

    // Calculate summary
    const summary = this.calculateSummary(seoPages, siteWideIssues);

    // Check for text files (humans.txt, llms.txt)
    const txtFiles = await this.checkTextFiles(startUrl);

    // Discover RSS feeds
    let homeHtml = '';
    try {
       const client = createClient({ timeout: 10000 });
       const res = await client.get(startUrl);
       homeHtml = await res.text();
    } catch {}
    const rssFeeds = await discoverFeeds(new URL(startUrl).origin, homeHtml);

    // Validate sitemap (once per crawl, not per page)
    const sitemapValidation = await this.validateSitemap(startUrl);

    const seoResult: SeoSpiderResult = {
      ...result,
      pages: seoPages,
      siteWideIssues,
      txtFiles,
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
   * Check for humans.txt and llms.txt
   */
  private async checkTextFiles(startUrl: string): Promise<SeoSpiderResult['txtFiles']> {
    try {
      const baseUrl = new URL(startUrl).origin;
      const client = createClient({ timeout: 5000 });
      const results = {
        humans: { found: false, content: undefined as string | undefined, url: `${baseUrl}/humans.txt` },
        llms: { found: false, content: undefined as string | undefined, url: `${baseUrl}/llms.txt` },
      };

      // Check humans.txt
      try {
        const res = await client.get(results.humans.url);
        if (res.status === 200) {
          results.humans.found = true;
          results.humans.content = await res.text();
        }
      } catch {}

      // Check llms.txt
      try {
        const res = await client.get(results.llms.url);
        if (res.status === 200) {
          results.llms.found = true;
          results.llms.content = await res.text();
        }
      } catch {}

      return results;
    } catch {
      return undefined;
    }
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
          headers: Object.fromEntries([...res.headers.entries()]),
        };
      };

      const result = await fetchAndValidateSitemap(sitemapUrl, fetcher);
      return result;
    } catch {
      return undefined;
    }
  }

  /**
   * Analyze SEO for all crawled pages
   */
  private async analyzePages(pages: SpiderPageResult[]): Promise<SeoPageResult[]> {
    const results: SeoPageResult[] = [];
    const client = createClient({
      timeout: this.options.timeout || 10000,
      headers: {
        'User-Agent': this.options.userAgent || 'Recker Spider/1.0',
      },
    });

    for (const page of pages) {
      // Skip error pages
      if (page.error || page.status >= 400) {
        results.push({
          ...page,
          seoReport: undefined,
        });
        continue;
      }

      try {
        // Re-fetch the HTML for full SEO analysis
        const response = await client.get(page.url);
        const html = await response.text();

        // Build rules options based on focus categories
        const rulesOptions = this.options.focusCategories?.length
          ? { categories: this.options.focusCategories as any[] }
          : undefined;

        // Use the full SEO analyzer with focus categories if specified
        const seoReport = await analyzeSeo(html, {
          baseUrl: page.url,
          rules: rulesOptions,
        });

        const seoPage: SeoPageResult = {
          ...page,
          seoReport,
        };

        results.push(seoPage);
        this.seoResults.set(page.url, seoReport);

        // Call callback if provided
        this.options.onSeoAnalysis?.(seoPage);
      } catch {
        results.push({
          ...page,
          seoReport: undefined,
        });
      }
    }

    return results;
  }

  /**
   * Create a basic SEO report from spider page data
   * Note: This is limited since we don't have full HTML access
   */
  private createReportFromPageData(page: SpiderPageResult): SeoReport {
    const checks: SeoCheckResult[] = [];

    // Title check
    if (page.title) {
      const titleLength = page.title.length;
      if (titleLength < 30) {
        checks.push({
          name: 'Title Length',
          category: 'title',
          status: 'warn',
          message: `Title is ${titleLength} characters`,
          value: titleLength,
          recommendation: 'Title should be 50-60 characters',
        });
      } else if (titleLength > 60) {
        checks.push({
          name: 'Title Length',
          category: 'title',
          status: 'warn',
          message: `Title is too long (${titleLength} chars)`,
          value: titleLength,
          recommendation: 'Title should be 50-60 characters',
        });
      } else {
        checks.push({
          name: 'Title Length',
          category: 'title',
          status: 'pass',
          message: `Good title length (${titleLength} chars)`,
          value: titleLength,
        });
      }
    } else {
      checks.push({
        name: 'Title',
        category: 'title',
        status: 'fail',
        message: 'Page has no title',
        recommendation: 'Add a descriptive <title> tag',
      });
    }

    // Link analysis
    const internalLinks = page.links.filter(l => l.type === 'internal').length;
    const externalLinks = page.links.filter(l => l.type === 'external').length;

    if (internalLinks === 0) {
      checks.push({
        name: 'Internal Links',
        category: 'links',
        status: 'warn',
        message: 'No internal links found',
        recommendation: 'Add internal links to improve site structure',
      });
    } else {
      checks.push({
        name: 'Internal Links',
        category: 'links',
        status: 'pass',
        message: `${internalLinks} internal links found`,
        value: internalLinks,
      });
    }

    // Calculate score based on checks
    // pass = 100%, warn = 50%, fail = 0%
    const scoreSum = checks.reduce((sum, c) => {
      if (c.status === 'pass') return sum + 100;
      if (c.status === 'warn') return sum + 50;
      return sum; // fail = 0
    }, 0);
    const score = checks.length > 0 ? Math.round(scoreSum / checks.length) : 0;

    // Build basic summary for spider reports
    const passed = checks.filter(c => c.status === 'pass').length;
    const warnings = checks.filter(c => c.status === 'warn').length;
    const errors = checks.filter(c => c.status === 'fail').length;
    const infos = checks.filter(c => c.status === 'info').length;
    const passRate = checks.length > 0 ? Math.round((passed / checks.length) * 100) : 0;

    return {
      url: page.url,
      timestamp: new Date(),
      grade: this.scoreToGrade(score),
      score,
      summary: {
        totalChecks: checks.length,
        passed,
        warnings,
        errors,
        infos,
        passRate,
        issuesByCategory: {},
        topIssues: checks
          .filter(c => c.status === 'fail' || c.status === 'warn')
          .slice(0, 5)
          .map(c => ({
            name: c.name,
            message: c.message,
            category: 'general',
            severity: c.status === 'fail' ? 'error' as const : 'warning' as const,
          })),
        quickWins: [],
        vitals: {
          wordCount: 0,
          readingTime: 0,
          imageCount: 0,
          linkCount: page.links.length,
        },
        completeness: {
          meta: 0,
          social: 0,
          technical: 0,
          content: 0,
          images: 0,
          links: 0,
        },
      },
      checks,
      title: page.title ? { text: page.title, length: page.title.length } : undefined,
      headings: {
        structure: [],
        h1Count: 0,
        hasProperHierarchy: false,
        issues: [],
      },
      content: {
        wordCount: 0,
        characterCount: 0,
        sentenceCount: 0,
        paragraphCount: 0,
        readingTimeMinutes: 0,
        avgWordsPerSentence: 0,
        avgParagraphLength: 0,
        listCount: 0,
        strongTagCount: 0,
        emTagCount: 0,
      },
      links: {
        total: page.links.length,
        internal: internalLinks,
        external: externalLinks,
        nofollow: 0,
        broken: 0,
        withoutText: page.links.filter(l => !l.text?.trim()).length,
        sponsoredLinks: 0,
        ugcLinks: 0,
      },
      images: {
        total: 0,
        withAlt: 0,
        withoutAlt: 0,
        lazy: 0,
        missingDimensions: 0,
        modernFormats: 0,
        altTextLengths: [],
        imageAltTexts: [],
        imageFilenames: [],
        imagesWithAsyncDecoding: 0,
      },
      social: {
        openGraph: {
            present: false, hasTitle: false, hasDescription: false, hasImage: false, hasUrl: false, issues: []
        },
        twitterCard: {
            present: false, hasCard: false, hasTitle: false, hasDescription: false, hasImage: false, issues: []
        },
      },
      keywords: { totalWords: 0, uniqueWords: 0, topKeywords: [] },
      technical: {
        hasCanonical: false,
        hasRobotsMeta: false,
        hasViewport: false,
        hasCharset: false,
        hasLang: false,
      },
      structuredData: {
        count: 0,
        types: [],
        items: [],
      },
    };
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
          linkedUrls.add(link.href);
        }
      }
    }

    const orphanPages = pages
      .filter(p => !linkedUrls.has(p.url) && p.depth > 0) // depth 0 is the start URL
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
   * Convert score to letter grade
   */
  private scoreToGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
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
