/**
 * UDP Types for Recker
 *
 * Provides type definitions for UDP-based transports including:
 * - Generic UDP
 * - DTLS (secure UDP)
 * - QUIC/HTTP3
 */

import type { ReckerRequest, ReckerResponse, Transport } from './index.js';

// ============================================================================
// UDP Timings
// ============================================================================

/**
 * Timing information for UDP requests
 */
export interface UDPTimings {
  /** Time spent in queue before sending (ms) */
  queued: number;
  /** Time to send the packet (ms) */
  send: number;
  /** Time waiting for response (ms) */
  receive: number;
  /** Number of retransmission attempts */
  retransmissions: number;
  /** Total request duration (ms) */
  total: number;
}

/**
 * Extended timings for DTLS connections
 */
export interface DTLSTimings extends UDPTimings {
  /** DTLS handshake duration (ms) */
  handshake: number;
}

/**
 * Extended timings for QUIC connections
 */
export interface QUICTimings extends UDPTimings {
  /** QUIC handshake duration (ms) */
  quicHandshake: number;
  /** Time to open a new stream (ms) */
  streamOpen: number;
  /** Time to first byte (ms) */
  firstByte: number;
  /** Whether 0-RTT was used */
  zeroRTT: boolean;
}

// ============================================================================
// Connection Info
// ============================================================================

/**
 * UDP connection information
 */
export interface UDPConnection {
  /** Protocol type */
  protocol: 'udp' | 'dtls' | 'quic';
  /** Local IP address */
  localAddress: string;
  /** Local port number */
  localPort: number;
  /** Remote IP address */
  remoteAddress: string;
  /** Remote port number */
  remotePort: number;
}

/**
 * DTLS-specific connection information
 */
export interface DTLSConnection extends UDPConnection {
  protocol: 'dtls';
  /** TLS cipher suite used */
  cipher: string;
  /** DTLS version (e.g., 'DTLSv1.2') */
  version: string;
}

/**
 * QUIC-specific connection information
 */
export interface QUICConnection extends UDPConnection {
  protocol: 'quic';
  /** ALPN negotiated protocol (e.g., 'h3') */
  alpn: string;
  /** Congestion control algorithm */
  congestion: 'bbr' | 'cubic' | 'reno';
  /** QUIC version string */
  quicVersion: string;
  /** Whether connection was migrated */
  migrated: boolean;
}

// ============================================================================
// Transport Options
// ============================================================================

/**
 * Base options for all UDP transports
 */
export interface BaseUDPTransportOptions {
  /**
   * Socket timeout in milliseconds
   * @default 5000
   */
  timeout?: number;

  /**
   * Number of retransmission attempts on timeout
   * @default 3
   */
  retransmissions?: number;

  /**
   * Maximum UDP packet size in bytes
   * @default 65507 (max UDP payload)
   */
  maxPacketSize?: number;

  /**
   * Enable observability (timings, connection info)
   * @default true
   */
  observability?: boolean;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;

  /**
   * Bind to specific local address
   */
  localAddress?: string;

  /**
   * Bind to specific local port
   */
  localPort?: number;
}

/**
 * Options for generic UDP transport
 */
export interface UDPTransportOptions extends BaseUDPTransportOptions {
  /**
   * Enable broadcast mode
   * @default false
   */
  broadcast?: boolean;

  /**
   * Multicast TTL (time-to-live)
   * @default 1
   */
  multicastTTL?: number;

  /**
   * Join multicast groups
   */
  multicastGroups?: string[];

  /**
   * Enable multicast loopback
   * @default true
   */
  multicastLoopback?: boolean;

  /**
   * Socket type
   * @default 'udp4'
   */
  type?: 'udp4' | 'udp6';

  /**
   * Receive buffer size (bytes)
   */
  recvBufferSize?: number;

  /**
   * Send buffer size (bytes)
   */
  sendBufferSize?: number;
}

/**
 * Options for DTLS transport
 */
export interface DTLSTransportOptions extends BaseUDPTransportOptions {
  /**
   * Client certificate (PEM format)
   */
  cert?: string | Buffer;

  /**
   * Client private key (PEM format)
   */
  key?: string | Buffer;

  /**
   * Certificate authority chain (PEM format)
   */
  ca?: string | Buffer | Array<string | Buffer>;

  /**
   * Private key passphrase
   */
  passphrase?: string;

  /**
   * Cipher suites to use
   * @default 'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384'
   */
  ciphers?: string;

  /**
   * Minimum DTLS version
   * @default 'DTLSv1.2'
   */
  minVersion?: 'DTLSv1.0' | 'DTLSv1.2';

  /**
   * Whether to reject unauthorized certificates
   * @default true
   */
  rejectUnauthorized?: boolean;

  /**
   * Override server name for SNI
   */
  servername?: string;

  /**
   * DTLS handshake timeout (ms)
   * @default 10000
   */
  handshakeTimeout?: number;

  /**
   * MTU (Maximum Transmission Unit)
   * @default 1400
   */
  mtu?: number;
}

/**
 * Options for QUIC/HTTP3 transport
 */
export interface QUICTransportOptions extends BaseUDPTransportOptions {
  /**
   * Maximum concurrent streams
   * @default 100
   */
  maxStreams?: number;

  /**
   * Idle timeout in milliseconds
   * @default 30000
   */
  idleTimeout?: number;

  /**
   * Congestion control algorithm
   * @default 'bbr'
   */
  congestionControl?: 'bbr' | 'cubic' | 'reno';

  /**
   * Enable 0-RTT for reconnections
   * @default true
   */
  earlyData?: boolean;

  /**
   * Session cache for 0-RTT resumption
   */
  sessionCache?: Map<string, Buffer>;

  /**
   * TLS certificate (PEM format)
   */
  cert?: string | Buffer;

  /**
   * TLS private key (PEM format)
   */
  key?: string | Buffer;

  /**
   * Certificate authority chain
   */
  ca?: string | Buffer | Array<string | Buffer>;

  /**
   * ALPN protocols
   * @default ['h3']
   */
  alpnProtocols?: string[];

  /**
   * Initial RTT estimate (ms) for congestion control
   * @default 100
   */
  initialRtt?: number;

  /**
   * Enable connection migration
   * @default true
   */
  connectionMigration?: boolean;
}

// ============================================================================
// Request/Response Extensions
// ============================================================================

/**
 * UDP-specific request fields
 */
export interface UDPRequestOptions {
  /**
   * Enable broadcast for this request
   */
  broadcast?: boolean;

  /**
   * Multicast group to send to
   */
  multicast?: string;

  /**
   * Time-to-live for the packet
   */
  ttl?: number;

  /**
   * Custom destination port (overrides URL)
   */
  port?: number;
}

/**
 * Extended request for UDP transports
 */
export interface UDPRequest extends ReckerRequest {
  /** UDP-specific options */
  udp?: UDPRequestOptions;
}

/**
 * UDP response with extended methods
 */
export interface UDPResponse<T = unknown> extends ReckerResponse<T> {
  /** UDP-specific timings */
  timings: UDPTimings;

  /** UDP connection information */
  connection: UDPConnection;

  /**
   * Get response as raw Buffer
   */
  buffer(): Promise<Buffer>;

  /**
   * Iterate over incoming packets (for streaming UDP)
   */
  packets(): AsyncGenerator<Buffer>;
}

// ============================================================================
// Transport Interfaces
// ============================================================================

/**
 * UDP Transport interface
 */
export interface UDPTransport extends Transport {
  /**
   * Send a UDP datagram and wait for response
   */
  dispatch(req: UDPRequest): Promise<UDPResponse>;

  /**
   * Send a datagram without waiting for response (fire-and-forget)
   */
  send(host: string, port: number, data: Buffer): Promise<void>;

  /**
   * Send a broadcast datagram
   */
  broadcast(port: number, data: Buffer): Promise<void>;

  /**
   * Join a multicast group
   */
  joinMulticast(group: string): void;

  /**
   * Leave a multicast group
   */
  leaveMulticast(group: string): void;

  /**
   * Close the transport and release resources
   */
  close(): Promise<void>;
}

/**
 * DTLS Transport interface
 */
export interface DTLSTransportInterface extends Transport {
  /**
   * Dispatch a request over DTLS
   */
  dispatch(req: UDPRequest): Promise<UDPResponse>;

  /**
   * Perform DTLS handshake explicitly
   */
  handshake(): Promise<void>;

  /**
   * Get current session for resumption
   */
  getSession(): Buffer | null;

  /**
   * Close the DTLS connection
   */
  close(): Promise<void>;
}

/**
 * QUIC Transport interface
 */
export interface QUICTransportInterface extends Transport {
  /**
   * Dispatch an HTTP/3 request
   */
  dispatch(req: ReckerRequest): Promise<ReckerResponse>;

  /**
   * Get session ticket for 0-RTT resumption
   */
  getSessionTicket(): Buffer | null;

  /**
   * Migrate connection to new local address
   */
  migrate(newLocalAddress: string): Promise<void>;

  /**
   * Close the QUIC connection
   */
  close(): Promise<void>;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Result of a batch UDP operation
 */
export interface UDPBatchResult<T> {
  results: Array<T | Error>;
  stats: {
    total: number;
    successful: number;
    failed: number;
    duration: number;
  };
}

/**
 * UDP discovery result (for broadcast/multicast discovery)
 */
export interface UDPDiscoveryResult {
  address: string;
  port: number;
  data: Buffer;
  latency: number;
}

/**
 * Simple UDP API (standalone functions without client)
 */
export interface SimpleUDPAPI {
  /**
   * Send a UDP packet and wait for response
   */
  send(address: string, data: Buffer, options?: UDPTransportOptions): Promise<UDPResponse>;

  /**
   * Send a broadcast packet and collect responses
   */
  broadcast(
    port: number,
    data: Buffer,
    options?: UDPTransportOptions & { timeout?: number }
  ): Promise<UDPDiscoveryResult[]>;

  /**
   * Discover services via multicast
   */
  discover(
    group: string,
    port: number,
    data: Buffer,
    options?: UDPTransportOptions & { timeout?: number }
  ): Promise<UDPDiscoveryResult[]>;
}

