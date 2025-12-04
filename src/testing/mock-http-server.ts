/**
 * Mock HTTP Server
 *
 * A lightweight HTTP server for testing HTTP clients.
 * Supports routing, delays, streaming, error simulation, and more.
 *
 * @example
 * ```typescript
 * import { MockHttpServer } from 'recker/testing';
 *
 * const server = await MockHttpServer.create();
 *
 * // Define routes
 * server.get('/users', { status: 200, body: [{ id: 1, name: 'John' }] });
 * server.post('/users', (req) => ({ status: 201, body: { id: 2, ...req.body } }));
 *
 * // With delay
 * server.get('/slow', { status: 200, body: 'slow response', delay: 1000 });
 *
 * // Error simulation
 * server.get('/error', { status: 500, body: { error: 'Internal error' } });
 *
 * // Use with fetch/recker
 * const response = await fetch(`${server.url}/users`);
 *
 * await server.stop();
 * ```
 */

import { EventEmitter } from 'node:events';
import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'node:http';

// ============================================
// Types
// ============================================

export interface MockHttpServerOptions {
  /**
   * Port to listen on (0 = random available port)
   * @default 0
   */
  port?: number;

  /**
   * Host to bind to
   * @default '127.0.0.1'
   */
  host?: string;

  /**
   * Default response for unmatched routes
   */
  defaultResponse?: MockHttpResponse;

  /**
   * Global delay for all responses (ms)
   * @default 0
   */
  delay?: number;

  /**
   * Enable CORS
   * @default true
   */
  cors?: boolean;

  /**
   * CORS origin
   * @default '*'
   */
  corsOrigin?: string;
}

export interface MockHttpResponse {
  /**
   * HTTP status code
   * @default 200
   */
  status?: number;

  /**
   * Response body (object will be JSON serialized)
   */
  body?: any;

  /**
   * Response headers
   */
  headers?: Record<string, string>;

  /**
   * Delay before responding (ms)
   */
  delay?: number;

  /**
   * Simulate connection drop
   */
  drop?: boolean;

  /**
   * Stream response in chunks
   */
  stream?: {
    chunks: (string | Buffer)[];
    interval: number;
  };
}

export interface MockHttpRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  body: any;
  raw: IncomingMessage;
}

export type MockHttpHandler = (req: MockHttpRequest) => MockHttpResponse | Promise<MockHttpResponse>;

interface Route {
  method: string;
  pattern: RegExp;
  pathPattern: string;
  handler: MockHttpResponse | MockHttpHandler;
  times?: number;
  callCount: number;
}

export interface MockHttpStats {
  totalRequests: number;
  requestsByMethod: Record<string, number>;
  requestsByPath: Record<string, number>;
  requestLog: Array<{
    method: string;
    path: string;
    status: number;
    timestamp: number;
    duration: number;
  }>;
}

// ============================================
// MockHttpServer
// ============================================

export class MockHttpServer extends EventEmitter {
  private options: Required<MockHttpServerOptions>;
  private httpServer: HttpServer | null = null;
  private routes: Route[] = [];
  private _port = 0;
  private _started = false;
  private stats: MockHttpStats = {
    totalRequests: 0,
    requestsByMethod: {},
    requestsByPath: {},
    requestLog: [],
  };

  constructor(options: MockHttpServerOptions = {}) {
    super();
    this.options = {
      port: 0,
      host: '127.0.0.1',
      defaultResponse: { status: 404, body: { error: 'Not Found' } },
      delay: 0,
      cors: true,
      corsOrigin: '*',
      ...options,
    };
  }

  // ============================================
  // Properties
  // ============================================

  get port(): number {
    return this._port;
  }

  get address(): string {
    return this.options.host;
  }

  get url(): string {
    return `http://${this.options.host}:${this._port}`;
  }

  get isRunning(): boolean {
    return this._started;
  }

  get statistics(): MockHttpStats {
    return { ...this.stats };
  }

  get routeCount(): number {
    return this.routes.length;
  }

  // ============================================
  // Lifecycle
  // ============================================

  async start(): Promise<void> {
    if (this._started) {
      throw new Error('Server already started');
    }

    return new Promise((resolve, reject) => {
      this.httpServer = createServer((req, res) => this.handleRequest(req, res));

      this.httpServer.on('error', reject);

      this.httpServer.listen(this.options.port, this.options.host, () => {
        const addr = this.httpServer!.address();
        this._port = typeof addr === 'string' ? 0 : addr?.port ?? 0;
        this._started = true;
        this.emit('listening', this._port);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this._started) return;

    return new Promise((resolve) => {
      this.httpServer?.close(() => {
        this._started = false;
        this.httpServer = null;
        this.emit('close');
        resolve();
      });
    });
  }

  reset(): void {
    this.routes = [];
    this.stats = {
      totalRequests: 0,
      requestsByMethod: {},
      requestsByPath: {},
      requestLog: [],
    };
    this.emit('reset');
  }

  // ============================================
  // Route Definition
  // ============================================

  /**
   * Add a route with any method
   */
  route(
    method: string,
    path: string,
    handler: MockHttpResponse | MockHttpHandler,
    options: { times?: number } = {}
  ): this {
    const pattern = this.pathToRegex(path);

    this.routes.push({
      method: method.toUpperCase(),
      pattern,
      pathPattern: path,
      handler,
      times: options.times,
      callCount: 0,
    });

    return this;
  }

  /**
   * GET route
   */
  get(path: string, handler: MockHttpResponse | MockHttpHandler, options?: { times?: number }): this {
    return this.route('GET', path, handler, options);
  }

  /**
   * POST route
   */
  post(path: string, handler: MockHttpResponse | MockHttpHandler, options?: { times?: number }): this {
    return this.route('POST', path, handler, options);
  }

  /**
   * PUT route
   */
  put(path: string, handler: MockHttpResponse | MockHttpHandler, options?: { times?: number }): this {
    return this.route('PUT', path, handler, options);
  }

  /**
   * PATCH route
   */
  patch(path: string, handler: MockHttpResponse | MockHttpHandler, options?: { times?: number }): this {
    return this.route('PATCH', path, handler, options);
  }

  /**
   * DELETE route
   */
  delete(path: string, handler: MockHttpResponse | MockHttpHandler, options?: { times?: number }): this {
    return this.route('DELETE', path, handler, options);
  }

  /**
   * HEAD route
   */
  head(path: string, handler: MockHttpResponse | MockHttpHandler, options?: { times?: number }): this {
    return this.route('HEAD', path, handler, options);
  }

  /**
   * OPTIONS route
   */
  optionsRoute(path: string, handler: MockHttpResponse | MockHttpHandler, options?: { times?: number }): this {
    return this.route('OPTIONS', path, handler, options);
  }

  /**
   * Match any method
   */
  any(path: string, handler: MockHttpResponse | MockHttpHandler, options?: { times?: number }): this {
    return this.route('*', path, handler, options);
  }

  /**
   * Remove a route
   */
  removeRoute(method: string, path: string): boolean {
    const index = this.routes.findIndex(
      (r) => r.method === method.toUpperCase() && r.pathPattern === path
    );

    if (index >= 0) {
      this.routes.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear all routes
   */
  clearRoutes(): void {
    this.routes = [];
  }

  // ============================================
  // Request Handling
  // ============================================

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startTime = Date.now();
    const method = req.method?.toUpperCase() ?? 'GET';
    const urlParts = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const path = urlParts.pathname;
    const query = Object.fromEntries(urlParts.searchParams);

    // Update stats
    this.stats.totalRequests++;
    this.stats.requestsByMethod[method] = (this.stats.requestsByMethod[method] ?? 0) + 1;
    this.stats.requestsByPath[path] = (this.stats.requestsByPath[path] ?? 0) + 1;

    // Handle CORS preflight
    if (this.options.cors && method === 'OPTIONS') {
      this.sendCorsHeaders(res);
      res.writeHead(204);
      res.end();
      return;
    }

    // Parse body
    const body = await this.parseBody(req);

    // Build request object
    const mockReq: MockHttpRequest = {
      method,
      path,
      query,
      headers: req.headers as Record<string, string | string[] | undefined>,
      body,
      raw: req,
    };

    this.emit('request', mockReq);

    // Find matching route
    const route = this.findRoute(method, path);
    let response: MockHttpResponse;

    if (route) {
      route.callCount++;

      // Check if route has exceeded its times limit
      if (route.times !== undefined && route.callCount > route.times) {
        response = this.options.defaultResponse;
      } else {
        response = typeof route.handler === 'function'
          ? await route.handler(mockReq)
          : route.handler;
      }
    } else {
      response = this.options.defaultResponse;
    }

    // Send response
    await this.sendResponse(res, response);

    // Log request
    const duration = Date.now() - startTime;
    this.stats.requestLog.push({
      method,
      path,
      status: response.status ?? 200,
      timestamp: startTime,
      duration,
    });

    this.emit('response', mockReq, response, duration);
  }

  private findRoute(method: string, path: string): Route | undefined {
    // Try exact method match first
    for (const route of this.routes) {
      if ((route.method === method || route.method === '*') && route.pattern.test(path)) {
        return route;
      }
    }
    return undefined;
  }

  private async sendResponse(res: ServerResponse, response: MockHttpResponse): Promise<void> {
    // Handle connection drop
    if (response.drop) {
      res.destroy();
      return;
    }

    // Apply delay
    const delay = response.delay ?? this.options.delay;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    // Set CORS headers
    if (this.options.cors) {
      this.sendCorsHeaders(res);
    }

    // Set status and headers
    const status = response.status ?? 200;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...response.headers,
    };

    // Handle streaming
    if (response.stream) {
      res.writeHead(status, headers);

      for (const chunk of response.stream.chunks) {
        res.write(chunk);
        await new Promise((resolve) => setTimeout(resolve, response.stream!.interval));
      }

      res.end();
      return;
    }

    // Regular response
    let body: string | Buffer = '';

    if (response.body !== undefined) {
      if (typeof response.body === 'string' || Buffer.isBuffer(response.body)) {
        body = response.body;
        if (typeof response.body === 'string' && !headers['Content-Type'].includes('json')) {
          headers['Content-Type'] = 'text/plain';
        }
      } else {
        body = JSON.stringify(response.body);
      }
    }

    headers['Content-Length'] = String(Buffer.byteLength(body));

    res.writeHead(status, headers);
    res.end(body);
  }

  private sendCorsHeaders(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', this.options.corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  private async parseBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];

      req.on('data', (chunk) => chunks.push(chunk));

      req.on('end', () => {
        if (chunks.length === 0) {
          resolve(undefined);
          return;
        }

        const raw = Buffer.concat(chunks).toString('utf-8');
        const contentType = req.headers['content-type'] ?? '';

        if (contentType.includes('application/json')) {
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve(raw);
          }
        } else {
          resolve(raw);
        }
      });

      req.on('error', () => resolve(undefined));
    });
  }

  private pathToRegex(path: string): RegExp {
    // Convert path params like :id to regex groups
    // First escape special regex chars in the path (except : for params)
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Then replace :param patterns with capture groups
    const withParams = escaped.replace(/:(\w+)/g, '([^/]+)');

    return new RegExp(`^${withParams}$`);
  }

  // ============================================
  // Utilities
  // ============================================

  /**
   * Wait for a specific number of requests
   */
  async waitForRequests(count: number, timeout = 5000): Promise<void> {
    const start = Date.now();

    while (this.stats.totalRequests < count) {
      if (Date.now() - start > timeout) {
        throw new Error(`Timeout waiting for ${count} requests (have ${this.stats.totalRequests})`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Get call count for a specific route
   */
  getCallCount(method: string, path: string): number {
    const route = this.routes.find(
      (r) => r.method === method.toUpperCase() && r.pathPattern === path
    );
    return route?.callCount ?? 0;
  }

  // ============================================
  // Static factory
  // ============================================

  static async create(options: MockHttpServerOptions = {}): Promise<MockHttpServer> {
    const server = new MockHttpServer(options);
    await server.start();
    return server;
  }
}

// ============================================
// Helper functions
// ============================================

/**
 * Create a simple mock HTTP server
 */
export async function createMockHttpServer(
  routes?: Record<string, MockHttpResponse>,
  options?: MockHttpServerOptions
): Promise<MockHttpServer> {
  const server = new MockHttpServer(options);

  if (routes) {
    for (const [key, response] of Object.entries(routes)) {
      const [method, path] = key.includes(' ') ? key.split(' ') : ['GET', key];
      server.route(method, path, response);
    }
  }

  await server.start();
  return server;
}
