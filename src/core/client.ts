import { ClientOptions, Middleware, NextFunction, ReckerRequest, ReckerResponse, RequestOptions, Transport, CacheStorage, Hooks, PaginationConfig, HTTP2Options, PageResult, CookieJar, CookieOptions, Logger, consoleLogger } from '../types/index.js';
import { HttpRequest } from './request.js';
import { HttpResponse } from './response.js';
import { UndiciTransport } from '../transport/undici.js';
import { RequestPromise } from './request-promise.js';
import { HttpError, MaxSizeExceededError, ReckerError } from '../core/errors.js';
import { processBody, createFormData, createMultipart, isPlainObject } from '../utils/body.js';
import { AgentManager } from '../utils/agent-manager.js';
import { RequestPool } from '../utils/request-pool.js';
import { normalizeConcurrency, createBatchConfig, type NormalizedConcurrencyConfig } from '../utils/concurrency.js';
import { getDefaultUserAgent } from '../utils/user-agent.js';

// Plugins and Storage for auto-wiring
import { paginate, PaginationOptions, streamPages } from '../plugins/pagination.js';
import { retry, RetryOptions } from '../plugins/retry.js';
import { cache, CacheOptions } from '../plugins/cache.js';
import { dedup, DedupOptions } from '../plugins/dedup.js';
import { createXSRFMiddleware, XSRFPluginOptions } from '../plugins/xsrf.js';
import { createCompressionMiddleware } from '../plugins/compression.js';
import { serializeXML } from '../plugins/xml.js';
import { MemoryStorage } from '../cache/memory-storage.js';
import { FileStorage } from '../cache/file-storage.js';
import { RequestRunner } from '../runner/request-runner.js';
import { ReckerWebSocket, type WebSocketOptions } from '../websocket/client.js';
import { whois as performWhois, isDomainAvailable, type WhoisOptions, type WhoisResult } from '../utils/whois.js';
import { MemoryCookieJar } from '../cookies/memory-cookie-jar.js';
import { scrape as scrapeHelper, type ScrapePromise } from '../plugins/scrape.js';
import type { ScrapeOptions, ExtractedLink, ExtractedImage, ExtractedMeta, OpenGraphData, TwitterCardData, JsonLdData, ExtractedForm, ExtractedTable, ExtractedScript, ExtractedStyle, ExtractionSchema, LinkExtractionOptions, ImageExtractionOptions } from '../scrape/types.js';

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

export class Client {
  private baseUrl: string;
  private middlewares: Middleware[];
  private hooks: Hooks;
  private transport: Transport;
  private defaultHeaders: HeadersInit;
  private defaultParams: Record<string, string | number>;
  private paginationConfig?: PaginationConfig;
  private handler: (req: ReckerRequest) => Promise<ReckerResponse>;
  private logger?: Logger;
  private debugEnabled: boolean;
  private agentManager?: AgentManager;
  private concurrencyConfig: NormalizedConcurrencyConfig;
  private requestPool?: RequestPool;
  private maxResponseSize?: number;
  private cookieJar?: CookieJar;
  private cookieIgnoreInvalid: boolean = false;
  
  constructor(options: ExtendedClientOptions = {}) {
    this.baseUrl = options.baseUrl || '';
    this.middlewares = options.middlewares || [];
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

    if (options.transport) {
      this.transport = options.transport;
    } else if (this.baseUrl) {
      // Parse HTTP/2 options
      let http2Options: HTTP2Options | undefined;
      if (options.http2) {
        if (typeof options.http2 === 'boolean') {
          http2Options = { enabled: options.http2 };
        } else {
          http2Options = options.http2;
        }
      }

      // Create AgentManager with auto-configured options
      this.agentManager = new AgentManager(this.concurrencyConfig.agent);

      this.transport = new UndiciTransport(this.baseUrl, {
        proxy: options.proxy,
        http2: http2Options,
        dns: options.dns,
        agent: this.agentManager,
        socketPath: options.socketPath,
        tls: options.tls,
        observability: options.observability
      });
    } else {
      throw new ReckerError(
        'baseUrl is required for default UndiciTransport, or provide a custom transport.',
        undefined,
        undefined,
        [
          'Set baseUrl when using the built-in Undici transport.',
          'Pass an absolute URL to each request.',
          'Provide a custom transport if you need to handle relative paths differently.'
        ]
      );
    }

    // 1. Auto-wire plugins based on config
    if (options.retry) {
      retry(options.retry)(this);
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
      dedup(options.dedup)(this);
    }

    if (options.cache) {
      let storage: CacheStorage;
      
      if (options.cache.storage) {
        storage = options.cache.storage;
      } else if (options.cache.driver === 'file') {
        storage = new FileStorage(options.cache.fileStoragePath);
      } else {
        storage = new MemoryStorage();
      }

      cache({
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

    // 6. Max response size protection (if enabled)
    if (this.maxResponseSize !== undefined) {
      this.middlewares.push(this.createMaxSizeMiddleware(this.maxResponseSize));
    }

    // 7. Debug logging middleware (if enabled)
    if (this.debugEnabled && this.logger) {
      this.middlewares.unshift(this.createLoggingMiddleware(this.logger));
    }

    // Add internal error handling middleware at the end of the stack (before transport)
    this.middlewares.push(this.httpErrorMiddleware);

    // Pre-compose middleware chain
    this.handler = this.composeMiddlewares();
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

  private composeMiddlewares(): (req: ReckerRequest) => Promise<ReckerResponse> {
    const chain = [...this.middlewares];
    const transportDispatch = this.transport.dispatch.bind(this.transport);

    // Optimization: Hooks integration with zero overhead if unused
    if (this.hooks.beforeRequest?.length || this.hooks.afterResponse?.length) {
        chain.unshift(this.hooksMiddleware);
    }

    if (chain.length === 0) {
        return transportDispatch;
    }

    // Composition: reduceRight to build nested functions
    // Last middleware calls transport
    // Previous middleware calls last middleware, etc.
    return chain.reduceRight<(req: ReckerRequest) => Promise<ReckerResponse>>((next, middleware) => {
      return (req) => middleware(req, next);
    }, transportDispatch as any) as (req: ReckerRequest) => Promise<ReckerResponse>;
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

  private httpErrorMiddleware: Middleware = async (req, next) => {
    const response = await next(req);
    // Conditional logic: only check if throwHttpErrors is true (default)
    // Also, 304 Not Modified is NOT an error, even if response.ok is false, if throwHttpErrors is false
    if (req.throwHttpErrors !== false && !response.ok && response.status !== 304) {
      throw new HttpError(response, req);
    }
    return response;
  }

  public use(middleware: Middleware) {
    this.middlewares.push(middleware);
    // Re-compose chain when new middleware is added
    this.handler = this.composeMiddlewares();
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
        throw new ReckerError(
          `Missing required path parameter: ${paramName}`,
          undefined,
          undefined,
          [
            `Provide '${paramName}' in request params or defaults.`,
            'Ensure the path template matches the provided params.',
            'If optional, remove the placeholder from the path.'
          ]
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
      throw new ReckerError(
        'Relative path provided without a baseUrl or explicit transport.',
        undefined,
        undefined,
        [
          'Set baseUrl when creating the client.',
          'Use an absolute URL in request().',
          'Provide a custom transport that resolves relative paths.'
        ]
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

    // Optimized: Merge headers efficiently
    let mergedHeaders: Headers;
    if (options.headers) {
      // Only create Headers when we need to merge
      mergedHeaders = this.defaultHeaders instanceof Headers
        ? new Headers(this.defaultHeaders)
        : new Headers(this.defaultHeaders);
      const optHeaders = options.headers instanceof Headers
        ? options.headers
        : new Headers(options.headers);
      optHeaders.forEach((value, key) => mergedHeaders.append(key, value));
    } else {
      // Reuse existing Headers if already created
      mergedHeaders = this.defaultHeaders instanceof Headers
        ? this.defaultHeaders
        : new Headers(this.defaultHeaders);
    }

    // Optimized: Lazy AbortController - only create when needed
    const needsController = options.timeout || options.signal;
    let controller: AbortController | undefined;
    let signal: AbortSignal | undefined = options.signal;
    let timeoutId: NodeJS.Timeout | undefined;
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
      const timeout = options.timeout;
      if (timeout) {
        const totalTimeout = typeof timeout === 'number' ? timeout : timeout.request;
        if (totalTimeout) {
          timeoutId = setTimeout(() => controller!.abort(new ReckerError(
            'Request timed out (total timeout reached)',
            req,
            undefined,
            [
              'Increase the timeout value for long-running requests.',
              'Check upstream performance or network latency.',
              'Use per-phase timeouts to pinpoint where the delay occurs.'
            ]
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
    const { json, form, xml, ...restOptions } = actualOptions as any;

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
    // Priority 4: explicit body in options
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
      throw new ReckerError(
        'WebSocket requires either a full ws:// URL or a baseUrl',
        undefined,
        undefined,
        [
          'Pass a full ws:// or wss:// URL to websocket().',
          'Configure baseUrl so relative websocket paths can be resolved.',
          'Ensure the baseUrl uses http/https so it can be converted to ws/wss.'
        ]
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
}

export function createClient(options: ExtendedClientOptions = {}) {
  return new Client(options);
}
