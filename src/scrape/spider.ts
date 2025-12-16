/**
 * Spider - Web Crawler
 *
 * Crawls websites following internal links.
 * Never visits the same URL twice.
 * Optionally uses sitemap.xml for URL discovery.
 */

import { createClient } from '../core/client.js';
import { ScrapeDocument } from './document.js';
import { RequestPool } from '../utils/request-pool.js';
import type { ExtractedLink } from './types.js';
import {
  parseSitemap,
  discoverSitemaps,
  fetchAndValidateSitemap,
  type SitemapUrl,
  type SitemapParseResult,
  type SitemapValidationResult,
} from '../seo/validators/sitemap.js';
import {
  parseRobotsTxt,
  fetchAndValidateRobotsTxt,
  isPathAllowed,
  type RobotsParseResult,
} from '../seo/validators/robots.js';

export interface SpiderOptions {
  /** Maximum depth to crawl (default: 5) */
  maxDepth?: number;
  /** Maximum pages to crawl (default: 100) */
  maxPages?: number;
  /** Only crawl same domain (default: true) */
  sameDomain?: boolean;
  /** Concurrency level (default: 5) */
  concurrency?: number;
  /** Request timeout in ms (default: 10000) */
  timeout?: number;
  /** Delay between requests in ms (default: 100) */
  delay?: number;
  /** URL patterns to exclude (regex) */
  exclude?: RegExp[];
  /** URL patterns to include (regex) - if set, only matching URLs are crawled */
  include?: RegExp[];
  /** Custom user agent */
  userAgent?: string;
  /** Respect robots.txt (default: true) */
  respectRobotsTxt?: boolean;
  /** Use sitemap.xml to discover URLs (default: false) */
  useSitemap?: boolean;
  /** Custom sitemap URL (if not at /sitemap.xml) */
  sitemapUrl?: string;
  /** Callback for each page crawled */
  onPage?: (result: SpiderPageResult) => void;
  /** Callback for progress updates */
  onProgress?: (progress: SpiderProgress) => void;
}

export interface SpiderPageResult {
  url: string;
  status: number;
  title: string;
  depth: number;
  links: ExtractedLink[];
  duration: number;
  error?: string;
  meta?: {
    description?: string;
    keywords?: string[];
    author?: string;
    robots?: string[];
    canonical?: string;
    viewport?: string;
    lang?: string;
    charset?: string;
  };
  metrics?: {
    htmlSize: number;
    textLength: number;
  };
  social?: {
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
  };
}

export interface SpiderProgress {
  crawled: number;
  queued: number;
  total: number;
  currentUrl: string;
  depth: number;
}

/** Sitemap analysis comparing sitemap URLs vs discovered URLs */
export interface SitemapAnalysis {
  /** Sitemap was found and parsed */
  found: boolean;
  /** Sitemap URL used */
  url?: string;
  /** Total URLs in sitemap */
  totalUrls: number;
  /** URLs in sitemap that were crawled */
  crawledFromSitemap: number;
  /** URLs in sitemap but NOT discovered via links (potential orphans) */
  orphanUrls: string[];
  /** URLs discovered via links but NOT in sitemap */
  missingFromSitemap: string[];
  /** URLs in sitemap blocked by robots.txt */
  blockedBySitemapRobots: string[];
  /** Sitemap validation issues */
  validationIssues: Array<{ type: string; message: string }>;
  /** Raw sitemap data */
  sitemapUrls: SitemapUrl[];
}

/** Robots.txt analysis */
export interface RobotsAnalysis {
  /** robots.txt was found */
  found: boolean;
  /** Sitemap URLs declared in robots.txt */
  sitemaps: string[];
  /** Whether site blocks all crawlers */
  blocksAll: boolean;
  /** Validation issues */
  issues: Array<{ type: string; message: string }>;
}

export interface SpiderResult {
  startUrl: string;
  pages: SpiderPageResult[];
  visited: Set<string>;
  duration: number;
  errors: Array<{ url: string; error: string }>;
  /** Sitemap analysis (when useSitemap is enabled) */
  sitemap?: SitemapAnalysis;
  /** Robots.txt analysis */
  robots?: RobotsAnalysis;
}

interface QueueItem {
  url: string;
  depth: number;
}

/**
 * Common tracking parameters that should be removed during normalization
 * These don't affect page content but create duplicate URLs
 */
const TRACKING_PARAMS = new Set([
  // Google Analytics / Ads
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'gclsrc', 'dclid',
  // Facebook
  'fbclid', 'fb_action_ids', 'fb_action_types', 'fb_source', 'fb_ref',
  // Microsoft/Bing
  'msclkid',
  // Twitter
  'twclid',
  // Other common tracking
  'ref', 'referer', 'referrer', 'source',
  '_ga', '_gl', '_hsenc', '_hsmi',
  'mc_cid', 'mc_eid',
  'yclid', 'ymclid',
  'igshid',
  // Session/cache busting
  '_t', 't', 'timestamp', 'ts', 'nocache', 'cache',
]);

/**
 * Normalize URL for deduplication
 * - Remove fragments
 * - Remove tracking parameters
 * - Sort remaining query params
 * - Remove trailing slashes
 * - Lowercase hostname
 */
function normalizeUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    // Remove fragment
    url.hash = '';

    // Remove tracking parameters
    const paramsToDelete: string[] = [];
    url.searchParams.forEach((_, key) => {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        paramsToDelete.push(key);
      }
    });
    paramsToDelete.forEach(key => url.searchParams.delete(key));

    // Sort remaining query params
    url.searchParams.sort();

    // Remove trailing slash from pathname (except for root)
    if (url.pathname !== '/' && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return urlStr;
  }
}

/**
 * Check if URL should be crawled based on filters
 */
function shouldCrawl(
  url: string,
  baseHost: string,
  options: SpiderOptions
): boolean {
  try {
    const parsed = new URL(url);

    // Skip non-http(s) URLs
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    // Same domain check
    if (options.sameDomain !== false && parsed.hostname !== baseHost) {
      return false;
    }

    // Skip common non-page extensions
    const skipExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico',
      '.pdf', '.zip', '.tar', '.gz', '.rar',
      '.mp3', '.mp4', '.avi', '.mov', '.webm',
      '.css', '.js', '.json', '.xml', '.rss',
      '.woff', '.woff2', '.ttf', '.eot',
    ];
    const pathname = parsed.pathname.toLowerCase();
    if (skipExtensions.some(ext => pathname.endsWith(ext))) {
      return false;
    }

    // Exclude patterns
    if (options.exclude?.some(pattern => pattern.test(url))) {
      return false;
    }

    // Include patterns (if set, URL must match at least one)
    if (options.include?.length) {
      if (!options.include.some(pattern => pattern.test(url))) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Spider class for crawling websites
 */
export class Spider {
  private options: Required<Omit<SpiderOptions, 'onPage' | 'onProgress' | 'exclude' | 'include' | 'sitemapUrl'>> & {
    exclude?: RegExp[];
    include?: RegExp[];
    sitemapUrl?: string;
    onPage?: (result: SpiderPageResult) => void;
    onProgress?: (progress: SpiderProgress) => void;
  };
  private client: ReturnType<typeof createClient>;
  private pool: RequestPool;
  private visited: Set<string> = new Set();
  private queue: QueueItem[] = [];
  private results: SpiderPageResult[] = [];
  private errors: Array<{ url: string; error: string }> = [];
  private baseHost: string = '';
  private running: boolean = false;
  private aborted: boolean = false;
  private pendingCount: number = 0;

  // Sitemap & Robots data
  private sitemapUrls: SitemapUrl[] = [];
  private sitemapUrlSet: Set<string> = new Set();
  private robotsData: RobotsParseResult | null = null;
  private sitemapValidation: SitemapValidationResult | null = null;
  private robotsValidation: { found: boolean; issues: Array<{ type: string; message: string }> } | null = null;

  constructor(options: SpiderOptions = {}) {
    this.options = {
      maxDepth: options.maxDepth ?? 5,
      maxPages: options.maxPages ?? 100,
      sameDomain: options.sameDomain ?? true,
      concurrency: options.concurrency ?? 5,
      timeout: options.timeout ?? 10000,
      delay: options.delay ?? 100,
      userAgent: options.userAgent ?? 'Recker Spider/1.0',
      respectRobotsTxt: options.respectRobotsTxt ?? true,
      useSitemap: options.useSitemap ?? false,
      sitemapUrl: options.sitemapUrl,
      exclude: options.exclude,
      include: options.include,
      onPage: options.onPage,
      onProgress: options.onProgress,
    };

    this.client = createClient({
      baseUrl: 'http://localhost',
      timeout: this.options.timeout,
      headers: {
        'User-Agent': this.options.userAgent,
      },
    } as any);

    // Initialize request pool for concurrency control
    // Also supports rate limiting via delay (requestsPerInterval)
    this.pool = new RequestPool({
      concurrency: this.options.concurrency,
      // If delay is set, convert to rate limiting: 1 request per delay ms
      ...(this.options.delay > 0 ? {
        requestsPerInterval: 1,
        interval: this.options.delay,
      } : {}),
    });
  }

  /**
   * Start crawling from a URL
   *
   * Uses RequestPool for efficient concurrency control:
   * - True concurrent execution (no batch waiting)
   * - Rate limiting via delay option
   * - Immediate scheduling of discovered URLs
   */
  async crawl(startUrl: string): Promise<SpiderResult> {
    const startTime = performance.now();

    // Normalize and validate start URL
    const normalizedStart = normalizeUrl(startUrl);
    const baseUrl = new URL(normalizedStart).origin;
    this.baseHost = new URL(normalizedStart).hostname;

    // Reset state
    this.visited.clear();
    this.queue = [];
    this.results = [];
    this.errors = [];
    this.running = true;
    this.aborted = false;
    this.pendingCount = 0;
    this.sitemapUrls = [];
    this.sitemapUrlSet.clear();
    this.robotsData = null;
    this.sitemapValidation = null;
    this.robotsValidation = null;

    // Fetch robots.txt first (for respecting rules and finding sitemaps)
    if (this.options.respectRobotsTxt || this.options.useSitemap) {
      await this.fetchRobotsTxt(baseUrl);
    }

    // Fetch and parse sitemap(s)
    if (this.options.useSitemap) {
      await this.fetchSitemaps(baseUrl);
    }

    // Track pending crawl promises by URL
    const pending = new Map<string, Promise<void>>();

    // Helper to schedule a URL for crawling
    const scheduleUrl = (item: QueueItem, fromSitemap = false): void => {
      const normalized = normalizeUrl(item.url);

      // Skip if already visited or pending
      if (this.visited.has(normalized)) return;
      if (pending.has(normalized)) return;

      // Skip if exceeds max depth (sitemap URLs get depth 1)
      if (item.depth > this.options.maxDepth) return;

      // Skip if we've reached max pages (count completed + pending)
      if (this.results.length + pending.size >= this.options.maxPages) return;

      // Check robots.txt if enabled
      if (this.options.respectRobotsTxt && this.robotsData) {
        try {
          const urlPath = new URL(normalized).pathname;
          if (!isPathAllowed(this.robotsData, urlPath, this.options.userAgent)) {
            return; // Blocked by robots.txt
          }
        } catch {
          // Invalid URL, skip
          return;
        }
      }

      // Mark as visited to prevent duplicate scheduling
      this.visited.add(normalized);
      this.pendingCount++;

      // Schedule via pool - returns immediately, pool handles concurrency
      const promise = this.pool.run(() => this.crawlPage({ ...item, url: normalized }))
        .finally(() => {
          pending.delete(normalized);
          this.pendingCount--;
        });

      pending.set(normalized, promise);
    };

    // Schedule the start URL
    scheduleUrl({ url: normalizedStart, depth: 0 });

    // Schedule sitemap URLs (with depth 1 so they can discover more links)
    if (this.options.useSitemap && this.sitemapUrls.length > 0) {
      for (const sitemapUrl of this.sitemapUrls) {
        // Only add URLs from same domain
        try {
          const urlHost = new URL(sitemapUrl.loc).hostname;
          if (urlHost === this.baseHost) {
            scheduleUrl({ url: sitemapUrl.loc, depth: 1 }, true);
          }
        } catch {
          // Invalid URL, skip
        }
      }
    }

    // Process until no more pending crawls or aborted
    while ((pending.size > 0 || this.queue.length > 0) && !this.aborted) {
      // Schedule any URLs discovered from completed crawls
      while (this.queue.length > 0 && !this.aborted) {
        const item = this.queue.shift()!;

        // Check if we should continue scheduling
        if (this.results.length + pending.size >= this.options.maxPages) break;

        scheduleUrl(item);
      }

      // If there are pending crawls, wait for at least one to complete
      if (pending.size > 0) {
        await Promise.race(pending.values());
      }
    }

    // Wait for any remaining crawls to complete
    if (pending.size > 0) {
      await Promise.all(pending.values());
    }

    this.running = false;

    // Build sitemap analysis
    const sitemapAnalysis = this.buildSitemapAnalysis();
    const robotsAnalysis = this.buildRobotsAnalysis();

    return {
      startUrl: normalizedStart,
      pages: this.results,
      visited: this.visited,
      duration: Math.round(performance.now() - startTime),
      errors: this.errors,
      sitemap: this.options.useSitemap ? sitemapAnalysis : undefined,
      robots: robotsAnalysis,
    };
  }

  /**
   * Fetch and parse robots.txt
   */
  private async fetchRobotsTxt(baseUrl: string): Promise<void> {
    try {
      const fetcher = async (url: string) => {
        const response = await this.client.get(url);
        return {
          status: response.status,
          text: await response.text(),
        };
      };

      const result = await fetchAndValidateRobotsTxt(baseUrl, fetcher);

      if (result.exists) {
        this.robotsData = result.parseResult;
        this.robotsValidation = {
          found: true,
          issues: result.issues.map(i => ({ type: i.type, message: i.message })),
        };
      } else {
        this.robotsValidation = {
          found: false,
          issues: [{ type: 'info', message: 'robots.txt not found' }],
        };
      }
    } catch (error) {
      this.robotsValidation = {
        found: false,
        issues: [{ type: 'error', message: `Failed to fetch robots.txt: ${error instanceof Error ? error.message : 'Unknown error'}` }],
      };
    }
  }

  /**
   * Fetch and parse sitemaps
   */
  private async fetchSitemaps(baseUrl: string): Promise<void> {
    const fetcher = async (url: string) => {
      const response = await this.client.get(url);
      return {
        status: response.status,
        text: await response.text(),
        headers: Object.fromEntries([...response.headers.entries()]),
      };
    };

    try {
      // Get sitemap URLs from robots.txt or discover them
      let sitemapUrls: string[] = [];

      if (this.options.sitemapUrl) {
        // Use custom sitemap URL
        sitemapUrls = [this.options.sitemapUrl];
      } else if (this.robotsData?.sitemaps.length) {
        // Use sitemaps from robots.txt
        sitemapUrls = this.robotsData.sitemaps;
      } else {
        // Discover sitemaps from common locations
        sitemapUrls = await discoverSitemaps(baseUrl, undefined, fetcher);
      }

      // Fetch and parse each sitemap
      for (const sitemapUrl of sitemapUrls) {
        try {
          const result = await fetchAndValidateSitemap(sitemapUrl, fetcher);

          if (result.exists && result.parseResult.valid) {
            this.sitemapValidation = result;

            // Handle sitemap index (recursive fetch)
            if (result.parseResult.type === 'sitemapindex') {
              for (const childSitemap of result.parseResult.sitemaps) {
                try {
                  const childResult = await fetchAndValidateSitemap(childSitemap.loc, fetcher);
                  if (childResult.exists && childResult.parseResult.urls.length > 0) {
                    this.sitemapUrls.push(...childResult.parseResult.urls);
                  }
                } catch {
                  // Skip failed child sitemaps
                }
              }
            } else {
              // Regular sitemap
              this.sitemapUrls.push(...result.parseResult.urls);
            }
          }
        } catch {
          // Skip failed sitemaps
        }
      }

      // Build URL set for fast lookup
      for (const url of this.sitemapUrls) {
        this.sitemapUrlSet.add(normalizeUrl(url.loc));
      }
    } catch (error) {
      // Sitemap fetch failed, continue without it
    }
  }

  /**
   * Build sitemap analysis comparing discovered URLs vs sitemap
   */
  private buildSitemapAnalysis(): SitemapAnalysis {
    const crawledUrls = new Set(this.results.map(r => normalizeUrl(r.url)));

    // URLs in sitemap that were crawled
    const crawledFromSitemap = this.sitemapUrls.filter(u =>
      crawledUrls.has(normalizeUrl(u.loc))
    ).length;

    // URLs in sitemap but NOT discovered via links (orphans)
    // These are URLs only reachable via sitemap, not linked from any page
    const linkedUrls = new Set<string>();
    for (const page of this.results) {
      for (const link of page.links) {
        if (link.href) {
          linkedUrls.add(normalizeUrl(link.href));
        }
      }
    }

    const orphanUrls = this.sitemapUrls
      .filter(u => {
        const normalized = normalizeUrl(u.loc);
        // URL is in sitemap but not linked from any crawled page
        return !linkedUrls.has(normalized) && crawledUrls.has(normalized);
      })
      .map(u => u.loc);

    // URLs discovered but NOT in sitemap
    const missingFromSitemap = Array.from(crawledUrls)
      .filter(url => !this.sitemapUrlSet.has(url));

    // URLs in sitemap blocked by robots.txt
    const blockedBySitemapRobots: string[] = [];
    if (this.robotsData) {
      for (const sitemapUrl of this.sitemapUrls) {
        try {
          const urlPath = new URL(sitemapUrl.loc).pathname;
          if (!isPathAllowed(this.robotsData, urlPath, this.options.userAgent)) {
            blockedBySitemapRobots.push(sitemapUrl.loc);
          }
        } catch {
          // Invalid URL
        }
      }
    }

    return {
      found: this.sitemapUrls.length > 0,
      url: this.sitemapValidation?.parseResult ? undefined : undefined,
      totalUrls: this.sitemapUrls.length,
      crawledFromSitemap,
      orphanUrls,
      missingFromSitemap,
      blockedBySitemapRobots,
      validationIssues: this.sitemapValidation?.issues.map(i => ({
        type: i.type,
        message: i.message,
      })) || [],
      sitemapUrls: this.sitemapUrls,
    };
  }

  /**
   * Build robots.txt analysis
   */
  private buildRobotsAnalysis(): RobotsAnalysis {
    return {
      found: this.robotsValidation?.found ?? false,
      sitemaps: this.robotsData?.sitemaps ?? [],
      blocksAll: this.robotsData?.blocksAllRobots ?? false,
      issues: this.robotsValidation?.issues ?? [],
    };
  }

  /**
   * Crawl a single page
   */
  private async crawlPage(item: QueueItem): Promise<void> {
    const startTime = performance.now();

    // Report progress
    this.options.onProgress?.({
      crawled: this.results.length,
      queued: this.queue.length,
      total: this.visited.size,
      currentUrl: item.url,
      depth: item.depth,
    });

    try {
      const response = await this.client.get(item.url);
      const status = response.status;

      // Skip non-HTML responses
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        return;
      }

      const html = await response.text();
      const doc = await ScrapeDocument.create(html, { baseUrl: item.url });

      // Extract title
      const title = doc.selectFirst('title').text() || '';

      // Extract links
      const links = doc.links({ absolute: true });

      // Extract basic metadata for light crawler
      const meta = doc.meta();
      const og = doc.openGraph();
      
      const metrics = {
        htmlSize: html.length,
        textLength: doc.text('body').length,
      };

      const social = {
        ogTitle: og.title,
        ogDescription: og.description,
        ogImage: Array.isArray(og.image) ? og.image[0] : og.image,
      };

      // Create result
      const result: SpiderPageResult = {
        url: item.url,
        status,
        title,
        depth: item.depth,
        links,
        duration: Math.round(performance.now() - startTime),
        meta: {
            description: meta.description,
            keywords: meta.keywords,
            author: meta.author,
            robots: meta.robots,
            canonical: meta.canonical,
            viewport: meta.viewport,
            charset: meta.charset,
            lang: doc.attr('html', 'lang')
        },
        metrics,
        social
      };

      this.results.push(result);
      this.options.onPage?.(result);

      // Add new links to queue (only internal, unvisited)
      for (const link of links) {
        if (!link.href) continue;

        const normalized = normalizeUrl(link.href);

        // Skip if already visited or queued
        if (this.visited.has(normalized)) continue;

        // Check if should crawl
        if (!shouldCrawl(normalized, this.baseHost, this.options)) continue;

        // Add to queue
        this.queue.push({
          url: normalized,
          depth: item.depth + 1,
        });
      }
    } catch (error: any) {
      // Extract status code from error if available
      const status = error.status || error.statusCode || (error.response ? error.response.status : 0);
      const message = error.message || 'Unknown error';

      const errorResult: SpiderPageResult = {
        url: item.url,
        status: status,
        title: '',
        depth: item.depth,
        links: [],
        duration: Math.round(performance.now() - startTime),
        error: message,
      };

      this.results.push(errorResult);
      this.errors.push({ url: item.url, error: message });
      this.options.onPage?.(errorResult);
    }
  }

  /**
   * Stop the crawler
   */
  abort(): void {
    this.aborted = true;
  }

  /**
   * Check if crawler is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get current progress
   */
  getProgress(): SpiderProgress {
    return {
      crawled: this.results.length,
      queued: this.queue.length,
      total: this.visited.size,
      currentUrl: '',
      depth: 0,
    };
  }
}

/**
 * Quick spider function for simple use cases
 */
export async function spider(
  url: string,
  options?: SpiderOptions
): Promise<SpiderResult> {
  const s = new Spider(options);
  return s.crawl(url);
}