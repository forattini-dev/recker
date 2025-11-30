/**
 * Mock UDP Server
 *
 * Provides a simple UDP server for testing UDP transport.
 * Supports echo, custom responses, and programmatic control.
 *
 * @example
 * ```typescript
 * import { MockUDPServer } from 'recker/testing';
 *
 * const server = new MockUDPServer();
 * await server.start();
 *
 * // Echo mode (default)
 * // Sends back whatever it receives
 *
 * // Custom response
 * server.setResponse('/status', Buffer.from('OK'));
 *
 * // Get the port
 * const port = server.port;
 *
 * // Stop the server
 * await server.stop();
 * ```
 */

import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';

export interface MockUDPServerOptions {
  /**
   * Port to bind to (0 = random available port)
   * @default 0
   */
  port?: number;

  /**
   * Address to bind to
   * @default '127.0.0.1'
   */
  host?: string;

  /**
   * Socket type
   * @default 'udp4'
   */
  type?: 'udp4' | 'udp6';

  /**
   * Enable echo mode (echo back received messages)
   * @default true
   */
  echo?: boolean;

  /**
   * Delay before responding (ms)
   * @default 0
   */
  delay?: number;

  /**
   * Drop rate (0-1, percentage of packets to drop)
   * @default 0
   */
  dropRate?: number;
}

export interface ReceivedMessage {
  data: Buffer;
  rinfo: dgram.RemoteInfo;
  timestamp: number;
}

/**
 * Mock UDP Server for testing
 */
export class MockUDPServer extends EventEmitter {
  private socket: dgram.Socket | null = null;
  private options: Required<MockUDPServerOptions>;
  private responses: Map<string, Buffer | ((msg: Buffer, rinfo: dgram.RemoteInfo) => Buffer | null)> = new Map();
  private _port: number = 0;
  private _receivedMessages: ReceivedMessage[] = [];
  private _started: boolean = false;

  constructor(options: MockUDPServerOptions = {}) {
    super();
    this.options = {
      port: 0,
      host: '127.0.0.1',
      type: 'udp4',
      echo: true,
      delay: 0,
      dropRate: 0,
      ...options,
    };
  }

  /**
   * Get the port the server is listening on
   */
  get port(): number {
    return this._port;
  }

  /**
   * Get the address the server is listening on
   */
  get address(): string {
    return this.options.host;
  }

  /**
   * Check if the server is running
   */
  get isRunning(): boolean {
    return this._started;
  }

  /**
   * Get all received messages
   */
  get receivedMessages(): ReceivedMessage[] {
    return [...this._receivedMessages];
  }

  /**
   * Get the number of received messages
   */
  get messageCount(): number {
    return this._receivedMessages.length;
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    if (this._started) {
      throw new Error('Server already started');
    }

    this.socket = dgram.createSocket(this.options.type);

    this.socket.on('message', async (msg, rinfo) => {
      // Record the message
      this._receivedMessages.push({
        data: msg,
        rinfo,
        timestamp: Date.now(),
      });

      this.emit('message', msg, rinfo);

      // Check drop rate
      if (this.options.dropRate > 0 && Math.random() < this.options.dropRate) {
        this.emit('dropped', msg, rinfo);
        return;
      }

      // Add delay if configured
      if (this.options.delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.options.delay));
      }

      // Get response
      const response = this.getResponse(msg, rinfo);
      if (response) {
        this.socket!.send(response, rinfo.port, rinfo.address, (err) => {
          if (err) {
            this.emit('error', err);
          } else {
            this.emit('sent', response, rinfo);
          }
        });
      }
    });

    this.socket.on('error', (err) => {
      this.emit('error', err);
    });

    return new Promise((resolve) => {
      this.socket!.bind(this.options.port, this.options.host, () => {
        const addr = this.socket!.address();
        this._port = typeof addr === 'string' ? 0 : addr.port;
        this._started = true;
        this.emit('listening', this._port);
        resolve();
      });
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (!this._started || !this.socket) {
      return;
    }

    return new Promise((resolve) => {
      this.socket!.close(() => {
        this._started = false;
        this.socket = null;
        this.emit('close');
        resolve();
      });
    });
  }

  /**
   * Set a response for a specific message pattern
   */
  setResponse(
    pattern: string | RegExp,
    response: Buffer | string | ((msg: Buffer, rinfo: dgram.RemoteInfo) => Buffer | string | null)
  ): void {
    const key = pattern instanceof RegExp ? pattern.source : pattern;
    const handler = typeof response === 'function'
      ? (msg: Buffer, rinfo: dgram.RemoteInfo) => {
          const result = response(msg, rinfo);
          if (result === null) return null;
          return typeof result === 'string' ? Buffer.from(result) : result;
        }
      : typeof response === 'string'
        ? Buffer.from(response)
        : response;

    this.responses.set(key, handler);
  }

  /**
   * Set the delay for responses
   */
  setDelay(delay: number): void {
    this.options.delay = delay;
  }

  /**
   * Set the drop rate
   */
  setDropRate(rate: number): void {
    this.options.dropRate = Math.max(0, Math.min(1, rate));
  }

  /**
   * Enable/disable echo mode
   */
  setEcho(enabled: boolean): void {
    this.options.echo = enabled;
  }

  /**
   * Clear all recorded messages
   */
  clearMessages(): void {
    this._receivedMessages = [];
  }

  /**
   * Clear all custom responses
   */
  clearResponses(): void {
    this.responses.clear();
  }

  /**
   * Reset the server to default state
   */
  reset(): void {
    this.clearMessages();
    this.clearResponses();
    this.options.delay = 0;
    this.options.dropRate = 0;
    this.options.echo = true;
  }

  /**
   * Get response for a message
   */
  private getResponse(msg: Buffer, rinfo: dgram.RemoteInfo): Buffer | null {
    const msgStr = msg.toString();

    // Check custom responses
    for (const [pattern, response] of this.responses) {
      const regex = new RegExp(pattern);
      if (regex.test(msgStr)) {
        if (typeof response === 'function') {
          return response(msg, rinfo);
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

  /**
   * Send a message to a client (for push scenarios)
   */
  async sendTo(data: Buffer | string, port: number, address: string = '127.0.0.1'): Promise<void> {
    if (!this.socket || !this._started) {
      throw new Error('Server not started');
    }

    const buffer = typeof data === 'string' ? Buffer.from(data) : data;

    return new Promise((resolve, reject) => {
      this.socket!.send(buffer, port, address, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Wait for a specific number of messages
   */
  async waitForMessages(count: number, timeout: number = 5000): Promise<ReceivedMessage[]> {
    const startTime = Date.now();

    while (this._receivedMessages.length < count) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Timeout waiting for ${count} messages (received ${this._receivedMessages.length})`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return this._receivedMessages.slice(0, count);
  }

  /**
   * Create and start a server with a single method
   */
  static async create(options: MockUDPServerOptions = {}): Promise<MockUDPServer> {
    const server = new MockUDPServer(options);
    await server.start();
    return server;
  }
}

/**
 * Create a mock UDP server that responds with specific data
 */
export async function createMockUDPServer(
  responses?: Record<string, Buffer | string>,
  options?: MockUDPServerOptions
): Promise<MockUDPServer> {
  const server = new MockUDPServer(options);

  if (responses) {
    for (const [pattern, response] of Object.entries(responses)) {
      server.setResponse(pattern, response);
    }
    server.setEcho(false);
  }

  await server.start();
  return server;
}
