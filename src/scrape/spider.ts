/**
 * Spider - Web Crawler
 *
 * Crawls websites following internal links.
 * Never visits the same URL twice.
 * Optionally uses sitemap.xml for URL discovery.
 */

import { performance } from 'node:perf_hooks';
import { createClient } from '../core/client.js';
import { ScrapeDocument } from './document.js';
import { RequestPool } from '../utils/request-pool.js';
import type { ExtractedLink, ExtractionSchema } from './types.js';
import type { Options as ParserOptions } from './parser/index.js';
import {
  discoverSitemaps,
  fetchAndValidateSitemap,
  type SitemapUrl,
  type SitemapValidationResult,
} from '../seo/validators/sitemap.js';
import {
  fetchAndValidateRobotsTxt,
  isPathAllowed,
  type RobotsParseResult,
} from '../seo/validators/robots.js';
import {
  detectBlock,
  detectCaptcha,
  type CaptchaDetectionResult,
  type BlockDetectionResult,
  isProtectedDomain,
} from '../utils/block-detector.js';
import { hasImpersonate } from '../utils/binary-manager.js';
import { CurlTransport } from '../transport/curl.js';
import { HttpRequest } from '../core/request.js';
import { getRandomUserAgent } from '../utils/user-agent.js';
import { InMemoryCrawlQueue, type CrawlQueueAdapter, type CrawlQueueItem } from './crawl-queue.js';
import { InMemoryCrawlStorage, type CrawlStorageAdapter } from './crawl-storage.js';
import { ListProxyAdapter, type ProxyAdapter } from './proxy-adapter.js';

/** Transport type for HTTP requests */
export type SpiderTransport = 'auto' | 'undici' | 'curl';
type CaptchaProvider = CaptchaDetectionResult['provider'];

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
  /** Randomize user-agent per request using realistic browser fingerprints */
  rotateUserAgent?: boolean;
  /** Randomize request headers per request */
  randomizeHeaders?: boolean;
  /** Max retries when a request fails or appears blocked */
  maxRetryAttempts?: number;
  /** Base delay for retry attempts in ms */
  baseRetryDelayMs?: number;
  /** Maximum retry delay in ms */
  maxRetryDelayMs?: number;
  /** Exponential backoff multiplier */
  retryBackoffMultiplier?: number;
  /** Max random jitter added to each retry delay in ms */
  retryJitterMs?: number;
  /** Maximum number of block signals before force using curl (auto transport) */
  maxDomainBlockStrikes?: number;
  /** Respect robots.txt (default: true) */
  respectRobotsTxt?: boolean;
  /** Use sitemap.xml to discover URLs (default: false) */
  useSitemap?: boolean;
  /** Custom sitemap URL (if not at /sitemap.xml) */
  sitemapUrl?: string;
  /**
   * Proxy configuration. Supports HTTP, HTTPS, SOCKS5, SOCKS5h.
   *
   * - String: single static proxy
   * - String[]: round-robin rotation
   * - ProxyAdapter: pluggable dynamic selection (health-based, geo-routing, API pools, etc.)
   *
   * @example
   * ```typescript
   * proxy: 'socks5h://proxy.example.com:1080'
   * proxy: ['http://p1:8080', 'socks5h://p2:1080']
   * proxy: myProxyAdapter  // implements ProxyAdapter interface
   * ```
   */
  proxy?: string | string[] | ProxyAdapter;
  /**
   * Transport mode for HTTP requests (default: 'auto')
   * - 'auto': Prefer curl-impersonate, fallback to undici only when curl is unavailable
   * - 'undici': Always use undici (fast, but may be blocked by WAFs)
   * - 'curl': Always use curl-impersonate (slower, but bypasses TLS fingerprinting)
   */
  transport?: SpiderTransport;
  /** Prefer curl-impersonate before undici when transport is 'auto' */
  preferCurlFirst?: boolean;
  /** Callback for each page crawled */
  onPage?: (result: SpiderPageResult) => void;
  /** Callback for each page with HTML content (for SEO analysis during crawl) */
  onPageWithHtml?: (result: SpiderPageResult, html: string) => void | Promise<void>;
  /** Callback when a CAPTCHA challenge is detected */
  onCaptchaDetected?: (result: {
    url: string;
    status: number;
    confidence: number;
    provider?: CaptchaProvider;
    usedCurl: boolean;
  }) => void | Promise<void>;
  /** Callback for progress updates */
  onProgress?: (progress: SpiderProgress) => void;
  /**
   * CSS selectors to extract from each page.
   * Can be:
   * - Simple selectors: ['h1', 'h2', '.price']
   * - Selector:attribute pairs: ['a:href', 'img:src']
   * - Full extraction schema for complex cases
   */
  extract?: string[] | ExtractionSchema;

  /**
   * Parser options used when parsing HTML during crawl.
   * Useful for custom normalization and parser behavior.
   */
  parserOptions?: Partial<ParserOptions>;

  /**
   * Pluggable queue adapter for URL frontier management.
   * Enables persistent, distributed, or priority-based crawling.
   *
   * If not provided, uses an in-memory queue (same behavior as before).
   *
   * @example
   * ```typescript
   * const spider = new Spider({
   *   crawlQueue: new RedisCrawlQueue({ url: 'redis://localhost:6379' }),
   * });
   * ```
   */
  crawlQueue?: CrawlQueueAdapter;

  /**
   * Pluggable storage adapter for crawl results.
   * Enables persistent results, crash recovery, and memory-efficient large crawls.
   *
   * If not provided, uses in-memory storage (same behavior as before).
   */
  crawlStorage?: CrawlStorageAdapter;
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
  /** Network timing data from HTTP request */
  timings?: {
    dns?: number;
    tcp?: number;
    tls?: number;
    ttfb?: number;
    download?: number;
    total?: number;
  };
  /** Timestamp when this page was fetched (Date.now()) */
  fetchedAt?: number;
  security?: {
    blocked: boolean;
    reason?: BlockDetectionResult['reason'];
    confidence?: number;
    captchaDetected?: boolean;
    captchaProvider?: CaptchaProvider;
    attempts?: number;
    retryCount?: number;
    retryAfterMs?: number;
    transport?: SpiderTransport;
    blockedByCaptcha?: boolean;
    lastStatus?: number;
    lastTransport?: SpiderTransport;
  };
  resources?: {
    images: number;
    scripts: number;
    stylesheets: number;
  };
  /** Custom extracted data from --extract selectors */
  extracted?: Record<string, unknown>;
}

export interface SpiderProgress {
  crawled: number;
  queued: number;
  /** Number of URLs currently being processed */
  pending: number;
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
  /** Timestamp when crawl started (Date.now()) */
  startTime: number;
  /** Timestamp when crawl ended (Date.now()) */
  endTime: number;
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

const FALLBACK_ACCEPT_LANGUAGES = [
  'en-US,en;q=0.9',
  'en-GB,en;q=0.9',
  'en-CA,en;q=0.9',
  'pt-BR,pt;q=0.9,en-US;q=0.8',
  'es-ES,es;q=0.9,en;q=0.8',
];

const FALLBACK_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const RETRIABLE_STATUS_CODES = new Set([403, 429, 500, 502, 503, 504]);
const SEC_CH_UA_HINTS = [
  '"Not(A:Brand";v="99", "Chromium";v="120", "Google Chrome";v="120")',
  '"Not(A:Brand";v="99", "Chromium";v="120", "Microsoft Edge";v="120")',
];
const SEC_CH_UA_MOBILE_HINTS = [
  '"Not(A:Brand";v="99", "Chromium";v="120", "Google Chrome";v="120")',
  '"Not(A:Brand";v="99", "Chromium";v="120", "Google Chrome M";v="120")',
];
const SEC_CH_PLATFORM_HINTS = [
  '"Windows"',
  '"macOS"',
  '"Linux"',
  '"Android"',
  '"iOS"',
];

interface DomainState {
  strikes: number;
  retryAfterMs: number;
  penaltyUntil: number;
  challengeCooldownUntil: number;
  consecutiveCurlFailures: number;
  consecutiveUndiciFailures: number;
  lastTransport: SpiderTransport;
  lastCaptchaProvider?: CaptchaProvider;
  lastCaptchaConfidence: number;
}

function getHostname(url: string): string {
  return new URL(url).hostname;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRetryAfterDelay(response: Response): number {
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) return 0;

  const asSeconds = Number.parseInt(retryAfter, 10);
  if (!Number.isNaN(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000;
  }

  const asDate = Date.parse(retryAfter);
  if (!Number.isNaN(asDate)) {
    return Math.max(0, asDate - Date.now());
  }

  return 0;
}

function pickRandom<T>(values: readonly T[]): T {
  if (values.length === 0) {
    throw new Error('Cannot pick from an empty array');
  }
  const index = Math.floor(Math.random() * values.length);
  return values[index];
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

    // Strip www prefix for dedup (www.example.com → example.com)
    if (url.hostname.startsWith('www.')) {
      url.hostname = url.hostname.slice(4);
    }

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

function isHtmlContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return (
    normalized.includes('text/html') ||
    normalized.includes('application/xhtml+xml') ||
    normalized.includes('application/html')
  );
}

function looksLikeHtmlDocument(content: string): boolean {
  const snippet = content.trimStart().slice(0, 2048).toLowerCase();
  return (
    snippet.startsWith('<!doctype html') ||
    snippet.startsWith('<html') ||
    /<\s*(html|head|body|main|div|title|script|style|link|meta|header|footer)\b/.test(snippet)
  );
}

function shouldReadResponseBody(status: number, contentType: string): boolean {
  return (
    !contentType ||
    isHtmlContentType(contentType) ||
    RETRIABLE_STATUS_CODES.has(status) ||
    status === 403
  );
}

function getCharset(contentType: string): string | undefined {
  const match = /charset=([^;]+)/i.exec(contentType);
  return match ? match[1].trim() : undefined;
}


interface FetchPageResult {
  response: Response;
  body: string;
  usedCurl: boolean;
  timings?: SpiderPageResult['timings'];
  detection: BlockDetectionResult;
  captcha: CaptchaDetectionResult;
  attempts: number;
  retryCount: number;
  retryAfterMs: number;
  transportUsed: SpiderTransport;
  attemptLog: Array<{
    attempt: number;
    transport: SpiderTransport;
    status: number;
    blocked: boolean;
    captchaDetected: boolean;
    reason?: BlockDetectionResult['reason'];
    durationMs: number;
 }>;
}

/**
 * Spider class for crawling websites
 */
/**
 * Parse simple selector strings into ExtractionSchema
 * Supports:
 * - 'h1' -> { h1: { selector: 'h1', multiple: true } }
 * - 'a:href' -> { a_href: { selector: 'a', attribute: 'href', multiple: true } }
 * - '.price:text' -> { price: { selector: '.price', multiple: true } }
 */
function parseExtractSelectors(selectors: string[]): ExtractionSchema {
  const schema: ExtractionSchema = {};

  for (const sel of selectors) {
    const [selector, attr] = sel.split(':');
    // Generate a key name from the selector
    const key = selector
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() + (attr && attr !== 'text' ? `_${attr}` : '');

    schema[key || 'extracted'] = {
      selector,
      attribute: attr && attr !== 'text' ? attr : undefined,
      multiple: true,
    };
  }

  return schema;
}

export class Spider {
  private options: Required<
    Omit<
      SpiderOptions,
      'onPage' | 'onPageWithHtml' | 'onProgress' | 'onCaptchaDetected' | 'exclude' | 'include' | 'sitemapUrl' | 'transport' | 'extract' | 'parserOptions' | 'crawlQueue' | 'crawlStorage' | 'proxy'
    >
  > & {
    exclude?: RegExp[];
    include?: RegExp[];
    sitemapUrl?: string;
    transport: SpiderTransport;
    onPage?: (result: SpiderPageResult) => void;
    onPageWithHtml?: (result: SpiderPageResult, html: string) => void | Promise<void>;
    onCaptchaDetected?: (result: {
      url: string;
      status: number;
      confidence: number;
      provider?: CaptchaProvider;
      usedCurl: boolean;
    }) => void | Promise<void>;
    onProgress?: (progress: SpiderProgress) => void;
    extract?: ExtractionSchema;
    parserOptions?: Partial<ParserOptions>;
  };
  private client: ReturnType<typeof createClient>;
  private pool: RequestPool;
  private crawlQueue: CrawlQueueAdapter;
  private crawlStorage: CrawlStorageAdapter;
  private proxyAdapter: ProxyAdapter | null = null;
  private proxyClients = new Map<string, ReturnType<typeof createClient>>();
  private _visitedCount: number = 0;
  private _queueSize: number = 0;
  private _resultCount: number = 0;
  private baseHost: string = '';
  private running: boolean = false;
  private aborted: boolean = false;
  private pendingCount: number = 0;

  // Transport fallback state
  private blockedDomains: Set<string> = new Set();
  private curlTransport: CurlTransport | null = null;
  private curlAvailable: boolean = false;
  private domainStates: Map<string, DomainState> = new Map();

  // Sitemap & Robots data
  private sitemapUrls: SitemapUrl[] = [];
  private sitemapUrlSet: Set<string> = new Set();
  private robotsData: RobotsParseResult | null = null;
  private sitemapValidation: SitemapValidationResult | null = null;
  private robotsValidation: { found: boolean; issues: Array<{ type: string; message: string }> } | null = null;

  private toHeaderRecord(headers: Headers): Record<string, string> {
    const headerRecord: Record<string, string> = {};
    headers.forEach((value, key) => {
      headerRecord[key] = value;
    });
    return headerRecord;
  }

  constructor(options: SpiderOptions = {}) {
    // Parse extract option - convert simple selectors to schema
    let extractSchema: ExtractionSchema | undefined;
    if (options.extract) {
      if (Array.isArray(options.extract)) {
        extractSchema = parseExtractSelectors(options.extract);
      } else {
        extractSchema = options.extract;
      }
    }

    this.options = {
      maxDepth: options.maxDepth ?? 5,
      maxPages: options.maxPages ?? 100,
      sameDomain: options.sameDomain ?? true,
      concurrency: options.concurrency ?? 5,
      timeout: options.timeout ?? 10000,
      delay: options.delay ?? 100,
      userAgent: options.userAgent ?? 'Recker Spider/1.0',
      rotateUserAgent: options.rotateUserAgent ?? true,
      randomizeHeaders: options.randomizeHeaders ?? true,
      maxRetryAttempts: options.maxRetryAttempts ?? 3,
      baseRetryDelayMs: options.baseRetryDelayMs ?? 1000,
      maxRetryDelayMs: options.maxRetryDelayMs ?? 12000,
      retryBackoffMultiplier: options.retryBackoffMultiplier ?? 2,
      retryJitterMs: options.retryJitterMs ?? 250,
      maxDomainBlockStrikes: options.maxDomainBlockStrikes ?? 2,
      preferCurlFirst: options.preferCurlFirst ?? true,
      respectRobotsTxt: options.respectRobotsTxt ?? true,
      useSitemap: options.useSitemap ?? false,
      transport: options.transport ?? 'auto',
      sitemapUrl: options.sitemapUrl,
      exclude: options.exclude,
      include: options.include,
      onPage: options.onPage,
      onPageWithHtml: options.onPageWithHtml,
      onCaptchaDetected: options.onCaptchaDetected,
      onProgress: options.onProgress,
      extract: extractSchema,
      parserOptions: options.parserOptions,
    };

    // Resolve proxy: string → static client proxy, string[] → ListProxyAdapter, ProxyAdapter → dynamic
    if (options.proxy) {
      if (typeof options.proxy === 'string') {
        // Single static proxy — pass to client
        this.proxyAdapter = new ListProxyAdapter([options.proxy]);
      } else if (Array.isArray(options.proxy)) {
        // List — round-robin adapter
        this.proxyAdapter = new ListProxyAdapter(options.proxy);
      } else {
        // User-provided adapter
        this.proxyAdapter = options.proxy;
      }
    }

    this.client = createClient({
      baseUrl: 'http://localhost',
      timeout: this.options.timeout,
      headers: {
        'User-Agent': this.options.userAgent,
      },
    } as any);

    // Initialize curl transport if needed (auto or curl mode)
    if (this.options.transport !== 'undici') {
      this.curlTransport = new CurlTransport();
    }

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

    // Initialize crawl queue (pluggable or default in-memory)
    this.crawlQueue = options.crawlQueue ?? new InMemoryCrawlQueue();
    this.crawlStorage = options.crawlStorage ?? new InMemoryCrawlStorage();
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
    const perfStart = performance.now();
    const startTimestamp = Date.now();

    // Normalize and validate start URL
    const normalizedStart = normalizeUrl(startUrl);
    const baseUrl = new URL(normalizedStart).origin;
      this.baseHost = new URL(normalizedStart).hostname;

    // Reset state
    await this.crawlQueue.clear();
    await this.crawlStorage.clear();
    this._visitedCount = 0;
    this._queueSize = 0;
    this._resultCount = 0;
    this.running = true;
    this.aborted = false;
    this.pendingCount = 0;
    this.sitemapUrls = [];
    this.sitemapUrlSet.clear();
    this.robotsData = null;
    this.sitemapValidation = null;
    this.robotsValidation = null;
    this.blockedDomains.clear();
    this.domainStates.clear();

    // Check if curl-impersonate is available (for auto/curl modes)
    if (this.options.transport !== 'undici') {
      this.curlAvailable = await hasImpersonate();
      // Pre-mark protected domains if in auto mode
      if (this.options.transport === 'auto' && this.curlAvailable && isProtectedDomain(this.baseHost)) {
        this.blockedDomains.add(this.baseHost);
      }
    }

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
    const scheduleUrl = async (item: QueueItem): Promise<void> => {
      const normalized = normalizeUrl(item.url);

      // Skip if already visited or pending
      if (await this.crawlQueue.hasVisited(normalized)) return;
      if (pending.has(normalized)) return;

      // Skip if exceeds max depth (sitemap URLs get depth 1)
      if (item.depth > this.options.maxDepth) return;

      // Skip if we've reached max pages (count completed + pending)
      if (this._resultCount + pending.size >= this.options.maxPages) return;

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
      await this.crawlQueue.markVisited(normalized);
      this._visitedCount++;
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
    await scheduleUrl({ url: normalizedStart, depth: 0 });

    // Schedule sitemap URLs (with depth 1 so they can discover more links)
    if (this.options.useSitemap && this.sitemapUrls.length > 0) {
      for (const sitemapUrl of this.sitemapUrls) {
        // Only add URLs from same domain
        try {
          const urlHost = new URL(sitemapUrl.loc).hostname;
          if (urlHost === this.baseHost) {
            await scheduleUrl({ url: sitemapUrl.loc, depth: 1 });
          }
        } catch {
          // Invalid URL, skip
        }
      }
    }

    // Process until no more pending crawls or aborted
    while (
      (pending.size > 0 || this._queueSize > 0)
      && !this.aborted
      && this._resultCount < this.options.maxPages
    ) {
      // Schedule any URLs discovered from completed crawls
      let nextItem = await this.crawlQueue.pop();
      while (nextItem && !this.aborted) {
        this._queueSize = Math.max(0, this._queueSize - 1);

        // Check if we should continue scheduling
        if (this._resultCount + pending.size >= this.options.maxPages) break;

        await scheduleUrl(nextItem);
        nextItem = await this.crawlQueue.pop();
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

    // Collect results from storage
    const pages = await this.crawlStorage.getResults();
    const errors = await this.crawlStorage.getErrors();

    // Build sitemap analysis
    const sitemapAnalysis = this.buildSitemapAnalysis(pages);
    const robotsAnalysis = this.buildRobotsAnalysis();

    // Build visited set from crawl queue adapter (or from results as fallback)
    const visited = this.crawlQueue instanceof InMemoryCrawlQueue
      ? this.crawlQueue.getVisited()
      : new Set(pages.map(r => r.url));

    return {
      startUrl: normalizedStart,
      pages,
      visited,
      duration: Math.round(performance.now() - perfStart),
      startTime: startTimestamp,
      endTime: Date.now(),
      errors,
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
        headers: this.toHeaderRecord(response.headers),
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
  private buildSitemapAnalysis(results: SpiderPageResult[]): SitemapAnalysis {
    const crawledUrls = new Set(results.map(r => normalizeUrl(r.url)));
    const sitemapUrlSet = this.sitemapUrlSet.size > 0
      ? this.sitemapUrlSet
      : new Set(this.sitemapUrls.map((u) => normalizeUrl(u.loc)));

    // URLs in sitemap that were crawled
    const crawledFromSitemap = Array.from(sitemapUrlSet)
      .filter(url => crawledUrls.has(url))
      .length;

    // URLs in sitemap but NOT discovered via links (orphans)
    // These are URLs only reachable via sitemap, not linked from any page
    const linkedUrls = new Set<string>();
    const blockedBySitemapRobotsSet = new Set<string>();
    if (this.robotsData) {
      for (const sitemapUrl of this.sitemapUrls) {
        try {
          const normalized = normalizeUrl(sitemapUrl.loc);
          const urlPath = new URL(sitemapUrl.loc).pathname;
          if (!isPathAllowed(this.robotsData, urlPath, this.options.userAgent)) {
            blockedBySitemapRobotsSet.add(normalized);
          }
        } catch {
          // Invalid URL
        }
      }
    }

    for (const page of results) {
      for (const link of page.links) {
        if (link.href) {
          linkedUrls.add(normalizeUrl(link.href));
        }
      }
    }

    const orphanUrlSet = new Set<string>();
    for (const u of this.sitemapUrls) {
      const normalized = normalizeUrl(u.loc);
      // URL is in sitemap but not linked from any crawled page
      if (!linkedUrls.has(normalized) && !blockedBySitemapRobotsSet.has(normalized)) {
        orphanUrlSet.add(normalized);
      }
    }
    const orphanUrls = Array.from(orphanUrlSet);

    // URLs discovered but NOT in sitemap
    const missingFromSitemap = Array.from(crawledUrls)
      .filter(url => !sitemapUrlSet.has(url));

    // URLs in sitemap blocked by robots.txt
    const blockedBySitemapRobots = Array.from(blockedBySitemapRobotsSet);

    return {
      found: this.sitemapUrls.length > 0,
      url: this.sitemapUrls[0]?.loc,
      totalUrls: sitemapUrlSet.size,
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

  /** Get or create a client configured with the given proxy */
  private getClientForProxy(proxyUrl: string | null): ReturnType<typeof createClient> {
    if (!proxyUrl) return this.client;
    let proxied = this.proxyClients.get(proxyUrl);
    if (!proxied) {
      proxied = createClient({
        baseUrl: 'http://localhost',
        timeout: this.options.timeout,
        headers: { 'User-Agent': this.options.userAgent },
        proxy: proxyUrl,
      } as any);
      this.proxyClients.set(proxyUrl, proxied);
    }
    return proxied;
  }

  /**
   * Fetch a page using the appropriate transport (undici or curl-impersonate)
   * Implements auto-detection and fallback for blocked requests.
   */
  private async fetchPage(url: string): Promise<FetchPageResult> {
    const hostname = getHostname(url);
    const maxAttempts = Math.max(1, this.options.maxRetryAttempts);
    const hasCurl = this.options.transport !== 'undici' && this.curlAvailable && this.curlTransport !== null;
    let lastResponse: Response | null = null;
    let lastBody = '';
    let lastDetection: BlockDetectionResult = { blocked: false, confidence: 0 };
    let lastCaptcha: CaptchaDetectionResult = { detected: false, confidence: 0 };
    let lastTimings: SpiderPageResult['timings'] | undefined;
    let lastUsedCurl = false;
    let lastError: unknown;
    let captchaReported = false;
    let forcedTransport: SpiderTransport | null = null;
    let attemptLog: FetchPageResult['attemptLog'] = [];
    let lastRetryAfterMs = 0;

    // Get proxy URL for this request (if adapter configured)
    const proxyUrl = this.proxyAdapter ? await this.proxyAdapter.getProxy() : null;

    const executeRequest = async (useCurl: boolean): Promise<{ response: Response; body: string; usedCurl: boolean; timings: SpiderPageResult['timings'] }> => {
      if (useCurl && this.curlTransport) {
        // Use proxy-configured curl transport when adapter provides a proxy
        const curlForRequest = proxyUrl
          ? new CurlTransport(proxyUrl)
          : this.curlTransport!;
        const req = new HttpRequest(url, {
          method: 'GET',
          headers: this.buildRequestHeaders(url, true),
        });
        const requestStart = performance.now();
        const response = await curlForRequest.dispatch(req);
        const contentType = response.headers.get('content-type') || '';
        const shouldReadCurlResponseBody = shouldReadResponseBody(response.status, contentType);
        let body = '';
        const responseStart = performance.now();
        if (shouldReadCurlResponseBody) {
          body = await response.text();
        }
        const totalMs = Math.round(performance.now() - requestStart);
        const downloadMs = Math.round(performance.now() - responseStart);

        const timings: SpiderPageResult['timings'] = response.timings ? {
          dns: response.timings.dns,
          tcp: response.timings.tcp,
          tls: response.timings.tls,
          ttfb: response.timings.firstByte,
          download: shouldReadCurlResponseBody ? downloadMs : undefined,
          total: response.timings.total ? Math.round(response.timings.total) : totalMs,
        } : {
          download: shouldReadCurlResponseBody ? downloadMs : undefined,
          total: totalMs,
        };

      return {
        response: response as unknown as Response,
        body,
        usedCurl: true,
        timings,
      };
    }

      const clientForRequest = this.getClientForProxy(proxyUrl);
      const response = await clientForRequest.get(url, {
        headers: this.buildRequestHeaders(url, false),
      });

      const contentType = response.headers.get('content-type') || '';
      const shouldReadUndiciBody =
        !contentType ||
        isHtmlContentType(contentType) ||
        this.isRetryableStatus(response.status);
      let body = '';
      let downloadMs = 0;
      const requestEnd = performance.now();

      if (shouldReadUndiciBody) {
        const downloadStart = performance.now();
        body = await response.text();
        downloadMs = Math.round(performance.now() - downloadStart);
      }

      const timings: SpiderPageResult['timings'] = response.timings ? {
        dns: response.timings?.dns,
        tcp: response.timings?.tcp,
        tls: response.timings?.tls,
        ttfb: response.timings?.firstByte,
        download: shouldReadUndiciBody ? downloadMs : undefined,
        total: response.timings?.total ? Math.round(response.timings.total) : Math.round(performance.now() - requestEnd),
      } : {
        download: shouldReadUndiciBody ? downloadMs : undefined,
        total: Math.round(performance.now() - requestEnd),
      };

      return {
        response: response as unknown as Response,
        body,
        usedCurl: false,
        timings,
      };
    };

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await this.waitForDomainPenalty(hostname);
      const useCurl = this.shouldUseCurlForHost(hostname, hasCurl, forcedTransport);
      const transportForAttempt: SpiderTransport = useCurl ? 'curl' : 'undici';
      forcedTransport = null;
      const attemptStart = performance.now();

      try {
        const { response, body, usedCurl, timings } = await executeRequest(transportForAttempt === 'curl');
        const transportUsed = usedCurl ? 'curl' : 'undici';
        this.recordTransportResult(hostname, transportForAttempt, true);
        const contentType = response.headers.get('content-type') || '';
        const readBodyForDetection = shouldReadResponseBody(response.status, contentType);
        const detection = detectBlock(response, readBodyForDetection ? body : undefined);
        const captcha = detectCaptcha(response, readBodyForDetection ? body : undefined);
        const hasCaptchaSignal = captcha.detected && captcha.confidence >= 0.6;
        const highConfidenceCaptcha = captcha.detected && captcha.confidence >= 0.8;
        const state = this.getOrCreateDomainState(hostname);

        if (captcha.detected && this.options.onCaptchaDetected && !captchaReported) {
          await this.options.onCaptchaDetected({
            url,
            status: response.status,
            confidence: captcha.confidence,
            provider: captcha.provider,
            usedCurl,
          });
          captchaReported = true;
        }

        if (hasCaptchaSignal) {
          this.registerDomainChallenge(hostname, captcha.provider, captcha.confidence);
        }

        lastResponse = response;
        lastBody = body;
        lastDetection = detection;
        lastCaptcha = captcha;
        lastUsedCurl = usedCurl;
        lastTimings = timings;
        const attemptReason = hasCaptchaSignal ? 'captcha' : detection.reason;

        attemptLog.push({
          attempt: attempt + 1,
          transport: transportForAttempt,
          status: response.status,
          blocked: detection.blocked || hasCaptchaSignal,
          captchaDetected: hasCaptchaSignal,
          reason: attemptReason,
          durationMs: Math.max(0, Math.round(performance.now() - attemptStart)),
        });

        const canRetryWithCurl = this.options.transport === 'auto' && hasCurl;
        const retryOnCaptcha = hasCaptchaSignal && canRetryWithCurl && highConfidenceCaptcha;
        const shouldRetry = (
          attempt < maxAttempts - 1 &&
          (
            retryOnCaptcha ||
            this.isRetryableStatus(response.status) ||
            (detection.blocked && detection.confidence >= 0.6) ||
            (hasCaptchaSignal && this.options.transport !== 'undici')
          )
        );

        const isHighQualitySuccess = response.status < 400 && !detection.blocked && !hasCaptchaSignal;
        if (isHighQualitySuccess) {
          this.registerDomainSuccess(hostname);
        }

        if (!shouldRetry || attempt === maxAttempts - 1) {
          // Report proxy result for health tracking
          if (proxyUrl && this.proxyAdapter?.reportResult) {
            await this.proxyAdapter.reportResult(proxyUrl, isHighQualitySuccess);
          }
          return {
            response,
            body,
            usedCurl: transportUsed === 'curl',
            timings,
            detection,
            captcha,
            attempts: attempt + 1,
            retryCount: attempt,
            retryAfterMs: lastRetryAfterMs,
            transportUsed: transportForAttempt,
            attemptLog,
          };
        }

        if (!hasCaptchaSignal && (detection.blocked || this.isRetryableStatus(response.status))) {
          this.registerDomainBlock(hostname);
        }

        const retryAfter = getRetryAfterDelay(response);
        state.retryAfterMs = Math.max(
          retryAfter,
          this.getRetryWait(
            hostname,
            attempt + 1,
            captcha.provider,
          ),
        );
        lastRetryAfterMs = state.retryAfterMs;

        const waitMs = this.getRetryWait(
          hostname,
          attempt + 1,
          captcha.provider,
        );

        if (this.options.transport === 'auto' && hasCurl) {
          if (transportUsed === 'curl' && state.consecutiveCurlFailures >= 2) {
            forcedTransport = 'undici';
          } else if (transportUsed === 'undici' && (detection.blocked || hasCaptchaSignal)) {
            forcedTransport = 'curl';
          }
        }

        await sleep(waitMs);
        continue;
      } catch (error) {
        lastError = error;
        this.recordTransportResult(hostname, transportForAttempt, false);
        const state = this.getOrCreateDomainState(hostname);
        state.retryAfterMs = this.getRetryWait(hostname, attempt + 1);
        lastRetryAfterMs = state.retryAfterMs;

        attemptLog.push({
          attempt: attempt + 1,
          transport: transportForAttempt,
          status: 0,
          blocked: false,
          captchaDetected: false,
          reason: 'status',
          durationMs: Math.max(0, Math.round(performance.now() - attemptStart)),
        });

        if (attempt === maxAttempts - 1) {
          throw error;
        }

        this.registerDomainBlock(hostname);
        if (this.options.transport === 'auto' && hasCurl) {
          if (transportForAttempt === 'curl') {
            const state = this.getOrCreateDomainState(hostname);
            forcedTransport = state.consecutiveCurlFailures >= 2 ? 'undici' : null;
          } else {
            forcedTransport = 'curl';
          }
        }

        const waitMs = this.getRetryWait(hostname, attempt + 1);
        await sleep(waitMs);
      }
    }

    if (lastResponse) {
      return {
        response: lastResponse,
        body: lastBody,
        usedCurl: lastUsedCurl,
        timings: lastTimings,
        detection: lastDetection,
        captcha: lastCaptcha,
        attempts: attemptLog.length || 1,
        retryCount: Math.max(0, attemptLog.length - 1),
        retryAfterMs: lastRetryAfterMs,
        transportUsed: lastUsedCurl ? 'curl' : 'undici',
        attemptLog,
      };
    }

    const attempts = attemptLog.length || 1;
    const retryCount = Math.max(0, attempts - 1);
    if (lastError) {
      const wrapped = (lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`)) as Error & {
        attempts?: number;
        retryCount?: number;
        retryAfterMs?: number;
        transportUsed?: SpiderTransport;
        response?: Response;
        security?: {
          blocked: boolean;
          reason?: BlockDetectionResult['reason'];
          confidence?: number;
          captchaDetected?: boolean;
          captchaProvider?: CaptchaDetectionResult['provider'];
          attempts?: number;
          retryCount?: number;
          retryAfterMs?: number;
          transport?: SpiderTransport;
          blockedByCaptcha?: boolean;
          lastStatus?: number;
        };
      };
      wrapped.attempts = attempts;
      wrapped.retryCount = retryCount;
      wrapped.retryAfterMs = lastRetryAfterMs;
      wrapped.transportUsed = lastUsedCurl ? 'curl' : 'undici';
      if (lastResponse) {
        wrapped.response = lastResponse;
        wrapped.security = {
          blocked: lastDetection.blocked,
          reason: lastDetection.reason,
          confidence: lastDetection.confidence,
          captchaDetected: lastCaptcha.detected,
          captchaProvider: lastCaptcha.provider,
          attempts,
          retryCount,
          retryAfterMs: lastRetryAfterMs,
          transport: lastUsedCurl ? 'curl' : 'undici',
          blockedByCaptcha: lastCaptcha.detected,
          lastStatus: (lastResponse as Response).status,
        };
      }
      // Report proxy failure
      if (proxyUrl && this.proxyAdapter?.reportResult) {
        await this.proxyAdapter.reportResult(proxyUrl, false);
      }
      throw wrapped;
    }

    throw new Error(`Failed to fetch ${url}`);
  }

  /**
   * Crawl a single page
   */
    private async crawlPage(item: QueueItem): Promise<void> {
    const startTime = performance.now();
    const fetchedAt = Date.now();

    // Report progress
    this.options.onProgress?.({
      crawled: this._resultCount,
      queued: this._queueSize,
      pending: this.pendingCount,
      total: this._visitedCount,
      currentUrl: item.url,
      depth: item.depth,
    });

    try {
      const {
        response,
        body: html,
        timings,
        detection,
        captcha,
        attempts,
        retryCount,
        retryAfterMs,
        transportUsed,
      } = await this.fetchPage(item.url);
      const status = response.status;
      const contentType = response.headers.get('content-type') || '';
      const isHtml = isHtmlContentType(contentType) || (!contentType && looksLikeHtmlDocument(html));
      const hasCaptcha = captcha.detected && captcha.confidence >= 0.7;
      const contentLength = Number.parseInt(response.headers.get('content-length') || '', 10);
      const normalizedHtmlSize = Number.isFinite(contentLength) ? contentLength : html.length;
      const security = {
        blocked: detection.blocked || hasCaptcha,
        reason: hasCaptcha ? (detection.reason ?? 'captcha') : detection.reason,
        confidence: Math.max(detection.confidence, hasCaptcha ? captcha.confidence : 0),
        captchaDetected: hasCaptcha,
        captchaProvider: captcha.provider,
        attempts,
        retryCount,
        retryAfterMs,
        transport: transportUsed,
        blockedByCaptcha: hasCaptcha,
        lastStatus: status,
      };

      if (!isHtml || hasCaptcha || (detection.blocked && detection.reason === 'captcha')) {
        const nonHtmlResult: SpiderPageResult = {
          url: item.url,
          status,
          title: '',
          depth: item.depth,
          links: [],
          duration: Math.round(performance.now() - startTime),
          error: hasCaptcha ? 'CAPTCHA detected' : status >= 400 ? `HTTP ${status}` : 'Blocked by bot protection',
          meta: {
            charset: getCharset(contentType),
          },
          metrics: {
            htmlSize: normalizedHtmlSize,
            textLength: 0,
          },
          timings,
          security,
          fetchedAt,
        };
        await this.crawlStorage.saveResult(nonHtmlResult);
        this._resultCount++;
        this.options.onPage?.(nonHtmlResult);
        if (this.options.onPageWithHtml && html) {
          await this.options.onPageWithHtml(nonHtmlResult, html);
        }
        return;
      }

      const doc = await ScrapeDocument.create(html, {
        baseUrl: item.url,
        parserOptions: this.options.parserOptions,
      });

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

      const imageCount = doc.images().length;
      const scriptCount = doc.scripts().length;
      const stylesheetCount = doc.styles().length;

      const social = {
        ogTitle: og.title,
        ogDescription: og.description,
        ogImage: Array.isArray(og.image) ? og.image[0] : og.image,
      };

      // Apply custom extraction if configured
      let extracted: Record<string, unknown> | undefined;
      if (this.options.extract) {
        try {
          extracted = doc.extract(this.options.extract);
        } catch {
          // Extraction failed, continue without it
        }
      }

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
        security,
        resources: {
          images: imageCount,
          scripts: scriptCount,
          stylesheets: stylesheetCount,
        },
        social,
        timings,
        fetchedAt,
        extracted,
      };

      await this.crawlStorage.saveResult(result);
      this._resultCount++;
      this.options.onPage?.(result);

      // Call onPageWithHtml for SEO analysis during crawl (await if async)
      if (this.options.onPageWithHtml) {
        await this.options.onPageWithHtml(result, html);
      }

      // Add new links to queue (only internal, unvisited) — batch optimized
      const candidates: CrawlQueueItem[] = [];
      const candidateUrls: string[] = [];

      for (const link of links) {
        if (!link.href) continue;
        const normalized = normalizeUrl(link.href);
        if (!shouldCrawl(normalized, this.baseHost, this.options)) continue;
        candidateUrls.push(normalized);
        candidates.push({ url: normalized, depth: item.depth + 1 });
      }

      if (candidates.length > 0) {
        // Batch check visited URLs (reduces round-trips for remote backends)
        const visitedSet = this.crawlQueue.hasVisitedBatch
          ? await this.crawlQueue.hasVisitedBatch(candidateUrls)
          : new Set(await Promise.all(candidateUrls.map(async (u) => (await this.crawlQueue.hasVisited(u)) ? u : null)).then(r => r.filter(Boolean) as string[]));

        const newItems = candidates.filter((_, i) => !visitedSet.has(candidateUrls[i]));

        if (newItems.length > 0) {
          if (this.crawlQueue.pushBatch) {
            await this.crawlQueue.pushBatch(newItems);
          } else {
            for (const newItem of newItems) await this.crawlQueue.push(newItem);
          }
          this._queueSize += newItems.length;
        }
      }
    } catch (error: any) {
      const errAttempts = typeof error?.attempts === 'number' ? error.attempts : 1;
      const errRetryCount = typeof error?.retryCount === 'number' ? error.retryCount : Math.max(0, errAttempts - 1);
      const errRetryAfterMs = typeof error?.retryAfterMs === 'number' ? error?.retryAfterMs : 0;
      const errTransport =
        error?.transportUsed === 'curl' || error?.transportUsed === 'undici'
          ? error.transportUsed
          : this.options.transport === 'curl'
            ? 'curl'
            : 'undici';
      type ResponseWithTimings = Response & { timings?: { dns?: number; tcp?: number; tls?: number; firstByte?: number; total?: number } };
      const errResponse: ResponseWithTimings | undefined = error.response as ResponseWithTimings | undefined;
      const errStatus = errResponse?.status || 0;
      const errDetection: BlockDetectionResult = errResponse ? detectBlock(errResponse, undefined) : { blocked: true, confidence: 0.75, reason: 'status' as const };
      const errCaptcha = errResponse ? detectCaptcha(errResponse, undefined) : { detected: false, confidence: 0 };
      // Extract status code from error if available
      const status = errStatus;
      const message = error.message || 'Unknown error';
      const errorResponse = errResponse;
      const errorContentType = errorResponse?.headers?.get?.('content-type') || '';
      const errorContentLength = Number.parseInt(errorResponse?.headers?.get?.('content-length') || '', 10);
      const errorTimings = errorResponse?.timings
        ? {
            dns: errorResponse.timings?.dns,
            tcp: errorResponse.timings?.tcp,
            tls: errorResponse.timings?.tls,
            ttfb: errorResponse.timings?.firstByte,
            total: errorResponse.timings?.total ? Math.round(errorResponse.timings.total) : Math.round(performance.now() - startTime),
          }
        : {
          total: Math.round(performance.now() - startTime),
        };

      const hasCaptcha = errCaptcha.detected && errCaptcha.confidence >= 0.7;
      const security = {
        blocked: errDetection.blocked || hasCaptcha,
        reason: hasCaptcha ? (errDetection.reason ?? 'captcha') : errDetection.reason,
        confidence: Math.max(errDetection.confidence, hasCaptcha ? errCaptcha.confidence : 0),
        captchaDetected: hasCaptcha,
        captchaProvider: errCaptcha.provider,
        attempts: errAttempts,
        retryCount: errRetryCount,
        retryAfterMs: errRetryAfterMs,
        transport: errTransport,
        blockedByCaptcha: hasCaptcha,
        lastStatus: status,
      };

      const errorResult: SpiderPageResult = {
        url: item.url,
        status: status,
        title: '',
        depth: item.depth,
        links: [],
        duration: Math.round(performance.now() - startTime),
        error: message,
        meta: {
          charset: getCharset(errorContentType),
        },
        metrics: {
          htmlSize: Number.isFinite(errorContentLength) ? errorContentLength : 0,
          textLength: 0,
        },
        timings: errorTimings,
        security,
        fetchedAt,
      };

      await this.crawlStorage.saveResult(errorResult);
      this._resultCount++;
      await this.crawlStorage.saveError({ url: item.url, error: message });
      this.options.onPage?.(errorResult);
    }
  }

  private getOrCreateDomainState(hostname: string): DomainState {
    const current = this.domainStates.get(hostname);
    if (current) return current;

    const next: DomainState = {
      strikes: 0,
      retryAfterMs: 0,
      penaltyUntil: 0,
      challengeCooldownUntil: 0,
      consecutiveCurlFailures: 0,
      consecutiveUndiciFailures: 0,
      lastTransport: 'undici',
      lastCaptchaConfidence: 0,
    };
    this.domainStates.set(hostname, next);
    return next;
  }

  private recordTransportResult(hostname: string, transport: SpiderTransport, success: boolean): void {
    const state = this.getOrCreateDomainState(hostname);
    state.lastTransport = transport;

    if (success) {
      if (transport === 'curl') {
        state.consecutiveCurlFailures = 0;
      } else if (transport === 'undici') {
        state.consecutiveUndiciFailures = 0;
      }
      return;
    }

    if (transport === 'curl') {
      state.consecutiveCurlFailures += 1;
    } else {
      state.consecutiveUndiciFailures += 1;
    }
  }

  private isRetryableStatus(status: number): boolean {
    return RETRIABLE_STATUS_CODES.has(status);
  }

  private buildRequestHeaders(url: string, useCurl: boolean): HeadersInit {
    const hostname = getHostname(url);
    const randomizedHeaders = this.options.randomizeHeaders;
    const userAgent = this.options.rotateUserAgent
      ? (Math.random() < 0.8 ? getRandomUserAgent('desktop') : getRandomUserAgent('mobile'))
      : this.options.userAgent;
    const isMobile = /mobile|android|iphone|ipad/i.test(userAgent);

    const baseHeaders = new Headers({
      'Accept': FALLBACK_ACCEPT,
      'Accept-Language': pickRandom(FALLBACK_ACCEPT_LANGUAGES),
      'Cache-Control': 'max-age=0',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'DNT': '1',
      'Connection': 'keep-alive',
      Referer: `${new URL(url).origin}/`,
      'User-Agent': userAgent,
      'sec-ch-ua': isMobile ? pickRandom(SEC_CH_UA_MOBILE_HINTS) : pickRandom(SEC_CH_UA_HINTS),
      'sec-ch-ua-platform': pickRandom(SEC_CH_PLATFORM_HINTS),
      'sec-ch-ua-mobile': isMobile ? '?1' : '?0',
    });

    if (useCurl) {
      baseHeaders.set('Referer', `${new URL(url).origin}/`);
    }

    if (!randomizedHeaders) {
      baseHeaders.delete('Sec-Fetch-Mode');
      baseHeaders.delete('Sec-Fetch-Dest');
      baseHeaders.delete('Sec-Fetch-Site');
      baseHeaders.delete('DNT');
      baseHeaders.delete('sec-ch-ua');
      baseHeaders.delete('sec-ch-ua-platform');
      baseHeaders.delete('sec-ch-ua-mobile');
      baseHeaders.set('Accept-Language', 'en-US,en;q=0.9');
    }

    // Small host-specific randomness to reduce fingerprint repetition across domains
    if (this.options.rotateUserAgent && hostname.includes('.')) {
      baseHeaders.set('Accept-Language', pickRandom(FALLBACK_ACCEPT_LANGUAGES));
    }

    if (this.domainStates.get(hostname)?.strikes) {
      baseHeaders.set('Pragma', 'no-cache');
    }

    return baseHeaders;
  }

  private shouldUseCurlForHost(
    hostname: string,
    hasCurl: boolean,
    forceTransport: SpiderTransport | null = null,
  ): boolean {
    if (!hasCurl) return false;
    if (this.options.transport === 'curl') return true;
    if (this.options.transport !== 'auto') return false;

    const state = this.getOrCreateDomainState(hostname);
    if (forceTransport === 'curl') {
      return true;
    }
    if (forceTransport === 'undici') {
      return false;
    }

    const hasActiveChallengeCooldown = state.challengeCooldownUntil > Date.now();
    if (hasActiveChallengeCooldown || isProtectedDomain(hostname) || this.blockedDomains.has(hostname)) {
      return true;
    }

    if (state.consecutiveCurlFailures >= 2 && state.lastTransport === 'curl') {
      return false;
    }

    if (this.options.preferCurlFirst) {
      return true;
    }

    if (state.consecutiveUndiciFailures >= 2 && state.lastTransport === 'undici') {
      return true;
    }

    return false;
  }

  private async waitForDomainPenalty(hostname: string): Promise<void> {
    const state = this.getOrCreateDomainState(hostname);
    const now = Date.now();
    const delay = Math.max(state.penaltyUntil, state.challengeCooldownUntil) - now;
    if (delay > 0) {
      await sleep(delay);
    }
  }

  private registerDomainBlock(hostname: string): void {
    const state = this.getOrCreateDomainState(hostname);
    state.strikes += 1;

    const baseDelay = this.options.baseRetryDelayMs;
    const cappedDelay = Math.min(
      this.options.maxRetryDelayMs,
      baseDelay * Math.pow(this.options.retryBackoffMultiplier, Math.max(state.strikes - 1, 0))
    );
    state.penaltyUntil = Date.now() + cappedDelay;
    state.retryAfterMs = cappedDelay;

    if (this.options.transport === 'auto' && state.strikes >= this.options.maxDomainBlockStrikes) {
      this.blockedDomains.add(hostname);
    }
  }

  private registerDomainSuccess(hostname: string): void {
    const state = this.domainStates.get(hostname);
    if (!state) return;
    state.strikes = Math.max(0, state.strikes - 1);
    state.penaltyUntil = 0;
    state.challengeCooldownUntil = 0;
    if (state.strikes === 0) {
      state.lastCaptchaConfidence = 0;
      state.lastCaptchaProvider = undefined;
    }
  }

  private getCaptchaRetryMultiplier(provider?: CaptchaProvider): number {
    if (!provider) return 1.2;

    switch (provider) {
      case 'cloudflare':
      case 'datadome':
        return 1.9;
      case 'funcaptcha':
        return 1.7;
      case 'recaptcha':
      case 'hcaptcha':
        return 1.5;
      case 'turnstile':
        return 1.4;
      default:
        return 1.25;
    }
  }

  private registerDomainChallenge(hostname: string, provider?: CaptchaProvider, confidence: number = 0): void {
    const state = this.getOrCreateDomainState(hostname);
    const providerMultiplier = this.getCaptchaRetryMultiplier(provider);
    const confidenceMultiplier = 1 + Math.min(confidence, 0.95);
    const challengePenalty = Math.round(
      this.options.baseRetryDelayMs
      * this.options.retryBackoffMultiplier
      * providerMultiplier
      * confidenceMultiplier
    );
    state.strikes += 1;
    state.lastCaptchaProvider = provider;
    state.lastCaptchaConfidence = Math.max(state.lastCaptchaConfidence, confidence);
    state.challengeCooldownUntil = Date.now() + Math.min(this.options.maxRetryDelayMs, challengePenalty);
    state.penaltyUntil = state.challengeCooldownUntil;
    state.retryAfterMs = Math.min(this.options.maxRetryDelayMs, challengePenalty);
    this.blockedDomains.add(hostname);
  }

  private getRetryWait(hostname: string, attempt: number, provider?: CaptchaProvider): number {
    const state = this.getOrCreateDomainState(hostname);
    const providerMultiplier = this.getCaptchaRetryMultiplier(provider ?? state.lastCaptchaProvider);
    const baseDelay = this.options.baseRetryDelayMs;
    const attemptFactor = Math.pow(this.options.retryBackoffMultiplier, attempt);
    const retryAfter = state.retryAfterMs;
    const computed = Math.min(
      this.options.maxRetryDelayMs,
      Math.max(baseDelay * attemptFactor * providerMultiplier, baseDelay)
    );
    return Math.max(computed, retryAfter) + (this.options.retryJitterMs ? Math.random() * this.options.retryJitterMs : 0);
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
      crawled: this._resultCount,
      queued: this._queueSize,
      pending: this.pendingCount,
      total: this._visitedCount,
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
