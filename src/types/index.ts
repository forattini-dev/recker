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
  transferred: number; // Alias for loaded (got compatibility)
  total?: number;    // Total bytes (may be unknown)
  percent?: number;  // Percentage (0-100)
  rate?: number;     // Bytes per second
  estimated?: number; // Estimated time remaining in ms
  direction?: 'upload' | 'download'; // Transfer direction
}

export type ProgressCallback = (progress: ProgressEvent) => void;

/**
 * Per-phase timeout configuration
 * Inspired by got's granular timeout control
 */
export interface TimeoutOptions {
  /**
   * Time to wait for DNS lookup
   * @default 30000
   */
  lookup?: number;

  /**
   * Time to wait for TCP connection
   * @default 30000
   */
  connect?: number;

  /**
   * Time to wait for TLS handshake
   * @default 30000
   */
  secureConnect?: number;

  /**
   * Time to wait for socket assignment (from pool)
   * @default 60000
   */
  socket?: number;

  /**
   * Time to wait to send the request (after socket)
   * @default 10000
   */
  send?: number;

  /**
   * Time to wait for first byte of response (TTFB)
   * @default 60000
   */
  response?: number;

  /**
   * Total time for the entire request (cumulative)
   * This is the legacy 'timeout' option
   * @default Infinity
   */
  request?: number;
}

/**
 * Information about a redirect
 */
export interface RedirectInfo {
  /** The URL being redirected from */
  from: string;
  /** The URL being redirected to */
  to: string;
  /** HTTP status code (301, 302, 303, 307, 308) */
  status: number;
  /** Response headers from the redirect response */
  headers: Headers;
}

export interface RequestOptions {
  method?: Method;
  headers?: HeadersInit;
  body?: BodyInit | null;
  /**
   * Shorthand for sending JSON data
   * Automatically sets Content-Type to application/json
   * Takes priority over body if both are specified
   *
   * @example
   * ```typescript
   * client.post('/api/users', {
   *   json: { name: 'John', age: 30 }
   * });
   * ```
   */
  json?: any;
  /**
   * Shorthand for sending multipart/form-data
   * Automatically creates FormData from object and handles file uploads
   * Takes priority over json and body if all are specified
   *
   * @example
   * ```typescript
   * client.post('/api/upload', {
   *   form: {
   *     name: 'John',
   *     avatar: fileBlob,
   *     documents: [file1, file2]
   *   }
   * });
   * ```
   */
  form?: Record<string, any>;
  /**
   * Shorthand for sending XML data
   * Automatically serializes object to XML and sets Content-Type to application/xml
   * Supports attributes via @attributes and text content via #text
   *
   * @example
   * ```typescript
   * client.post('/api/soap', {
   *   xml: {
   *     user: {
   *       '@attributes': { id: '123' },
   *       name: 'John',
   *       email: 'john@example.com'
   *     }
   *   }
   * });
   * ```
   */
  xml?: any;
  params?: Record<string, string | number>;
  signal?: AbortSignal;
  throwHttpErrors?: boolean; // Default true
  /**
   * Request timeout configuration
   *
   * @example
   * ```typescript
   * // Simple total timeout
   * timeout: 5000
   *
   * // Per-phase timeouts (got-style)
   * timeout: {
   *   lookup: 1000,      // DNS
   *   connect: 5000,     // TCP
   *   secureConnect: 5000, // TLS
   *   response: 10000,   // TTFB
   *   request: 30000     // Total
   * }
   * ```
   */
  timeout?: number | TimeoutOptions;
  onUploadProgress?: ProgressCallback;
  onDownloadProgress?: ProgressCallback;
  maxResponseSize?: number;
  /**
   * Hook called before following a redirect
   * Allows inspection/modification of redirect or cancellation
   *
   * @param info - Information about the redirect
   * @returns void to continue, false to stop redirect chain, or modified URL string
   *
   * @example
   * ```typescript
   * // Log redirects
   * beforeRedirect: (info) => {
   *   console.log(`Redirecting from ${info.from} to ${info.to}`);
   * }
   *
   * // Stop redirect chain
   * beforeRedirect: (info) => {
   *   if (info.to.includes('external.com')) return false;
   * }
   *
   * // Modify redirect URL
   * beforeRedirect: (info) => {
   *   return info.to.replace('http://', 'https://');
   * }
   * ```
   */
  beforeRedirect?: (info: RedirectInfo) => void | false | string | Promise<void | false | string>;
  /**
   * Maximum number of redirects to follow
   * @default 20
   */
  maxRedirects?: number;
  /**
   * Whether to follow redirects automatically
   * @default true
   */
  followRedirects?: boolean;
  /**
   * Enable or disable HTTP/2 for this specific request
   * Overrides client-level http2 configuration
   *
   * @example
   * ```typescript
   * // Force HTTP/2 for a specific request
   * await client.get('/api/data', { http2: true });
   *
   * // Force HTTP/1.1 for a specific request
   * await client.get('/legacy/api', { http2: false });
   * ```
   */
  http2?: boolean;
}

export interface ReckerRequest {
  url: string;
  method: Method;
  headers: Headers;
  body: BodyInit | null;
  signal?: AbortSignal;
  throwHttpErrors?: boolean;
  timeout?: TimeoutOptions;
  onUploadProgress?: ProgressCallback;
  onDownloadProgress?: ProgressCallback;
  maxResponseSize?: number;
  beforeRedirect?: (info: RedirectInfo) => void | false | string | Promise<void | false | string>;
  maxRedirects?: number;
  followRedirects?: boolean;
  /** Per-request HTTP/2 override */
  http2?: boolean;

  // Helpers for immutability
  withHeader(name: string, value: string): ReckerRequest;
  withBody(body: BodyInit): ReckerRequest;

  /** @internal */
  _hooks?: {
      onDnsLookup?: (info: any) => void;
      onTcpConnect?: (info: any) => void;
      onTlsHandshake?: (info: any) => void;
      onRequestSent?: () => void;
      onResponseStart?: (info: any) => void;
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
  agent?: AgentOptions & { connections?: number | 'auto' };

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

// Re-export Logger types
export type { Logger, MinimalLogger } from './logger.js';
export { consoleLogger, silentLogger, createLevelLogger } from './logger.js';

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

  // RFC 7232 validators for conditional requests
  etag?: string;
  lastModified?: string;

  // RFC 7234 Vary header for content negotiation
  vary?: string;

  // RFC 7234 Expires header (legacy, superseded by max-age)
  expires?: number;  // Absolute expiration timestamp in milliseconds

  // Parsed Cache-Control directives
  maxAge?: number;       // max-age in seconds
  sMaxAge?: number;      // s-maxage in seconds
  mustRevalidate?: boolean;
  noCache?: boolean;
  noStore?: boolean;
  isPrivate?: boolean;
  isPublic?: boolean;
  staleWhileRevalidate?: number;  // stale-while-revalidate extension
  staleIfError?: number;          // stale-if-error extension
}

export interface CacheStorage {
  get(key: string): Promise<CacheEntry | undefined | null>;
  set(key: string, value: CacheEntry, ttl: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Cache strategies:
 * - 'cache-first': Return cached response immediately, ignore freshness
 * - 'network-only': Always fetch from network, never cache
 * - 'network-first': Try network, fall back to cache on error
 * - 'stale-while-revalidate': Return cached response, refresh in background
 * - 'revalidate': (NEW) Use conditional requests (ETag/If-None-Match) to revalidate
 * - 'rfc-compliant': (NEW) Full HTTP caching semantics (Cache-Control, ETag, 304)
 */
export type CacheStrategy =
  | 'cache-first'
  | 'network-only'
  | 'network-first'
  | 'stale-while-revalidate'
  | 'revalidate'
  | 'rfc-compliant';

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
  onDnsLookup?: Array<(info: { domain: string, duration: number, addresses?: string[] }, req: ReckerRequest) => void>;
  onTcpConnect?: Array<(info: { remoteAddress: string, remotePort?: number, localAddress?: string, localPort?: number, duration: number, reused?: boolean }, req: ReckerRequest) => void>;
  onTlsHandshake?: Array<(info: { protocol: string, cipher: string, duration: number }, req: ReckerRequest) => void>;
  
  /**
   * Dispatched when a socket/stream is assigned to the request.
   * Crucial for understanding HTTP/2 multiplexing and Keep-Alive reuse.
   */
  onSocketAssigned?: Array<(info: { protocol: string, reused: boolean, remoteAddress: string }, req: ReckerRequest) => void>;

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
   * Supports HTTP, HTTPS, SOCKS4, SOCKS4a, SOCKS5 protocols
   *
   * @example
   * ```typescript
   * // HTTP proxy
   * url: 'http://proxy.example.com:8080'
   *
   * // HTTPS proxy
   * url: 'https://secure-proxy.example.com:443'
   *
   * // SOCKS5 proxy
   * url: 'socks5://proxy.example.com:1080'
   *
   * // SOCKS5 with authentication
   * url: 'socks5://user:pass@proxy.example.com:1080'
   * ```
   */
  url: string;

  /**
   * Proxy type (auto-detected from URL if not specified)
   */
  type?: 'http' | 'https' | 'socks4' | 'socks4a' | 'socks5';

  /**
   * Proxy authentication (if required)
   */
  auth?: {
    username: string;
    password: string;
  };

  /**
   * Additional headers to send to the proxy (e.g., custom auth).
   */
  headers?: Record<string, string>;

  /**
   * Explicit Proxy-Authorization token (overrides auth basic header).
   */
  token?: string;

  /**
   * Force CONNECT tunneling even for HTTP proxies.
   */
  tunnel?: boolean;

  /**
   * Bypass proxy for the given hosts/domains (supports exact host, host:port or *.example.com).
   * Also supports CIDR notation for IP ranges (e.g., '192.168.0.0/16')
   *
   * @example
   * ```typescript
   * bypass: [
   *   'localhost',
   *   '127.0.0.1',
   *   '*.internal.com',
   *   '192.168.0.0/16'
   * ]
   * ```
   */
  bypass?: string[];

  /**
   * TLS options for the request to the origin when going through the proxy.
   */
  requestTls?: TLSOptions;

  /**
   * TLS options for the proxy connection itself (for HTTPS proxies).
   */
  proxyTls?: TLSOptions;

  /**
   * Enable HTTP/2 for the connection through the proxy.
   * When enabled, allows HTTP/2 multiplexing through an HTTP/1.1 CONNECT tunnel.
   *
   * @default false
   */
  http2?: boolean;

  /**
   * Keep-alive timeout for the proxy connection in milliseconds.
   * Only applies to persistent proxy connections.
   *
   * @default 4000
   */
  keepAliveTimeout?: number;

  /**
   * Connection timeout for establishing the proxy connection in milliseconds.
   *
   * @default 10000
   */
  connectTimeout?: number;
}

export interface TLSOptions {
  /**
   * Minimum TLS protocol version to allow (e.g., 'TLSv1.2').
   */
  minVersion?: 'TLSv1' | 'TLSv1.1' | 'TLSv1.2' | 'TLSv1.3';

  /**
   * Maximum TLS protocol version to allow (e.g., 'TLSv1.3').
   */
  maxVersion?: 'TLSv1' | 'TLSv1.1' | 'TLSv1.2' | 'TLSv1.3';

  /**
   * Cipher suite string (OpenSSL format).
   */
  ciphers?: string;

  /**
   * Whether to respect the server cipher preference order.
   */
  honorCipherOrder?: boolean;

  /**
   * Custom CA bundle(s) to trust.
   */
  ca?: string | Buffer | Array<string | Buffer>;

  /**
   * Client certificate (PEM).
   */
  cert?: string | Buffer;

  /**
   * Client private key (PEM).
   */
  key?: string | Buffer;

  /**
   * Optional passphrase for the private key.
   */
  passphrase?: string;

  /**
   * Whether to reject invalid/self-signed certificates.
   * @default true
   */
  rejectUnauthorized?: boolean;

  /**
   * ALPN protocol hints (e.g., ['h2', 'http/1.1']).
   */
  alpnProtocols?: string[];

  /**
   * Override or disable SNI (false to disable, string to force servername).
   */
  servername?: string | false;

  /**
   * TLS session timeout in seconds.
   */
  sessionTimeout?: number;

  /**
   * TLS session id context.
   */
  sessionIdContext?: string;
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

/**
 * Cookie Jar interface compatible with tough-cookie
 * Allows custom cookie storage implementations
 */
export interface CookieJar {
  /**
   * Get cookie string for the given URL
   * Returns cookies as "name1=value1; name2=value2" format
   */
  getCookieString(url: string): Promise<string> | string;

  /**
   * Store a cookie from Set-Cookie header value
   * @param rawCookie The raw Set-Cookie header value
   * @param url The URL the cookie was set for
   */
  setCookie(rawCookie: string, url: string): Promise<unknown> | unknown;
}

/**
 * Cookie configuration options
 */
export interface CookieOptions {
  /**
   * Cookie jar instance or boolean to enable built-in memory jar
   * - `true`: Use built-in MemoryCookieJar
   * - CookieJar instance: Use custom jar (e.g., tough-cookie)
   */
  jar?: CookieJar | boolean;

  /**
   * Ignore invalid cookies instead of throwing errors
   * @default false
   */
  ignoreInvalid?: boolean;
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
   * Grace period subtracted from server keep-alive hints to avoid races.
   * @default 1000 (1s)
   */
  keepAliveTimeoutThreshold?: number;

  /**
   * Connection timeout in milliseconds
   * @default 10000
   */
  connectTimeout?: number;

  /**
   * Max requests per underlying client before recycling.
   */
  maxRequestsPerClient?: number;

  /**
   * Max cached TLS sessions for reuse.
   */
  maxCachedSessions?: number;

  /**
   * Max lifetime for a pooled client (ms). `null` disables.
   */
  clientTtl?: number | null;

  /**
   * Max HTTP header size in bytes.
   */
  maxHeaderSize?: number;

  /**
   * Enable per-domain agent pooling for multi-domain requests
   * When true, creates separate connection pools for each domain
   * @default true
   */
  perDomainPooling?: boolean;

  /**
   * Local address to bind to for outgoing connections
   */
  localAddress?: string;
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
   * Logger instance for debug output and request logging
   * Accepts Pino, Winston, console, or any logger implementing the Logger interface
   *
   * @example Pino
   * ```typescript
   * import pino from 'pino';
   * const client = createClient({
   *   baseUrl: 'https://api.example.com',
   *   logger: pino({ level: 'debug' }),
   *   debug: true
   * });
   * ```
   *
   * @example Winston
   * ```typescript
   * import winston from 'winston';
   * const client = createClient({
   *   baseUrl: 'https://api.example.com',
   *   logger: winston.createLogger({ level: 'debug' }),
   *   debug: true
   * });
   * ```
   *
   * @example Console (default when debug: true)
   * ```typescript
   * const client = createClient({
   *   baseUrl: 'https://api.example.com',
   *   debug: true  // Uses console by default
   * });
   * ```
   */
  logger?: import('./logger.js').Logger;
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
   * Advanced TLS configuration (cipher suites, certs, ALPN/SNI).
   */
  tls?: TLSOptions;
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

  /**
   * Maximum response body size in bytes
   * Prevents memory exhaustion from unexpectedly large responses
   *
   * @default Infinity (no limit)
   *
   * @example
   * ```typescript
   * // Limit to 10 MB
   * maxResponseSize: 10 * 1024 * 1024
   *
   * // Limit to 1 GB
   * maxResponseSize: 1024 * 1024 * 1024
   * ```
   */
  maxResponseSize?: number;

  /**
   * Unix Domain Socket path for IPC communication
   * When set, connects to a local Unix socket instead of TCP
   * Commonly used for Docker API, systemd, and local service communication
   *
   * Note: Not supported on Windows
   *
   * @example
   * ```typescript
   * // Connect to Docker daemon
   * socketPath: '/var/run/docker.sock'
   *
   * // Connect to custom application socket
   * socketPath: '/tmp/myapp.sock'
   * ```
   */
  socketPath?: string;

  /**
   * Cookie handling configuration (got-compatible)
   * Automatically stores and sends cookies across requests
   *
   * @example
   * ```typescript
   * // Enable built-in memory cookie jar
   * cookies: true
   *
   * // Use built-in jar with options
   * cookies: { jar: true, ignoreInvalid: true }
   *
   * // Use custom cookie jar (e.g., tough-cookie)
   * import { CookieJar } from 'tough-cookie';
   * cookies: { jar: new CookieJar() }
   * ```
   */
  cookies?: boolean | CookieOptions;

  /**
   * Default request timeout configuration
   * Applied to all requests unless overridden at request level
   *
   * @example
   * ```typescript
   * // Simple total timeout (ms)
   * timeout: 30000
   *
   * // Per-phase timeouts (got-style)
   * timeout: {
   *   lookup: 1000,      // DNS
   *   connect: 5000,     // TCP
   *   secureConnect: 5000, // TLS
   *   response: 10000,   // TTFB
   *   request: 30000     // Total
   * }
   * ```
   */
  timeout?: number | TimeoutOptions;

  /**
   * Enable/disable observability features (timings, connection info)
   *
   * When `false`:
   * - Skips diagnostics_channel processing
   * - Skips AsyncLocalStorage context
   * - response.timings and response.connection will be empty
   * - Significantly reduces per-request overhead
   *
   * Use `false` for maximum performance when you don't need timing data.
   *
   * @default true
   *
   * @example
   * ```typescript
   * // High-performance mode (no timings)
   * const client = createClient({
   *   baseUrl: 'https://api.example.com',
   *   observability: false
   * });
   *
   * // Full observability (default)
   * const client = createClient({
   *   baseUrl: 'https://api.example.com',
   *   observability: true
   * });
   * ```
   */
  observability?: boolean;

  /**
   * Retry configuration for failed requests
   * @see RetryOptions from plugins/retry
   */
  retry?: {
    maxAttempts?: number;
    delay?: number;
    maxDelay?: number;
    backoff?: 'linear' | 'exponential' | 'decorrelated';
    jitter?: boolean;
    statusCodes?: number[];
  };
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
