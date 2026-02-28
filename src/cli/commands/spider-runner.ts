/**
 * Spider Runner - Event-Driven Spider Command
 *
 * Wraps the core Spider class and emits events for CLI/TUI handlers.
 * This separates the crawling logic from the output presentation.
 *
 * @example
 * ```typescript
 * const runner = new SpiderRunner();
 *
 * // CLI mode
 * attachCLIHandler(runner, { verbose: true });
 *
 * // TUI mode (background job)
 * attachTUIHandler(runner, { jobId: 123 });
 *
 * await runner.run('https://example.com', { depth: 3, limit: 50 });
 * ```
 */

import { CommandEmitter } from '../events/emitter.js';
import type { SpiderPageEvent, SpiderQueueEvent } from '../events/types.js';
import type { SeoReport } from '../../seo/types.js';
import type { SpiderPageResult, SpiderTransport } from '../../scrape/spider.js';
import type { SpiderFocusMode } from '../utils/option-helpers.js';
import { AbortError } from '../../core/errors.js';

// =============================================================================
// Types
// =============================================================================

export interface SpiderRunnerOptions {
  /** Maximum depth to crawl */
  depth?: number;
  /** Maximum pages to crawl */
  limit?: number;
  /** Concurrency level */
  concurrency?: number;
  /** Respect robots.txt */
  robots?: boolean;
  /** Enable SEO analysis */
  seo?: boolean;
  /** Use sitemap.xml to discover URLs (default: true in SEO mode) */
  useSitemap?: boolean;
  /** HTTP transport to use */
  transport?: SpiderTransport;
  /** Prefer curl-impersonate first when transport is auto */
  preferCurlFirst?: boolean;
  /** Request timeout in ms */
  timeout?: number;
  /** Delay between requests in ms */
  delay?: number;
  /** Max retries for failed/blocked requests */
  maxRetryAttempts?: number;
  /** Base delay for retries in ms */
  baseRetryDelayMs?: number;
  /** Maximum retry delay in ms */
  maxRetryDelayMs?: number;
  /** Exponential backoff multiplier */
  retryBackoffMultiplier?: number;
  /** Random jitter (ms) for retries */
  retryJitterMs?: number;
  /** Strikes before forcing curl in auto mode */
  maxDomainBlockStrikes?: number;
  /** Rotate user-agent each request */
  rotateUserAgent?: boolean;
  /** Randomize request headers */
  randomizeHeaders?: boolean;
  /** Focus mode for SEO analysis */
  focus?: SpiderFocusMode;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** CSS selectors to extract from each page (e.g., ['h1', 'a:href', '.price']) */
  extract?: string[];
  /** URL patterns to include (regex strings) */
  include?: string[];
  /** URL patterns to exclude (regex strings) */
  exclude?: string[];
}

export interface SpiderRunnerResult {
  url: string;
  pagesVisited: number;
  duration: number;
  errors: number;
  security?: {
    pages: number;
    blockedPages: number;
    captchaPages: number;
    captchaProviders: Record<string, number>;
    attempts: number;
    retries: number;
    transportUsage: Record<Exclude<SpiderTransport, 'auto'>, number>;
    avgAttempts: number;
    avgTtfbMs?: number;
    avgTotalMs?: number;
    avgDownloadMs?: number;
  };
  internalLinks: number;
  externalLinks: number;
  images: number;
  scripts: number;
  stylesheets: number;
  pages: Array<{
    url: string;
    status: number;
    title?: string;
    depth: number;
    links: number;
    duration: number;
    security?: SpiderPageResult['security'];
    timings?: SpiderPageResult['timings'];
    resources?: {
      images: number;
      scripts: number;
      stylesheets: number;
    };
    /** SEO score for this page (only when seo mode enabled) */
    seoScore?: number;
    /** SEO grade for this page (only when seo mode enabled) */
    seoGrade?: string;
    /** SEO errors count (only when seo mode enabled) */
    seoErrors?: number;
    /** SEO warnings count (only when seo mode enabled) */
    seoWarnings?: number;
    /** Full SEO report (only when seo mode enabled) */
    seoReport?: SeoReport;
    /** Custom extracted data (when --extract is used) */
    extracted?: Record<string, unknown>;
  }>;
  /** Aggregated extraction results across all pages */
  extraction?: {
    /** Schema used for extraction */
    schema: Record<string, string>;
    /** Total items extracted */
    totalItems: number;
    /** Extraction results by page URL */
    byPage: Record<string, Record<string, unknown>>;
  };
  /** SEO summary data (only when seo mode enabled) */
  seo?: {
    avgScore: number;
    pagesWithErrors: number;
    pagesWithWarnings: number;
    duplicateTitles: number;
    duplicateDescriptions: number;
    duplicateH1s: number;
    orphanPages: number;
    siteWideIssues: Array<{
      type: string;
      severity: 'error' | 'warning' | 'info';
      message: string;
      affectedUrls: string[];
    }>;
    /** Discovery of important site files */
    discovery?: {
      humans: { found: boolean; url: string };
      llms: { found: boolean; url: string };
      sitemap: { found: boolean; url: string; urlCount?: number };
      manifest: { found: boolean; url: string; valid?: boolean };
    };
  };
}

// =============================================================================
// Spider Runner
// =============================================================================

export class SpiderRunner extends CommandEmitter {
  constructor() {
    super('spider');
  }

  /**
   * Run the spider with event emission
   */
  async run(url: string, options: SpiderRunnerOptions = {}): Promise<SpiderRunnerResult> {
    const {
      depth = 5,
      limit = 100,
      concurrency = 5,
      robots = true,
      seo = false,
      focus = 'all',
      signal,
      extract,
      include,
      exclude,
      transport,
      preferCurlFirst,
      timeout,
      delay,
      maxRetryAttempts,
      baseRetryDelayMs,
      maxRetryDelayMs,
      retryBackoffMultiplier,
      retryJitterMs,
      maxDomainBlockStrikes,
      rotateUserAgent,
      randomizeHeaders,
    } = options;

    // Normalize URL
    let startUrl = url;
    if (!startUrl.startsWith('http')) {
      startUrl = `https://${startUrl}`;
    }

    // Emit start event
    this.emitStart(startUrl, { depth, limit, concurrency, seo, focus });

    // Track stats
    const pages: SpiderRunnerResult['pages'] = [];
    let internalLinks = 0;
    let externalLinks = 0;
    let images = 0;
    let scripts = 0;
    let stylesheets = 0;
    let errorCount = 0;
    let blockedPages = 0;
    let captchaPages = 0;
    let captchaProviders: Record<string, number> = {};
    let attemptsTotal = 0;
    let retriesTotal = 0;
    let transportUsage: Record<Exclude<SpiderTransport, 'auto'>, number> = { undici: 0, curl: 0 };
    let timingSum: { ttfb: number; total: number; download: number } = { ttfb: 0, total: 0, download: 0 };
    let timingCount = 0;

    const collectPageMetrics = (page: SpiderPageResult): void => {
      const resources = page.resources;
      if (resources) {
        images += resources.images || 0;
        scripts += resources.scripts || 0;
        stylesheets += resources.stylesheets || 0;
      }

      if (page.security) {
        if (page.security.blocked) blockedPages += 1;
        if (page.security.captchaDetected) captchaPages += 1;
        if (page.security.captchaDetected) {
          const provider = (page.security.captchaProvider || '').trim().toLowerCase();
          const key = provider.length > 0 ? provider : 'unknown';
          captchaProviders[key] = (captchaProviders[key] || 0) + 1;
        }
        attemptsTotal += Number(page.security.attempts ?? 1);
        retriesTotal += Number(page.security.retryCount ?? 0);
        const transport = page.security.transport;
        if (transport && transport !== 'auto') {
          transportUsage[transport] += 1;
        }
      } else {
        attemptsTotal += 1;
      }

      const ttfb = page.timings?.ttfb;
      const total = page.timings?.total;
      const download = page.timings?.download;
      if (typeof ttfb === 'number' || typeof total === 'number' || typeof download === 'number') {
        timingSum.ttfb += typeof ttfb === 'number' ? ttfb : 0;
        timingSum.total += typeof total === 'number' ? total : 0;
        timingSum.download += typeof download === 'number' ? download : 0;
        timingCount += 1;
      }
    };

    const getSecuritySummary = () => ({
      pages: pages.length,
      blockedPages,
      captchaPages,
      captchaProviders,
      attempts: attemptsTotal,
      retries: retriesTotal,
      transportUsage,
      avgAttempts: pages.length > 0 ? Number((attemptsTotal / pages.length).toFixed(2)) : 0,
      avgTtfbMs: timingCount > 0 ? Math.round(timingSum.ttfb / timingCount) : undefined,
      avgTotalMs: timingCount > 0 ? Math.round(timingSum.total / timingCount) : undefined,
      avgDownloadMs: timingCount > 0 ? Math.round(timingSum.download / timingCount) : undefined,
    });

    try {
      // Choose spider implementation
      if (seo) {
        return await this.runSeoSpider(startUrl, options, pages, collectPageMetrics, getSecuritySummary);
      }

      // Regular spider
      const { Spider } = await import('../../scrape/spider.js');

      // Track extraction data
      const extractionByPage: Record<string, Record<string, unknown>> = {};

      const spider = new Spider({
        maxDepth: depth,
        maxPages: limit,
        concurrency,
        respectRobotsTxt: robots,
        transport,
        preferCurlFirst,
        timeout,
        delay,
        maxRetryAttempts,
        baseRetryDelayMs,
        maxRetryDelayMs,
        retryBackoffMultiplier,
        retryJitterMs,
        maxDomainBlockStrikes,
        rotateUserAgent,
        randomizeHeaders,
        extract,
        include: include?.map(p => new RegExp(p)),
        exclude: exclude?.map(p => new RegExp(p)),
        onPage: (page) => {
          collectPageMetrics(page);

          // Track page with extraction data
          pages.push({
            url: page.url,
            status: page.status,
            title: page.title,
            depth: page.depth,
            links: page.links?.length || 0,
            duration: page.duration,
            security: page.security,
            timings: page.timings,
            resources: page.resources,
            extracted: page.extracted,
          });

          // Collect extracted data
          if (page.extracted && Object.keys(page.extracted).length > 0) {
            extractionByPage[page.url] = page.extracted;
          }

          // Count links
          if (page.links) {
            const pageHost = new URL(page.url).hostname;
            for (const link of page.links) {
              try {
                const linkHost = new URL(link.href, page.url).hostname;
                if (linkHost !== pageHost) {
                  externalLinks++;
                } else {
                  internalLinks++;
                }
              } catch {
                internalLinks++; // Invalid URLs count as internal
              }
            }
          }

          // Emit page event
          this.emitTyped<SpiderPageEvent>({
            type: 'spider:page',
            level: page.status < 400 ? 'info' : 'warn',
            url: page.url,
            status: page.status,
            depth: page.depth,
            title: page.title,
            links: page.links?.length || 0,
            duration: page.duration,
            security: page.security,
            timings: page.timings,
            resources: page.resources,
          });

          // Check for abort
          if (signal?.aborted) {
            throw new AbortError('Spider crawl aborted');
          }
        },
        onProgress: (progress) => {
          // Emit queue event
          this.emitTyped<SpiderQueueEvent>({
            type: 'spider:queue',
            level: 'debug',
            crawled: progress.crawled,
            queued: progress.queued,
            depth: progress.depth,
          });
        },
      });

      const result = await spider.crawl(startUrl);

      // Count errors
      errorCount = result.errors?.length || 0;

      // Build extraction summary if extraction was enabled
      let extraction: SpiderRunnerResult['extraction'];
      if (extract && Object.keys(extractionByPage).length > 0) {
        // Count total items extracted
        let totalItems = 0;
        for (const pageData of Object.values(extractionByPage)) {
          for (const values of Object.values(pageData)) {
            if (Array.isArray(values)) {
              totalItems += values.length;
            } else if (values !== undefined) {
              totalItems++;
            }
          }
        }

        // Build schema description
        const schema: Record<string, string> = {};
        for (const sel of extract) {
          const [selector, attr] = sel.split(':');
          schema[selector] = attr || 'text';
        }

        extraction = {
          schema,
          totalItems,
          byPage: extractionByPage,
        };
      }

      // Emit completion
      const summary: SpiderRunnerResult = {
        url: startUrl,
        pagesVisited: pages.length,
        duration: result.duration,
        errors: errorCount,
        internalLinks,
        externalLinks,
        images,
        scripts,
        stylesheets,
        security: getSecuritySummary(),
        pages,
        extraction,
      };

      this.emitComplete({
        url: startUrl,
        pagesVisited: pages.length,
        duration: result.duration,
        errors: errorCount,
        internalLinks,
        externalLinks,
        images,
        scripts,
        stylesheets,
        security: getSecuritySummary(),
      });

      return summary;

    } catch (err: unknown) {
      if (signal?.aborted || err instanceof AbortError) {
        this.emitError('Spider stopped by user', { code: 'ABORT' });
      } else {
        this.emitError(err instanceof Error ? err.message : 'Spider failed', {
          stack: err instanceof Error ? err.stack : undefined,
          context: startUrl,
        });
      }
      throw err;
    }
  }

  /**
   * Run SEO spider variant
   */
  private async runSeoSpider(
    url: string,
    options: SpiderRunnerOptions,
    pages: SpiderRunnerResult['pages'],
    collectPageMetrics: (page: SpiderPageResult) => void,
    getSecuritySummary: () => NonNullable<SpiderRunnerResult['security']>
  ): Promise<SpiderRunnerResult> {
    const {
      depth = 5,
      limit = 100,
      concurrency = 5,
      robots = true,
      focus = 'all',
      signal,
      useSitemap = true,
      transport,
      preferCurlFirst,
      timeout,
      delay,
      maxRetryAttempts,
      baseRetryDelayMs,
      maxRetryDelayMs,
      retryBackoffMultiplier,
      retryJitterMs,
      maxDomainBlockStrikes,
      rotateUserAgent,
      randomizeHeaders,
    } = options;

    const focusCategories: Record<string, string[]> = {
      links: ['links'],
      duplicates: ['title', 'meta', 'content'],
      security: ['security'],
      ai: ['ai-search'],
      resources: ['resources', 'performance'],
      all: [],
    };

    const { SeoSpider } = await import('../../seo/index.js');

    let internalLinks = 0;
    let externalLinks = 0;
    let images = 0;
    let scripts = 0;
    let stylesheets = 0;

    const seoSpider = new SeoSpider({
      maxDepth: depth,
      maxPages: limit,
      concurrency,
      sameDomain: true,
      delay,
      timeout,
      transport,
      preferCurlFirst,
      maxRetryAttempts,
      baseRetryDelayMs,
      maxRetryDelayMs,
      retryBackoffMultiplier,
      retryJitterMs,
      maxDomainBlockStrikes,
      rotateUserAgent,
      randomizeHeaders,
      seo: true,
      respectRobotsTxt: robots,
      useSitemap,
      focusCategories: focusCategories[focus],
      focusMode: focus,
      onProgress: (progress) => {
        this.emitTyped<SpiderQueueEvent>({
          type: 'spider:queue',
          level: 'debug',
          crawled: progress.crawled,
          queued: progress.queued,
          depth: progress.depth,
        });

        if (signal?.aborted) {
          throw new AbortError('Spider crawl aborted');
        }
      },
    });

    const result = await seoSpider.crawl(url);

    // Process pages with SEO data
    for (const page of result.pages) {
      const seoReport = page.seoReport;
      pages.push({
        url: page.url,
        status: page.status || 0,
        title: page.title,
        depth: page.depth,
        links: page.links?.length || 0,
        duration: page.duration,
        security: page.security,
        timings: page.timings,
        resources: page.resources,
        // Include SEO metrics per page
        seoScore: seoReport?.score,
        seoGrade: seoReport?.grade,
        seoErrors: seoReport?.summary?.errors,
        seoWarnings: seoReport?.summary?.warnings,
        seoReport,
      });

      collectPageMetrics(page);

      // Count resources
      if (page.links) {
        const pageHost = new URL(page.url).hostname;
        for (const link of page.links) {
          try {
            const linkHost = new URL(link.href, page.url).hostname;
            if (linkHost !== pageHost) {
              externalLinks++;
            } else {
              internalLinks++;
            }
          } catch {
            internalLinks++;
          }
        }
      }

      // Emit page event with SEO data
      this.emitTyped<SpiderPageEvent>({
        type: 'spider:page',
        level: (page.status || 0) < 400 ? 'info' : 'warn',
        url: page.url,
        status: page.status || 0,
        depth: page.depth,
        title: page.title,
        links: page.links?.length || 0,
        duration: page.duration,
        security: page.security,
        timings: page.timings,
        resources: page.resources,
      });
    }

    // Build summary with SEO data
    const summary: SpiderRunnerResult = {
      url,
      pagesVisited: pages.length,
      duration: result.duration,
      errors: result.errors?.length || 0,
      internalLinks,
      externalLinks,
      images,
      scripts,
      stylesheets,
      security: getSecuritySummary(),
      pages,
      // Include SEO summary when seo mode is enabled
      seo: result.summary ? {
        avgScore: result.summary.avgScore,
        pagesWithErrors: result.summary.pagesWithErrors,
        pagesWithWarnings: result.summary.pagesWithWarnings,
        duplicateTitles: result.summary.duplicateTitles,
        duplicateDescriptions: result.summary.duplicateDescriptions,
        duplicateH1s: result.summary.duplicateH1s,
        orphanPages: result.summary.orphanPages,
        siteWideIssues: result.siteWideIssues?.map(issue => ({
          type: issue.type,
          severity: issue.severity,
          message: issue.message,
          affectedUrls: issue.affectedUrls,
        })) || [],
        discovery: result.discovery ? {
          humans: { found: result.discovery.humans.found, url: result.discovery.humans.url },
          llms: { found: result.discovery.llms.found, url: result.discovery.llms.url },
          sitemap: { found: result.discovery.sitemap.found, url: result.discovery.sitemap.url, urlCount: result.discovery.sitemap.urlCount },
          manifest: { found: result.discovery.manifest.found, url: result.discovery.manifest.url, valid: result.discovery.manifest.valid },
        } : undefined,
      } : undefined,
    };

    this.emitComplete({
      url,
      pagesVisited: pages.length,
      duration: result.duration,
      errors: result.errors?.length || 0,
      internalLinks,
      externalLinks,
      images,
      scripts,
      stylesheets,
      security: getSecuritySummary(),
    });

    return summary;
  }
}

/**
 * JSONL writer for streaming output
 */
export interface JsonlWriterOptions {
  /** Output file path (stdout if not specified) */
  output?: string;
  /** Append to existing file instead of overwriting */
  append?: boolean;
}

export class JsonlWriter {
  private fileHandle: import('node:fs').WriteStream | null = null;
  private useStdout: boolean;
  private outputPath?: string;
  private initialized = false;

  constructor(private options: JsonlWriterOptions = {}) {
    this.useStdout = !options.output;
    this.outputPath = options.output;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    if (!this.useStdout && this.outputPath) {
      const { createWriteStream } = await import('node:fs');
      const { mkdir } = await import('node:fs/promises');
      const { dirname } = await import('node:path');

      // Ensure directory exists
      await mkdir(dirname(this.outputPath), { recursive: true });

      this.fileHandle = createWriteStream(this.outputPath, {
        flags: this.options.append ? 'a' : 'w',
        encoding: 'utf-8',
      });
    }
  }

  write(obj: Record<string, unknown>): void {
    const line = JSON.stringify(obj) + '\n';
    if (this.useStdout) {
      process.stdout.write(line);
    } else if (this.fileHandle) {
      this.fileHandle.write(line);
    }
  }

  async close(): Promise<void> {
    if (this.fileHandle) {
      return new Promise((resolve) => {
        this.fileHandle!.end(() => resolve());
      });
    }
  }

  getPath(): string | undefined {
    return this.outputPath;
  }
}

/**
 * Convenience function to run spider with CLI output
 */
export async function runSpiderWithEvents(
  url: string,
  options: SpiderRunnerOptions & {
    verbose?: boolean;
    json?: boolean;
    jsonl?: boolean;
    jsonlOutput?: string;
  } = {}
): Promise<SpiderRunnerResult> {
  const { verbose = false, json = false, jsonl = false, jsonlOutput, ...spiderOptions } = options;

  const runner = new SpiderRunner();

  // JSONL streaming mode
  let jsonlWriter: JsonlWriter | null = null;
  if (jsonl) {
    jsonlWriter = new JsonlWriter({ output: jsonlOutput });
    await jsonlWriter.init();

    // Write start record
    jsonlWriter.write({
      type: 'start',
      url,
      startedAt: new Date().toISOString(),
      config: {
        depth: spiderOptions.depth ?? 5,
        limit: spiderOptions.limit ?? 100,
        concurrency: spiderOptions.concurrency ?? 5,
        seo: spiderOptions.seo ?? false,
        extract: spiderOptions.extract,
        transport: spiderOptions.transport,
        preferCurlFirst: spiderOptions.preferCurlFirst,
        timeout: spiderOptions.timeout,
        delay: spiderOptions.delay,
      },
    });

    // Stream pages as they're crawled
    runner.on('spider:page', (event) => {
      jsonlWriter!.write({
        type: 'page',
        url: event.url,
        status: event.status,
        depth: event.depth,
        title: event.title,
        links: event.links,
        duration: event.duration,
        blocked: event.security?.blocked,
        blockedByCaptcha: event.security?.blockedByCaptcha,
        captchaDetected: event.security?.captchaDetected,
        transport: event.security?.transport,
        timing: event.timings,
        resources: event.resources,
      });
    });
  } else if (!json) {
    // Attach CLI handler for console output
    const { attachCLIHandler } = await import('../events/handlers/cli.js');
    attachCLIHandler(runner, { verbose });
  }

  const result = await runner.run(url, spiderOptions);

  // Write completion record and close JSONL
  if (jsonlWriter) {
    // Write full pages with SEO/extraction data (not streamed earlier)
    for (const page of result.pages) {
      jsonlWriter.write({
        type: 'page-full',
        url: page.url,
        status: page.status,
        title: page.title,
        depth: page.depth,
        links: page.links,
        duration: page.duration,
        security: page.security,
        timings: page.timings,
        resources: page.resources,
        seoScore: page.seoScore,
        seoGrade: page.seoGrade,
        seoErrors: page.seoErrors,
        seoWarnings: page.seoWarnings,
        attempts: page.security?.attempts,
        retryCount: page.security?.retryCount,
        retryAfterMs: page.security?.retryAfterMs,
        extracted: page.extracted,
      });
    }

    // Write site-wide summary
    jsonlWriter.write({
      type: 'complete',
      url: result.url,
      completedAt: new Date().toISOString(),
      pagesVisited: result.pagesVisited,
      duration: result.duration,
      errors: result.errors,
      internalLinks: result.internalLinks,
      externalLinks: result.externalLinks,
      seo: result.seo,
      security: result.security,
      images: result.images,
      scripts: result.scripts,
      stylesheets: result.stylesheets,
      extraction: result.extraction,
    });
    await jsonlWriter.close();
  }

  return result;
}
