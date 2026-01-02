/**
 * Mock Proxy Server
 *
 * A proxy server for testing and debugging HTTP/HTTPS traffic.
 * Supports forward proxy (HTTP CONNECT), intercept mode (MITM), and mTLS.
 *
 * @example
 * ```typescript
 * import { MockProxyServer } from 'recker/testing';
 *
 * // Forward proxy (tunnel mode - no MITM)
 * const proxy = await MockProxyServer.create({ port: 8888 });
 * console.log(`Proxy listening on ${proxy.url}`);
 *
 * // Use with curl: curl -x http://localhost:8888 https://api.github.com/users
 *
 * // Intercept mode (MITM - read/modify traffic)
 * const interceptProxy = await MockProxyServer.create({
 *   port: 8889,
 *   mode: 'intercept',
 *   intercept: {
 *     logPayloads: true,
 *     modifyRequest: (req) => {
 *       req.headers['X-Proxy'] = 'Recker';
 *       return req;
 *     }
 *   }
 * });
 *
 * interceptProxy.on('request', (req) => console.log(req.method, req.url));
 * interceptProxy.on('response', (res) => console.log(res.statusCode));
 *
 * await proxy.stop();
 * ```
 */

import { EventEmitter } from 'node:events';
import {
  createServer,
  type Server as HttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import {
  createServer as createTlsServer,
  type TLSSocket,
} from 'node:tls';
import { createConnection, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { generateCertificate, type CertificateInfo } from './proxy-certs.js';

// ============================================
// Types
// ============================================

export type ProxyMode = 'forward' | 'intercept';

export interface ProxyServerOptions {
  /**
   * Port to listen on (0 = random available port)
   * @default 0
   */
  port?: number;

  /**
   * Host to bind to
   * @default '127.0.0.1'
   */
  host?: string;

  /**
   * Proxy mode
   * - forward: Tunnel mode, just forwards traffic (no MITM)
   * - intercept: MITM mode, terminates TLS and can read/modify traffic
   * @default 'forward'
   */
  mode?: ProxyMode;

  /**
   * mTLS configuration
   */
  mtls?: {
    /**
     * Enable mTLS
     */
    enabled: boolean;

    /**
     * CA certificate for signing dynamic certs (PEM string or path)
     */
    caCert?: string;

    /**
     * CA private key (PEM string or path)
     */
    caKey?: string;

    /**
     * Client certificate to present to upstream (PEM string or path)
     */
    clientCert?: string;

    /**
     * Client private key (PEM string or path)
     */
    clientKey?: string;

    /**
     * Require client certificate from connecting clients
     */
    requireClientCert?: boolean;
  };

  /**
   * Interception options (only for intercept mode)
   */
  intercept?: {
    /**
     * Log request/response payloads
     * @default false
     */
    logPayloads?: boolean;

    /**
     * Maximum payload size to capture (bytes)
     * @default 1048576 (1MB)
     */
    maxPayloadSize?: number;

    /**
     * Modify request before forwarding
     */
    modifyRequest?: (req: ProxyRequest) => ProxyRequest | Promise<ProxyRequest>;

    /**
     * Modify response before returning to client
     */
    modifyResponse?: (res: ProxyResponse) => ProxyResponse | Promise<ProxyResponse>;
  };

  /**
   * Upstream connection timeout (ms)
   * @default 30000
   */
  timeout?: number;

  /**
   * Enable verbose logging
   * @default false
   */
  verbose?: boolean;
}

export interface ProxyRequest {
  /**
   * Unique request ID
   */
  id: string;

  /**
   * Request timestamp
   */
  timestamp: number;

  /**
   * HTTP method
   */
  method: string;

  /**
   * Full URL
   */
  url: string;

  /**
   * Request headers
   */
  headers: Record<string, string>;

  /**
   * Request body (if logPayloads enabled)
   */
  body?: Buffer;

  /**
   * Client IP address
   */
  clientIp: string;

  /**
   * Target host
   */
  targetHost: string;

  /**
   * Target port
   */
  targetPort: number;

  /**
   * Is HTTPS request
   */
  isHttps: boolean;
}

export interface ProxyResponse {
  /**
   * Request ID (matches ProxyRequest.id)
   */
  id: string;

  /**
   * Response timestamp
   */
  timestamp: number;

  /**
   * HTTP status code
   */
  statusCode: number;

  /**
   * HTTP status text
   */
  statusText: string;

  /**
   * Response headers
   */
  headers: Record<string, string>;

  /**
   * Response body (if logPayloads enabled)
   */
  body?: Buffer;

  /**
   * Response latency in ms
   */
  latency: number;

  /**
   * Response size in bytes
   */
  size: number;
}

export interface ProxyError {
  /**
   * Request ID (if available)
   */
  requestId?: string;

  /**
   * Error type
   */
  type: 'connection' | 'timeout' | 'tls' | 'upstream' | 'parse';

  /**
   * Error message
   */
  message: string;

  /**
   * Original error
   */
  error?: Error;

  /**
   * Target host
   */
  targetHost?: string;

  /**
   * Target port
   */
  targetPort?: number;
}

export interface ProxyStats {
  /**
   * Total requests processed
   */
  totalRequests: number;

  /**
   * Successful requests (2xx, 3xx responses)
   */
  successCount: number;

  /**
   * Error count (connection errors, timeouts, etc)
   */
  errorCount: number;

  /**
   * Total bytes received from clients
   */
  bytesIn: number;

  /**
   * Total bytes sent to clients
   */
  bytesOut: number;

  /**
   * Average latency in ms
   */
  avgLatency: number;

  /**
   * Requests per second (rolling average)
   */
  requestsPerSecond: number;

  /**
   * Active connections
   */
  activeConnections: number;

  /**
   * Requests by status code
   */
  byStatusCode: Record<number, number>;

  /**
   * Requests by method
   */
  byMethod: Record<string, number>;

  /**
   * Top hosts by request count
   */
  topHosts: Array<{ host: string; count: number }>;
}

// ============================================
// MockProxyServer
// ============================================

export class MockProxyServer extends EventEmitter {
  private options: Required<Omit<ProxyServerOptions, 'mtls' | 'intercept'>> & {
    mtls?: ProxyServerOptions['mtls'];
    intercept?: ProxyServerOptions['intercept'];
  };
  private httpServer: HttpServer | null = null;
  private _port = 0;
  private _started = false;

  // Stats tracking
  private _stats: ProxyStats = {
    totalRequests: 0,
    successCount: 0,
    errorCount: 0,
    bytesIn: 0,
    bytesOut: 0,
    avgLatency: 0,
    requestsPerSecond: 0,
    activeConnections: 0,
    byStatusCode: {},
    byMethod: {},
    topHosts: [],
  };

  // Internal tracking
  private hostCounts: Map<string, number> = new Map();
  private latencies: number[] = [];
  private requestTimestamps: number[] = [];
  private activeConnections = new Set<Duplex>();

  // Certificate cache for intercept mode
  private certCache: Map<string, CertificateInfo> = new Map();

  constructor(options: ProxyServerOptions = {}) {
    super();
    this.options = {
      port: 0,
      host: '127.0.0.1',
      mode: 'forward',
      timeout: 30000,
      verbose: false,
      ...options,
    };
  }

  // ============================================
  // Properties
  // ============================================

  get port(): number {
    return this._port;
  }

  get address(): string {
    return this.options.host;
  }

  get url(): string {
    return `http://${this.options.host}:${this._port}`;
  }

  get isRunning(): boolean {
    return this._started;
  }

  get mode(): ProxyMode {
    return this.options.mode;
  }

  get stats(): ProxyStats {
    // Calculate RPS
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const recentRequests = this.requestTimestamps.filter((t) => t > oneSecondAgo);

    return {
      ...this._stats,
      requestsPerSecond: recentRequests.length,
      activeConnections: this.activeConnections.size,
      topHosts: Array.from(this.hostCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([host, count]) => ({ host, count })),
    };
  }

  // ============================================
  // Lifecycle
  // ============================================

  async start(): Promise<void> {
    if (this._started) {
      throw new Error('Proxy server already started');
    }

    return new Promise((resolve, reject) => {
      this.httpServer = createServer((req, res) => this.handleHttpRequest(req, res));

      // Handle CONNECT method for HTTPS tunneling
      this.httpServer.on('connect', (req, clientSocket, head) => {
        this.handleConnect(req, clientSocket, head);
      });

      this.httpServer.on('error', reject);

      this.httpServer.listen(this.options.port, this.options.host, () => {
        const addr = this.httpServer!.address();
        this._port = typeof addr === 'string' ? 0 : addr?.port ?? 0;
        this._started = true;
        this.emit('listening', this._port);

        if (this.options.verbose) {
          console.log(`[proxy] Listening on ${this.url} (mode: ${this.options.mode})`);
        }

        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this._started) return;

    // Close all active connections
    for (const socket of this.activeConnections) {
      socket.destroy();
    }
    this.activeConnections.clear();

    return new Promise((resolve) => {
      this.httpServer?.close(() => {
        this._started = false;
        this.httpServer = null;
        this.emit('close');
        resolve();
      });
    });
  }

  reset(): void {
    this._stats = {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      bytesIn: 0,
      bytesOut: 0,
      avgLatency: 0,
      requestsPerSecond: 0,
      activeConnections: 0,
      byStatusCode: {},
      byMethod: {},
      topHosts: [],
    };
    this.hostCounts.clear();
    this.latencies = [];
    this.requestTimestamps = [];
    this.certCache.clear();
    this.emit('reset');
  }

  // ============================================
  // HTTP Request Handling (non-CONNECT)
  // ============================================

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = randomUUID();
    const startTime = Date.now();
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    // Parse target URL
    let targetUrl: URL;
    try {
      targetUrl = new URL(url);
    } catch {
      this.sendError(res, 400, 'Invalid URL');
      return;
    }

    const targetHost = targetUrl.hostname;
    const targetPort = parseInt(targetUrl.port, 10) || (targetUrl.protocol === 'https:' ? 443 : 80);

    // Track stats
    this.updateStats(method, targetHost);

    // Build proxy request
    const proxyRequest: ProxyRequest = {
      id: requestId,
      timestamp: startTime,
      method,
      url,
      headers: this.headersToRecord(req.headers),
      clientIp: req.socket.remoteAddress ?? 'unknown',
      targetHost,
      targetPort,
      isHttps: targetUrl.protocol === 'https:',
    };

    // Read body if logPayloads enabled
    if (this.options.intercept?.logPayloads) {
      proxyRequest.body = await this.readBody(req, this.options.intercept.maxPayloadSize ?? 1048576);
      this._stats.bytesIn += proxyRequest.body?.length ?? 0;
    }

    this.emit('request', proxyRequest);

    // Apply request modification if configured
    let modifiedRequest = proxyRequest;
    if (this.options.intercept?.modifyRequest) {
      try {
        modifiedRequest = await this.options.intercept.modifyRequest(proxyRequest);
      } catch (err) {
        this.emitError({
          requestId,
          type: 'parse',
          message: 'Request modification failed',
          error: err as Error,
          targetHost,
          targetPort,
        });
        this.sendError(res, 500, 'Request modification failed');
        return;
      }
    }

    // Forward request to target
    try {
      await this.forwardHttpRequest(modifiedRequest, req, res, startTime);
    } catch (err) {
      this.emitError({
        requestId,
        type: 'upstream',
        message: (err as Error).message,
        error: err as Error,
        targetHost,
        targetPort,
      });
      this.sendError(res, 502, 'Bad Gateway');
    }
  }

  private async forwardHttpRequest(
    proxyReq: ProxyRequest,
    clientReq: IncomingMessage,
    clientRes: ServerResponse,
    startTime: number
  ): Promise<void> {
    const targetUrl = new URL(proxyReq.url);

    // Build request options
    const requestOptions = {
      hostname: proxyReq.targetHost,
      port: proxyReq.targetPort,
      path: targetUrl.pathname + targetUrl.search,
      method: proxyReq.method,
      headers: { ...proxyReq.headers },
      timeout: this.options.timeout,
    };

    // Remove hop-by-hop headers
    delete requestOptions.headers['proxy-connection'];
    delete requestOptions.headers['proxy-authorization'];
    delete requestOptions.headers['connection'];
    delete requestOptions.headers['keep-alive'];
    delete requestOptions.headers['transfer-encoding'];
    delete requestOptions.headers['te'];
    delete requestOptions.headers['trailer'];
    delete requestOptions.headers['upgrade'];

    // Add X-Forwarded headers
    requestOptions.headers['x-forwarded-for'] = proxyReq.clientIp;
    requestOptions.headers['x-forwarded-host'] = proxyReq.headers['host'] ?? proxyReq.targetHost;
    requestOptions.headers['x-forwarded-proto'] = proxyReq.isHttps ? 'https' : 'http';

    const http = proxyReq.isHttps ? await import('node:https') : await import('node:http');

    const upstreamReq = http.request(requestOptions, (upstreamRes) => {
      const latency = Date.now() - startTime;
      const statusCode = upstreamRes.statusCode ?? 500;

      // Update stats
      this._stats.byStatusCode[statusCode] = (this._stats.byStatusCode[statusCode] ?? 0) + 1;
      if (statusCode >= 200 && statusCode < 400) {
        this._stats.successCount++;
      }
      this.updateLatency(latency);

      // Build proxy response
      const proxyResponse: ProxyResponse = {
        id: proxyReq.id,
        timestamp: Date.now(),
        statusCode,
        statusText: upstreamRes.statusMessage ?? '',
        headers: this.headersToRecord(upstreamRes.headers),
        latency,
        size: 0,
      };

      // Forward response headers
      const responseHeaders = { ...upstreamRes.headers };
      delete responseHeaders['transfer-encoding'];

      clientRes.writeHead(statusCode, responseHeaders);

      // Stream response body
      let totalSize = 0;
      upstreamRes.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        clientRes.write(chunk);
      });

      upstreamRes.on('end', () => {
        proxyResponse.size = totalSize;
        this._stats.bytesOut += totalSize;
        this.emit('response', proxyResponse);
        clientRes.end();
      });

      upstreamRes.on('error', (err) => {
        this.emitError({
          requestId: proxyReq.id,
          type: 'upstream',
          message: err.message,
          error: err,
          targetHost: proxyReq.targetHost,
          targetPort: proxyReq.targetPort,
        });
        clientRes.destroy();
      });
    });

    upstreamReq.on('error', (err) => {
      this.emitError({
        requestId: proxyReq.id,
        type: 'connection',
        message: err.message,
        error: err,
        targetHost: proxyReq.targetHost,
        targetPort: proxyReq.targetPort,
      });
      this.sendError(clientRes, 502, 'Bad Gateway');
    });

    upstreamReq.on('timeout', () => {
      this.emitError({
        requestId: proxyReq.id,
        type: 'timeout',
        message: 'Request timeout',
        targetHost: proxyReq.targetHost,
        targetPort: proxyReq.targetPort,
      });
      upstreamReq.destroy();
      this.sendError(clientRes, 504, 'Gateway Timeout');
    });

    // Forward request body
    if (proxyReq.body) {
      upstreamReq.write(proxyReq.body);
      upstreamReq.end();
    } else {
      clientReq.pipe(upstreamReq);
    }
  }

  // ============================================
  // CONNECT Handling (HTTPS Tunneling)
  // ============================================

  private handleConnect(
    req: IncomingMessage,
    clientSocket: Duplex,
    head: Buffer
  ): void {
    const requestId = randomUUID();
    const startTime = Date.now();

    // Parse target from CONNECT request
    const [targetHost, targetPortStr] = (req.url ?? '').split(':');
    const targetPort = parseInt(targetPortStr, 10) || 443;

    // Track connection
    this.activeConnections.add(clientSocket);
    clientSocket.on('close', () => {
      this.activeConnections.delete(clientSocket);
    });

    // Track stats
    this.updateStats('CONNECT', targetHost);

    // Emit request event
    const proxyRequest: ProxyRequest = {
      id: requestId,
      timestamp: startTime,
      method: 'CONNECT',
      url: `https://${targetHost}:${targetPort}`,
      headers: this.headersToRecord(req.headers),
      clientIp: req.socket.remoteAddress ?? 'unknown',
      targetHost,
      targetPort,
      isHttps: true,
    };

    this.emit('request', proxyRequest);

    if (this.options.verbose) {
      console.log(`[proxy] CONNECT ${targetHost}:${targetPort}`);
    }

    if (this.options.mode === 'forward') {
      // Forward mode: Just tunnel, no MITM
      this.tunnel(clientSocket, targetHost, targetPort, head, requestId, startTime);
    } else {
      // Intercept mode: MITM
      this.intercept(clientSocket, targetHost, targetPort, head, requestId, startTime);
    }
  }

  /**
   * Forward proxy: Create TCP tunnel (no MITM)
   */
  private tunnel(
    clientSocket: Duplex,
    targetHost: string,
    targetPort: number,
    head: Buffer,
    requestId: string,
    startTime: number
  ): void {
    const targetSocket = createConnection(targetPort, targetHost, () => {
      // Send 200 Connection Established
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

      // Pipe data bidirectionally
      if (head.length > 0) {
        targetSocket.write(head);
      }

      clientSocket.pipe(targetSocket);
      targetSocket.pipe(clientSocket);

      // Track bytes
      clientSocket.on('data', (chunk) => {
        this._stats.bytesIn += chunk.length;
      });

      targetSocket.on('data', (chunk) => {
        this._stats.bytesOut += chunk.length;
      });

      const latency = Date.now() - startTime;
      this.updateLatency(latency);
      this._stats.successCount++;

      // Emit response for tunnel establishment
      const proxyResponse: ProxyResponse = {
        id: requestId,
        timestamp: Date.now(),
        statusCode: 200,
        statusText: 'Connection Established',
        headers: {},
        latency,
        size: 0,
      };

      this.emit('response', proxyResponse);
    });

    targetSocket.on('error', (err) => {
      this.emitError({
        requestId,
        type: 'connection',
        message: err.message,
        error: err,
        targetHost,
        targetPort,
      });
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.destroy();
    });

    targetSocket.setTimeout(this.options.timeout, () => {
      this.emitError({
        requestId,
        type: 'timeout',
        message: 'Connection timeout',
        targetHost,
        targetPort,
      });
      targetSocket.destroy();
      clientSocket.write('HTTP/1.1 504 Gateway Timeout\r\n\r\n');
      clientSocket.destroy();
    });

    clientSocket.on('error', () => {
      targetSocket.destroy();
    });

    clientSocket.on('close', () => {
      targetSocket.destroy();
    });

    targetSocket.on('close', () => {
      clientSocket.destroy();
    });
  }

  /**
   * Intercept mode: MITM with TLS termination
   */
  private async intercept(
    clientSocket: Duplex,
    targetHost: string,
    targetPort: number,
    _head: Buffer,
    requestId: string,
    startTime: number
  ): Promise<void> {
    try {
      // Generate or get cached certificate for this host
      const cert = await this.getCertificateForHost(targetHost);

      // Create TLS server for client connection
      const tlsServer = createTlsServer({
        key: cert.key,
        cert: cert.cert,
        requestCert: this.options.mtls?.requireClientCert ?? false,
        rejectUnauthorized: false,
      });

      // Handle TLS connection from client
      tlsServer.on('secureConnection', async (tlsSocket: TLSSocket) => {
        // Create HTTP server over TLS socket
        this.handleInterceptedConnection(
          tlsSocket,
          targetHost,
          targetPort,
          requestId,
          startTime
        );
      });

      // Send 200 Connection Established to client
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

      // Upgrade client socket to TLS
      tlsServer.emit('connection', clientSocket);

    } catch (err) {
      this.emitError({
        requestId,
        type: 'tls',
        message: (err as Error).message,
        error: err as Error,
        targetHost,
        targetPort,
      });
      clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      clientSocket.destroy();
    }
  }

  private async handleInterceptedConnection(
    clientSocket: TLSSocket,
    targetHost: string,
    targetPort: number,
    _requestId: string,
    _startTime: number
  ): Promise<void> {
    // Simple HTTP parser for intercepted traffic
    let buffer = Buffer.alloc(0);

    clientSocket.on('data', async (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      this._stats.bytesIn += chunk.length;

      // Try to parse HTTP request
      const httpEnd = buffer.indexOf('\r\n\r\n');
      if (httpEnd === -1) return;

      const headerStr = buffer.subarray(0, httpEnd).toString('utf-8');
      const body = buffer.subarray(httpEnd + 4);

      const lines = headerStr.split('\r\n');
      const [method, path] = (lines[0] ?? '').split(' ');

      const headers: Record<string, string> = {};
      for (let i = 1; i < lines.length; i++) {
        const colonIdx = lines[i].indexOf(':');
        if (colonIdx > 0) {
          const key = lines[i].substring(0, colonIdx).toLowerCase().trim();
          const value = lines[i].substring(colonIdx + 1).trim();
          headers[key] = value;
        }
      }

      const requestId = randomUUID();
      const startTime = Date.now();

      const proxyRequest: ProxyRequest = {
        id: requestId,
        timestamp: startTime,
        method: method ?? 'GET',
        url: `https://${targetHost}${path}`,
        headers,
        clientIp: clientSocket.remoteAddress ?? 'unknown',
        targetHost,
        targetPort,
        isHttps: true,
        body: this.options.intercept?.logPayloads ? body : undefined,
      };

      this.emit('request', proxyRequest);

      // Forward to target
      try {
        const response = await this.forwardInterceptedRequest(proxyRequest);

        // Send response to client
        let responseStr = `HTTP/1.1 ${response.statusCode} ${response.statusText}\r\n`;
        for (const [key, value] of Object.entries(response.headers)) {
          responseStr += `${key}: ${value}\r\n`;
        }
        responseStr += '\r\n';

        clientSocket.write(responseStr);
        if (response.body) {
          clientSocket.write(response.body);
          this._stats.bytesOut += response.body.length;
        }

        this.emit('response', response);
        this._stats.successCount++;

      } catch (err) {
        this.emitError({
          requestId,
          type: 'upstream',
          message: (err as Error).message,
          error: err as Error,
          targetHost,
          targetPort,
        });

        clientSocket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      }

      buffer = Buffer.alloc(0);
    });

    clientSocket.on('error', () => {
      clientSocket.destroy();
    });
  }

  private async forwardInterceptedRequest(proxyReq: ProxyRequest): Promise<ProxyResponse> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const https = require('node:https');

      const targetUrl = new URL(proxyReq.url);
      const requestOptions = {
        hostname: proxyReq.targetHost,
        port: proxyReq.targetPort,
        path: targetUrl.pathname + targetUrl.search,
        method: proxyReq.method,
        headers: { ...proxyReq.headers },
        timeout: this.options.timeout,
        rejectUnauthorized: false, // Allow self-signed certs in upstream
      };

      // Add mTLS client cert if configured
      if (this.options.mtls?.clientCert && this.options.mtls?.clientKey) {
        (requestOptions as any).cert = this.options.mtls.clientCert;
        (requestOptions as any).key = this.options.mtls.clientKey;
      }

      // Remove hop-by-hop headers
      delete requestOptions.headers['proxy-connection'];
      delete requestOptions.headers['connection'];
      delete requestOptions.headers['keep-alive'];

      const req = https.request(requestOptions, (res: IncomingMessage) => {
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => chunks.push(chunk));

        res.on('end', () => {
          const body = Buffer.concat(chunks);
          const latency = Date.now() - startTime;

          const proxyResponse: ProxyResponse = {
            id: proxyReq.id,
            timestamp: Date.now(),
            statusCode: res.statusCode ?? 500,
            statusText: res.statusMessage ?? '',
            headers: this.headersToRecord(res.headers),
            latency,
            size: body.length,
            body: this.options.intercept?.logPayloads ? body : undefined,
          };

          this.updateLatency(latency);
          this._stats.byStatusCode[proxyResponse.statusCode] =
            (this._stats.byStatusCode[proxyResponse.statusCode] ?? 0) + 1;

          resolve(proxyResponse);
        });

        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Request timeout')));

      if (proxyReq.body) {
        req.write(proxyReq.body);
      }
      req.end();
    });
  }

  // ============================================
  // Certificate Management
  // ============================================

  private async getCertificateForHost(host: string): Promise<CertificateInfo> {
    // Check cache
    const cached = this.certCache.get(host);
    if (cached) return cached;

    // Generate new certificate
    const cert = await generateCertificate(host, {
      caCert: this.options.mtls?.caCert,
      caKey: this.options.mtls?.caKey,
    });

    this.certCache.set(host, cert);
    return cert;
  }

  // ============================================
  // Utilities
  // ============================================

  private sendError(res: ServerResponse, status: number, message: string): void {
    this._stats.errorCount++;
    res.writeHead(status, { 'Content-Type': 'text/plain' });
    res.end(message);
  }

  private emitError(error: ProxyError): void {
    this._stats.errorCount++;
    this.emit('error', error);

    if (this.options.verbose) {
      console.error(`[proxy] Error: ${error.type} - ${error.message}`);
    }
  }

  private updateStats(method: string, host: string): void {
    this._stats.totalRequests++;
    this._stats.byMethod[method] = (this._stats.byMethod[method] ?? 0) + 1;
    this.hostCounts.set(host, (this.hostCounts.get(host) ?? 0) + 1);
    this.requestTimestamps.push(Date.now());

    // Cleanup old timestamps (keep last minute)
    const oneMinuteAgo = Date.now() - 60000;
    this.requestTimestamps = this.requestTimestamps.filter((t) => t > oneMinuteAgo);
  }

  private updateLatency(latency: number): void {
    this.latencies.push(latency);

    // Keep only last 1000 latencies
    if (this.latencies.length > 1000) {
      this.latencies.shift();
    }

    // Calculate average
    const sum = this.latencies.reduce((a, b) => a + b, 0);
    this._stats.avgLatency = Math.round(sum / this.latencies.length);
  }

  private headersToRecord(headers: IncomingMessage['headers']): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) {
        result[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }
    return result;
  }

  private async readBody(req: IncomingMessage, maxSize: number): Promise<Buffer> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;

      req.on('data', (chunk: Buffer) => {
        if (totalSize < maxSize) {
          chunks.push(chunk);
          totalSize += chunk.length;
        }
      });

      req.on('end', () => {
        resolve(Buffer.concat(chunks).subarray(0, maxSize));
      });

      req.on('error', () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }

  // ============================================
  // Static factory
  // ============================================

  static async create(options: ProxyServerOptions = {}): Promise<MockProxyServer> {
    const server = new MockProxyServer(options);
    await server.start();
    return server;
  }
}

// ============================================
// Helper functions
// ============================================

/**
 * Create a simple forward proxy
 */
export async function createForwardProxy(
  port?: number,
  options?: Omit<ProxyServerOptions, 'port' | 'mode'>
): Promise<MockProxyServer> {
  return MockProxyServer.create({
    port: port ?? 0,
    mode: 'forward',
    ...options,
  });
}

/**
 * Create an intercept proxy (MITM)
 */
export async function createInterceptProxy(
  port?: number,
  options?: Omit<ProxyServerOptions, 'port' | 'mode'>
): Promise<MockProxyServer> {
  return MockProxyServer.create({
    port: port ?? 0,
    mode: 'intercept',
    ...options,
  });
}
