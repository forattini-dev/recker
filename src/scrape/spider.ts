/**
 * Spider - Web Crawler
 *
 * Crawls websites following internal links.
 * Never visits the same URL twice.
 */

import { createClient } from '../core/client.js';
import { ScrapeDocument } from './document.js';
import type { ExtractedLink } from './types.js';

export interface SpiderOptions {
  /** Maximum depth to crawl (default: 3) */
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
 * Normalize URL for deduplication
 * - Remove trailing slashes
 * - Remove fragments
 * - Sort query params
 * - Lowercase hostname
 */
function normalizeUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    // Remove fragment
    url.hash = '';
    // Sort query params
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
  private visited: Set<string> = new Set();
  private queue: QueueItem[] = [];
  private results: SpiderPageResult[] = [];
  private errors: Array<{ url: string; error: string }> = [];
  private baseHost: string = '';
  private running: boolean = false;
  private aborted: boolean = false;

  constructor(options: SpiderOptions = {}) {
    this.options = {
      maxDepth: options.maxDepth ?? 3,
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
  }

  /**
   * Start crawling from a URL
   */
  async crawl(startUrl: string): Promise<SpiderResult> {
    const startTime = performance.now();

    // Normalize and validate start URL
    const normalizedStart = normalizeUrl(startUrl);
    this.baseHost = new URL(normalizedStart).hostname;

    // Reset state
    this.visited.clear();
    this.queue = [{ url: normalizedStart, depth: 0 }];
    this.results = [];
    this.errors = [];
    this.running = true;
    this.aborted = false;

    // Process queue with concurrency
    while (this.queue.length > 0 && !this.aborted) {
      // Check page limit
      if (this.results.length >= this.options.maxPages) {
        break;
      }

      // Get batch of URLs to process
      const batch: QueueItem[] = [];
      while (batch.length < this.options.concurrency && this.queue.length > 0) {
        const item = this.queue.shift()!;
        const normalized = normalizeUrl(item.url);

        // Skip if already visited
        if (this.visited.has(normalized)) {
          continue;
        }

        // Skip if exceeds max depth
        if (item.depth > this.options.maxDepth) {
          continue;
        }

        // Mark as visited BEFORE processing (prevents duplicates)
        this.visited.add(normalized);
        batch.push({ ...item, url: normalized });
      }

      if (batch.length === 0) {
        continue;
      }

      // Process batch concurrently
      await Promise.all(batch.map(item => this.crawlPage(item)));

      // Delay between batches
      if (this.options.delay > 0 && this.queue.length > 0) {
        await sleep(this.options.delay);
      }
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
