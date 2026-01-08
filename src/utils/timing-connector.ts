/**
 * Timing Connector for Undici
 * 
 * Custom connector that captures real DNS, TCP, and TLS timing
 * by separating each phase of the connection process.
 */

import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns/promises';
import { performance } from 'node:perf_hooks';

export interface ConnectionTimings {
  dns: number;
  tcp: number;
  tls: number;
  total: number;
}

export interface TimingConnectorOptions {
  /** Connection timeout in ms (default: 10000) */
  timeout?: number;
  /** Allow HTTP/2 negotiation (default: false) */
  allowH2?: boolean;
  /** Keep-alive initial delay (default: 60000) */
  keepAliveInitialDelay?: number;
  /** Max cached TLS sessions (default: 100) */
  maxCachedSessions?: number;
  /** Local address to bind to */
  localAddress?: string;
}

// Storage for timing data - keyed by hostname
const hostTimings = new Map<string, ConnectionTimings>();

// Connection counter to detect reuse - incremented each time a NEW connection is made
// Key: hostname, Value: connection ID (monotonically increasing)
const connectionCounter = new Map<string, number>();
let globalConnectionId = 0;

// TLS session cache for session resumption
const sessionCache = new Map<string, Buffer>();

/**
 * Get the last recorded timing for a hostname
 * Returns undefined if no timing exists or if the connection was reused
 */
export function getTimingForHost(hostname: string): ConnectionTimings | undefined {
  const timing = hostTimings.get(hostname);
  if (process.env.DEBUG_TIMING) {
    console.log(`[TIMING] getTimingForHost(${hostname}):`, timing ? 'found' : 'NOT FOUND', 'map size:', hostTimings.size);
  }
  return timing;
}

/**
 * Get the current connection ID for a hostname
 * Used to detect if a new connection was made for a specific request
 */
export function getConnectionId(hostname: string): number {
  return connectionCounter.get(hostname) ?? 0;
}

/**
 * Check if a new connection was made since the given connection ID
 */
export function isNewConnection(hostname: string, previousId: number): boolean {
  const currentId = connectionCounter.get(hostname) ?? 0;
  return currentId > previousId;
}

/**
 * Clear timing for a hostname (call after reading to avoid memory leaks)
 */
export function clearTimingForHost(hostname: string): void {
  hostTimings.delete(hostname);
}

/**
 * Clear all cached timings
 */
export function clearAllTimings(): void {
  hostTimings.clear();
}

/** Undici connector options interface */
interface ConnectorOptions {
  hostname: string;
  host?: string;
  protocol: string;
  port: string;
  servername?: string;
  localAddress?: string | null;
  httpSocket?: net.Socket;
}

/** Undici callback args - either success [null, socket] or error [error, null] */
type CallbackArgs = [null, net.Socket | tls.TLSSocket] | [Error, null];
type ConnectorCallback = (...args: CallbackArgs) => void;

/**
 * Build a timing-aware connector for undici Agent
 */
export function buildTimingConnector(options: TimingConnectorOptions = {}) {
  const timeout = options.timeout ?? 10000;
  const allowH2 = options.allowH2 ?? false;
  const keepAliveInitialDelay = options.keepAliveInitialDelay ?? 60000;
  const maxCachedSessions = options.maxCachedSessions ?? 100;
  const localAddress = options.localAddress;

  return function connect(opts: ConnectorOptions, callback: ConnectorCallback): void {
    const { hostname, protocol, port, servername } = opts;
    const isHttps = protocol === 'https:';
    const targetPort = Number(port) || (isHttps ? 443 : 80);

    const timings: ConnectionTimings = {
      dns: 0,
      tcp: 0,
      tls: 0,
      total: 0
    };

    const startTime = performance.now();

    // Run async DNS lookup, then sync socket operations
    doConnect();

    async function doConnect() {
      try {
        // 1. DNS Lookup
        const dnsStart = performance.now();
        let resolvedAddress: string;
        
        try {
          const result = await dns.lookup(hostname, { family: 4 });
          resolvedAddress = result.address;
        } catch (dnsError) {
          // Try IPv6 fallback
          try {
            const result = await dns.lookup(hostname, { family: 6 });
            resolvedAddress = result.address;
          } catch {
            callback(dnsError as Error, null);
            return;
          }
        }
        
        timings.dns = performance.now() - dnsStart;

        // 2. TCP Connection
        const tcpStart = performance.now();
        
        const tcpSocket = net.connect({
          host: resolvedAddress,
          port: targetPort,
          localAddress: localAddress,
        });

        tcpSocket.setNoDelay(true);
        tcpSocket.setKeepAlive(true, keepAliveInitialDelay);

        // Timeout handling
        const timeoutTimer = setTimeout(() => {
          tcpSocket.destroy(new Error(`Connect timeout after ${timeout}ms`));
        }, timeout);

        tcpSocket.once('error', (err) => {
          clearTimeout(timeoutTimer);
          callback(err, null);
        });

        tcpSocket.once('connect', () => {
          timings.tcp = performance.now() - tcpStart;
          clearTimeout(timeoutTimer);

          if (!isHttps) {
            timings.total = performance.now() - startTime;
            hostTimings.set(hostname, { ...timings });
            // Increment connection counter to mark this as a NEW connection
            globalConnectionId++;
            connectionCounter.set(hostname, globalConnectionId);
            callback(null, tcpSocket);
            return;
          }

          // 3. TLS Handshake
          const tlsStart = performance.now();
          const sn = servername || hostname;
          const sessionKey = `${sn}:${targetPort}`;
          const session = sessionCache.get(sessionKey);

          const tlsSocket = tls.connect({
            socket: tcpSocket,
            servername: sn,
            session: session,
            ALPNProtocols: allowH2 ? ['h2', 'http/1.1'] : ['http/1.1'],
            rejectUnauthorized: true,
          });

          tlsSocket.on('session', (newSession) => {
            if (sessionCache.size >= maxCachedSessions) {
              const firstKey = sessionCache.keys().next().value;
              if (firstKey) sessionCache.delete(firstKey);
            }
            sessionCache.set(sessionKey, newSession);
          });

          tlsSocket.once('error', (err) => {
            callback(err, null);
          });

          tlsSocket.once('secureConnect', () => {
            timings.tls = performance.now() - tlsStart;
            timings.total = performance.now() - startTime;
            hostTimings.set(hostname, { ...timings });
            // Increment connection counter to mark this as a NEW connection
            globalConnectionId++;
            connectionCounter.set(hostname, globalConnectionId);
            if (process.env.DEBUG_TIMING) {
              console.log(`[TIMING] Stored for ${hostname}:`, timings);
            }
            callback(null, tlsSocket);
          });
        });

      } catch (err) {
        callback(err as Error, null);
      }
    }
  };
}
