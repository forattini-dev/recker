import type { WebSocketOptions } from '../websocket/client.js';

// ============================================================================
// Wire protocol types
// ============================================================================

/** RPC envelope — discriminated by `procedure` field */
export interface RaffelEnvelope {
  id: string;
  procedure?: string;
  type: string;
  payload?: unknown;
  metadata?: Record<string, unknown>;
}

/** Channel message — discriminated by `channel` field */
export interface RaffelChannelMessage {
  id?: string;
  type: string;
  channel: string;
  event?: string;
  data?: unknown;
  members?: string[];
}

/** Error payload inside an error envelope */
export interface RaffelErrorPayload {
  code: string;
  status: number;
  message: string;
  details?: unknown;
}

// ============================================================================
// Client types
// ============================================================================

export type ChannelEventHandler = (event: string, data: unknown) => void;

export interface RaffelClientOptions extends WebSocketOptions {
  /** Channels to auto-subscribe on connect */
  channels?: string[];

  /** Per-channel event handlers (keyed by channel name) */
  channelHandlers?: Record<string, ChannelEventHandler>;

  /** Catch-all handler for events on procedures (type: "event") */
  onEvent?: (procedure: string, payload: unknown) => void;

  /** Default timeout for call() in ms (default: 30000) */
  defaultTimeout?: number;
}

export interface RaffelCallOptions {
  /** Timeout in ms (overrides defaultTimeout) */
  timeout?: number;

  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

// ============================================================================
// Error
// ============================================================================

export class RaffelError extends Error {
  code: string;
  status: number;
  details?: unknown;
  procedure?: string;

  constructor(payload: RaffelErrorPayload, procedure?: string) {
    super(payload.message);
    this.name = 'RaffelError';
    this.code = payload.code;
    this.status = payload.status;
    this.details = payload.details;
    this.procedure = procedure;
  }
}
