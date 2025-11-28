/**
 * HTTP/2 Server Push Plugin
 * Handles HTTP/2 server push streams and push promise events
 *
 * Note: HTTP/2 Server Push is being deprecated by major browsers (Chrome removed it in 2022)
 * but is still useful for server-to-server communication and specific use cases.
 */

import type { Client } from '../core/client.js';
import type { Middleware, RequestOptions } from '../types/index.js';
import * as http2 from 'node:http2';
import { EventEmitter } from 'node:events';

export interface PushPromise {
  /** The path being pushed */
  path: string;
  /** HTTP method (usually GET) */
  method: string;
  /** Request headers from push promise */
  headers: Record<string, string | string[]>;
  /** The authority (host) */
  authority: string;
  /** Scheme (https) */
  scheme: string;
}

export interface PushedResource {
  /** Push promise information */
  promise: PushPromise;
  /** Response status code */
  status: number;
  /** Response headers */
  headers: Record<string, string | string[]>;
  /** Response body as Buffer */
  body: Buffer;
  /** When the push was received */
  receivedAt: Date;
}

export interface Http2PushOptions {
  /** Enable push handling (default: true) */
  enabled?: boolean;
  /** Maximum concurrent push streams (default: 100) */
  maxConcurrentPushes?: number;
  /** Timeout for push streams in ms (default: 30000) */
  pushTimeout?: number;
  /** Cache pushed resources (default: true) */
  cachePushes?: boolean;
  /** Maximum cache size (default: 100 entries) */
  maxCacheSize?: number;
  /** TTL for cached pushes in ms (default: 60000) */
  cacheTtl?: number;
  /** Filter function to accept/reject pushes */
  filter?: (promise: PushPromise) => boolean;
  /** Callback when push is received */
  onPush?: (resource: PushedResource) => void;
}

interface CacheEntry {
  resource: PushedResource;
  expiresAt: number;
}

/**
 * HTTP/2 Push Stream Manager
 *
 * Manages HTTP/2 server push streams, caching pushed resources,
 * and providing them to subsequent requests.
 *
 * @example
 * ```typescript
 * const pushManager = new Http2PushManager({
 *   cachePushes: true,
 *   onPush: (resource) => {
 *     console.log(`Received push for: ${resource.promise.path}`);
 *   }
 * });
 *
 * // Connect to HTTP/2 server
 * await pushManager.connect('https://example.com');
 *
 * // Make request - pushed resources will be cached
 * const response = await pushManager.request('/');
 *
 * // Get cached push
 * const pushed = pushManager.getCachedPush('/style.css');
 * ```
 */
export class Http2PushManager extends EventEmitter {
  private options: Required<Http2PushOptions>;
  private sessions: Map<string, http2.ClientHttp2Session> = new Map();
  private pushCache: Map<string, CacheEntry> = new Map();
  private pendingPushes: Map<string, Promise<PushedResource>> = new Map();

  constructor(options: Http2PushOptions = {}) {
    super();
    this.options = {
      enabled: options.enabled ?? true,
      maxConcurrentPushes: options.maxConcurrentPushes ?? 100,
      pushTimeout: options.pushTimeout ?? 30000,
      cachePushes: options.cachePushes ?? true,
      maxCacheSize: options.maxCacheSize ?? 100,
      cacheTtl: options.cacheTtl ?? 60000,
      filter: options.filter ?? (() => true),
      onPush: options.onPush ?? (() => {}),
    };
  }

  /**
   * Connect to an HTTP/2 server
   */
  async connect(url: string): Promise<http2.ClientHttp2Session> {
    const parsedUrl = new URL(url);
    const origin = parsedUrl.origin;

    // Return existing session if available
    const existingSession = this.sessions.get(origin);
    if (existingSession && !existingSession.closed && !existingSession.destroyed) {
      return existingSession;
    }

    return new Promise((resolve, reject) => {
      const session = http2.connect(origin, {
        settings: {
          enablePush: this.options.enabled,
          maxConcurrentStreams: this.options.maxConcurrentPushes,
        },
      });

      session.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      session.on('connect', () => {
        this.sessions.set(origin, session);
        this.setupPushHandling(session, origin);
        resolve(session);
      });

      session.on('close', () => {
        this.sessions.delete(origin);
        this.emit('sessionClosed', origin);
      });
    });
  }

  /**
   * Make an HTTP/2 request
   */
  async request(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: Buffer | string;
    } = {}
  ): Promise<{ status: number; headers: Record<string, string | string[]>; body: Buffer }> {
    const parsedUrl = new URL(url);
    const origin = parsedUrl.origin;
    const path = parsedUrl.pathname + parsedUrl.search;

    // Check cache first
    const cached = this.getCachedPush(url);
    if (cached) {
      this.emit('cacheHit', url, cached);
      return {
        status: cached.status,
        headers: cached.headers,
        body: cached.body,
      };
    }

    const session = await this.connect(origin);

    return new Promise((resolve, reject) => {
      const reqHeaders: http2.OutgoingHttpHeaders = {
        ':method': options.method ?? 'GET',
        ':path': path,
        ':scheme': parsedUrl.protocol.replace(':', ''),
        ':authority': parsedUrl.host,
        ...options.headers,
      };

      const stream = session.request(reqHeaders);
      const chunks: Buffer[] = [];
      let responseHeaders: Record<string, string | string[]> = {};
      let status = 0;

      stream.on('response', (headers) => {
        status = headers[':status'] as number;
        responseHeaders = { ...headers } as Record<string, string | string[]>;
        delete responseHeaders[':status'];
      });

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        resolve({
          status,
          headers: responseHeaders,
          body: Buffer.concat(chunks),
        });
      });

      stream.on('error', reject);

      if (options.body) {
        stream.write(options.body);
      }
      stream.end();
    });
  }

  /**
   * Get cached pushed resource
   */
  getCachedPush(url: string): PushedResource | null {
    const cacheKey = this.getCacheKey(url);
    const entry = this.pushCache.get(cacheKey);

    if (!entry) return null;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.pushCache.delete(cacheKey);
      return null;
    }

    return entry.resource;
  }

  /**
   * Wait for a specific push promise
   */
  async waitForPush(url: string, timeout?: number): Promise<PushedResource | null> {
    const cacheKey = this.getCacheKey(url);

    // Check cache first
    const cached = this.getCachedPush(url);
    if (cached) return cached;

    // Check pending
    const pending = this.pendingPushes.get(cacheKey);
    if (pending) return pending;

    // Wait for push
    return new Promise((resolve) => {
      const timeoutMs = timeout ?? this.options.pushTimeout;
      const timer = setTimeout(() => {
        this.removeListener('push', handler);
        resolve(null);
      }, timeoutMs);

      const handler = (resource: PushedResource) => {
        const resourceKey = this.getCacheKey(
          `${resource.promise.scheme}://${resource.promise.authority}${resource.promise.path}`
        );
        if (resourceKey === cacheKey) {
          clearTimeout(timer);
          this.removeListener('push', handler);
          resolve(resource);
        }
      };

      this.on('push', handler);
    });
  }

  /**
   * Get all cached push entries
   */
  getCachedPushes(): Map<string, PushedResource> {
    const result = new Map<string, PushedResource>();
    const now = Date.now();

    for (const [key, entry] of this.pushCache.entries()) {
      if (now <= entry.expiresAt) {
        result.set(key, entry.resource);
      }
    }

    return result;
  }

  /**
   * Clear push cache
   */
  clearCache(): void {
    this.pushCache.clear();
  }

  /**
   * Close all sessions
   */
  async close(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    for (const session of this.sessions.values()) {
      closePromises.push(
        new Promise((resolve) => {
          session.close(() => resolve());
        })
      );
    }

    await Promise.all(closePromises);
    this.sessions.clear();
  }

  /**
   * Get session for origin
   */
  getSession(origin: string): http2.ClientHttp2Session | undefined {
    return this.sessions.get(origin);
  }

  private setupPushHandling(session: http2.ClientHttp2Session, origin: string): void {
    session.on('stream', (pushedStream, requestHeaders) => {
      const promise: PushPromise = {
        path: requestHeaders[':path'] as string,
        method: (requestHeaders[':method'] as string) ?? 'GET',
        authority: (requestHeaders[':authority'] as string) ?? new URL(origin).host,
        scheme: (requestHeaders[':scheme'] as string) ?? 'https',
        headers: { ...requestHeaders } as Record<string, string | string[]>,
      };

      // Apply filter
      if (!this.options.filter(promise)) {
        pushedStream.close(http2.constants.NGHTTP2_CANCEL);
        this.emit('pushRejected', promise);
        return;
      }

      this.emit('pushPromise', promise);

      const cacheKey = this.getCacheKey(`${promise.scheme}://${promise.authority}${promise.path}`);

      // Create pending promise
      const pushPromise = this.handlePushStream(pushedStream, promise);
      this.pendingPushes.set(cacheKey, pushPromise);

      pushPromise
        .then((resource) => {
          this.pendingPushes.delete(cacheKey);

          // Cache if enabled
          if (this.options.cachePushes) {
            this.cacheResource(cacheKey, resource);
          }

          this.options.onPush(resource);
          this.emit('push', resource);
        })
        .catch((err) => {
          this.pendingPushes.delete(cacheKey);
          this.emit('pushError', err, promise);
        });
    });
  }

  private handlePushStream(
    stream: http2.ClientHttp2Stream,
    promise: PushPromise
  ): Promise<PushedResource> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let responseHeaders: Record<string, string | string[]> = {};
      let status = 0;

      const timeout = setTimeout(() => {
        stream.close(http2.constants.NGHTTP2_CANCEL);
        reject(new Error(`Push stream timeout for ${promise.path}`));
      }, this.options.pushTimeout);

      stream.on('response', (headers) => {
        status = headers[':status'] as number;
        responseHeaders = { ...headers } as Record<string, string | string[]>;
        delete responseHeaders[':status'];
      });

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        clearTimeout(timeout);
        resolve({
          promise,
          status,
          headers: responseHeaders,
          body: Buffer.concat(chunks),
          receivedAt: new Date(),
        });
      });

      stream.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  private cacheResource(key: string, resource: PushedResource): void {
    // Enforce max cache size
    if (this.pushCache.size >= this.options.maxCacheSize) {
      // Remove oldest entry
      const oldestKey = this.pushCache.keys().next().value;
      if (oldestKey) {
        this.pushCache.delete(oldestKey);
      }
    }

    this.pushCache.set(key, {
      resource,
      expiresAt: Date.now() + this.options.cacheTtl,
    });
  }

  private getCacheKey(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}${parsed.search}`;
    } catch {
      return url;
    }
  }
}

/**
 * HTTP/2 Server Push plugin for Recker client
 *
 * @example
 * ```typescript
 * const pushManager = new Http2PushManager({
 *   onPush: (resource) => console.log(`Push: ${resource.promise.path}`)
 * });
 *
 * const client = createClient({
 *   baseUrl: 'https://example.com',
 *   plugins: [http2Push({ manager: pushManager })]
 * });
 *
 * // Requests will use cached pushes when available
 * const response = await client.get('/page');
 *
 * // Access push manager
 * const pushed = client.getPushManager().getCachedPush('/style.css');
 * ```
 */
export function http2Push(options: { manager: Http2PushManager }): (client: Client) => void {
  const { manager } = options;

  const middleware: Middleware = async (req, next) => {
    // Check if we have a cached push for this URL
    const cached = manager.getCachedPush(req.url);
    if (cached && req.method === 'GET') {
      // Return cached push as response
      const headers = new Headers();
      for (const [key, value] of Object.entries(cached.headers)) {
        if (!key.startsWith(':')) {
          headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        }
      }
      headers.set('X-Push-Cache', 'hit');

      const response = new Response(new Uint8Array(cached.body), {
        status: cached.status,
        headers,
      });

      // Import HttpResponse dynamically to avoid circular deps
      const { HttpResponse } = await import('../core/response.js');
      return new HttpResponse(response);
    }

    // Continue with normal request
    return next(req);
  };

  return (client: Client) => {
    client.use(middleware);

    // Add push manager accessor
    (client as Client & { getPushManager: () => Http2PushManager }).getPushManager = () => manager;
  };
}

// Type augmentation for Client
declare module '../core/client.js' {
  interface Client {
    getPushManager(): Http2PushManager;
  }
}

export { http2 };
