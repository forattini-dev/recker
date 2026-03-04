/**
 * Transport factory — auto-detects transport type from URL scheme
 * and instantiates the appropriate transport backend.
 */

import type { RaffelTransport } from './transport.js';
import type { RaffelClientOptions, RaffelTransportType } from './types.js';
import { WsTransport } from './transport-ws.js';

/**
 * Detect transport type from URL scheme.
 *
 * | Scheme | Transport |
 * |--------|-----------|
 * | ws:// wss:// | websocket |
 * | http:// https:// with /rpc path | jsonrpc |
 * | http:// https:// | http |
 * | tcp:// | tcp |
 * | udp:// | udp |
 */
export function detectTransportType(url: string, options?: RaffelClientOptions): RaffelTransportType {
  if (options?.transport) return options.transport;

  const lower = url.toLowerCase();

  if (lower.startsWith('ws://') || lower.startsWith('wss://')) {
    return 'websocket';
  }

  if (lower.startsWith('tcp://')) {
    return 'tcp';
  }

  if (lower.startsWith('udp://')) {
    return 'udp';
  }

  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      if (parsed.pathname === '/rpc' || parsed.pathname.endsWith('/rpc')) {
        return 'jsonrpc';
      }
    } catch {
      // fall through
    }
    return 'http';
  }

  // Default to websocket for unknown schemes
  return 'websocket';
}

/**
 * Create a transport instance for the given URL and options.
 *
 * Non-WebSocket transports are lazy-imported to avoid pulling in
 * node:net / node:dgram when not needed.
 */
export async function createTransport(url: string, options: RaffelClientOptions = {}): Promise<RaffelTransport> {
  const type = detectTransportType(url, options);

  switch (type) {
    case 'websocket':
      return new WsTransport(url, options.ws);

    case 'http': {
      const { HttpTransport } = await import('./transport-http.js');
      return new HttpTransport(url, options.http);
    }

    case 'tcp': {
      const { TcpTransport } = await import('./transport-tcp.js');
      return new TcpTransport(url, options.tcp);
    }

    case 'udp': {
      const { UdpTransport } = await import('./transport-udp.js');
      return new UdpTransport(url, options.udp);
    }

    case 'jsonrpc': {
      const { JsonRpcTransport } = await import('./transport-jsonrpc.js');
      return new JsonRpcTransport(url, options.jsonrpc);
    }

    default:
      throw new Error(`Unknown transport type: ${type}`);
  }
}
