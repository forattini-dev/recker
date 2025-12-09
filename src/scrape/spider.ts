/**
 * Spider - Web Crawler
 *
 * Crawls websites following internal links.
 * Never visits the same URL twice.
 */

import { createClient } from '../core/client.js';
import { ScrapeDocument } from './document.js';
import { RequestPool } from '../utils/request-pool.js';
import type { ExtractedLink } from './types.js';

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
}

export interface SpiderProgress {
  crawled: number;
  queued: number;
  total: number;
  currentUrl: string;
  depth: number;
}

export interface SpiderResult {
  startUrl: string;
  pages: SpiderPageResult[];
  visited: Set<string>;
  duration: number;
  errors: Array<{ url: string; error: string }>;
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
  private options: Required<Omit<SpiderOptions, 'onPage' | 'onProgress' | 'exclude' | 'include'>> & {
    exclude?: RegExp[];
    include?: RegExp[];
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
    this.baseHost = new URL(normalizedStart).hostname;

    // Reset state
    this.visited.clear();
    this.queue = [];
    this.results = [];
    this.errors = [];
    this.running = true;
    this.aborted = false;
    this.pendingCount = 0;

    // Track pending crawl promises by URL
    const pending = new Map<string, Promise<void>>();

    // Helper to schedule a URL for crawling
    const scheduleUrl = (item: QueueItem): void => {
      const normalized = normalizeUrl(item.url);

      // Skip if already visited or pending
      if (this.visited.has(normalized)) return;
      if (pending.has(normalized)) return;

      // Skip if exceeds max depth
      if (item.depth > this.options.maxDepth) return;

      // Skip if we've reached max pages (count completed + pending)
      if (this.results.length + pending.size >= this.options.maxPages) return;

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

    return {
      startUrl: normalizedStart,
      pages: this.results,
      visited: this.visited,
      duration: Math.round(performance.now() - startTime),
      errors: this.errors,
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

      // Create result
      const result: SpiderPageResult = {
        url: item.url,
        status,
        title,
        depth: item.depth,
        links,
        duration: Math.round(performance.now() - startTime),
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
      const errorResult: SpiderPageResult = {
        url: item.url,
        status: 0,
        title: '',
        depth: item.depth,
        links: [],
        duration: Math.round(performance.now() - startTime),
        error: error.message,
      };

      this.results.push(errorResult);
      this.errors.push({ url: item.url, error: error.message });
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
