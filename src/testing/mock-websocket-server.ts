/**
 * Mock WebSocket Server
 *
 * Simulates a WebSocket server for testing WebSocket clients.
 * Supports message patterns, broadcasting, connection simulation, and more.
 *
 * @example
 * ```typescript
 * import { MockWebSocketServer } from 'recker/testing';
 *
 * const server = await MockWebSocketServer.create({ port: 8080 });
 *
 * // Echo mode (default)
 * // Set custom responses
 * server.setResponse('ping', 'pong');
 * server.setResponse(/^subscribe:/, (msg) => `subscribed:${msg.split(':')[1]}`);
 *
 * // Broadcast to all clients
 * server.broadcast('Hello everyone!');
 *
 * // Simulate server-initiated messages
 * server.sendToAll({ type: 'update', data: { value: 42 } });
 *
 * // Get connection info
 * console.log(`Connections: ${server.connectionCount}`);
 *
 * await server.stop();
 * ```
 */

import { EventEmitter } from 'node:events';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import { createServer, type Server as HttpServer } from 'node:http';

// ============================================
// Types
// ============================================

export interface MockWebSocketServerOptions {
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
   * Path for WebSocket connections
   * @default '/'
   */
  path?: string;

  /**
   * Echo received messages back
   * @default true
   */
  echo?: boolean;

  /**
   * Delay before responding (ms)
   * @default 0
   */
  delay?: number;

  /**
   * Subprotocols to accept
   */
  protocols?: string[];

  /**
   * Auto-close connections after this many ms (0 = never)
   * @default 0
   */
  autoCloseAfter?: number;

  /**
   * Simulate connection drop rate (0-1)
   * @default 0
   */
  dropRate?: number;

  /**
   * Maximum connections allowed (0 = unlimited)
   * @default 0
   */
  maxConnections?: number;
}

export interface MockWebSocketClient {
  id: string;
  socket: WebSocket;
  connectedAt: number;
  messageCount: number;
  lastMessage?: RawData;
  metadata: Record<string, any>;
}

export interface MockWebSocketMessage {
  clientId: string;
  data: RawData;
  timestamp: number;
  isBinary: boolean;
}

export interface MockWebSocketStats {
  totalConnections: number;
  currentConnections: number;
  totalMessages: number;
  totalBytesSent: number;
  totalBytesReceived: number;
  messageLog: MockWebSocketMessage[];
}

// ============================================
// MockWebSocketServer
// ============================================

export class MockWebSocketServer extends EventEmitter {
  private options: Required<MockWebSocketServerOptions>;
  private httpServer: HttpServer | null = null;
  private wss: WebSocketServer | null = null;
  private clients: Map<string, MockWebSocketClient> = new Map();
  private responses: Map<string, string | Buffer | ((msg: string, client: MockWebSocketClient) => string | Buffer | null)> = new Map();
  private _port = 0;
  private _started = false;
  private clientIdCounter = 0;
  private stats: MockWebSocketStats = {
    totalConnections: 0,
    currentConnections: 0,
    totalMessages: 0,
    totalBytesSent: 0,
    totalBytesReceived: 0,
    messageLog: [],
  };

  constructor(options: MockWebSocketServerOptions = {}) {
    super();
    this.options = {
      port: 0,
      host: '127.0.0.1',
      path: '/',
      echo: true,
      delay: 0,
      protocols: [],
      autoCloseAfter: 0,
      dropRate: 0,
      maxConnections: 0,
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
    return `ws://${this.options.host}:${this._port}${this.options.path}`;
  }

  get isRunning(): boolean {
    return this._started;
  }

  get connectionCount(): number {
    return this.clients.size;
  }

  get statistics(): MockWebSocketStats {
    return { ...this.stats };
  }

  get allClients(): MockWebSocketClient[] {
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
      this.httpServer = createServer();

      this.wss = new WebSocketServer({
        server: this.httpServer,
        path: this.options.path,
        handleProtocols: this.options.protocols.length > 0
          ? (protocols) => {
              for (const p of protocols) {
                if (this.options.protocols.includes(p)) {
                  return p;
                }
              }
              return false;
            }
          : undefined,
      });

      this.wss.on('connection', (socket, req) => this.handleConnection(socket, req));
      this.wss.on('error', (err) => this.emit('error', err));

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

    // Close all client connections
    for (const client of this.clients.values()) {
      client.socket.close(1001, 'Server shutting down');
    }
    this.clients.clear();

    return new Promise((resolve) => {
      this.wss?.close(() => {
        this.httpServer?.close(() => {
          this._started = false;
          this.wss = null;
          this.httpServer = null;
          this.emit('close');
          resolve();
        });
      });
    });
  }

  reset(): void {
    this.responses.clear();
    this.stats = {
      totalConnections: 0,
      currentConnections: 0,
      totalMessages: 0,
      totalBytesSent: 0,
      totalBytesReceived: 0,
      messageLog: [],
    };
    this.options.echo = true;
    this.options.delay = 0;
    this.options.dropRate = 0;
    this.emit('reset');
  }

  // ============================================
  // Response Configuration
  // ============================================

  setResponse(
    pattern: string | RegExp,
    response: string | Buffer | ((msg: string, client: MockWebSocketClient) => string | Buffer | null)
  ): void {
    const key = pattern instanceof RegExp ? pattern.source : pattern;
    this.responses.set(key, response);
  }

  clearResponses(): void {
    this.responses.clear();
  }

  setEcho(enabled: boolean): void {
    this.options.echo = enabled;
  }

  setDelay(delay: number): void {
    this.options.delay = delay;
  }

  setDropRate(rate: number): void {
    this.options.dropRate = Math.max(0, Math.min(1, rate));
  }

  // ============================================
  // Client Management
  // ============================================

  getClient(id: string): MockWebSocketClient | undefined {
    return this.clients.get(id);
  }

  disconnectClient(id: string, code = 1000, reason = 'Disconnected by server'): void {
    const client = this.clients.get(id);
    if (client) {
      client.socket.close(code, reason);
    }
  }

  disconnectAll(code = 1000, reason = 'Disconnected by server'): void {
    for (const client of this.clients.values()) {
      client.socket.close(code, reason);
    }
  }

  // ============================================
  // Messaging
  // ============================================

  send(clientId: string, data: string | Buffer | object): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    const message = typeof data === 'object' && !Buffer.isBuffer(data)
      ? JSON.stringify(data)
      : data;

    client.socket.send(message);
    this.stats.totalBytesSent += Buffer.byteLength(message);
    return true;
  }

  broadcast(data: string | Buffer | object): number {
    let sent = 0;
    for (const client of this.clients.values()) {
      if (this.send(client.id, data)) {
        sent++;
      }
    }
    return sent;
  }

  sendToAll(data: string | Buffer | object): number {
    return this.broadcast(data);
  }

  // ============================================
  // Simulation
  // ============================================

  /**
   * Simulate receiving a message from a client
   */
  simulateMessage(clientId: string, data: string | Buffer): void {
    const client = this.clients.get(clientId);
    if (client) {
      const rawData = Buffer.isBuffer(data) ? data : Buffer.from(data);
      this.handleMessage(client, rawData, Buffer.isBuffer(data));
    }
  }

  /**
   * Simulate server sending ping
   */
  ping(clientId?: string): void {
    if (clientId) {
      const client = this.clients.get(clientId);
      client?.socket.ping();
    } else {
      for (const client of this.clients.values()) {
        client.socket.ping();
      }
    }
  }

  /**
   * Wait for a specific number of connections
   */
  async waitForConnections(count: number, timeout = 5000): Promise<MockWebSocketClient[]> {
    const start = Date.now();

    while (this.clients.size < count) {
      if (Date.now() - start > timeout) {
        throw new Error(`Timeout waiting for ${count} connections (have ${this.clients.size})`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return [...this.clients.values()].slice(0, count);
  }

  /**
   * Wait for a specific number of messages
   */
  async waitForMessages(count: number, timeout = 5000): Promise<MockWebSocketMessage[]> {
    const start = Date.now();

    while (this.stats.messageLog.length < count) {
      if (Date.now() - start > timeout) {
        throw new Error(`Timeout waiting for ${count} messages (have ${this.stats.messageLog.length})`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return this.stats.messageLog.slice(0, count);
  }

  // ============================================
  // Private
  // ============================================

  private handleConnection(socket: WebSocket, _req: any): void {
    // Check max connections
    if (this.options.maxConnections > 0 && this.clients.size >= this.options.maxConnections) {
      socket.close(1013, 'Max connections reached');
      return;
    }

    // Check drop rate
    if (this.options.dropRate > 0 && Math.random() < this.options.dropRate) {
      socket.close(1006, 'Connection dropped');
      this.emit('dropped');
      return;
    }

    const clientId = `client-${++this.clientIdCounter}`;
    const client: MockWebSocketClient = {
      id: clientId,
      socket,
      connectedAt: Date.now(),
      messageCount: 0,
      metadata: {},
    };

    this.clients.set(clientId, client);
    this.stats.totalConnections++;
    this.stats.currentConnections++;

    this.emit('connection', client);

    // Auto-close timer
    if (this.options.autoCloseAfter > 0) {
      setTimeout(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.close(1000, 'Auto-close timeout');
        }
      }, this.options.autoCloseAfter);
    }

    socket.on('message', (data, isBinary) => {
      this.handleMessage(client, data, isBinary);
    });

    socket.on('close', (code, reason) => {
      this.clients.delete(clientId);
      this.stats.currentConnections--;
      this.emit('disconnect', client, code, reason.toString());
    });

    socket.on('error', (err) => {
      this.emit('clientError', client, err);
    });

    socket.on('ping', () => {
      this.emit('ping', client);
    });

    socket.on('pong', () => {
      this.emit('pong', client);
    });
  }

  private async handleMessage(client: MockWebSocketClient, data: RawData, isBinary: boolean): Promise<void> {
    const bytes = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data.toString());
    this.stats.totalBytesReceived += bytes;
    this.stats.totalMessages++;

    client.messageCount++;
    client.lastMessage = data;

    const message: MockWebSocketMessage = {
      clientId: client.id,
      data,
      timestamp: Date.now(),
      isBinary,
    };
    this.stats.messageLog.push(message);

    this.emit('message', message, client);

    // Apply delay
    if (this.options.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.delay));
    }

    // Get response
    const response = this.getResponse(data.toString(), client);
    if (response !== null && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(response);
      this.stats.totalBytesSent += Buffer.byteLength(response);
    }
  }

  private getResponse(msg: string, client: MockWebSocketClient): string | Buffer | null {
    // Check custom responses
    for (const [pattern, response] of this.responses) {
      const regex = new RegExp(pattern);
      if (regex.test(msg)) {
        if (typeof response === 'function') {
          return response(msg, client);
        }
        return response;
      }
    }

    // Echo mode
    if (this.options.echo) {
      return msg;
    }

    return null;
  }

  // ============================================
  // Static factory
  // ============================================

  static async create(options: MockWebSocketServerOptions = {}): Promise<MockWebSocketServer> {
    const server = new MockWebSocketServer(options);
    await server.start();
    return server;
  }
}

// ============================================
// Helper functions
// ============================================

/**
 * Create a simple echo WebSocket server
 */
export async function createMockWebSocketServer(
  responses?: Record<string, string>,
  options?: MockWebSocketServerOptions
): Promise<MockWebSocketServer> {
  const server = new MockWebSocketServer(options);

  if (responses) {
    for (const [pattern, response] of Object.entries(responses)) {
      server.setResponse(pattern, response);
    }
    server.setEcho(false);
  }

  await server.start();
  return server;
}
