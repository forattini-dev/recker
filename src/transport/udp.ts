/**
 * UDP Transport
 *
 * Generic UDP transport for sending and receiving datagrams.
 * Supports broadcast, multicast, and request-response patterns.
 */

import dgram from 'node:dgram';
import type { ReckerRequest, ReckerResponse } from '../types/index.js';
import type {
  UDPTransportOptions,
  UDPRequest,
  UDPResponse,
  UDPDiscoveryResult,
  SimpleUDPAPI,
} from '../types/udp.js';
import { BaseUDPTransport, udpRequestStorage, UDPRequestContext } from './base-udp.js';
import { UDPResponseWrapper } from './udp-response.js';
import { ValidationError } from '../core/errors.js';

/**
 * Default UDP transport options
 */
const DEFAULT_OPTIONS: UDPTransportOptions = {
  timeout: 5000,
  retransmissions: 3,
  maxPacketSize: 65507,
  observability: true,
  debug: false,
  broadcast: false,
  multicastTTL: 1,
  multicastLoopback: true,
  type: 'udp4',
};

/**
 * UDP Transport
 *
 * Generic UDP transport for sending and receiving datagrams.
 * Supports broadcast, multicast, and request-response patterns.
 *
 * @example
 * ```typescript
 * import { createUDP } from 'recker/udp';
 *
 * const udp = createUDP({
 *   timeout: 5000,
 *   debug: true
 * });
 *
 * // Send datagram
 * await udp.send('192.168.1.100', 5000, Buffer.from('hello'));
 *
 * // Broadcast
 * await udp.broadcast(5000, Buffer.from('discover'));
 *
 * // Close when done
 * await udp.close();
 * ```
 */
export class UDPClient extends BaseUDPTransport {
  private socket: dgram.Socket | null = null;
  private baseUrl: string;
  private udpOptions: Required<UDPTransportOptions>;
  private multicastGroups: Set<string> = new Set();

  constructor(baseUrl: string = '', options: UDPTransportOptions = {}) {
    super(options);
    this.baseUrl = baseUrl;
    this.udpOptions = {
      ...DEFAULT_OPTIONS,
      ...options,
      timeout: options.timeout ?? DEFAULT_OPTIONS.timeout!,
      retransmissions: options.retransmissions ?? DEFAULT_OPTIONS.retransmissions!,
      maxPacketSize: options.maxPacketSize ?? DEFAULT_OPTIONS.maxPacketSize!,
      observability: options.observability ?? DEFAULT_OPTIONS.observability!,
      debug: options.debug ?? DEFAULT_OPTIONS.debug!,
      localAddress: options.localAddress ?? '',
      localPort: options.localPort ?? 0,
      broadcast: options.broadcast ?? DEFAULT_OPTIONS.broadcast!,
      multicastTTL: options.multicastTTL ?? DEFAULT_OPTIONS.multicastTTL!,
      multicastGroups: options.multicastGroups ?? [],
      multicastLoopback: options.multicastLoopback ?? DEFAULT_OPTIONS.multicastLoopback!,
      type: options.type ?? DEFAULT_OPTIONS.type!,
      recvBufferSize: options.recvBufferSize,
      sendBufferSize: options.sendBufferSize,
    } as Required<UDPTransportOptions>;
  }

  private log(message: string, ...args: unknown[]): void {
    if (this.udpOptions.debug) {
      console.log(`[UDP] ${message}`, ...args);
    }
  }

  /**
   * Get or create the UDP socket
   */
  private getSocket(): dgram.Socket {
    if (!this.socket) {
      this.socket = this.createSocket(this.udpOptions.type);
      this._socketBound = false;

      // Configure socket options
      this.socket.on('listening', () => {
        this._socketBound = true;

        if (this.udpOptions.broadcast) {
          this.socket!.setBroadcast(true);
        }

        if (this.udpOptions.multicastTTL !== 1) {
          this.socket!.setMulticastTTL(this.udpOptions.multicastTTL);
        }

        if (!this.udpOptions.multicastLoopback) {
          this.socket!.setMulticastLoopback(false);
        }

        if (this.udpOptions.recvBufferSize) {
          this.socket!.setRecvBufferSize(this.udpOptions.recvBufferSize);
        }

        if (this.udpOptions.sendBufferSize) {
          this.socket!.setSendBufferSize(this.udpOptions.sendBufferSize);
        }

        // Join configured multicast groups
        for (const group of this.udpOptions.multicastGroups ?? []) {
          this.joinMulticast(group);
        }
      });

      // Bind the socket (port 0 = random available port)
      this.socket.bind(this.udpOptions.localPort, this.udpOptions.localAddress || undefined);
    }

    return this.socket;
  }

  private _socketBound: boolean = false;

  /**
   * Dispatch a request over UDP
   */
  async dispatch(req: ReckerRequest): Promise<ReckerResponse> {
    // Create request context for observability
    const context: UDPRequestContext = {
      startTime: performance.now(),
      retransmissions: 0,
    };

    // Run in async local storage context
    return udpRequestStorage.run(context, async () => {
      // Parse URL to get target
      const fullUrl = this.baseUrl ? `${this.baseUrl}${req.url}` : req.url;
      const { host, port, path } = this.parseUrl(fullUrl);

      this.log(`Dispatch to ${fullUrl}`);

      if (!host || !port) {
        throw new ValidationError(`Invalid UDP URL: ${fullUrl}. Expected format: udp://host:port/path`, {
          field: 'url',
          value: fullUrl,
        });
      }

      // Get request body as Buffer
      let body: Buffer;
      if (req.body === null || req.body === undefined) {
        // For GET-like requests, send the path as the message
        body = Buffer.from(path);
      } else if (Buffer.isBuffer(req.body)) {
        body = req.body;
      } else if (typeof req.body === 'string') {
        body = Buffer.from(req.body);
      } else if (req.body instanceof ArrayBuffer) {
        body = Buffer.from(req.body);
      } else if (ArrayBuffer.isView(req.body)) {
        body = Buffer.from(req.body.buffer, req.body.byteOffset, req.body.byteLength);
      } else {
        // Try to serialize as JSON
        body = Buffer.from(JSON.stringify(req.body));
      }

      // Validate packet size
      this.validatePacketSize(body);

      // Get or create socket
      const socket = this.getSocket();

      // Wait for socket to be bound
      if (!this._socketBound) {
        await new Promise<void>((resolve) => {
          socket.once('listening', () => resolve());
        });
      }

      // Check for UDP-specific options
      const udpReq = req as UDPRequest;
      const isBroadcast = udpReq.udp?.broadcast ?? this.udpOptions.broadcast;
      const targetPort = udpReq.udp?.port ?? port;
      const targetAddress = isBroadcast ? '255.255.255.255' : (udpReq.udp?.multicast ?? host);

      // Set broadcast if needed for this request
      if (isBroadcast && !this.udpOptions.broadcast) {
        socket.setBroadcast(true);
      }

      // Send and receive
      const responseBuffer = await this.sendWithRetry(
        socket,
        body,
        targetPort,
        targetAddress,
        req.signal
      );

      // Collect metrics
      const timings = this.collectTimings();
      const connection = this.collectConnection(socket);

      this.log(`Response received in ${timings.total.toFixed(0)}ms (${responseBuffer.length} bytes)`);

      // Create response
      return new UDPResponseWrapper(responseBuffer, {
        timings,
        connection,
        url: fullUrl,
      });
    });
  }

  /**
   * Send a datagram without waiting for response (fire-and-forget)
   */
  async send(host: string, port: number, data: Buffer): Promise<void> {
    this.validatePacketSize(data);
    const socket = this.getSocket();

    // Wait for socket to be bound
    if (!this._socketBound) {
      await new Promise<void>((resolve) => {
        socket.once('listening', () => resolve());
      });
    }

    return new Promise((resolve, reject) => {
      socket.send(data, 0, data.length, port, host, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Send a broadcast datagram
   */
  async broadcast(port: number, data: Buffer): Promise<void> {
    const socket = this.getSocket();

    // Wait for socket to be bound
    if (!this._socketBound) {
      await new Promise<void>((resolve) => {
        socket.once('listening', () => resolve());
      });
    }

    socket.setBroadcast(true);
    await this.send('255.255.255.255', port, data);
  }

  /**
   * Join a multicast group
   */
  joinMulticast(group: string): void {
    const socket = this.getSocket();
    if (!this.multicastGroups.has(group)) {
      socket.addMembership(group);
      this.multicastGroups.add(group);
    }
  }

  /**
   * Leave a multicast group
   */
  leaveMulticast(group: string): void {
    const socket = this.getSocket();
    if (this.multicastGroups.has(group)) {
      socket.dropMembership(group);
      this.multicastGroups.delete(group);
    }
  }

  /**
   * Close the transport and release resources
   */
  async close(): Promise<void> {
    if (this.socket) {
      // Leave all multicast groups
      for (const group of this.multicastGroups) {
        try {
          this.socket.dropMembership(group);
        } catch {
          // Ignore errors when leaving groups
        }
      }
      this.multicastGroups.clear();

      // Close socket
      return new Promise((resolve) => {
        this.socket!.close(() => {
          this.socket = null;
          resolve();
        });
      });
    }
  }
}

// ============================================================================
// Simple UDP API (standalone functions)
// ============================================================================

/**
 * Create a UDP client
 *
 * @example
 * ```typescript
 * import { createUDP } from 'recker/udp';
 *
 * const udp = createUDP({
 *   timeout: 5000,
 *   debug: true
 * });
 *
 * await udp.send('192.168.1.100', 5000, Buffer.from('hello'));
 * await udp.close();
 * ```
 */
export function createUDP(options: UDPTransportOptions = {}): UDPClient {
  return new UDPClient('', options);
}

/**
 * Simple UDP API for quick one-off operations
 */
export const udp: SimpleUDPAPI = {
  /**
   * Send a UDP packet and wait for response
   */
  async send(
    address: string,
    data: Buffer,
    options: UDPTransportOptions = {}
  ): Promise<UDPResponse> {
    const transport = new UDPClient('', options);
    try {
      const response = await transport.dispatch({
        url: address.startsWith('udp://') ? address : `udp://${address}`,
        method: 'GET',
        headers: new Headers(),
        body: new Uint8Array(data) as unknown as BodyInit,
        withHeader: () => ({ url: address } as any),
        withBody: () => ({ url: address } as any),
      });
      return response as UDPResponse;
    } finally {
      await transport.close();
    }
  },

  /**
   * Send a broadcast packet and collect responses
   */
  async broadcast(
    port: number,
    data: Buffer,
    options: UDPTransportOptions & { timeout?: number } = {}
  ): Promise<UDPDiscoveryResult[]> {
    const timeout = options.timeout ?? 3000;
    const results: UDPDiscoveryResult[] = [];
    const socket = dgram.createSocket({ type: options.type ?? 'udp4', reuseAddr: true });

    return new Promise((resolve) => {
      const startTime = performance.now();

      socket.on('message', (msg, rinfo) => {
        results.push({
          address: rinfo.address,
          port: rinfo.port,
          data: msg,
          latency: performance.now() - startTime,
        });
      });

      socket.on('listening', () => {
        socket.setBroadcast(true);
        socket.send(data, 0, data.length, port, '255.255.255.255');
      });

      socket.bind();

      setTimeout(() => {
        socket.close();
        resolve(results);
      }, timeout);
    });
  },

  /**
   * Discover services via multicast
   */
  async discover(
    group: string,
    port: number,
    data: Buffer,
    options: UDPTransportOptions & { timeout?: number } = {}
  ): Promise<UDPDiscoveryResult[]> {
    const timeout = options.timeout ?? 3000;
    const results: UDPDiscoveryResult[] = [];
    const socket = dgram.createSocket({ type: options.type ?? 'udp4', reuseAddr: true });

    return new Promise((resolve) => {
      const startTime = performance.now();

      socket.on('message', (msg, rinfo) => {
        results.push({
          address: rinfo.address,
          port: rinfo.port,
          data: msg,
          latency: performance.now() - startTime,
        });
      });

      socket.on('listening', () => {
        socket.addMembership(group);
        socket.setMulticastTTL(options.multicastTTL ?? 1);
        socket.send(data, 0, data.length, port, group);
      });

      socket.bind(port);

      setTimeout(() => {
        socket.dropMembership(group);
        socket.close();
        resolve(results);
      }, timeout);
    });
  },
};

// Alias for transport interface compatibility
export { UDPClient as UDPTransport };
