/**
 * Server Runner - Event-Driven Mock Server Management
 *
 * Wraps all mock servers and emits events for CLI/TUI handlers.
 * This separates server logic from output presentation.
 *
 * @example
 * ```typescript
 * const runner = new ServerRunner();
 *
 * // CLI mode
 * attachCLIHandler(runner, { verbose: true });
 *
 * // TUI mode (background job)
 * attachTUIHandler(runner, { jobId: 123 });
 *
 * await runner.start('http', { port: 3000 });
 * ```
 */

import { EventEmitter } from 'node:events';
import { CommandEmitter } from '../events/emitter.js';
import { AbortError, ValidationError } from '../../core/errors.js';

// =============================================================================
// Types
// =============================================================================

export type ServerType =
  | 'http'
  | 'webhook'
  | 'websocket'
  | 'sse'
  | 'hls'
  | 'udp'
  | 'dns'
  | 'whois'
  | 'telnet'
  | 'ftp';

export interface ServerRunnerOptions {
  /** Port to listen on */
  port?: number;
  /** Host to bind to */
  host?: string;
  /** Response delay in ms */
  delay?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Server-specific options */
  [key: string]: any;
}

export interface ServerRunnerResult {
  type: ServerType;
  port: number;
  host: string;
  url: string;
  startTime: number;
  stopTime?: number;
  duration?: number;
  stats: ServerStats;
}

export interface ServerStats {
  totalConnections: number;
  totalRequests: number;
  activeConnections: number;
  bytesIn: number;
  bytesOut: number;
}

interface AnyServer extends EventEmitter {
  start?: () => Promise<void>;
  stop: () => Promise<void>;
  port?: number;
  address?: string;
  host?: string;
  url?: string;
  isRunning?: boolean;
  statistics?: any;
}

// =============================================================================
// Default Ports
// =============================================================================

const DEFAULT_PORTS: Record<ServerType, number> = {
  http: 3000,
  webhook: 3000,
  websocket: 8080,
  sse: 8081,
  hls: 8082,
  udp: 9000,
  dns: 5353,
  whois: 4343,
  telnet: 2323,
  ftp: 2121,
};

// =============================================================================
// Server Runner
// =============================================================================

export class ServerRunner extends CommandEmitter {
  private server: AnyServer | null = null;
  private serverType: ServerType | null = null;
  private stats: ServerStats = {
    totalConnections: 0,
    totalRequests: 0,
    activeConnections: 0,
    bytesIn: 0,
    bytesOut: 0,
  };
  private aborted: boolean = false;

  constructor() {
    super('server');
  }

  /**
   * Check if server is running
   */
  get isRunning(): boolean {
    return this.server !== null && (this.server.isRunning ?? true);
  }

  /**
   * Get server info
   */
  get serverInfo(): { type: ServerType | null; port: number; host: string; url: string } | null {
    if (!this.server || !this.serverType) return null;
    return {
      type: this.serverType,
      port: this.server.port ?? 0,
      host: this.server.address ?? this.server.host ?? '127.0.0.1',
      url: this.server.url ?? `http://127.0.0.1:${this.server.port}`,
    };
  }

  /**
   * Get current stats
   */
  getStats(): ServerStats {
    return { ...this.stats };
  }

  /**
   * Start a mock server
   */
  async start(type: ServerType, options: ServerRunnerOptions = {}): Promise<ServerRunnerResult> {
    const {
      port = DEFAULT_PORTS[type],
      host = '127.0.0.1',
      signal,
      ...serverOptions
    } = options;

    this.serverType = type;
    this.startTime = Date.now();
    this.aborted = false;
    this.stats = {
      totalConnections: 0,
      totalRequests: 0,
      activeConnections: 0,
      bytesIn: 0,
      bytesOut: 0,
    };

    // Emit start event
    this.emitStart(`${type} server`, { port, host });

    try {
      // Check for abort
      if (signal?.aborted) {
        throw new AbortError('Server start aborted');
      }

      // Set up abort handler
      const abortHandler = () => {
        this.aborted = true;
        this.stop();
      };
      signal?.addEventListener('abort', abortHandler);

      // Create and start server based on type
      this.server = await this.createServer(type, { port, host, ...serverOptions });

      // Emit progress
      this.emitProgress({
        current: 1,
        total: 1,
        currentItem: `${type} server listening on ${host}:${this.server.port ?? port}`,
        percent: 100,
      });

      // Emit data event with server info
      this.emit('data', {
        type: 'data',
        category: 'server:start',
        timestamp: Date.now(),
        command: 'server',
        level: 'info',
        payload: {
          serverType: type,
          port: this.server.port ?? port,
          host,
          url: this.server.url ?? `http://${host}:${this.server.port ?? port}`,
        },
      });

      // Wait for stop signal or abort
      await this.waitForStop(signal);

      // Clean up abort handler
      signal?.removeEventListener('abort', abortHandler);

      const stopTime = Date.now();
      const result: ServerRunnerResult = {
        type,
        port: this.server?.port ?? port,
        host,
        url: this.server?.url ?? `http://${host}:${port}`,
        startTime: this.startTime,
        stopTime,
        duration: stopTime - this.startTime,
        stats: this.getStats(),
      };

      // Emit completion
      this.emitComplete({
        type,
        duration: result.duration,
        stats: result.stats,
      });

      return result;

    } catch (err: any) {
      if (signal?.aborted || this.aborted || err instanceof AbortError) {
        this.emitError('Server stopped by user', { code: 'ABORT' });

        return {
          type,
          port,
          host,
          url: `http://${host}:${port}`,
          startTime: this.startTime,
          stopTime: Date.now(),
          duration: Date.now() - this.startTime,
          stats: this.getStats(),
        };
      }

      this.emitError(err.message || 'Server failed', {
        stack: err.stack,
        context: `${type} on port ${port}`,
      });
      throw err;
    }
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (this.server) {
      // Emit stop event
      this.emit('data', {
        type: 'data',
        category: 'server:stop',
        timestamp: Date.now(),
        command: 'server',
        level: 'info',
        payload: {
          serverType: this.serverType,
          duration: Date.now() - this.startTime,
          stats: this.getStats(),
        },
      });

      await this.server.stop();
      this.server = null;
    }
  }

  /**
   * Create server based on type
   */
  private async createServer(type: ServerType, options: any): Promise<AnyServer> {
    switch (type) {
      case 'http': {
        const { createMockHttpServer } = await import('../../testing/index.js');
        const server = await createMockHttpServer({
          port: options.port,
          host: options.host,
          delay: options.delay,
          cors: options.cors !== false,
        });

        if (options.echo) {
          const echoHandler = (req: any) => ({
            status: 200,
            body: { method: req.method, path: req.path, query: req.query, headers: req.headers, body: req.body },
          });
          server.get('/*', echoHandler);
          server.post('/*', echoHandler);
          server.put('/*', echoHandler);
          server.patch('/*', echoHandler);
          server.delete('/*', echoHandler);
        }

        this.attachHttpEvents(server);
        return server;
      }

      case 'webhook': {
        const { createMockHttpServer } = await import('../../testing/index.js');
        const webhookStatus = options.status || 204;
        const webhookHandler = () => ({ status: webhookStatus });
        const server = await createMockHttpServer({ port: options.port, host: options.host });
        server.get('/*', webhookHandler);
        server.post('/*', webhookHandler);
        server.put('/*', webhookHandler);
        server.patch('/*', webhookHandler);
        server.delete('/*', webhookHandler);

        this.attachHttpEvents(server);
        return server;
      }

      case 'websocket': {
        const { createMockWebSocketServer } = await import('../../testing/index.js');
        const server = await createMockWebSocketServer({
          port: options.port,
          host: options.host,
        });
        if (options.echo === false) {
          server.setMessageHandler(() => undefined);
        }

        this.attachWebSocketEvents(server);
        return server;
      }

      case 'sse': {
        const { createMockSSEServer } = await import('../../testing/index.js');
        const server = await createMockSSEServer({
          port: options.port,
          host: options.host,
          path: options.path || '/events',
        });

        if (options.heartbeat) {
          server.startPeriodicEvents('heartbeat', options.heartbeat, () => ({ data: 'heartbeat', event: 'heartbeat' }));
        }

        this.attachSSEEvents(server);
        return server;
      }

      case 'hls': {
        const { createMockHlsServer } = await import('../../testing/index.js');
        const hlsServer = await createMockHlsServer({
          port: options.port,
          host: options.host,
          mode: options.mode || 'vod',
          segmentCount: options.segments || 10,
          segmentDuration: options.duration || 6,
        });

        return {
          port: hlsServer.port,
          address: options.host,
          url: hlsServer.masterUrl,
          isRunning: hlsServer.isRunning,
          stop: () => hlsServer.stop(),
          on: hlsServer.on.bind(hlsServer),
          emit: hlsServer.emit.bind(hlsServer),
        } as unknown as AnyServer;
      }

      case 'udp': {
        const { createMockUdpServer } = await import('../../testing/index.js');
        const server = await createMockUdpServer({
          port: options.port,
          host: options.host,
        });
        if (options.echo === false) {
          server.setMessageHandler(() => undefined);
        }
        this.attachUDPEvents(server);
        return server;
      }

      case 'dns': {
        const { createMockDnsServer } = await import('../../testing/index.js');
        const server = await createMockDnsServer({
          port: options.port,
          host: options.host,
          delay: options.delay,
        });

        this.attachDNSEvents(server);
        return server;
      }

      case 'whois': {
        const { createMockWhoisServer } = await import('../../testing/index.js');
        const server = await createMockWhoisServer({
          port: options.port,
          host: options.host,
          responseDelay: options.delay,
        });

        this.attachWhoisEvents(server);
        return server;
      }

      case 'telnet': {
        const { createMockTelnetServer } = await import('../../testing/index.js');
        const server = await createMockTelnetServer({
          port: options.port,
          host: options.host,
          responseDelay: options.delay,
        });

        this.attachTelnetEvents(server);
        return server;
      }

      case 'ftp': {
        const { createMockFtpServer } = await import('../../testing/index.js');
        const server = await createMockFtpServer({
          port: options.port,
          host: options.host,
        });

        this.attachFTPEvents(server);
        return server;
      }

      default:
        throw new ValidationError(`Unknown server type: ${type}`, {
          field: 'serverType',
          value: type,
        });
    }
  }

  /**
   * Wait for server to stop
   */
  private async waitForStop(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.isRunning || signal?.aborted || this.aborted) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  // ===========================================================================
  // Event Attachments
  // ===========================================================================

  private attachHttpEvents(server: AnyServer): void {
    server.on('request', (req: any) => {
      this.stats.totalRequests++;

      this.emit('data', {
        type: 'data',
        category: 'server:request',
        timestamp: Date.now(),
        command: 'server',
        level: 'debug',
        payload: {
          method: req.method,
          path: req.path,
          query: req.query,
        },
      });
    });

    server.on('response', (req: any, res: any, duration: number) => {
      this.emit('data', {
        type: 'data',
        category: 'server:response',
        timestamp: Date.now(),
        command: 'server',
        level: 'debug',
        payload: {
          method: req.method,
          path: req.path,
          status: res.status,
          duration,
        },
      });
    });
  }

  private attachWebSocketEvents(server: AnyServer): void {
    server.on('connection', (client: any) => {
      this.stats.totalConnections++;
      this.stats.activeConnections++;

      this.emit('data', {
        type: 'data',
        category: 'server:connection',
        timestamp: Date.now(),
        command: 'server',
        level: 'info',
        payload: { clientId: client.id, event: 'connect' },
      });
    });

    server.on('message', (msg: any, client: any) => {
      this.stats.totalRequests++;
      const data = msg.data?.toString() || '';

      this.emit('data', {
        type: 'data',
        category: 'server:message',
        timestamp: Date.now(),
        command: 'server',
        level: 'debug',
        payload: {
          clientId: client.id,
          message: data.slice(0, 100),
          length: data.length,
        },
      });
    });

    server.on('disconnect', (client: any) => {
      this.stats.activeConnections--;

      this.emit('data', {
        type: 'data',
        category: 'server:connection',
        timestamp: Date.now(),
        command: 'server',
        level: 'info',
        payload: { clientId: client.id, event: 'disconnect' },
      });
    });
  }

  private attachSSEEvents(server: AnyServer): void {
    server.on('connection', (client: any) => {
      this.stats.totalConnections++;
      this.stats.activeConnections++;

      this.emit('data', {
        type: 'data',
        category: 'server:connection',
        timestamp: Date.now(),
        command: 'server',
        level: 'info',
        payload: { clientId: client.id, event: 'connect' },
      });
    });

    server.on('disconnect', (client: any) => {
      this.stats.activeConnections--;

      this.emit('data', {
        type: 'data',
        category: 'server:connection',
        timestamp: Date.now(),
        command: 'server',
        level: 'info',
        payload: { clientId: client.id, event: 'disconnect' },
      });
    });
  }

  private attachUDPEvents(server: AnyServer): void {
    server.on('message', (msg: any) => {
      this.stats.totalRequests++;
      const data = msg.data?.toString() || '';

      this.emit('data', {
        type: 'data',
        category: 'server:message',
        timestamp: Date.now(),
        command: 'server',
        level: 'debug',
        payload: {
          from: `${msg.rinfo?.address}:${msg.rinfo?.port}`,
          message: data.slice(0, 100),
          length: data.length,
        },
      });
    });
  }

  private attachDNSEvents(server: AnyServer): void {
    server.on('query', (query: { name: string; type: string }) => {
      this.stats.totalRequests++;

      this.emit('data', {
        type: 'data',
        category: 'server:query',
        timestamp: Date.now(),
        command: 'server',
        level: 'debug',
        payload: {
          domain: query.name,
          recordType: query.type,
        },
      });
    });
  }

  private attachWhoisEvents(server: AnyServer): void {
    server.on('query', (query: string) => {
      this.stats.totalRequests++;

      this.emit('data', {
        type: 'data',
        category: 'server:query',
        timestamp: Date.now(),
        command: 'server',
        level: 'debug',
        payload: { domain: query },
      });
    });
  }

  private attachTelnetEvents(server: AnyServer): void {
    server.on('connect', (session: any) => {
      this.stats.totalConnections++;
      this.stats.activeConnections++;

      this.emit('data', {
        type: 'data',
        category: 'server:connection',
        timestamp: Date.now(),
        command: 'server',
        level: 'info',
        payload: { sessionId: session.id, event: 'connect' },
      });
    });

    server.on('command', (cmd: string, session: any) => {
      this.stats.totalRequests++;

      this.emit('data', {
        type: 'data',
        category: 'server:command',
        timestamp: Date.now(),
        command: 'server',
        level: 'debug',
        payload: { sessionId: session.id, command: cmd },
      });
    });

    server.on('disconnect', (session: any) => {
      this.stats.activeConnections--;

      this.emit('data', {
        type: 'data',
        category: 'server:connection',
        timestamp: Date.now(),
        command: 'server',
        level: 'info',
        payload: { sessionId: session.id, event: 'disconnect' },
      });
    });
  }

  private attachFTPEvents(server: AnyServer): void {
    server.on('connect', (session: any) => {
      this.stats.totalConnections++;
      this.stats.activeConnections++;

      this.emit('data', {
        type: 'data',
        category: 'server:connection',
        timestamp: Date.now(),
        command: 'server',
        level: 'info',
        payload: { sessionId: session.id, event: 'connect' },
      });
    });

    server.on('command', (cmd: string, _arg: string, session: any) => {
      this.stats.totalRequests++;

      this.emit('data', {
        type: 'data',
        category: 'server:command',
        timestamp: Date.now(),
        command: 'server',
        level: 'debug',
        payload: { sessionId: session.id, command: cmd },
      });
    });

    server.on('disconnect', (session: any) => {
      this.stats.activeConnections--;

      this.emit('data', {
        type: 'data',
        category: 'server:connection',
        timestamp: Date.now(),
        command: 'server',
        level: 'info',
        payload: { sessionId: session.id, event: 'disconnect' },
      });
    });
  }
}

/**
 * Convenience function to run server with CLI output
 */
export async function runServerWithEvents(
  type: ServerType,
  options: ServerRunnerOptions & { verbose?: boolean; json?: boolean } = {}
): Promise<ServerRunnerResult> {
  const { verbose = false, json = false, ...serverOptions } = options;

  const runner = new ServerRunner();

  if (!json) {
    const { attachCLIHandler } = await import('../events/handlers/cli.js');
    attachCLIHandler(runner, { verbose });
  }

  return runner.start(type, serverOptions);
}
