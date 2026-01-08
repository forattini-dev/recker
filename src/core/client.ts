import { ClientOptions, Middleware, NextFunction, ReckerRequest, ReckerResponse, RequestOptions, Transport, CacheStorage, CacheEntry, Hooks, PaginationConfig, HTTP2Options, PageResult, CookieJar, CookieOptions, Logger, consoleLogger } from '../types/index.js';
import type { ClientAI, PresetAIConfig, ClientOptionsWithAI } from '../types/ai-client.js';
import { ClientAIImpl } from '../ai/client-ai.js';
import { HttpRequest } from './request.js';
import { RequestPromise } from './request-promise.js';
import { HttpError, MaxSizeExceededError, ConfigurationError, ValidationError, TimeoutError, UnsupportedError } from '../core/errors.js';
import { processBody, createFormData, createMultipart, isPlainObject } from '../utils/body.js';
import type { AgentManager } from '../utils/agent-manager.js';
import { RequestPool } from '../utils/request-pool.js';
import { normalizeConcurrency, expandHTTP2Options, type NormalizedConcurrencyConfig } from '../utils/concurrency.js';
import { getGlobalProtocolCache } from '../utils/protocol-cache.js';
import { getDefaultUserAgent } from '../utils/user-agent.js';
import { getVersion, getVersionSync, getVersionInfo, type VersionInfo } from '../version.js';
import { FetchTransport } from '../transport/fetch.js';

// Plugins and Storage for auto-wiring
import { paginate, PaginationOptions, streamPages } from '../plugins/pagination.js';
import { retryPlugin, RetryOptions } from '../plugins/retry.js';
import { cachePlugin, CacheOptions } from '../plugins/cache.js';
import { dedupPlugin, DedupOptions } from '../plugins/dedup.js';
import { createXSRFMiddleware, XSRFPluginOptions } from '../plugins/xsrf.js';
import { createCompressionMiddleware } from '../plugins/compression.js';
import { serializeXML } from '../plugins/xml.js';
import { serializeYaml } from '../plugins/yaml.js';
import { serializeCsv } from '../plugins/csv.js';
import { SimpleMemoryStorage } from '../cache/simple-memory-storage.js';
import { RequestRunner } from '../runner/request-runner.js';
import { ReckerWebSocket, type WebSocketOptions } from '../websocket/client.js';
import { whois as performWhois, isDomainAvailable, type WhoisOptions, type WhoisResult } from '../utils/whois.js';
import { MemoryCookieJar } from '../cookies/memory-cookie-jar.js';
import { scrape as scrapeHelper, type ScrapePromise } from '../plugins/scrape.js';
import type { ScrapeOptions, ExtractedLink, ExtractedImage, ExtractedMeta, OpenGraphData, TwitterCardData, JsonLdData, ExtractedForm, ExtractedTable, ExtractedScript, ExtractedStyle, ExtractionSchema, LinkExtractionOptions, ImageExtractionOptions } from '../scrape/types.js';
import type { HlsPromise, HlsOptions } from '../plugins/hls.js';

// Extended Cache Config for Client
interface ClientCacheConfig extends Omit<CacheOptions, 'storage'> {
  storage?: CacheStorage;
  driver?: 'memory' | 'file';
  fileStoragePath?: string; // For file driver
}

// Merge into ClientOptions (augmenting the interface from types)
export interface ExtendedClientOptions extends ClientOptions {
  retry?: RetryOptions;
  cache?: ClientCacheConfig;
  dedup?: DedupOptions;
}

function isNodeRuntime(): boolean {
  return typeof globalThis !== 'undefined' && Boolean((globalThis as any).process?.versions?.node);
}

class LazyTransport implements Transport {
  private transport?: Transport;
  private resolving?: Promise<Transport>;
  private dispatchFn: (req: ReckerRequest) => Promise<ReckerResponse>;

  constructor(private factory: () => Promise<Transport>) {
    // Initial dispatch function that resolves the transport
    this.dispatchFn = this.initialDispatch.bind(this);
  }

  private async initialDispatch(req: ReckerRequest): Promise<ReckerResponse> {
    if (!this.transport) {
      if (!this.resolving) {
        this.resolving = this.factory().then((instance) => {
          this.transport = instance;
          // After first resolution, swap to direct dispatch (zero overhead)
          this.dispatchFn = (r: ReckerRequest) => this.transport!.dispatch(r);
          return instance;
        });
      }
      this.transport = await this.resolving;
    }
    return this.transport.dispatch(req);
  }

  dispatch(req: ReckerRequest): Promise<ReckerResponse> {
    return this.dispatchFn(req);
  }

  /**
   * Pre-warm the transport by resolving it before the first request.
   * Optional optimization for applications that want to minimize first-request latency.
   */
  async warmup(): Promise<void> {
    if (!this.transport && !this.resolving) {
      this.resolving = this.factory().then((instance) => {
        this.transport = instance;
        this.dispatchFn = (r: ReckerRequest) => this.transport!.dispatch(r);
        return instance;
      });
    }
    await this.resolving;
  }
}

function createLazyCurlTransport(): Transport {
  if (!isNodeRuntime()) {
    return {
      async dispatch(req: ReckerRequest) {
        throw new ConfigurationError(
          'Curl transport is only available in Node.js environments.',
          { configKey: 'useCurl', request: req }
        );
      }
    };
  }

  return new LazyTransport(async () => {
    const { CurlTransport } = await import('../transport/curl.js');
    return new CurlTransport();
  });
}

class LazyCacheStorage implements CacheStorage {
  private storage?: CacheStorage;
  private resolving?: Promise<CacheStorage>;

  constructor(private factory: () => Promise<CacheStorage>) {}

  private async getStorage(): Promise<CacheStorage> {
    if (!this.storage) {
      if (!this.resolving) {
        this.resolving = this.factory().then((instance) => {
          this.storage = instance;
          return instance;
        });
      }
      this.storage = await this.resolving;
    }
    return this.storage;
  }

  async get(key: string): Promise<CacheEntry | undefined | null> {
    return (await this.getStorage()).get(key);
  }

  async set(key: string, value: CacheEntry, ttl: number): Promise<void> {
    return (await this.getStorage()).set(key, value, ttl);
  }

  async delete(key: string): Promise<void> {
    return (await this.getStorage()).delete(key);
  }
}

function createLazyFileStorage(path?: string): CacheStorage {
  if (!isNodeRuntime()) {
    throw new ConfigurationError(
      'File cache storage is only available in Node.js environments.',
      { configKey: 'cache.driver' }
    );
  }

  return new LazyCacheStorage(async () => {
    const { FileStorage } = await import('../cache/basic-file-storage.js');
    return new FileStorage(path);
  });
}

function createDefaultCacheStorage(): CacheStorage {
  if (!isNodeRuntime()) {
    return new SimpleMemoryStorage();
  }

  return new LazyCacheStorage(async () => {
    const { MemoryStorage } = await import('../cache/memory-storage.js');
    return new MemoryStorage();
  });
}

/**
 * LazyHlsPromise wraps HlsPromise for lazy-loading the HLS module.
 *
 * IMPORTANT: The factory returns { instance: HlsPromise } wrapped in an object
 * to prevent JavaScript from calling HlsPromise.then() during await.
 * HlsPromise implements Promise<void> with a .then() that rejects when awaited
 * directly (without calling .download(), .stream(), etc.), so we need to
 * prevent automatic Promise unwrapping.
 */
class LazyHlsPromise implements Promise<void> {
  private instancePromise: Promise<{ instance: HlsPromise }>;

  constructor(factory: () => Promise<{ instance: HlsPromise }>) {
    this.instancePromise = factory();
  }

  get [Symbol.toStringTag]() {
    return 'HlsPromise';
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.instancePromise.then(({ instance }) => instance.then(onfulfilled, onrejected));
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<void | TResult> {
    return this.then(null, onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<void> {
    return this.instancePromise.then(({ instance }) => instance.finally(onfinally));
  }

  cancel(): void {
    this.instancePromise.then(({ instance }) => instance.cancel()).catch(() => {});
  }

  async download(dest: any): Promise<void> {
    const { instance } = await this.instancePromise;
    return instance.download(dest);
  }

  async *stream(): AsyncGenerator<any> {
    const { instance } = await this.instancePromise;
    yield* instance.stream();
  }

  async pipe(writable: any): Promise<void> {
    const { instance } = await this.instancePromise;
    return instance.pipe(writable);
  }

  async info(): Promise<any> {
    const { instance } = await this.instancePromise;
    return instance.info();
  }
}

export class Client {
  // ============================================================================
  // Static version info
  // ============================================================================

  /**
   * Get the Recker version synchronously (may return '0.0.0' if not yet loaded)
   * For guaranteed accuracy, use Client.getVersion() instead
   */
  static get version(): string {
    return getVersionSync();
  }

  /**
   * Get the Recker version (async, guaranteed accurate)
   */
  static getVersion(): Promise<string> {
    return getVersion();
  }

  /**
   * Get detailed version information
   */
  static getVersionInfo(): Promise<VersionInfo> {
    return getVersionInfo();
  }

  // ============================================================================
  // Instance properties
  // ============================================================================

  private baseUrl: string;
  private middlewares: Middleware[];
  private hooks: Hooks;
  private transport: Transport;
  private curlTransport?: Transport;
  private defaultHeaders: HeadersInit;
  private defaultHeadersObj: Headers; // Pre-computed Headers object for fast path
  private defaultParams: Record<string, string | number>;
  private paginationConfig?: PaginationConfig;
  private handler: (req: ReckerRequest) => Promise<ReckerResponse>;
  private fastHandler: (req: ReckerRequest) => Promise<ReckerResponse>; // Fast path handler (no hooks middleware)
  private logger?: Logger;
  private debugEnabled: boolean;
  private agentManager?: AgentManager;
  private concurrencyConfig: NormalizedConcurrencyConfig;
  private requestPool?: RequestPool;
  private maxResponseSize?: number;
  private cookieJar?: CookieJar;
  private cookieIgnoreInvalid: boolean = false;
  private defaultTimeout?: number | import('../types/index.js').TimeoutOptions;
  private http2Enabled: boolean = false;
  private transportKind: 'curl' | 'undici' | 'fetch' | 'custom' = 'custom';
  private canFastPath: boolean = false; // Pre-computed flag for fast path eligibility

  // AI integration
  private _aiConfig?: PresetAIConfig;
  private _ai?: ClientAI;

  constructor(options: ExtendedClientOptions & Partial<ClientOptionsWithAI> = {}) {
    this.baseUrl = options.baseUrl || '';
    this.middlewares = options.middlewares || [];
    this.defaultTimeout = options.timeout;
    this.hooks = {
      beforeRequest: options.hooks?.beforeRequest || [],
      afterResponse: options.hooks?.afterResponse || [],
      onError: options.hooks?.onError || [],
      onRetry: options.hooks?.onRetry || [],
      onUrlResolved: options.hooks?.onUrlResolved || [],
    };

    // Set default headers with Recker User-Agent
    this.defaultHeaders = {
      'User-Agent': getDefaultUserAgent(),
      ...(options.headers || {})
    };

    // Pre-compute Headers object for fast path (avoid repeated new Headers() calls)
    this.defaultHeadersObj = new Headers(this.defaultHeaders);

    this.defaultParams = options.defaults?.params || {};
    this.paginationConfig = options.pagination;
    this.maxResponseSize = options.maxResponseSize;

    // Debug mode - use provided logger or console as default
    this.debugEnabled = options.debug === true;
    if (this.debugEnabled) {
      this.logger = options.logger ?? consoleLogger;
    } else if (options.logger) {
      // Allow logger without debug mode (silent logger can be passed)
      this.logger = options.logger;
    }

    // ========================================
    // UNIFIED CONCURRENCY CONFIGURATION
    // ========================================
    // Normalize concurrency config from unified API
    this.concurrencyConfig = normalizeConcurrency({
      concurrency: options.concurrency,
      http2: options.http2
    });

    // Expand HTTP/2 options with preset support
    const expandedHttp2 = expandHTTP2Options(options.http2);
    this.http2Enabled = expandedHttp2.enabled ?? false;

    if (options.transport) {
      this.transport = options.transport;
      this.transportKind = 'custom';
    } else if (options.useCurl) {
      if (this.debugEnabled) console.log('[DEBUG] Using Curl Transport');
      this.transport = createLazyCurlTransport();
      this.transportKind = 'curl';
    } else if (isNodeRuntime()) {
      if (this.debugEnabled) console.log('[DEBUG] Using Undici Transport');

      // Create AgentManager with auto-configured options + HTTP/2 settings + protocol cache
      const agentOptions = {
        ...this.concurrencyConfig.agent,
        // Wire HTTP/2 settings from preset/config to agent level
        allowH2: expandedHttp2.enabled,
        maxConcurrentStreams: expandedHttp2.resolvedSettings?.maxConcurrentStreams,
      };

      const transportOptions = {
        proxy: options.proxy,
        http2: expandedHttp2.enabled ? expandedHttp2 : undefined,
        dns: options.dns,
        socketPath: options.socketPath,
        tls: options.tls,
        observability: options.observability,
        expectContinue: options.expectContinue,
        protocolCache: true, // Use global cache for protocol tracking
      };

      this.transport = new LazyTransport(async () => {
        if (!this.agentManager) {
          const protocolCache = getGlobalProtocolCache();
          const { AgentManager } = await import('../utils/agent-manager.js');
          this.agentManager = new AgentManager(agentOptions, protocolCache);
        }
        const { UndiciTransport } = await import('../transport/undici.js');
        // UndiciTransport accepts optional baseUrl - when empty, requests must use absolute URLs
        return new UndiciTransport(this.baseUrl || undefined, {
          ...transportOptions,
          agent: this.agentManager
        });
      });
      this.transportKind = 'undici';
    } else {
      if (this.debugEnabled) console.log('[DEBUG] Using Fetch Transport');
      this.transport = new FetchTransport();
      this.transportKind = 'fetch';
    }

    // 1. Auto-wire plugins based on config
    if (options.retry) {
      retryPlugin(options.retry)(this);
    }

    // ========================================
    // GLOBAL CONCURRENCY & RATE LIMITING
    // ========================================
    // Use RequestPool (unified) instead of old rate-limit plugin
    // IMPORTANT: Only create RequestPool if max is finite (global limit desired)
    // If max is Infinity, no global limit is applied (allows multiple batches in parallel)
    if (this.concurrencyConfig.max < Infinity || this.concurrencyConfig.requestsPerInterval < Infinity) {
      this.requestPool = new RequestPool({
        concurrency: this.concurrencyConfig.max,
        requestsPerInterval: this.concurrencyConfig.requestsPerInterval,
        interval: this.concurrencyConfig.interval
      });
      this.middlewares.unshift(this.requestPool.asMiddleware());

      if (this.debugEnabled && this.logger) {
        this.logger.debug(`Global concurrency limit: ${this.concurrencyConfig.max} concurrent requests`);
      }
    } else {
      if (this.debugEnabled && this.logger) {
        this.logger.debug('No global concurrency limit (allows unlimited parallel batches)');
      }
    }

    if (options.dedup) {
      dedupPlugin(options.dedup)(this);
    }

    if (options.cache) {
      let storage: CacheStorage;
      
      if (options.cache.storage) {
        storage = options.cache.storage;
      } else if (options.cache.driver === 'file') {
        storage = createLazyFileStorage(options.cache.fileStoragePath);
      } else {
        storage = createDefaultCacheStorage();
      }

      cachePlugin({
        ...options.cache,
        storage
      })(this);
    }

    // 2. Manual plugins
    if (options.plugins) {
      options.plugins.forEach((plugin) => plugin(this));
    }

    // 3. Compression (if enabled)
    if (options.compression) {
      const compressionMiddleware = createCompressionMiddleware(options.compression);
      if (compressionMiddleware) {
        this.middlewares.push(compressionMiddleware);
      }
    }

    // 4. XSRF protection (if enabled)
    if (options.xsrf) {
      const xsrfMiddleware = createXSRFMiddleware(options.xsrf);
      if (xsrfMiddleware) {
        this.middlewares.push(xsrfMiddleware);
      }
    }

    // 5. Cookie jar (if enabled)
    if (options.cookies) {
      this.setupCookieJar(options.cookies);
    }

    // 6. AI configuration (from AI presets)
    if (options._aiConfig) {
      this._aiConfig = options._aiConfig;
    }

    // 7. Max response size protection (if enabled)
    if (this.maxResponseSize !== undefined) {
      this.middlewares.push(this.createMaxSizeMiddleware(this.maxResponseSize));
    }

    // 7. Debug logging middleware (if enabled)
    if (this.debugEnabled && this.logger) {
      this.middlewares.unshift(this.createLoggingMiddleware(this.logger));
    }

    // NOTE: httpErrorMiddleware is now inlined in handlers for performance
    // (moved from middleware chain to avoid function call overhead)

    // Pre-compose middleware chains
    this.handler = this.composeMiddlewares();
    this.fastHandler = this.composeFastHandler();

    // Pre-compute fast path eligibility:
    // Fast path is available when there are no middlewares (except internal ones),
    // no hooks, no timeout, no cookie jar, and no max response size
    const hasHooks = (this.hooks.beforeRequest?.length ?? 0) > 0 ||
                     (this.hooks.afterResponse?.length ?? 0) > 0 ||
                     (this.hooks.onError?.length ?? 0) > 0;
    const hasComplexConfig = !!this.cookieJar ||
                             !!this.defaultTimeout ||
                             this.maxResponseSize !== undefined ||
                             this.debugEnabled;
    // middlewares array only has user/plugin middlewares now (no httpErrorMiddleware)
    const hasUserMiddlewares = this.middlewares.length > 0;

    this.canFastPath = !hasHooks && !hasComplexConfig && !hasUserMiddlewares;
  }

  private createLoggingMiddleware(logger: Logger): Middleware {
    return async (req, next) => {
      const startTime = Date.now();

      // Log request
      logger.debug({ type: 'request', method: req.method, url: req.url }, `→ ${req.method} ${req.url}`);

      try {
        const response = await next(req);
        const duration = Date.now() - startTime;

        // Log response
        logger.debug(
          {
            type: 'response',
            method: req.method,
            url: req.url,
            status: response.status,
            duration,
            timings: response.timings,
          },
          `← ${response.status} ${req.method} ${req.url} (${duration}ms)`
        );

        return response;
      } catch (error) {
        const duration = Date.now() - startTime;
        const err = error as Error;

        // Log error
        logger.error(
          {
            type: 'error',
            method: req.method,
            url: req.url,
            error: err.message,
            errorName: err.name,
            duration,
          },
          `✖ ${req.method} ${req.url} - ${err.message}`
        );

        throw error;
      }
    };
  }

  private createMaxSizeMiddleware(globalMaxSize?: number): Middleware {
    return async (req, next) => {
      const response = await next(req);

      const limit = req.maxResponseSize ?? globalMaxSize;
      if (limit === undefined) return response;

      // Check Content-Length header if present
      const contentLength = response.headers.get('Content-Length');
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (!isNaN(size) && size > limit) {
          throw new MaxSizeExceededError(limit, size, req);
        }
      }

      // TODO: For streaming responses without Content-Length,
      // we should wrap the response stream and monitor bytes read.
      // This will be implemented in a future enhancement.

      return response;
    };
  }

  /**
   * Setup cookie jar from options
   */
  private setupCookieJar(options: boolean | CookieOptions): void {
    if (options === true) {
      // Simple boolean - use built-in memory jar
      this.cookieJar = new MemoryCookieJar();
    } else if (typeof options === 'object') {
      if (options.jar === true) {
        this.cookieJar = new MemoryCookieJar();
      } else if (options.jar && typeof options.jar === 'object') {
        this.cookieJar = options.jar;
      }
      this.cookieIgnoreInvalid = options.ignoreInvalid ?? false;
    }

    if (this.cookieJar) {
      this.middlewares.push(this.createCookieMiddleware());
    }
  }

  /**
   * Create cookie middleware that:
   * 1. Injects cookies from jar into request
   * 2. Stores cookies from Set-Cookie headers
   */
  private createCookieMiddleware(): Middleware {
    return async (req, next) => {
      const jar = this.cookieJar!;

      // 1. Get cookies for this URL and add to request
      try {
        const cookieString = await jar.getCookieString(req.url);
        if (cookieString) {
          const existingCookie = req.headers.get('cookie');
          const newCookie = existingCookie
            ? `${existingCookie}; ${cookieString}`
            : cookieString;
          req.headers.set('cookie', newCookie);
        }
      } catch (error) {
        if (!this.cookieIgnoreInvalid) {
          throw error;
        }
      }

      // 2. Make the request
      const response = await next(req);

      // 3. Store cookies from response
      const setCookieHeader = response.headers.get('set-cookie');
      if (setCookieHeader) {
        // Split multiple cookies (handling comma in dates is tricky)
        const cookies = this.splitSetCookieHeader(setCookieHeader);

        for (const cookie of cookies) {
          try {
            await jar.setCookie(cookie, req.url);
          } catch (error) {
            if (!this.cookieIgnoreInvalid) {
              throw error;
            }
          }
        }
      }

      return response;
    };
  }

  /**
   * Split Set-Cookie header into individual cookies
   * Handles the tricky comma-in-date issue
   */
  private splitSetCookieHeader(header: string): string[] {
    // Pattern: split on comma followed by a cookie name=value pattern
    // This avoids splitting on commas inside Expires dates
    return header.split(/,(?=\s*[a-zA-Z0-9_-]+=)/g).map(s => s.trim());
  }

  private async dispatch(req: ReckerRequest): Promise<ReckerResponse> {
    // Check per-request override for Curl
    if (req.useCurl && this.transportKind !== 'curl') {
      if (!this.curlTransport) {
        this.curlTransport = createLazyCurlTransport();
      }
      return this.curlTransport.dispatch(req);
    }
    return this.transport.dispatch(req);
  }

  private composeMiddlewares(): (req: ReckerRequest) => Promise<ReckerResponse> {
    const chain = [...this.middlewares];
    const self = this;

    // Create transport dispatch with inline HTTP error check
    const transportWithErrorCheck = async (req: ReckerRequest): Promise<ReckerResponse> => {
      const response = await self.dispatch(req);
      // Inline HTTP error check (moved from httpErrorMiddleware for performance)
      if (req.throwHttpErrors !== false && !response.ok && response.status !== 304) {
        throw new HttpError(response, req);
      }
      return response;
    };

    // Optimization: Hooks integration with zero overhead if unused
    if (this.hooks.beforeRequest?.length || this.hooks.afterResponse?.length) {
        chain.unshift(this.hooksMiddleware);
    }

    if (chain.length === 0) {
        return transportWithErrorCheck;
    }

    // Composition: reduceRight to build nested functions
    // Last middleware calls transport
    // Previous middleware calls last middleware, etc.
    return chain.reduceRight<(req: ReckerRequest) => Promise<ReckerResponse>>((next, middleware) => {
      return (req) => middleware(req, next);
    }, transportWithErrorCheck) as (req: ReckerRequest) => Promise<ReckerResponse>;
  }

  /**
   * Fast path handler - bypasses all middleware for maximum performance
   * Used when no hooks, middleware, or complex config is present
   */
  private composeFastHandler(): (req: ReckerRequest) => Promise<ReckerResponse> {
    const self = this;
    return async (req: ReckerRequest): Promise<ReckerResponse> => {
      const response = await self.dispatch(req);
      // Inline HTTP error check
      if (req.throwHttpErrors !== false && !response.ok && response.status !== 304) {
        throw new HttpError(response, req);
      }
      return response;
    };
  }

  private hooksMiddleware: Middleware = async (req, next) => {
    let modifiedReq = req;

    // beforeRequest hooks can transform the request
    if (this.hooks.beforeRequest && this.hooks.beforeRequest.length > 0) {
        for (const hook of this.hooks.beforeRequest) {
            const result = await hook(modifiedReq);
            if (result) {
                modifiedReq = result;
            }
        }
    }

    try {
        let response = await next(modifiedReq);

        // afterResponse hooks can transform the response
        if (this.hooks.afterResponse && this.hooks.afterResponse.length > 0) {
            for (const hook of this.hooks.afterResponse) {
                const result = await hook(modifiedReq, response);
                if (result) {
                    response = result;
                }
            }
        }

        return response;
    } catch (error) {
        // onError hooks can provide fallback responses
        if (this.hooks.onError && this.hooks.onError.length > 0) {
            for (const hook of this.hooks.onError) {
                const result = await hook(error as Error, modifiedReq);
                if (result) {
                    // Hook provided a fallback response
                    return result;
                }
            }
        }
        // No fallback provided, rethrow
        throw error;
    }
  }

  // httpErrorMiddleware removed - now inlined in composeMiddlewares() and composeFastHandler()
  // for better performance (avoids function call overhead)

  public use(middleware: Middleware) {
    this.middlewares.push(middleware);
    // Re-compose chain when new middleware is added
    this.handler = this.composeMiddlewares();
    // Disable fast path since we now have user middleware
    this.canFastPath = false;
    return this;
  }

  /**
   * Add a hook that runs before each request
   * Hook can return a modified request or void
   */
  public beforeRequest(hook: (req: ReckerRequest) => ReckerRequest | void | Promise<ReckerRequest | void>) {
    if (!this.hooks.beforeRequest) {
      this.hooks.beforeRequest = [];
    }
    this.hooks.beforeRequest.push(hook);
    // Re-compose chain to include hooks middleware
    this.handler = this.composeMiddlewares();
    // Disable fast path since we now have hooks
    this.canFastPath = false;
    return this;
  }

  /**
   * Add a hook that runs after each successful response
   * Hook can return a modified response or void
   */
  public afterResponse(hook: (req: ReckerRequest, res: ReckerResponse) => ReckerResponse | void | Promise<ReckerResponse | void>) {
    if (!this.hooks.afterResponse) {
      this.hooks.afterResponse = [];
    }
    this.hooks.afterResponse.push(hook);
    // Re-compose chain to include hooks middleware
    this.handler = this.composeMiddlewares();
    // Disable fast path since we now have hooks
    this.canFastPath = false;
    return this;
  }

  /**
   * Add a hook that runs when an error occurs
   * Hook can return a fallback response or void to rethrow
   */
  public onError(hook: (error: Error, req: ReckerRequest) => ReckerResponse | void | Promise<ReckerResponse | void>) {
    if (!this.hooks.onError) {
      this.hooks.onError = [];
    }
    this.hooks.onError.push(hook);
    // Re-compose chain to include hooks middleware
    this.handler = this.composeMiddlewares();
    // Disable fast path since we now have hooks
    this.canFastPath = false;
    return this;
  }

  // Removed per-request runMiddlewares iteration
  // private async runMiddlewares(req: ReckerRequest): Promise<ReckerResponse> { ... }

  private buildUrl(path: string, requestParams?: Record<string, string | number>): string {
    const hasRequestParams = requestParams && Object.keys(requestParams).length > 0;
    const hasDefaultParams = Object.keys(this.defaultParams).length > 0;

    // Fast path: no params, simple concatenation
    if (!hasRequestParams && !hasDefaultParams) {
      // Absolute URL - return as-is
      if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
      }
      // Simple path concatenation (avoid URL object overhead)
      if (this.baseUrl) {
        // Handle trailing/leading slashes
        const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
        const p = path.startsWith('/') ? path : '/' + path;
        return base + p;
      }
      return path;
    }

    let finalPath = path;
    const mergedParams = { ...this.defaultParams, ...requestParams };
    const usedParams = new Set<string>();

    // Only scan for path params if path contains ':'
    if (finalPath.includes(':')) {
      finalPath = finalPath.replace(/:([a-zA-Z0-9_]+)/g, (match, paramName) => {
        if (mergedParams && paramName in mergedParams) {
          usedParams.add(paramName);
          return encodeURIComponent(String(mergedParams[paramName]));
        }
        throw new ValidationError(
          `Missing required path parameter: ${paramName}`,
          {
            field: paramName,
            value: undefined,
          }
        );
      });
    }

    // Build final URL
    let finalUrl: string;
    if (finalPath.startsWith('http://') || finalPath.startsWith('https://')) {
      finalUrl = finalPath;
    } else if (this.baseUrl) {
      const base = this.baseUrl.endsWith('/') ? this.baseUrl.slice(0, -1) : this.baseUrl;
      const p = finalPath.startsWith('/') ? finalPath : '/' + finalPath;
      finalUrl = base + p;
    } else {
      throw new ConfigurationError(
        'Relative path provided without a baseUrl or explicit transport.',
        {
          configKey: 'baseUrl',
        }
      );
    }

    // Append remaining params as query string
    const remainingKeys = Object.keys(mergedParams).filter((k) => !usedParams.has(k));
    if (remainingKeys.length > 0) {
      // Fast path: build query string manually
      const queryParts = remainingKeys.map(key =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(mergedParams[key]))}`
      );
      const separator = finalUrl.includes('?') ? '&' : '?';
      return finalUrl + separator + queryParts.join('&');
    }

    return finalUrl;
  }

  request<T = unknown>(path: string, options: RequestOptions = {}): RequestPromise<T> {
    const url = this.buildUrl(path, options.params);

    // ========================================
    // FAST PATH: Skip all overhead for simple requests
    // ========================================
    // Eligible when: no options.headers, no options.timeout, no options.signal,
    // no options.maxResponseSize, and canFastPath is true
    const usesFastPath = this.canFastPath &&
      !options.headers &&
      !options.timeout &&
      !options.signal &&
      options.maxResponseSize === undefined;

    if (usesFastPath) {
      // Fast path: minimal object creation
      const req = new HttpRequest(url, {
        method: options.method || 'GET',
        body: options.body,
        headers: this.defaultHeadersObj, // Reuse pre-computed Headers object
        throwHttpErrors: options.throwHttpErrors,
      });

      const responsePromise = this.fastHandler(req) as Promise<ReckerResponse<T>>;
      return new RequestPromise<T>(responsePromise);
    }

    // ========================================
    // STANDARD PATH: Full feature support
    // ========================================

    // Optimized: Merge headers efficiently using pre-computed defaultHeadersObj
    let mergedHeaders: Headers;
    if (options.headers) {
      // Clone defaultHeadersObj and merge with options.headers
      mergedHeaders = new Headers(this.defaultHeadersObj);
      const optHeaders = options.headers instanceof Headers
        ? options.headers
        : new Headers(options.headers);
      optHeaders.forEach((value, key) => mergedHeaders.set(key, value));
    } else {
      // Reuse pre-computed Headers object directly (no clone needed if not modified)
      mergedHeaders = this.defaultHeadersObj;
    }

    // Optimized: Lazy AbortController - only create when needed
    const needsController = options.timeout || options.signal || this.defaultTimeout;
    let controller: AbortController | undefined;
    let signal: AbortSignal | undefined = options.signal;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let externalAbortCleanup: (() => void) | undefined;

    if (needsController) {
      controller = new AbortController();
      signal = controller.signal;

      if (options.signal) {
        const externalSignal = options.signal;
        const abortHandler = () => controller!.abort(externalSignal.reason);
        if (externalSignal.aborted) {
          abortHandler();
        } else {
          externalSignal.addEventListener('abort', abortHandler, { once: true });
          externalAbortCleanup = () => externalSignal.removeEventListener('abort', abortHandler);
        }
      }

      // Handle per-phase or total timeout
      const timeout = options.timeout ?? this.defaultTimeout;
      if (timeout) {
        const totalTimeout = typeof timeout === 'number' ? timeout : timeout.request;
        if (totalTimeout) {
          timeoutId = setTimeout(() => controller!.abort(new TimeoutError(
            req,
            {
              phase: 'request',
              timeout: totalTimeout,
            }
          )), totalTimeout);
        }
      }
    }

    const req = new HttpRequest(url, {
      ...options,
      headers: mergedHeaders,
      signal,
      maxResponseSize: options.maxResponseSize ?? this.maxResponseSize
    });

    const responsePromise = this.handler(req) as Promise<ReckerResponse<T>>;

    if (timeoutId || externalAbortCleanup) {
      // Cleanup handlers - use catch to prevent unhandled rejection
      responsePromise.finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
        externalAbortCleanup?.();
      }).catch(() => {
        // Ignore - the actual error will be propagated through RequestPromise
      });
    }

    return new RequestPromise<T>(responsePromise, controller);
  }

  get<T = unknown>(path: string, options: Omit<RequestOptions, 'method'> = {}) {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  /**
   * Pre-warm the HTTP transport to minimize first-request latency.
   *
   * This optional method resolves the lazy-loaded transport (e.g., undici)
   * before the first request, eliminating dynamic import overhead.
   *
   * @example
   * ```typescript
   * const client = createClient({ baseUrl: 'https://api.example.com' });
   * await client.warmup(); // Pre-load transport
   * await client.get('/users'); // First request is now fast
   * ```
   */
  async warmup(): Promise<void> {
    if (this.transport && 'warmup' in this.transport && typeof (this.transport as any).warmup === 'function') {
      await (this.transport as any).warmup();
    }
  }

  /**
   * Run multiple requests with unified concurrency control and smart connection pooling.
   *
   * **Concurrency Layers** (auto-coordinated):
   * 1. **Global RequestPool** - Controls max in-flight requests across ALL operations
   * 2. **Batch RequestRunner** - Controls dispatch rate for this specific batch
   * 3. **AgentManager** - Auto-optimizes TCP connection pooling per domain
   *
   * **How it works:**
   * - Global concurrency (from `client.concurrency`) applies to all requests
   * - Batch-specific concurrency (from `options.concurrency`) overrides for this batch only
   * - Connection pooling is auto-calculated based on concurrency and HTTP version
   * - Per-domain pooling ensures multi-domain batches don't block each other
   *
   * **Simple usage** (recommended):
   * ```typescript
   * const client = new Client({
   *   baseUrl: 'https://api.example.com',
   *   concurrency: 20  // Auto-configures everything
   * });
   *
   * await client.batch(requests);  // Uses global concurrency (20)
   * await client.batch(requests, { concurrency: 50 });  // Override to 50 for this batch
   * ```
   *
   * **Advanced usage:**
   * ```typescript
   * const client = new Client({
   *   concurrency: {
   *     max: 20,
   *     requestsPerInterval: 100,
   *     interval: 1000,
   *     agent: {
   *       connections: 'auto',  // Auto = 10 (max/2)
   *       perDomainPooling: true
   *     }
   *   }
   * });
   *
   * const { results } = await client.batch(
   *   requests,
   *   {
   *     concurrency: 50,  // Override for large batch
   *     mapResponse: (res) => res.json()
   *   }
   * );
   * ```
   */
  async batch<T = ReckerResponse>(
    requests: Array<{ path: string; options?: RequestOptions }>,
    options: { concurrency?: number; mapResponse?: (res: ReckerResponse) => Promise<T> | T } = {}
  ): Promise<{ results: (T | Error)[]; stats: { total: number; successful: number; failed: number; duration: number } }> {
    const mapResponse = options.mapResponse ?? ((res: ReckerResponse) => res as unknown as T);

    // Determine batch concurrency (options > config > unlimited)
    const batchConcurrency = options.concurrency ?? this.concurrencyConfig.runner.concurrency;

    // Use RequestRunner for local batch dispatch control
    // This works in coordination with:
    // - RequestPool middleware (global concurrency limit)
    // - AgentManager (connection pooling, auto-configured in constructor)
    const runner = new RequestRunner({
      concurrency: batchConcurrency,
      retries: this.concurrencyConfig.runner.retries,
      retryDelay: this.concurrencyConfig.runner.retryDelay
    });

    const runnerResult = await runner.run(requests, async (item) => {
      const res = await this.request(item.path, item.options);
      return mapResponse(res);
    });

    return runnerResult;
  }

  /**
   * Alias for batch with the same semantics.
   * If rateLimit middleware is configured, it has priority over local concurrency.
   */
  multi<T = ReckerResponse>(
    requests: Array<{ path: string; options?: RequestOptions }>,
    options: { concurrency?: number; mapResponse?: (res: ReckerResponse) => Promise<T> | T } = {}
  ) {
    return this.batch<T>(requests, options);
  }

  /**
   * Private helper to handle requests with body (POST, PUT, PATCH)
   * Processes body and sets appropriate Content-Type header
   * Priority: form > json > xml > body
   */
  private requestWithBody<T>(
    method: 'POST' | 'PUT' | 'PATCH' | 'PROPFIND' | 'PROPPATCH' | 'LOCK' | 'LINK' | 'UNLINK',
    path: string,
    bodyOrOptions?: any,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ) {
    let actualBody = bodyOrOptions;
    let actualOptions = options;

    // Check if options is effectively empty (undefined or no keys)
    // This is necessary because post/put/patch methods default options to {}
    const isOptionsEmpty = actualOptions === undefined || 
      (typeof actualOptions === 'object' && actualOptions !== null && Object.keys(actualOptions).length === 0);

    // Overload: post(url, options) handling
    // If options is undefined, and bodyOrOptions looks like options
    if (isOptionsEmpty && isPlainObject(bodyOrOptions)) {
      const potentialOptions = bodyOrOptions as any;
      // Heuristic to detect if it's options
      if (
        potentialOptions.json !== undefined ||
        potentialOptions.form !== undefined ||
        potentialOptions.xml !== undefined ||
        potentialOptions.yaml !== undefined ||
        potentialOptions.csv !== undefined ||
        potentialOptions.body !== undefined ||
        potentialOptions.headers !== undefined ||
        potentialOptions.timeout !== undefined ||
        potentialOptions.retry !== undefined ||
        potentialOptions.hooks !== undefined ||
        potentialOptions.searchParams !== undefined ||
        potentialOptions.params !== undefined
      ) {
        actualOptions = bodyOrOptions;
        actualBody = undefined;
      }
    }

    // Ensure actualOptions is at least an empty object if undefined
    actualOptions = actualOptions || {};

    // Extract json, form, and xml from options to prevent them from being passed to request()
    const { json, form, xml, yaml, csv, ...restOptions } = actualOptions as any;

    let finalBody = actualBody;
    let explicitContentType: string | undefined;

    // Priority 1: form option (multipart/form-data)
    if (form !== undefined) {
      finalBody = createFormData(form);
      // Don't set Content-Type - let FormData set boundary
      explicitContentType = undefined;
    }
    // Priority 2: json option (application/json)
    else if (json !== undefined) {
      finalBody = JSON.stringify(json);
      explicitContentType = 'application/json';
    }
    // Priority 3: xml option (application/xml)
    else if (xml !== undefined) {
      finalBody = '<?xml version="1.0" encoding="UTF-8"?>\n' + serializeXML(xml);
      explicitContentType = 'application/xml';
    }
    // Priority 4: yaml option (application/yaml) - RFC 9512
    else if (yaml !== undefined) {
      finalBody = serializeYaml(yaml);
      explicitContentType = 'application/yaml';
    }
    // Priority 5: csv option (text/csv) - RFC 4180
    else if (csv !== undefined) {
      finalBody = serializeCsv(csv);
      explicitContentType = 'text/csv';
    }
    // Priority 6: explicit body in options
    else if (restOptions.body !== undefined) {
      finalBody = restOptions.body;
    }
    // Priority 5: existing body parameter (already in finalBody)

    const { body: processedBody, contentType } = processBody(finalBody);
    const headers = new Headers(restOptions.headers);

    // Use explicit content type from json/form options, or auto-detected from processBody
    const finalContentType = explicitContentType ?? contentType;

    // Only set Content-Type if not already set and we have a contentType
    if (finalContentType && !headers.has('Content-Type')) {
      headers.set('Content-Type', finalContentType);
    }

    return this.request<T>(path, { ...restOptions, method, body: processedBody, headers });
  }

  post<T = unknown>(path: string, body?: any, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.requestWithBody<T>('POST', path, body, options);
  }

  put<T = unknown>(path: string, body?: any, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.requestWithBody<T>('PUT', path, body, options);
  }

  patch<T = unknown>(path: string, body?: any, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.requestWithBody<T>('PATCH', path, body, options);
  }

  delete<T = unknown>(path: string, options: Omit<RequestOptions, 'method'> = {}) {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  head<T = unknown>(path: string, options: Omit<RequestOptions, 'method'> = {}) {
    return this.request<T>(path, { ...options, method: 'HEAD' });
  }

  options<T = unknown>(path: string, options: Omit<RequestOptions, 'method'> = {}) {
    return this.request<T>(path, { ...options, method: 'OPTIONS' });
  }

  /**
   * TRACE request - Echo back the request for diagnostic purposes
   * Useful for debugging and testing proxies
   */
  trace<T = unknown>(path: string, options: Omit<RequestOptions, 'method'> = {}) {
    return this.request<T>(path, { ...options, method: 'TRACE' });
  }

  /**
   * CONNECT request - Establish a tunnel to the server
   * Primarily used for HTTPS proxying
   */
  connect<T = unknown>(path: string, options: Omit<RequestOptions, 'method'> = {}) {
    return this.request<T>(path, { ...options, method: 'CONNECT' });
  }

  /**
   * PURGE request - Invalidate cached content
   * Used by CDNs and caching servers (Varnish, Cloudflare, Fastly)
   *
   * @example
   * ```typescript
   * // Purge cached resource from CDN
   * await client.purge('/assets/style.css');
   * ```
   */
  purge<T = unknown>(path: string, options: Omit<RequestOptions, 'method'> = {}) {
    return this.request<T>(path, { ...options, method: 'PURGE' });
  }

  // WebDAV Methods

  /**
   * PROPFIND request - Retrieve properties of a resource (WebDAV)
   *
   * @example
   * ```typescript
   * const props = await client.propfind('/folder').json();
   * ```
   */
  propfind<T = unknown>(path: string, body?: any, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.requestWithBody<T>('PROPFIND', path, body, options);
  }

  /**
   * PROPPATCH request - Modify properties of a resource (WebDAV)
   */
  proppatch<T = unknown>(path: string, body?: any, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.requestWithBody<T>('PROPPATCH', path, body, options);
  }

  /**
   * MKCOL request - Create a collection/directory (WebDAV)
   *
   * @example
   * ```typescript
   * await client.mkcol('/new-folder');
   * ```
   */
  mkcol<T = unknown>(path: string, options: Omit<RequestOptions, 'method'> = {}) {
    return this.request<T>(path, { ...options, method: 'MKCOL' });
  }

  /**
   * COPY request - Copy a resource to a new location (WebDAV)
   *
   * @example
   * ```typescript
   * await client.copy('/file.txt', {
   *   headers: { 'Destination': '/backup/file.txt' }
   * });
   * ```
   */
  copy<T = unknown>(path: string, options: Omit<RequestOptions, 'method'> = {}) {
    return this.request<T>(path, { ...options, method: 'COPY' });
  }

  /**
   * MOVE request - Move a resource to a new location (WebDAV)
   *
   * @example
   * ```typescript
   * await client.move('/old-path/file.txt', {
   *   headers: { 'Destination': '/new-path/file.txt' }
   * });
   * ```
   */
  move<T = unknown>(path: string, options: Omit<RequestOptions, 'method'> = {}) {
    return this.request<T>(path, { ...options, method: 'MOVE' });
  }

  /**
   * LOCK request - Lock a resource (WebDAV)
   * Prevents other clients from modifying the resource
   */
  lock<T = unknown>(path: string, body?: any, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.requestWithBody<T>('LOCK', path, body, options);
  }

  /**
   * UNLOCK request - Unlock a resource (WebDAV)
   * Removes the lock and allows modifications
   */
  unlock<T = unknown>(path: string, options: Omit<RequestOptions, 'method'> = {}) {
    return this.request<T>(path, { ...options, method: 'UNLOCK' });
  }

  /**
   * LINK request - Establish relationships between resources
   * Part of HTTP Link extension
   */
  link<T = unknown>(path: string, body?: any, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.requestWithBody<T>('LINK', path, body, options);
  }

  /**
   * UNLINK request - Remove relationships between resources
   * Part of HTTP Link extension
   */
  unlink<T = unknown>(path: string, body?: any, options: Omit<RequestOptions, 'method' | 'body'> = {}) {
    return this.requestWithBody<T>('UNLINK', path, body, options);
  }

  // ============================================
  // Scraping Methods
  // ============================================

  /**
   * Scrape a URL and return a ScrapePromise with extraction methods
   *
   * @example
   * ```typescript
   * // Get full ScrapeDocument for complex scraping
   * const doc = await client.scrape('/page').scrape();
   * const title = doc.select('h1').text();
   * const items = doc.selectAll('.product').map(el => ({
   *   name: el.find('.name').text(),
   *   price: el.find('.price').text()
   * }));
   *
   * // Quick extraction
   * const links = await client.scrape('/page').links({ absolute: true });
   * const meta = await client.scrape('/page').meta();
   * const og = await client.scrape('/page').openGraph();
   *
   * // Declarative extraction
   * const data = await client.scrape('/product').extract({
   *   title: 'h1',
   *   price: { selector: '.price', transform: v => parseFloat(v.replace('$', '')) },
   *   images: { selector: 'img', attribute: 'src', multiple: true }
   * });
   *
   * // With different HTTP method
   * const doc = await client.scrape('/search', {
   *   method: 'POST',
   *   body: { query: 'test' }
   * }).scrape();
   * ```
   */
  scrape(path: string, options: RequestOptions = {}): ScrapePromise<ReckerResponse> {
    const method = options.method || 'GET';
    const requestPromise = this.request(path, { ...options, method });
    return scrapeHelper(requestPromise);
  }

  paginate<T>(path: string, options: RequestOptions & PaginationOptions<T> = {}): AsyncGenerator<T> {
    // Split request options from pagination options
    const { getItems, getNextUrl, maxPages, pageParam, limitParam, resultsPath, nextCursorPath, ...reqOptions } = options;
    
    // Merge global pagination config
    const paginationOpts: PaginationOptions<T> = { 
        getItems, 
        getNextUrl, 
        maxPages,
        pageParam: pageParam || this.paginationConfig?.pageParam,
        limitParam: limitParam || this.paginationConfig?.limitParam,
        resultsPath: resultsPath || this.paginationConfig?.resultsPath,
        nextCursorPath: nextCursorPath || this.paginationConfig?.nextCursorPath,
    };
    
    return paginate<T>(this, path, reqOptions, paginationOpts);
  }

  /**
   * Iterate over pages (full responses), allowing access to metadata.
   */
  pages<T = any>(path: string, options: RequestOptions & PaginationOptions = {}): AsyncGenerator<PageResult<T>> {
      const { getNextUrl, maxPages, pageParam, limitParam, resultsPath, nextCursorPath, ...reqOptions } = options;
      
      const paginationOpts: PaginationOptions = {
          getNextUrl,
          maxPages,
          pageParam: pageParam || this.paginationConfig?.pageParam,
          limitParam: limitParam || this.paginationConfig?.limitParam,
          nextCursorPath: nextCursorPath || this.paginationConfig?.nextCursorPath,
      };

      return streamPages<T>(this, path, reqOptions, paginationOpts);
  }

  /**
   * Fetch a specific page directly.
   */
  page<T = any>(path: string, pageNumber: number, options: RequestOptions & { pageParam?: string } = {}): RequestPromise<T> {
      const pageParam = options.pageParam || this.paginationConfig?.pageParam || 'page';
      const url = new URL(path.startsWith('http') ? path : `http://base${path}`);
      
      // Handle relative path reconstruction correctly if needed, but simple approach:
      // We inject the param into the options.params or the url string.
      // Let's use options.params merging.
      
      const params = { ...options.params, [pageParam]: pageNumber };
      
      return this.request<T>(path, { ...options, params });
  }

  async getAll<T>(path: string, options: RequestOptions & PaginationOptions<T> = {}): Promise<T[]> {
    const items: T[] = [];
    // We use the item-based paginate for getAll as it already handles extraction logic
    for await (const item of this.paginate<T>(path, options)) {
      items.push(item);
    }
    return items;
  }

  /**
   * Create a WebSocket connection
   *
   * @example
   * ```typescript
   * const ws = client.websocket('/chat');
   *
   * // Event-based
   * ws.on('message', (msg) => console.log(msg.data));
   * ws.on('close', () => console.log('Disconnected'));
   * ws.send('Hello!');
   *
   * // Or use async iterator
   * for await (const message of ws) {
   *   console.log(message.data);
   * }
   * ```
   */
  websocket(path: string, options: WebSocketOptions = {}): ReckerWebSocket {
    // Convert HTTP(S) URL to WS(S)
    let wsUrl: string;
    if (path.startsWith('ws://') || path.startsWith('wss://')) {
      wsUrl = path;
    } else if (this.baseUrl) {
      const base = this.baseUrl.replace(/^http/, 'ws');
      wsUrl = new URL(path, base).toString();
    } else {
      throw new ConfigurationError(
        'WebSocket requires either a full ws:// URL or a baseUrl',
        {
          configKey: 'baseUrl',
        }
      );
    }

    // Merge default headers if any
    const headersObj: Record<string, string> = {};

    // Convert HeadersInit to Record<string, string>
    if (this.defaultHeaders) {
      const headers = new Headers(this.defaultHeaders);
      headers.forEach((value, key) => {
        headersObj[key] = value;
      });
    }

    // Merge with options headers
    const finalHeaders = { ...headersObj, ...options.headers };

    return new ReckerWebSocket(wsUrl, { ...options, headers: finalHeaders });
  }

  /**
   * Alias for websocket()
   */
  ws(path: string, options: WebSocketOptions = {}): ReckerWebSocket {
    return this.websocket(path, options);
  }

  /**
   * Perform WHOIS lookup for a domain or IP address
   *
   * @example
   * ```typescript
   * const result = await client.whois('example.com');
   * console.log(result.data);
   * console.log(result.raw);
   *
   * // Check domain availability
   * const available = await client.isDomainAvailable('example.com');
   * ```
   */
  async whois(query: string, options?: WhoisOptions): Promise<WhoisResult> {
    return performWhois(query, options);
  }

  /**
   * Check if a domain is available (not registered)
   *
   * @example
   * ```typescript
   * if (await client.isDomainAvailable('my-startup.com')) {
   *   console.log('Domain is available!');
   * }
   * ```
   */
  async isDomainAvailable(domain: string, options?: WhoisOptions): Promise<boolean> {
    return isDomainAvailable(domain, options);
  }

  // ============================================
  // HLS Streaming
  // ============================================

  /**
   * Download HLS (HTTP Live Streaming) content
   *
   * @example
   * ```typescript
   * // Simple VOD download
   * await client.hls('https://example.com/video.m3u8').download('./video.ts');
   *
   * // Live stream recording for 2 minutes
   * await client.hls('https://example.com/live.m3u8', {
   *   live: { duration: 120_000 }
   * }).download('./recording.ts');
   *
   * // Download as separate chunks
   * await client.hls(url, { mode: 'chunks' })
   *   .download((seg) => `./segments/part-${seg.sequence}.ts`);
   *
   * // Stream segments for custom processing
   * for await (const segment of client.hls(url).stream()) {
   *   console.log(`Segment ${segment.sequence}: ${segment.data.byteLength} bytes`);
   *   await uploadToS3(segment.data);
   * }
   *
   * // Get playlist info without downloading
   * const info = await client.hls(url).info();
   * console.log(`Is live: ${info.isLive}`);
   * console.log(`Duration: ${info.totalDuration}s`);
   *
   * // Select quality
   * await client.hls(url, { quality: 'highest' }).download('./hd.ts');
   * await client.hls(url, { quality: '720p' }).download('./720p.ts');
   * await client.hls(url, { quality: { bandwidth: 2000000 } }).download('./2mbps.ts');
   * ```
   */
  hls(manifestUrl: string, options: HlsOptions = {}): HlsPromise {
    if (!isNodeRuntime()) {
      throw new UnsupportedError(
        'HLS is only available in Node.js environments.',
        { feature: 'hls' }
      );
    }

    const factory = async () => {
      const { HlsPromise } = await import('../plugins/hls.js');
      // Wrap in object to prevent await from calling HlsPromise.then()
      return { instance: new HlsPromise(this, manifestUrl, options) };
    };

    return new LazyHlsPromise(factory) as unknown as HlsPromise;
  }

  // ============================================
  // Smithy HttpHandler Interface (AWS SDK v3)
  // ============================================

  /**
   * Protocol metadata for Smithy HttpHandler interface.
   * Used by AWS SDK v3 to identify the handler protocol.
   *
   * Always returns 'http/1.1' to ensure AWS SDK signs the 'host' header
   * instead of HTTP/2 pseudo-header ':authority'. This is critical because
   * we filter out HTTP/2 pseudo-headers before sending, which would cause
   * signature mismatch if ':authority' was included in the signature.
   */
  get metadata(): { handlerProtocol: string } {
    return { handlerProtocol: 'http/1.1' };
  }

  /**
   * Handle method for Smithy HttpHandler interface compatibility.
   * Allows Recker Client to be used directly as AWS SDK v3 requestHandler.
   *
   * @example
   * ```typescript
   * import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
   * import { createClient } from 'recker';
   *
   * const s3 = new S3Client({
   *   region: 'us-east-1',
   *   requestHandler: createClient({ http2: true })
   * });
   *
   * await s3.send(new PutObjectCommand({
   *   Bucket: 'my-bucket',
   *   Key: 'file.txt',
   *   Body: 'Hello!'
   * }));
   * ```
   */
  async handle(
    request: {
      protocol?: string;
      hostname: string;
      port?: number;
      path?: string;
      query?: Record<string, string | string[] | null | undefined>;
      method?: string;
      headers?: Record<string, string | string[]>;
      body?: unknown;
    },
    options?: { abortSignal?: AbortSignal; requestTimeout?: number }
  ): Promise<{
    response: {
      statusCode: number;
      reason?: string;
      headers: Record<string, string>;
      body?: import('stream').Readable;
    };
  }> {
    // Build URL from Smithy request parts
    const protocol = request.protocol || 'https:';
    const hostname = request.hostname;
    const port = request.port;
    const path = request.path || '/';

    let url = `${protocol}//${hostname}`;
    if (port && !((protocol === 'https:' && port === 443) || (protocol === 'http:' && port === 80))) {
      url += `:${port}`;
    }
    url += path;

    // Build query string
    if (request.query) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(request.query)) {
        if (value === null || value === undefined) continue;
        if (Array.isArray(value)) {
          for (const v of value) {
            searchParams.append(key, v);
          }
        } else {
          searchParams.set(key, value);
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }

    // Normalize headers (array values → comma-joined string)
    // Filter out HTTP/2 pseudo-headers (start with ':') as they are not valid for fetch API
    const headers: Record<string, string> = {};
    if (request.headers) {
      for (const [key, value] of Object.entries(request.headers)) {
        if (value === undefined) continue;
        if (key.startsWith(':')) continue; // Skip HTTP/2 pseudo-headers like :authority, :method, :path
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }

    // Make request using Recker's internal machinery
    // AWS SDK expects the handler to return the response even for error status codes
    // so it can parse the XML body and extract the proper error code (e.g., NoSuchKey)
    const response = await this.request(url, {
      method: (request.method || 'GET') as RequestOptions['method'],
      headers,
      body: request.body as RequestOptions['body'],
      signal: options?.abortSignal,
      timeout: options?.requestTimeout,
      throwHttpErrors: false,
    });

    // Convert response headers to Record<string, string>
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // Convert body to Node.js Readable stream if present
    let body: import('stream').Readable | undefined;
    if (response.raw.body) {
      const { Readable } = await import('stream');
      body = Readable.fromWeb(response.raw.body as Parameters<typeof Readable.fromWeb>[0]);
    }

    return {
      response: {
        statusCode: response.status,
        reason: response.statusText,
        headers: responseHeaders,
        body,
      },
    };
  }

  /**
   * Update HTTP client configuration (Smithy HttpHandler interface).
   * @internal
   */
  updateHttpClientConfig(_key: string, _value: unknown): void {
    // Configuration is immutable after creation
    // This method exists for interface compatibility
  }

  /**
   * Get HTTP client configuration (Smithy HttpHandler interface).
   * @internal
   */
  httpHandlerConfigs(): Record<string, unknown> {
    return {
      http2: this.http2Enabled,
      maxSockets: this.concurrencyConfig.agent.connections,
      keepAlive: true,
    };
  }

  /**
   * Clean up resources (agents, connection pools).
   * Call this when you're done using the client to free up resources.
   *
   * @example
   * ```typescript
   * const client = createClient({ http2: true });
   * // ... use client ...
   * await client.destroy();
   * ```
   */
  async destroy(): Promise<void> {
    if (this.agentManager) {
      await this.agentManager.destroy();
    }
    // RequestPool queue will be garbage collected
    this.requestPool = undefined;
  }

  // ============================================
  // AI Integration
  // ============================================

  /**
   * Access AI features for this client.
   * Only available when using AI-enabled presets (@openai, @anthropic, etc.)
   *
   * @example
   * ```typescript
   * const client = createClient(openai({ apiKey: '...' }));
   *
   * // Chat with memory (remembers last 12 exchanges)
   * await client.ai.chat('Hello!');
   * await client.ai.chat('What did I just say?'); // Remembers context
   *
   * // Single prompt without memory
   * const response = await client.ai.prompt('Translate "hello" to Spanish');
   *
   * // Streaming
   * for await (const event of await client.ai.chatStream('Write a poem')) {
   *   if (event.type === 'text') process.stdout.write(event.content);
   * }
   *
   * // Memory management
   * client.ai.clearMemory();
   * client.ai.setMemoryConfig({ maxPairs: 20 });
   * ```
   *
   * @throws {ConfigurationError} If client was not created with an AI preset
   */
  get ai(): ClientAI {
    if (!this._ai) {
      if (!this._aiConfig) {
        throw new ConfigurationError(
          'AI features require an AI-enabled preset. Use createClient(openai({...})), createClient(anthropic({...})), etc.',
          { configKey: '_aiConfig' }
        );
      }
      // Lazy initialization
      this._ai = new ClientAIImpl(this, this._aiConfig);
    }
    return this._ai!;
  }

  /**
   * Check if AI features are available for this client
   */
  get hasAI(): boolean {
    return this._aiConfig !== undefined;
  }
}

export function createClient(options: ExtendedClientOptions = {}) {
  return new Client(options);
}
