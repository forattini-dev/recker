/**
 * Base UDP Transport
 *
 * Abstract base class for all UDP-based transports.
 * Provides shared functionality for timing, socket management, and error handling.
 */

import dgram from 'node:dgram';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ReckerRequest, ReckerResponse } from '../types/index.js';
import type {
  BaseUDPTransportOptions,
  UDPTimings,
  UDPConnection,
} from '../types/udp.js';
import { TimeoutError, NetworkError, AbortError, ValidationError } from '../core/errors.js';

/**
 * Request context for tracking timing and connection info
 */
export interface UDPRequestContext {
  startTime: number;
  queuedTime?: number;
  sendTime?: number;
  receiveTime?: number;
  retransmissions: number;
  localAddress?: string;
  localPort?: number;
  remoteAddress?: string;
  remotePort?: number;
}

/**
 * Storage for request context
 */
export const udpRequestStorage = new AsyncLocalStorage<UDPRequestContext>();

/**
 * Default options for UDP transports
 */
export const DEFAULT_UDP_OPTIONS: Required<BaseUDPTransportOptions> = {
  timeout: 5000,
  retransmissions: 3,
  maxPacketSize: 65507, // Max UDP payload size
  observability: true,
  debug: false,
  localAddress: '',
  localPort: 0,
};

/**
 * Abstract base class for UDP transports
 */
export abstract class BaseUDPTransport {
  protected options: Required<BaseUDPTransportOptions>;

  constructor(options: BaseUDPTransportOptions = {}) {
    this.options = {
      ...DEFAULT_UDP_OPTIONS,
      ...options,
    };
  }

  /**
   * Dispatch a request - must be implemented by subclasses
   */
  abstract dispatch(req: ReckerRequest): Promise<ReckerResponse>;

  /**
   * Create a new UDP socket with configured options
   */
  protected createSocket(type: 'udp4' | 'udp6' = 'udp4'): dgram.Socket {
    const socket = dgram.createSocket({
      type,
      reuseAddr: true,
    });

    // Bind to specific address/port if configured
    if (this.options.localAddress || this.options.localPort) {
      socket.bind(this.options.localPort, this.options.localAddress || undefined);
    }

    return socket;
  }

  /**
   * Send data with timeout and retransmission support
   */
  protected async sendWithRetry(
    socket: dgram.Socket,
    data: Buffer,
    port: number,
    address: string,
    signal?: AbortSignal
  ): Promise<Buffer> {
    const context = udpRequestStorage.getStore();
    let attempts = 0;
    const maxAttempts = this.options.retransmissions + 1;

    while (attempts < maxAttempts) {
      try {
        if (signal?.aborted) {
          throw new AbortError('Request aborted');
        }

        const response = await this.sendOnce(socket, data, port, address, signal);
        return response;
      } catch (error) {
        attempts++;
        if (context) {
          context.retransmissions = attempts - 1;
        }

        if (attempts >= maxAttempts) {
          throw error;
        }

        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempts - 1), 5000);
        await this.sleep(delay);
      }
    }

    throw new TimeoutError(
      { url: `udp://${address}:${port}` } as ReckerRequest,
      { phase: 'response', timeout: this.options.timeout }
    );
  }

  /**
   * Send data once and wait for response
   */
  protected sendOnce(
    socket: dgram.Socket,
    data: Buffer,
    port: number,
    address: string,
    signal?: AbortSignal
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const context = udpRequestStorage.getStore();
      let timeoutId: NodeJS.Timeout | undefined;
      let resolved = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        socket.removeListener('message', onMessage);
        socket.removeListener('error', onError);
      };

      const onMessage = (msg: Buffer, rinfo: dgram.RemoteInfo) => {
        if (resolved) return;
        resolved = true;

        if (context && this.options.observability) {
          context.receiveTime = performance.now();
          context.remoteAddress = rinfo.address;
          context.remotePort = rinfo.port;
        }

        cleanup();
        resolve(msg);
      };

      const onError = (err: Error) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        reject(new NetworkError(err.message, (err as any).code || 'UNKNOWN', {} as ReckerRequest));
      };

      const onTimeout = () => {
        if (resolved) return;
        resolved = true;
        cleanup();
        reject(
          new TimeoutError({ url: `udp://${address}:${port}` } as ReckerRequest, {
            phase: 'response',
            timeout: this.options.timeout,
          })
        );
      };

      // Handle abort signal
      if (signal) {
        signal.addEventListener('abort', () => {
          if (resolved) return;
          resolved = true;
          cleanup();
          reject(new AbortError('Request aborted'));
        }, { once: true });
      }

      // Set up listeners
      socket.on('message', onMessage);
      socket.on('error', onError);

      // Set timeout
      timeoutId = setTimeout(onTimeout, this.options.timeout);

      // Record send time and send
      if (context && this.options.observability) {
        context.sendTime = performance.now();
      }

      socket.send(data, 0, data.length, port, address, (err) => {
        if (err) {
          if (resolved) return;
          resolved = true;
          cleanup();
          reject(new NetworkError(err.message, (err as any).code || 'SEND_ERROR', {} as ReckerRequest));
        }
      });
    });
  }

  /**
   * Collect timing information from the current context
   */
  protected collectTimings(): UDPTimings {
    const context = udpRequestStorage.getStore();

    if (!context || !this.options.observability) {
      return {
        queued: 0,
        send: 0,
        receive: 0,
        retransmissions: 0,
        total: 0,
      };
    }

    const now = performance.now();
    const queued = context.queuedTime
      ? context.sendTime! - context.queuedTime
      : context.sendTime
        ? context.sendTime - context.startTime
        : 0;

    const send = context.sendTime && context.receiveTime
      ? 0.1 // Approximate send time (UDP is fast)
      : 0;

    const receive = context.sendTime && context.receiveTime
      ? context.receiveTime - context.sendTime
      : 0;

    return {
      queued: Math.round(queued * 100) / 100,
      send: Math.round(send * 100) / 100,
      receive: Math.round(receive * 100) / 100,
      retransmissions: context.retransmissions,
      total: Math.round((now - context.startTime) * 100) / 100,
    };
  }

  /**
   * Collect connection information from the current context
   */
  protected collectConnection(socket: dgram.Socket): UDPConnection {
    const context = udpRequestStorage.getStore();
    const address = socket.address();

    return {
      protocol: 'udp',
      localAddress: typeof address === 'string' ? address : address.address,
      localPort: typeof address === 'string' ? 0 : address.port,
      remoteAddress: context?.remoteAddress || '',
      remotePort: context?.remotePort || 0,
    };
  }

  /**
   * Parse a UDP URL into host and port
   */
  protected parseUrl(url: string): { host: string; port: number; path: string } {
    // Handle udp:// protocol
    let cleanUrl = url;
    if (url.startsWith('udp://')) {
      cleanUrl = url.slice(6);
    }

    // Parse host:port/path
    const pathIndex = cleanUrl.indexOf('/');
    const hostPort = pathIndex > -1 ? cleanUrl.slice(0, pathIndex) : cleanUrl;
    const path = pathIndex > -1 ? cleanUrl.slice(pathIndex) : '/';

    const [host, portStr] = hostPort.split(':');
    const port = portStr ? parseInt(portStr, 10) : 0;

    return { host, port, path };
  }

  /**
   * Validate packet size
   */
  protected validatePacketSize(data: Buffer): void {
    if (data.length > this.options.maxPacketSize) {
      throw new ValidationError(
        `Packet size ${data.length} exceeds maximum ${this.options.maxPacketSize} bytes`,
        {
          field: 'packetSize',
          value: data.length,
        }
      );
    }
  }

  /**
   * Sleep utility
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Close the transport (can be overridden by subclasses)
   */
  async close(): Promise<void> {
    // Base implementation does nothing
  }
}
