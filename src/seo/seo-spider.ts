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

    const seoResult: SeoSpiderResult = {
      ...result,
      pages: seoPages,
      siteWideIssues,
      summary,
    };

    // Save to file if output path specified
    if (this.options.output) {
      await this.saveReport(seoResult);
    }

    return seoResult;
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

        // Use the full SEO analyzer with all 70+ rules
        const seoReport = await analyzeSeo(html, { baseUrl: page.url });

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
          status: 'warn',
          message: `Title is too short (${titleLength} chars)`,
          value: titleLength,
          recommendation: 'Title should be 50-60 characters',
        });
      } else if (titleLength > 60) {
        checks.push({
          name: 'Title Length',
          status: 'warn',
          message: `Title is too long (${titleLength} chars)`,
          value: titleLength,
          recommendation: 'Title should be 50-60 characters',
        });
      } else {
        checks.push({
          name: 'Title Length',
          status: 'pass',
          message: `Good title length (${titleLength} chars)`,
          value: titleLength,
        });
      }
    } else {
      checks.push({
        name: 'Title',
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
        status: 'warn',
        message: 'No internal links found',
        recommendation: 'Add internal links to improve site structure',
      });
    } else {
      checks.push({
        name: 'Internal Links',
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

    return {
      url: page.url,
      timestamp: new Date(),
      grade: this.scoreToGrade(score),
      score,
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
        imageFilenames: [],
        imagesWithAsyncDecoding: 0,
      },
      social: {
        openGraph: {
          present: false,
          hasTitle: false,
          hasDescription: false,
          hasImage: false,
          hasUrl: false,
          issues: [],
        },
        twitterCard: {
          present: false,
          hasCard: false,
          hasTitle: false,
          hasDescription: false,
          hasImage: false,
          issues: [],
        },
      },
      technical: {
        hasCanonical: false,
        hasRobotsMeta: false,
        hasViewport: false,
        hasCharset: false,
        hasLang: false,
      },
      jsonLd: {
        count: 0,
        types: [],
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
