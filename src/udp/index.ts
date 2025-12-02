/**
 * Recker UDP Module
 *
 * Provides UDP transport and utilities for the Recker HTTP client.
 *
 * @example
 * ```typescript
 * import { createClient } from 'recker';
 * import { UDPTransport, udp } from 'recker/udp';
 *
 * // Option 1: Use with client
 * const client = createClient({
 *   baseUrl: 'udp://192.168.1.100:5000',
 *   transport: new UDPTransport({
 *     timeout: 5000,
 *     retransmissions: 3,
 *   })
 * });
 *
 * const response = await client.get('/status');
 * const data = await response.buffer();
 *
 * // Option 2: Standalone API
 * const response = await udp.send('192.168.1.100:5000', Buffer.from('PING'));
 *
 * // Option 3: Discovery
 * const devices = await udp.broadcast(5000, Buffer.from('DISCOVER'), {
 *   timeout: 3000
 * });
 * ```
 *
 * @packageDocumentation
 */

// Transport
export { UDPClient, UDPTransport, createUDP, udp } from '../transport/udp.js';

// Response
export { UDPResponseWrapper, StreamingUDPResponse } from '../transport/udp-response.js';

// Base classes
export { BaseUDPTransport, udpRequestStorage } from '../transport/base-udp.js';
export type { UDPRequestContext } from '../transport/base-udp.js';

// Types
export type {
  // Timings
  UDPTimings,
  DTLSTimings,
  QUICTimings,
  // Connections
  UDPConnection,
  DTLSConnection,
  QUICConnection,
  // Options
  BaseUDPTransportOptions,
  UDPTransportOptions,
  DTLSTransportOptions,
  QUICTransportOptions,
  // Request/Response
  UDPRequestOptions,
  UDPRequest,
  UDPResponse,
  // Interfaces
  UDPTransport as UDPTransportInterface,
  DTLSTransportInterface,
  QUICTransportInterface,
  // Utilities
  UDPBatchResult,
  UDPDiscoveryResult,
  SimpleUDPAPI,
} from '../types/udp.js';
