/**
 * Mock SSE Server
 *
 * Simulates a Server-Sent Events server for testing SSE clients.
 * Supports event types, IDs, retry hints, and multi-client broadcasting.
 *
 * @example
 * ```typescript
 * import { MockSSEServer } from 'recker/testing';
 *
 * const server = await MockSSEServer.create({ port: 8080 });
 *
 * // Send events to all clients
 * server.sendEvent({ data: 'Hello!' });
 * server.sendEvent({ event: 'update', data: JSON.stringify({ value: 42 }) });
 *
 * // Send event with ID for reconnection support
 * server.sendEvent({ id: '123', event: 'message', data: 'Important!' });
 *
 * // Schedule periodic events
 * server.startPeriodicEvents('heartbeat', 1000);
 *
 * // Get the URL for clients
 * const url = server.url;  // http://127.0.0.1:PORT/events
 *
 * await server.stop();
 * ```
 */

import { EventEmitter } from 'node:events';
import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from 'node:http';

// ============================================
// Types
// ============================================

export interface MockSSEServerOptions {
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
   * Path for SSE endpoint
   * @default '/events'
   */
  path?: string;

  /**
   * Retry interval hint for clients (ms)
   * @default 3000
   */
  retryInterval?: number;

  /**
   * Send retry hint on connection
   * @default true
   */
  sendRetry?: boolean;

  /**
   * Maximum connections allowed (0 = unlimited)
   * @default 0
   */
  maxConnections?: number;

  /**
   * Keep-alive interval (ms, 0 = disabled)
   * @default 15000
   */
  keepAliveInterval?: number;

  /**
   * Cors origin header
   * @default '*'
   */
  corsOrigin?: string;
}

export interface SSEEvent {
  /**
   * Event type
   */
  event?: string;

  /**
   * Event data (will be split on newlines)
   */
  data: string;

  /**
   * Event ID for reconnection
   */
  id?: string;

  /**
   * Retry interval hint (overrides server default)
   */
  retry?: number;
}

export interface MockSSEClient {
  id: string;
  response: ServerResponse;
  connectedAt: number;
  lastEventId?: string;
  eventsSent: number;
  metadata: Record<string, any>;
}

export interface MockSSEStats {
  totalConnections: number;
  currentConnections: number;
  totalEventsSent: number;
  eventLog: Array<{ event: SSEEvent; timestamp: number; clientCount: number }>;
}

// ============================================
// MockSSEServer
// ============================================

export class MockSSEServer extends EventEmitter {
  private options: Required<MockSSEServerOptions>;
  private httpServer: HttpServer | null = null;
  private clients: Map<string, MockSSEClient> = new Map();
  private _port = 0;
  private _started = false;
  private clientIdCounter = 0;
  private periodicIntervals: Map<string, NodeJS.Timeout> = new Map();
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private eventIdCounter = 0;
  private stats: MockSSEStats = {
    totalConnections: 0,
    currentConnections: 0,
    totalEventsSent: 0,
    eventLog: [],
  };

  constructor(options: MockSSEServerOptions = {}) {
    super();
    this.options = {
      port: 0,
      host: '127.0.0.1',
      path: '/events',
      retryInterval: 3000,
      sendRetry: true,
      maxConnections: 0,
      keepAliveInterval: 15000,
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
    return `http://${this.options.host}:${this._port}${this.options.path}`;
  }

  get isRunning(): boolean {
    return this._started;
  }

  get connectionCount(): number {
    return this.clients.size;
  }

  get statistics(): MockSSEStats {
    return { ...this.stats };
  }

  get allClients(): MockSSEClient[] {
    return [...this.clients.values()];
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

        // Start keep-alive
        if (this.options.keepAliveInterval > 0) {
          this.keepAliveInterval = setInterval(() => {
            this.sendComment('keep-alive');
          }, this.options.keepAliveInterval);
        }

        this.emit('listening', this._port);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this._started) return;

    // Clear all intervals
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }

    for (const interval of this.periodicIntervals.values()) {
      clearInterval(interval);
    }
    this.periodicIntervals.clear();

    // Close all client connections
    for (const client of this.clients.values()) {
      client.response.end();
    }
    this.clients.clear();

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
    this.stats = {
      totalConnections: 0,
      currentConnections: 0,
      totalEventsSent: 0,
      eventLog: [],
    };
    this.eventIdCounter = 0;

    for (const interval of this.periodicIntervals.values()) {
      clearInterval(interval);
    }
    this.periodicIntervals.clear();

    this.emit('reset');
  }

  // ============================================
  // Event Sending
  // ============================================

  /**
   * Send an event to all connected clients
   */
  sendEvent(event: SSEEvent): number {
    let sent = 0;
    const formatted = this.formatEvent(event);

    for (const client of this.clients.values()) {
      if (this.writeToClient(client, formatted)) {
        client.eventsSent++;
        sent++;
      }
    }

    this.stats.totalEventsSent += sent;
    this.stats.eventLog.push({
      event,
      timestamp: Date.now(),
      clientCount: sent,
    });

    this.emit('event', event, sent);
    return sent;
  }

  /**
   * Send an event to a specific client
   */
  sendEventTo(clientId: string, event: SSEEvent): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    const formatted = this.formatEvent(event);
    if (this.writeToClient(client, formatted)) {
      client.eventsSent++;
      this.stats.totalEventsSent++;
      return true;
    }
    return false;
  }

  /**
   * Send a simple data event
   */
  sendData(data: string, event?: string): number {
    return this.sendEvent({ data, event });
  }

  /**
   * Send a JSON event
   */
  sendJSON(data: any, event?: string): number {
    return this.sendEvent({ data: JSON.stringify(data), event });
  }

  /**
   * Send a comment (not visible to EventSource, but keeps connection alive)
   */
  sendComment(comment: string): void {
    const formatted = `: ${comment}\n\n`;
    for (const client of this.clients.values()) {
      this.writeToClient(client, formatted);
    }
  }

  /**
   * Start sending periodic events
   */
  startPeriodicEvents(eventType: string, intervalMs: number, dataGenerator?: () => string): void {
    if (this.periodicIntervals.has(eventType)) {
      clearInterval(this.periodicIntervals.get(eventType)!);
    }

    const interval = setInterval(() => {
      const data = dataGenerator?.() ?? new Date().toISOString();
      this.sendEvent({ event: eventType, data });
    }, intervalMs);

    this.periodicIntervals.set(eventType, interval);
  }

  /**
   * Stop periodic events
   */
  stopPeriodicEvents(eventType?: string): void {
    if (eventType) {
      const interval = this.periodicIntervals.get(eventType);
      if (interval) {
        clearInterval(interval);
        this.periodicIntervals.delete(eventType);
      }
    } else {
      for (const interval of this.periodicIntervals.values()) {
        clearInterval(interval);
      }
      this.periodicIntervals.clear();
    }
  }

  // ============================================
  // Client Management
  // ============================================

  getClient(id: string): MockSSEClient | undefined {
    return this.clients.get(id);
  }

  disconnectClient(id: string): void {
    const client = this.clients.get(id);
    if (client) {
      client.response.end();
      this.clients.delete(id);
      this.stats.currentConnections--;
      this.emit('disconnect', client);
    }
  }

  disconnectAll(): void {
    for (const client of this.clients.values()) {
      client.response.end();
    }
    this.clients.clear();
    this.stats.currentConnections = 0;
  }

  /**
   * Wait for connections
   */
  async waitForConnections(count: number, timeout = 5000): Promise<MockSSEClient[]> {
    const start = Date.now();

    while (this.clients.size < count) {
      if (Date.now() - start > timeout) {
        throw new Error(`Timeout waiting for ${count} connections (have ${this.clients.size})`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return [...this.clients.values()].slice(0, count);
  }

  // ============================================
  // Private
  // ============================================

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // Only handle GET requests to the SSE path
    if (req.method !== 'GET' || req.url !== this.options.path) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    // Check max connections
    if (this.options.maxConnections > 0 && this.clients.size >= this.options.maxConnections) {
      res.writeHead(503);
      res.end('Max connections reached');
      return;
    }

    // Get Last-Event-ID for reconnection
    const lastEventId = req.headers['last-event-id'] as string | undefined;

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': this.options.corsOrigin,
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send retry interval
    if (this.options.sendRetry) {
      res.write(`retry: ${this.options.retryInterval}\n\n`);
    }

    // Create client
    const clientId = `sse-client-${++this.clientIdCounter}`;
    const client: MockSSEClient = {
      id: clientId,
      response: res,
      connectedAt: Date.now(),
      lastEventId,
      eventsSent: 0,
      metadata: {},
    };

    this.clients.set(clientId, client);
    this.stats.totalConnections++;
    this.stats.currentConnections++;

    this.emit('connection', client);

    // Handle disconnect
    req.on('close', () => {
      this.clients.delete(clientId);
      this.stats.currentConnections--;
      this.emit('disconnect', client);
    });

    res.on('error', (err) => {
      this.emit('clientError', client, err);
      this.clients.delete(clientId);
      this.stats.currentConnections--;
    });
  }

  private formatEvent(event: SSEEvent): string {
    const lines: string[] = [];

    if (event.id) {
      lines.push(`id: ${event.id}`);
    }

    if (event.event) {
      lines.push(`event: ${event.event}`);
    }

    if (event.retry !== undefined) {
      lines.push(`retry: ${event.retry}`);
    }

    // Data can have multiple lines
    const dataLines = event.data.split('\n');
    for (const line of dataLines) {
      lines.push(`data: ${line}`);
    }

    return lines.join('\n') + '\n\n';
  }

  private writeToClient(client: MockSSEClient, data: string): boolean {
    try {
      return client.response.write(data);
    } catch {
      return false;
    }
  }

  /**
   * Generate next event ID
   */
  nextEventId(): string {
    return String(++this.eventIdCounter);
  }

  // ============================================
  // Static factory
  // ============================================

  static async create(options: MockSSEServerOptions = {}): Promise<MockSSEServer> {
    const server = new MockSSEServer(options);
    await server.start();
    return server;
  }
}

// ============================================
// Helper functions
// ============================================

/**
 * Create a simple SSE server
 */
export async function createMockSSEServer(options?: MockSSEServerOptions): Promise<MockSSEServer> {
  return MockSSEServer.create(options);
}
