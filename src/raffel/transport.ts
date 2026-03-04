/**
 * Transport abstraction for RaffelClient multi-protocol support.
 *
 * Transports handle the wire-level communication (WS, HTTP, TCP, UDP, JSON-RPC)
 * while the client handles envelope correlation, channels, and high-level API.
 */

import type { RaffelEnvelope } from './types.js';

// ============================================================================
// Capability bitmask
// ============================================================================

export const TransportCapability = {
  CALL:       0b000001,
  NOTIFY:     0b000010,
  SUBSCRIBE:  0b000100,
  PUBLISH:    0b001000,
  CANCEL:     0b010000,
  STREAM:     0b100000,
} as const;

export type TransportCapabilityFlag = (typeof TransportCapability)[keyof typeof TransportCapability];

// ============================================================================
// Transport events
// ============================================================================

export type RaffelTransportEvent =
  | 'connected'
  | 'disconnected'
  | 'message'
  | 'reconnecting'
  | 'error';

type Listener = (...args: any[]) => void;

// ============================================================================
// Transport interface
// ============================================================================

/**
 * Base transport — bidirectional message-passing (WS, TCP, UDP).
 *
 * `message` events carry parsed JSON objects (envelopes or channel messages).
 */
export interface RaffelTransport {
  readonly capabilities: number;
  readonly isConnected: boolean;

  connect(): Promise<void>;
  close(code?: number, reason?: string): void;

  /** Send a raw JSON-serializable object over the wire */
  send(data: unknown): void;

  on(event: RaffelTransportEvent, listener: Listener): void;
  off(event: RaffelTransportEvent, listener: Listener): void;
  once(event: RaffelTransportEvent, listener: Listener): void;
}

/**
 * Executable transport — request-response (HTTP, JSON-RPC).
 *
 * These transports don't maintain persistent connections with message events.
 * Instead, each `execute()` call maps to one HTTP round-trip.
 */
export interface RaffelExecutableTransport extends RaffelTransport {
  execute(envelope: RaffelEnvelope): Promise<unknown>;
  executeStream?(envelope: RaffelEnvelope): AsyncIterable<unknown>;
}

// ============================================================================
// Type guards
// ============================================================================

export function hasExecute(transport: RaffelTransport): transport is RaffelExecutableTransport {
  return typeof (transport as RaffelExecutableTransport).execute === 'function';
}

export function hasCapability(transport: RaffelTransport, cap: number): boolean {
  return (transport.capabilities & cap) === cap;
}
