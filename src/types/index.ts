export type Method =
  // Standard HTTP Methods
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'HEAD'
  | 'OPTIONS'
  | 'TRACE'
  | 'CONNECT'
  // CDN/Cache Methods
  | 'PURGE'
  // WebDAV Methods
  | 'PROPFIND'
  | 'PROPPATCH'
  | 'MKCOL'
  | 'COPY'
  | 'MOVE'
  | 'LOCK'
  | 'UNLOCK'
  // Link Methods
  | 'LINK'
  | 'UNLINK';

export interface ProgressEvent {
  loaded: number;    // Bytes transferred
  total?: number;    // Total bytes (may be unknown)
  percent?: number;  // Percentage (0-100)
  rate?: number;     // Bytes per second
  estimated?: number; // Estimated time remaining in ms
}

export type ProgressCallback = (progress: ProgressEvent) => void;

export interface RequestOptions {
  method?: Method;
  headers?: HeadersInit;
  body?: BodyInit | null;
  params?: Record<string, string | number>;
  signal?: AbortSignal;
  throwHttpErrors?: boolean; // Default true
  timeout?: number; // Timeout in milliseconds
  onUploadProgress?: ProgressCallback;
  onDownloadProgress?: ProgressCallback;
}

export interface ReckerRequest {
  url: string;
  method: Method;
  headers: Headers;
  body: BodyInit | null;
  signal?: AbortSignal;
  throwHttpErrors?: boolean;
  onUploadProgress?: ProgressCallback;
  onDownloadProgress?: ProgressCallback;

  // Helpers for immutability
  withHeader(name: string, value: string): ReckerRequest;
  withBody(body: BodyInit): ReckerRequest;

  /** @internal */
  _hooks?: {
      onDnsLookup?: (info: any) => void;
      onTcpConnect?: (info: any) => void;
      onTlsHandshake?: (info: any) => void;
  };
}

export interface Timings {
  queuing?: number;
  dns?: number;
  tls?: number;
  tcp?: number;
  firstByte?: number; // TTFB
  content?: number;
  total?: number;
}

/**
 * Unified concurrency configuration
 * Controls request dispatch, rate limiting, and connection pooling
 */
export interface ConcurrencyConfig {
  /**
   * Maximum concurrent in-flight requests
   * Simple shorthand for common use case
   * @default 10
   *
   * @example
   * ```typescript
   * // Simple usage
   * concurrency: 20
   *
   * // Advanced usage
   * concurrency: {
   *   max: 20,
   *   requestsPerInterval: 100,
   *   interval: 1000
   * }
   * ```
   */
  max?: number;

  /**
   * Maximum number of requests allowed per interval window
   * Used for rate limiting
   * @default Infinity (no rate limiting)
   */
  requestsPerInterval?: number;

  /**
   * Interval length in milliseconds for rate limiting
   * @default 1000
   */
  interval?: number;

  /**
   * Advanced: Override RequestRunner configuration for batch operations
   * Usually not needed - defaults to using 'max'
   */
  runner?: {
    /** Max concurrent batch tasks (default: inherits from 'max') */
    concurrency?: number;
    /** Retry attempts for failed requests */
    retries?: number;
    /** Delay between retries in ms */
    retryDelay?: number;
  };

  /**
   * Advanced: Override Agent (connection pool) configuration
   * Use 'auto' for automatic calculation based on 'max' and HTTP version
   */
  agent?: {
    /** Max TCP connections per domain ('auto' = max / 2) */
    connections?: number | 'auto';
    /** HTTP/1.1 pipelining factor */
    pipelining?: number;
    /** Keep connections alive between requests */
    keepAlive?: boolean;
    /** Keep-alive timeout in ms */
    keepAliveTimeout?: number;
    /** Max keep-alive timeout in ms */
    keepAliveMaxTimeout?: number;
    /** Connection timeout in ms */
    connectTimeout?: number;
    /** Enable per-domain connection pooling */
    perDomainPooling?: boolean;
  };

  /**
   * Advanced: Override HTTP/2 stream configuration
   * Use 'auto' for automatic calculation
   */
  http2?: {
    /** Max concurrent streams per HTTP/2 connection ('auto' based on max) */
    maxConcurrentStreams?: number | 'auto';
  };
}

export interface HTTP2Settings {
  headerTableSize?: number;
  enablePush?: number;
  initialWindowSize?: number;
  maxFrameSize?: number;
  maxConcurrentStreams?: number;
  maxHeaderListSize?: number;
  enableConnectProtocol?: number;
}

export interface ConnectionInfo {
  // Basic connection info
  protocol?: string; // e.g., "HTTP/1.1", "h2", "h3"
  cipher?: string;
  remoteAddress?: string;
  remotePort?: number;
  localAddress?: string;
  localPort?: number;

  // HTTP/2 specific metrics
  http2?: {
    streamId?: number;          // HTTP/2 stream ID
    streamWeight?: number;      // Stream priority weight
    streamDependency?: number;  // Stream dependency ID
    serverPush?: boolean;       // Whether server push was used
    settingsReceived?: boolean; // Whether SETTINGS frame was received
    maxConcurrentStreams?: number; // Server-advertised concurrency
    currentStreams?: number;    // Active streams on the session
    pendingStreams?: number;    // Pending streams waiting for capacity
    localWindowSize?: number;   // Current connection window
    remoteWindowSize?: number;  // Remote window (if exposed)
    localSettings?: HTTP2Settings;
    remoteSettings?: HTTP2Settings;
  };

  // HTTP/3 / QUIC specific metrics
  http3?: {
    quicVersion?: string;       // QUIC protocol version
    zeroRTT?: boolean;          // Whether 0-RTT was used
    maxStreams?: number;        // Max concurrent streams
    handshakeConfirmed?: boolean; // Transport handshake finished
  };

  // Connection reuse metrics
  reused?: boolean;             // Whether connection was reused
  rtt?: number;                 // Round-trip time in ms
}

// Re-export SSE types
export interface SSEEvent {
  id?: string;
  event?: string;
  data: string;
  retry?: number;
}

export interface PaginationConfig {
  pageParam?: string; // default: 'page'
  limitParam?: string; // default: 'limit'
  offsetParam?: string; // default: 'offset'
  resultsPath?: string; // default: 'data' or 'items'
  nextCursorPath?: string; // default: 'next'
}

export interface PageResult<T = any> {
    data: T;
    response: ReckerResponse;
    pageNumber: number;
}

export type NextFunction = (req: ReckerRequest) => Promise<ReckerResponse>;
export type Middleware = (req: ReckerRequest, next: NextFunction) => Promise<ReckerResponse>;

export interface Transport {
  dispatch(req: ReckerRequest): Promise<ReckerResponse>;
}

export interface CacheEntry {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timestamp: number;
}

export interface CacheStorage {
  get(key: string): Promise<CacheEntry | undefined | null>;
  set(key: string, value: CacheEntry, ttl: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export type CacheStrategy = 'cache-first' | 'network-only' | 'network-first' | 'stale-while-revalidate';

export type Plugin = (client: any) => void;

export type HookFunction<T = void> = (req: ReckerRequest, extra?: any) => T | Promise<T>;

export interface Hooks {
  beforeRequest?: Array<(req: ReckerRequest) => ReckerRequest | void | Promise<ReckerRequest | void>>;
  afterResponse?: Array<(req: ReckerRequest, res: ReckerResponse) => ReckerResponse | void | Promise<ReckerResponse | void>>;
  onError?: Array<(error: Error, req: ReckerRequest) => ReckerResponse | void | Promise<ReckerResponse | void>>;
  
  /**
   * Dispatched when a request is retried.
   */
  onRetry?: Array<(error: Error, attempt: number, delay: number, req: ReckerRequest) => void | Promise<void>>;
  
  /**
   * Dispatched after URL template resolution but before request dispatch.
   */
  onUrlResolved?: Array<(template: string, url: string, params: Record<string, string | number>, req: ReckerRequest) => void | Promise<void>>;

  // Low-level Network Hooks (Zero-overhead if unused)
  onDnsLookup?: Array<(info: { domain: string, duration: number, ip?: string }, req: ReckerRequest) => void>;
  onTcpConnect?: Array<(info: { remoteAddress: string, duration: number }, req: ReckerRequest) => void>;
  onTlsHandshake?: Array<(info: { protocol: string, cipher: string, duration: number }, req: ReckerRequest) => void>;
  
  /**
   * Dispatched when a socket/stream is assigned to the request.
   * Crucial for understanding HTTP/2 multiplexing and Keep-Alive reuse.
   */
  onSocketAssigned?: Array<(info: { protocol: string, reused: boolean }, req: ReckerRequest) => void>;

  /**
   * Dispatched when the request body has been fully flushed to the network.
   */
  onRequestSent?: Array<(req: ReckerRequest) => void>;

  /**
   * Dispatched when the first byte of the response (headers) is received.
   * Represents Time To First Byte (TTFB).
   */
  onResponseStart?: Array<(info: { status: number, headers: Headers }, req: ReckerRequest) => void>;
}

export interface ProxyOptions {
  /**
   * Proxy URL (e.g., 'http://proxy.example.com:8080')
   */
  url: string;
  /**
   * Proxy authentication (if required)
   */
  auth?: {
    username: string;
    password: string;
  };
}

export interface DNSOptions {
  /**
   * DNS hostname to IP override mapping
   * Useful for testing or bypassing DNS resolution
   *
   * @example
   * ```typescript
   * dns: {
   *   override: {
   *     'api.example.com': '1.2.3.4',
   *     'cdn.example.com': '5.6.7.8'
   *   }
   * }
   * ```
   */
  override?: Record<string, string>;

  /**
   * Custom DNS servers to use for resolution
   * Falls back to system DNS if not provided
   *
   * @example
   * ```typescript
   * dns: {
   *   servers: ['8.8.8.8', '1.1.1.1'] // Google and Cloudflare DNS
   * }
   * ```
   */
  servers?: string[];

  /**
   * DNS lookup timeout in milliseconds
   * @default 5000
   */
  timeout?: number;

  /**
   * Prefer IPv4 over IPv6
   * @default true
   */
  preferIPv4?: boolean;
}

export interface XSRFOptions {
  /**
   * Name of the cookie to read the XSRF token from
   * @default 'XSRF-TOKEN'
   */
  cookieName?: string;
  /**
   * Name of the header to send the XSRF token in
   * @default 'X-XSRF-TOKEN'
   */
  headerName?: string;
}

export interface CompressionOptions {
  /**
   * Compression algorithm
   * @default 'gzip'
   */
  algorithm?: 'gzip' | 'deflate' | 'br';
  /**
   * Minimum body size to compress (bytes)
   * @default 1024
   */
  threshold?: number;
  /**
   * Force compression even for small bodies
   * @default false
   */
  force?: boolean;
  /**
   * HTTP methods to compress
   * @default ['POST', 'PUT', 'PATCH']
   */
  methods?: string[];
}

export interface HTTP2Options {
  /**
   * Enable HTTP/2 support (default: false)
   * When enabled, the client will use HTTP/2 if the server supports it
   * @default false
   */
  enabled?: boolean;

  /**
   * Maximum number of concurrent HTTP/2 streams per connection (default: 100)
   * Only applies when HTTP/2 is enabled
   * @default 100
   */
  maxConcurrentStreams?: number;

  /**
   * HTTP/1.1 pipelining factor (default: 1, no pipelining)
   * Number of requests to pipeline on HTTP/1.1 connections
   * Ignored when HTTP/2 is used
   * @default 1
   */
  pipelining?: number;
}

export interface AgentOptions {
  /**
   * Maximum number of concurrent connections per origin
   * @default 10
   */
  connections?: number;

  /**
   * Number of requests to pipeline on a single connection
   * @default 1 (no pipelining for safety)
   */
  pipelining?: number;

  /**
   * Keep connections alive between requests
   * @default true
   */
  keepAlive?: boolean;

  /**
   * Keep-alive timeout in milliseconds
   * @default 4000
   */
  keepAliveTimeout?: number;

  /**
   * Maximum keep-alive timeout in milliseconds
   * @default 600000 (10 minutes)
   */
  keepAliveMaxTimeout?: number;

  /**
   * Connection timeout in milliseconds
   * @default 10000
   */
  connectTimeout?: number;

  /**
   * Enable per-domain agent pooling for multi-domain requests
   * When true, creates separate connection pools for each domain
   * @default true
   */
  perDomainPooling?: boolean;
}

export interface ClientOptions {
  baseUrl?: string;
  headers?: HeadersInit;
  middlewares?: Middleware[];
  hooks?: Hooks;
  plugins?: Plugin[];
  transport?: Transport;
  defaults?: {
    params?: Record<string, string | number>;
  };
  pagination?: PaginationConfig; // Global pagination config
  debug?: boolean; // Enable debug mode (can also use DEBUG=recker env var)
  /**
   * HTTP/HTTPS/SOCKS proxy configuration
   *
   * @example
   * ```typescript
   * proxy: { url: 'http://proxy.example.com:8080' }
   * proxy: { url: 'http://proxy.example.com:8080', auth: { username: 'user', password: 'pass' } }
   * ```
   */
  proxy?: ProxyOptions | string; // String for simple proxy URL
  /**
   * Custom DNS configuration
   * Override DNS resolution or use custom DNS servers
   *
   * @example
   * ```typescript
   * // DNS Override
   * dns: {
   *   override: {
   *     'api.example.com': '1.2.3.4'
   *   }
   * }
   *
   * // Custom DNS Servers
   * dns: {
   *   servers: ['8.8.8.8', '1.1.1.1']
   * }
   * ```
   */
  dns?: DNSOptions;
  /**
   * XSRF/CSRF protection configuration
   * Automatically reads token from cookie and sends it in header
   *
   * @example
   * ```typescript
   * xsrf: true // Use defaults
   * xsrf: { cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }
   * ```
   */
  xsrf?: boolean | XSRFOptions;
  /**
   * Request body compression
   * Automatically compresses large request bodies to reduce bandwidth
   *
   * @example
   * ```typescript
   * compression: true // Use defaults (gzip, > 1KB)
   * compression: { algorithm: 'br', threshold: 5120 } // Brotli, > 5KB
   * ```
   */
  compression?: boolean | CompressionOptions;
  /**
   * HTTP/2 and HTTP/1.1 pipelining configuration
   * Controls protocol negotiation and concurrent request handling
   *
   * @example
   * ```typescript
   * http2: true // Enable HTTP/2 with defaults
   * http2: { enabled: true, maxConcurrentStreams: 200, pipelining: 10 }
   * ```
   */
  http2?: boolean | HTTP2Options;

  /**
   * Unified concurrency control for requests, rate limiting, and connection pooling
   *
   * **Simple usage** (recommended):
   * ```typescript
   * concurrency: 20  // Max 20 concurrent requests with auto-optimized connections
   * ```
   *
   * **Advanced usage**:
   * ```typescript
   * concurrency: {
   *   max: 20,                    // Max concurrent requests
   *   requestsPerInterval: 100,   // Rate limiting
   *   interval: 1000,
   *   agent: {
   *     connections: 'auto',      // Auto-calculate (max/2 = 10)
   *     perDomainPooling: true
   *   }
   * }
   * ```
   *
   * **Granular override** (for experts):
   * ```typescript
   * concurrency: {
   *   max: 50,
   *   runner: { concurrency: 30 },   // Override batch runner
   *   agent: { connections: 25 }      // Override connection pool
   * }
   * ```
   */
  concurrency?: number | ConcurrencyConfig;
}

export interface ReckerResponse<T = unknown> {
  status: number;
  statusText: string;
  headers: Headers;
  ok: boolean;
  url: string;

  // Performance & Low-level info
  timings?: Timings;
  connection?: ConnectionInfo;

  // Data access
  json<R = T>(): Promise<R>;
  text(): Promise<string>;
  cleanText(): Promise<string>; // AI-ready text extraction
  blob(): Promise<Blob>;

  // Streaming & IO
  read(): ReadableStream<Uint8Array> | null; // Native Web Stream

  clone(): ReckerResponse<T>; // For dedup/cache
  sse(): AsyncGenerator<SSEEvent>; // SSE helper
  download(): AsyncGenerator<ProgressEvent>; // Download with progress
  raw: Response; // Original fetch Response

  // Streaming
  [Symbol.asyncIterator](): AsyncGenerator<Uint8Array>;
}
