import { ClientOptions, Middleware, NextFunction, ReckerRequest, ReckerResponse, RequestOptions, Transport, CacheStorage, Hooks, PaginationConfig, HTTP2Options, PageResult } from '../types/index.js';
import { HttpRequest } from './request.js';
import { HttpResponse } from './response.js';
import { UndiciTransport } from '../transport/undici.js';
import { RequestPromise } from './request-promise.js';
import { HttpError } from '../core/errors.js';
import { Logger, getLogger } from '../utils/logger.js';
import { processBody, createFormData, createMultipart } from '../utils/body.js';
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
import { MemoryStorage } from '../cache/memory-storage.js';
import { FileStorage } from '../cache/file-storage.js';
import { RequestRunner } from '../runner/request-runner.js';
import { ReckerWebSocket, type WebSocketOptions } from '../websocket/client.js';
import { whois as performWhois, isDomainAvailable, type WhoisOptions, type WhoisResult } from '../utils/whois.js';

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

    // Debug mode
    this.debugEnabled = options.debug === true;
    if (this.debugEnabled) {
      this.logger = getLogger();
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
        agent: this.agentManager
      });
    } else {
      throw new Error('baseUrl is required for default UndiciTransport, or provide a custom transport.');
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

      if (this.debugEnabled) {
        console.log(`[Recker] Global concurrency limit: ${this.concurrencyConfig.max} concurrent requests`);
      }
    } else {
      if (this.debugEnabled) {
        console.log('[Recker] No global concurrency limit (allows unlimited parallel batches)');
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

    // 5. Debug logging middleware (if enabled)
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

      logger.logRequest(req);

      try {
        const response = await next(req);
        logger.logResponse(req, response, startTime);
        return response;
      } catch (error) {
        logger.logError(req, error as Error);
        throw error;
      }
    };
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
    if (req.throwHttpErrors !== false && !response.ok) {
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

    if (!hasRequestParams && !hasDefaultParams) {
      if (this.baseUrl && !path.startsWith('http')) {
        return new URL(path, this.baseUrl).toString();
      }
      return path;
    }

    let finalPath = path;
    const mergedParams = { ...this.defaultParams, ...requestParams };
    const usedParams = new Set<string>();

    if (finalPath.includes(':')) {
      finalPath = finalPath.replace(/:([a-zA-Z0-9_]+)/g, (match, paramName) => {
        if (mergedParams && paramName in mergedParams) {
          usedParams.add(paramName);
          return String(mergedParams[paramName]);
        }
        throw new Error(`Missing required path parameter: ${paramName}`);
      });
    }

    let finalUrl = finalPath;
    if (this.baseUrl && !finalPath.startsWith('http://') && !finalPath.startsWith('https://')) {
      finalUrl = new URL(finalPath, this.baseUrl).toString();
    } else if (!this.baseUrl && !finalPath.startsWith('http://') && !finalPath.startsWith('https://')) {
      throw new Error('Relative path provided without a baseUrl or explicit transport.');
    }

    const remainingKeys = Object.keys(mergedParams).filter((k) => !usedParams.has(k));
    if (remainingKeys.length > 0) {
      const urlObj = new URL(finalUrl);
      remainingKeys.forEach((key) => {
        urlObj.searchParams.append(key, String(mergedParams[key]));
      });
      return urlObj.toString();
    }

    return finalUrl;
  }

  request<T = unknown>(path: string, options: RequestOptions = {}): RequestPromise<T> {
    const url = this.buildUrl(path, options.params);

    let mergedHeaders = this.defaultHeaders;
    if (options.headers) {
      mergedHeaders = new Headers(this.defaultHeaders);
      new Headers(options.headers).forEach((value, key) => (mergedHeaders as Headers).append(key, value));
    } else if (!(mergedHeaders instanceof Headers)) {
      mergedHeaders = new Headers(mergedHeaders);
    }

    const controller = new AbortController();
    let signal = controller.signal;
    let timeoutId: NodeJS.Timeout | undefined;
    let externalAbortCleanup: (() => void) | undefined;

    if (options.signal) {
      const externalSignal = options.signal;
      const abortHandler = () => controller.abort(externalSignal.reason);
      if (externalSignal.aborted) {
        abortHandler();
      } else {
        externalSignal.addEventListener('abort', abortHandler, { once: true });
        externalAbortCleanup = () => externalSignal.removeEventListener('abort', abortHandler);
      }
    }

    if (options.timeout) {
      timeoutId = setTimeout(() => controller.abort(new Error('Request timed out')), options.timeout);
    }

    const req = new HttpRequest(url, {
      ...options,
      headers: mergedHeaders,
      signal,
    });

    const responsePromise = this.handler(req) as Promise<ReckerResponse<T>>;

    if (timeoutId || externalAbortCleanup) {
      responsePromise.finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
        externalAbortCleanup?.();
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
   */
  private requestWithBody<T>(
    method: 'POST' | 'PUT' | 'PATCH' | 'PROPFIND' | 'PROPPATCH' | 'LOCK' | 'LINK' | 'UNLINK',
    path: string,
    body?: any,
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ) {
    const { body: processedBody, contentType } = processBody(body);
    const headers = new Headers(options.headers);

    // Only set Content-Type if not already set and we have a contentType
    if (contentType && !headers.has('Content-Type')) {
      headers.set('Content-Type', contentType);
    }

    return this.request<T>(path, { ...options, method, body: processedBody, headers });
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
      throw new Error('WebSocket requires either a full ws:// URL or a baseUrl');
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
