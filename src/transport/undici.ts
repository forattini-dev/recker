import { request as undiciRequest, errors as undiciErrors, ProxyAgent, Agent, Client } from 'undici';
import { ConnectionInfo, ReckerRequest, ReckerResponse, Timings, Transport, ProxyOptions, HTTP2Options, DNSOptions, AgentOptions, TLSOptions, ProgressCallback, RedirectInfo, TimeoutOptions } from '../types/index.js';
import { HttpResponse } from '../core/response.js';
import { NetworkError, TimeoutError, MaxSizeExceededError } from '../core/errors.js';
import { performance } from 'perf_hooks';
import { AsyncLocalStorage } from 'async_hooks';
import { channel } from 'node:diagnostics_channel';
import { createLookupFunction } from '../utils/dns.js';
import { AgentManager } from '../utils/agent-manager.js';
import { createProgressStream } from '../utils/progress.js';
import { nodeToWebStream } from '../utils/streaming.js';

// Define the shape of undici's internal diagnostic events
interface UndiciRequestStartEvent {
  request: {
    origin: string;
    path: string;
    method: string;
    headers: string[];
    // ... other request properties
  };
}

interface UndiciClientConnectEvent {
  connectParams: {
    hostname: string;
    port: number;
    // ... other connection properties
  };
  socket: {
    remoteAddress: string;
    remotePort: number;
    localAddress: string;
    localPort: number;
    alpnProtocol?: string;
    tlsSocket?: {
      getProtocol(): string;
      getCipher(): { name: string; standardName: string } | null;
    };
  };
}

interface UndiciRequestHeadersEvent {
  request: UndiciRequestStartEvent['request'];
  response: {
    statusCode: number;
    headers: string[];
  };
  timing: {
    queuing: number;
    dns: number;
    tcp: number;
    tls: number;
    request: number; // Time until request headers sent
    response: number; // Time until response headers received (TTFB)
    body: number; // Time until response body fully received
    ended: number; // Total time until request ends
  };
}

interface RequestContext {
  timings: Timings;
  connection: ConnectionInfo;
  requestStartTime: number;
  requestCorrelationId: string;
  // Optional low-level hooks
  hooks?: {
      onDnsLookup?: (info: any) => void;
      onTcpConnect?: (info: any) => void;
      onTlsHandshake?: (info: any) => void;
      onRequestSent?: () => void;
      onResponseStart?: (info: any) => void;
  };
}

const undiciRequestChannel = channel('undici:request:create');
const undiciBodySentChannel = channel('undici:request:bodySent');
const undiciHeadersChannel = channel('undici:request:headers');
const undiciConnectChannel = channel('undici:client:connect');

const requestStorage = new AsyncLocalStorage<RequestContext>();

undiciRequestChannel.subscribe((message: unknown) => {
  const store = requestStorage.getStore();
  if (store) {
    store.requestStartTime = performance.now();
    store.timings = { queuing: 0, dns: 0, tcp: 0, tls: 0, firstByte: 0, content: 0, total: 0 };
    store.connection = {};
  }
});

undiciBodySentChannel.subscribe((message: unknown) => {
    const store = requestStorage.getStore();
    // Dispatch onRequestSent hook
    if (store && store.hooks && store.hooks.onRequestSent) {
        // We don't have req object here directly but we have it in closure? No.
        // Wait, store.hooks functions are bound to 'req' in Client.ts closure!
        // Client.ts: req._hooks.onRequestSent = () => userHooks.forEach(h => h(req))
        // So we just call the function.
        store.hooks.onRequestSent();
    }
});

undiciHeadersChannel.subscribe((message: unknown) => {
  const payload = message as UndiciRequestHeadersEvent;
  const store = requestStorage.getStore();
  if (store && payload && payload.timing) {
    const { timing } = payload;
    // ... timings update ...
    store.timings.queuing = timing.queuing;
    store.timings.dns = timing.dns;
    store.timings.tcp = timing.tcp;
    store.timings.tls = timing.tls;
    store.timings.firstByte = timing.response;
    store.timings.content = timing.body;
    store.timings.total = timing.ended;

    // Dispatch Hooks (if registered) - "Zero-Cost" check
    if (store.hooks) {
        if (store.hooks.onDnsLookup && timing.dns > 0) {
            store.hooks.onDnsLookup({ domain: payload.request.origin, duration: timing.dns });
        }
        if (store.hooks.onTcpConnect && timing.tcp > 0) {
            store.hooks.onTcpConnect({ remoteAddress: '', duration: timing.tcp }); 
        }
        if (store.hooks.onTlsHandshake && timing.tls > 0) {
            store.hooks.onTlsHandshake({ protocol: '', cipher: '', duration: timing.tls }); 
        }
        
        // New: onResponseStart
        if (store.hooks.onResponseStart) {
            // We construct a minimal Headers object or just pass raw array?
            // Let's keep it simple/fast for internal hook.
            const headers = new Headers();
            for (let i = 0; i < payload.response.headers.length; i += 2) {
                headers.append(payload.response.headers[i], payload.response.headers[i + 1]);
            }
            store.hooks.onResponseStart({ status: payload.response.statusCode, headers });
        }
    }
  }
});

undiciConnectChannel.subscribe((message: unknown) => {
  const payload = message as UndiciClientConnectEvent;
  const store = requestStorage.getStore();
  if (store && payload && payload.socket) {
    const { socket } = payload;
    store.connection.remoteAddress = socket.remoteAddress;
    store.connection.remotePort = socket.remotePort;
    store.connection.localAddress = socket.localAddress;
    store.connection.localPort = socket.localPort;

    // Protocol detection (HTTP/1.1, h2, h3)
    const protocol = socket.alpnProtocol || (socket.tlsSocket ? socket.tlsSocket.getProtocol() : undefined);
    store.connection.protocol = protocol;
    store.connection.cipher = socket.tlsSocket ? socket.tlsSocket.getCipher()?.name : undefined;

    // Dispatch Hooks with more detail (if registered)
    if (store.hooks) {
        // Note: We don't have duration here, only connection details.
        // Duration comes in headers event (timing).
        // But we can dispatch connection details.
        
        // TCP Details
        if (store.hooks.onTcpConnect) {
             store.hooks.onTcpConnect({ remoteAddress: socket.remoteAddress, duration: 0 }); // 0 because handled by timing event for duration
        }
        
        // TLS Details
        if (store.hooks.onTlsHandshake && socket.tlsSocket) {
             store.hooks.onTlsHandshake({ 
                 protocol: protocol || 'unknown', 
                 cipher: socket.tlsSocket.getCipher()?.name || 'unknown', 
                 duration: 0 
             });
        }
    }

    // HTTP/2 specific metrics (when protocol is h2)
    if (protocol === 'h2') {
      const http2Session = (socket as any).session || socket;
      const http2State = (http2Session as any).state;
      const remoteSettings = (http2Session as any).remoteSettings;
      const localSettings = (http2Session as any).localSettings;
      store.connection.http2 = {
        // Note: Undici may not expose all HTTP/2 stream details via diagnostics_channel
        // These would be populated if available in future versions
        streamId: (socket as any).streamId,
        streamWeight: (socket as any).weight,
        streamDependency: (socket as any).dependency,
        serverPush: Boolean((socket as any).serverPush),
        settingsReceived: Boolean(remoteSettings),
        maxConcurrentStreams: remoteSettings?.maxConcurrentStreams,
        currentStreams: http2State?.streamCount,
        pendingStreams: http2State?.pendingStreamCount,
        localWindowSize: http2State?.localWindowSize ?? http2State?.effectiveLocalWindowSize,
        remoteWindowSize: http2State?.effectiveRecvDataLength,
        localSettings: localSettings ? { ...localSettings } : undefined,
        remoteSettings: remoteSettings ? { ...remoteSettings } : undefined
      };
    }

    // HTTP/3 / QUIC metrics (when protocol is h3)
    if (protocol === 'h3' || protocol?.startsWith('h3-')) {
      const quicStats = (socket as any).stats;
      const handshakeConfirmed = (socket as any).handshakeConfirmed;
      store.connection.http3 = {
        quicVersion: protocol,
        zeroRTT: (socket as any).zeroRTT || false,
        maxStreams: (socket as any).maxStreams,
        handshakeConfirmed: typeof handshakeConfirmed === 'boolean' ? handshakeConfirmed : undefined
      };

      if (quicStats && typeof quicStats.rtt === 'number') {
        store.connection.rtt = quicStats.rtt;
      }
    }

    // Connection reuse detection
    store.connection.reused = Boolean((socket as any).reused);
  }
});

interface UndiciTransportOptions {
  connectTimeout?: number;
  headersTimeout?: number;
  bodyTimeout?: number;
  maxRedirections?: number;
  proxy?: ProxyOptions | string;
  http2?: HTTP2Options;
  dns?: DNSOptions;
  agent?: AgentManager;
  tls?: TLSOptions;
  socketPath?: string;
  // Agent creation options (when no AgentManager provided)
  connections?: number;
  pipelining?: number;
  keepAlive?: boolean;
  keepAliveTimeout?: number;
  keepAliveMaxTimeout?: number;
  perDomainPooling?: boolean;
  localAddress?: string;
  /**
   * Enable/disable observability (timings, connection info)
   * When false, skips AsyncLocalStorage and diagnostics_channel processing
   * @default true
   */
  observability?: boolean;
}

/**
 * Maps granular TimeoutOptions to Undici's timeout options
 *
 * Undici timeout mapping:
 * - connectTimeout: TCP connection + TLS handshake
 * - headersTimeout: Time to receive response headers (TTFB)
 * - bodyTimeout: Time to receive response body
 *
 * Our granular options:
 * - lookup: DNS resolution (not supported by Undici, handled before)
 * - connect: TCP connection
 * - secureConnect: TLS handshake
 * - response: TTFB (maps to headersTimeout)
 * - send: Request body upload (maps to bodyTimeout for upload)
 * - request: Total request time (not directly supported, use AbortSignal)
 */
function mapTimeoutOptions(
  requestTimeout?: TimeoutOptions,
  transportDefaults?: {
    connectTimeout?: number;
    headersTimeout?: number;
    bodyTimeout?: number;
  }
): {
  connectTimeout?: number;
  headersTimeout?: number;
  bodyTimeout?: number;
  totalTimeout?: number;
} {
  // Priority: request-level > transport-level defaults
  return {
    // connect and secureConnect both map to connectTimeout
    // Use the minimum of the two if both are specified
    connectTimeout: requestTimeout?.connect ??
                   requestTimeout?.secureConnect ??
                   transportDefaults?.connectTimeout,

    // response timeout is TTFB (time to first byte)
    headersTimeout: requestTimeout?.response ??
                   transportDefaults?.headersTimeout,

    // send is for request body, but Undici's bodyTimeout is for response body
    // We'll use it for send as well since it's the closest match
    bodyTimeout: requestTimeout?.send ??
                transportDefaults?.bodyTimeout,

    // Total request timeout for AbortSignal
    totalTimeout: requestTimeout?.request
  };
}

export class UndiciTransport implements Transport {
  private static requestCounter = 0;  // Fast correlation ID generator

  private baseUrl: string;
  private options: UndiciTransportOptions;
  private proxyAgent?: ProxyAgent;
  private dnsAgent?: Agent;
  private agentManager?: AgentManager;
  private proxyBypassList?: string[];
  private tlsOptions?: TLSOptions;
  private socketClient?: Client;  // Unix domain socket client
  private observability: boolean;  // Enable/disable timing capture

  constructor(baseUrl: string, options: UndiciTransportOptions = {}) {
    this.baseUrl = baseUrl;
    this.options = options;
    this.tlsOptions = options.tls;
    this.observability = options.observability !== false;  // Default: true

    if (options.proxy) {
      const proxyConfig: ProxyOptions = typeof options.proxy === 'string'
        ? { url: options.proxy }
        : options.proxy;

      // Auto-detect proxy type from URL if not specified
      const proxyUrl = new URL(proxyConfig.url);
      const proxyType = proxyConfig.type || detectProxyType(proxyUrl.protocol);

      // SOCKS proxies are not natively supported by undici ProxyAgent
      if (proxyType?.startsWith('socks')) {
        throw new NetworkError(
          `SOCKS proxy (${proxyType}) is not supported. Use an HTTP/HTTPS proxy or a SOCKS-to-HTTP bridge.`,
          'ERR_UNSUPPORTED_PROXY_TYPE'
        );
      }

      const proxyAuth = proxyConfig.auth
        ? `${proxyConfig.auth.username}:${proxyConfig.auth.password}`
        : undefined;

      const finalProxyUrl = proxyAuth
        ? proxyConfig.url.replace('://', `://${proxyAuth}@`)
        : proxyConfig.url;

      this.proxyBypassList = proxyConfig.bypass;

      // Build ProxyAgent options
      const proxyAgentOptions: any = {
        uri: finalProxyUrl,
        headers: proxyConfig.headers,
        token: proxyConfig.token,
        proxyTunnel: proxyConfig.tunnel,
        requestTls: mapTlsOptions(proxyConfig.requestTls ?? options.tls),
        proxyTls: mapTlsOptions(proxyConfig.proxyTls),
      };

      // Add timeout options if specified
      if (proxyConfig.connectTimeout) {
        proxyAgentOptions.connectTimeout = proxyConfig.connectTimeout;
      }

      // HTTP/2 through proxy
      if (proxyConfig.http2) {
        // Enable HTTP/2 for the tunneled connection
        // This allows HTTP/2 multiplexing through HTTP/1.1 CONNECT tunnel
        if (!proxyAgentOptions.requestTls) {
          proxyAgentOptions.requestTls = {};
        }
        proxyAgentOptions.requestTls.ALPNProtocols = ['h2', 'http/1.1'];
      }

      this.proxyAgent = new ProxyAgent(proxyAgentOptions);
    }

    // Store AgentManager reference if provided
    this.agentManager = options.agent;

    // Setup custom DNS if specified
    // If AgentManager is provided, DNS will be integrated with it
    // Otherwise, create standalone DNS agent for backward compatibility
    if (options.dns && !this.agentManager) {
      const lookupFn = createLookupFunction(options.dns);
      this.dnsAgent = new Agent({
        connect: {
          lookup: lookupFn as any,
        },
      });
    }

    // Agent creation now uses AgentManager if available
    // Otherwise, create a default agent
    if (!this.agentManager) {
      this.agentManager = new AgentManager({
        connections: options.connections,
        pipelining: options.pipelining,
        keepAlive: options.keepAlive,
        keepAliveTimeout: options.keepAliveTimeout,
        keepAliveMaxTimeout: options.keepAliveMaxTimeout,
        connectTimeout: options.connectTimeout,
        perDomainPooling: options.perDomainPooling,
        localAddress: options.localAddress, // Pass localAddress here
      });
    }

    if (options.socketPath) {
      // For Unix sockets, use the base URL as origin with socketPath option
      this.socketClient = new Client(baseUrl, {
        socketPath: options.socketPath
      });
    }
  }

  async dispatch(req: ReckerRequest): Promise<ReckerResponse> {
    // Optimized: use Object.fromEntries instead of forEach iteration
    const headers: Record<string, string> = Object.fromEntries(req.headers as any);
    const contentLengthHeader = headers['content-length'];
    const uploadTotal = contentLengthHeader ? parseInt(contentLengthHeader, 10) : undefined;

    const path = req.url.startsWith(this.baseUrl) ? req.url.substring(this.baseUrl.length) : req.url;
    let currentUrl = new URL(path, this.baseUrl).toString();

    // Determine if we handle redirects manually (when beforeRedirect hook is provided)
    const handleRedirectsManually = Boolean(req.beforeRedirect);
    const maxRedirects = req.maxRedirects ?? 20;
    const followRedirects = req.followRedirects !== false;

    // Map granular timeout options with request-level taking priority
    const timeouts = mapTimeoutOptions(req.timeout, {
      connectTimeout: this.options.connectTimeout,
      headersTimeout: this.options.headersTimeout,
      bodyTimeout: this.options.bodyTimeout
    });

    // Handle total request timeout with AbortSignal
    let timeoutController: AbortController | undefined;
    let timeoutId: NodeJS.Timeout | undefined;

    // FAST PATH: Skip AsyncLocalStorage when observability is disabled
    if (!this.observability) {
      return this.dispatchFast(req, headers, currentUrl, timeouts, handleRedirectsManually, maxRedirects, followRedirects, uploadTotal);
    }

    // FULL PATH: With observability (timings, connection info)
    const requestContext: RequestContext = {
      timings: {},
      connection: {},
      requestStartTime: 0,
      requestCorrelationId: `r${++UndiciTransport.requestCounter}`,
      hooks: req._hooks
    };

    return requestStorage.run(requestContext, async () => {
      try {
        const startTime = performance.now();
        if (requestContext.requestStartTime === 0) {
            requestContext.requestStartTime = startTime;
        }

        let redirectCount = 0;
        let currentMethod = req.method;
        let currentBody = req.body;
        let currentHeaders = { ...headers };
        let effectiveSignal = req.signal;

        if (timeouts.totalTimeout) {
          timeoutController = new AbortController();

          // If there's an existing signal, combine them
          if (req.signal) {
            // Abort if either signal aborts
            const originalSignal = req.signal;
            effectiveSignal = timeoutController.signal;

            const onOriginalAbort = () => {
              timeoutController!.abort();
            };

            if (originalSignal.aborted) {
              timeoutController.abort();
            } else {
              originalSignal.addEventListener('abort', onOriginalAbort, { once: true });
            }
          } else {
            effectiveSignal = timeoutController.signal;
          }

          // Set timeout
          timeoutId = setTimeout(() => {
            timeoutController!.abort();
          }, timeouts.totalTimeout);
        }

        while (true) {
            const dispatcher = this.socketClient || determineDispatcher({
              explicit: (req as any)._dispatcher,
              proxyAgent: this.proxyAgent,
              agentManager: this.agentManager,
              dnsAgent: this.dnsAgent,
              url: currentUrl,
              bypass: this.proxyBypassList
            });

            const bodyWithProgress = redirectCount === 0
              ? wrapUploadBody(currentBody, req.onUploadProgress, uploadTotal)
              : currentBody;

            let finalBody = bodyWithProgress;
            
            // Workaround for undici FormData issues: use Response to serialize to stream
            if (finalBody instanceof FormData) {
              const tempResponse = new Response(finalBody);
              finalBody = tempResponse.body;
              // Merge headers (Content-Type with boundary)
              tempResponse.headers.forEach((value, key) => {
                // Don't overwrite if already set (though usually we want the boundary)
                // Actually, for FormData, we MUST use the generated boundary
                if (key.toLowerCase() === 'content-type') {
                  currentHeaders[key] = value;
                  // Also handle case-insensitive variants that might exist
                  delete currentHeaders['Content-Type']; 
                } else if (!currentHeaders[key]) {
                  currentHeaders[key] = value;
                }
              });
            }

            const undiciOptions: any = {
              method: currentMethod as any,
              headers: currentHeaders,
              body: finalBody as any,
              signal: effectiveSignal,
              dispatcher: dispatcher,
              connectTimeout: timeouts.connectTimeout,
              headersTimeout: timeouts.headersTimeout,
              bodyTimeout: timeouts.bodyTimeout,
              maxRedirections: 0, // Always handle redirects manually to support hooks and avoid dispatcher issues
            };

            // If body is a stream (from FormData conversion or otherwise), set duplex: half
            if (finalBody && (
                finalBody instanceof ReadableStream || 
                (typeof (finalBody as any).pipe === 'function') ||
                (finalBody as any)[Symbol.asyncIterator]
            )) {
                undiciOptions.duplex = 'half';
            }

          const tlsOptions = mapTlsOptions(this.tlsOptions);
          if (tlsOptions) {
            undiciOptions.tls = tlsOptions;
          }

          // HTTP/2 configuration - per-request takes precedence over transport-level
          // req.http2 can explicitly enable (true) or disable (false) HTTP/2
          const http2Enabled = req.http2 !== undefined
            ? req.http2
            : this.options.http2?.enabled;

          if (http2Enabled) {
            undiciOptions.allowH2 = true;
          } else if (req.http2 === false) {
            // Explicitly disabled per-request
            undiciOptions.allowH2 = false;
          }

          // Transport-level HTTP/2 options (only if HTTP/2 is enabled)
          if (http2Enabled && this.options.http2) {
            if (this.options.http2.maxConcurrentStreams !== undefined) {
              undiciOptions.maxConcurrentStreams = this.options.http2.maxConcurrentStreams;
            }
            if (this.options.http2.pipelining !== undefined) {
              undiciOptions.pipelining = this.options.http2.pipelining;
            }
          }


          // For Unix sockets, use the Client's request method directly with just the path
          // undiciRequest with a dispatcher doesn't work correctly for Unix sockets
          let undiciResponse;
          if (this.socketClient) {
            const urlPath = new URL(currentUrl).pathname + new URL(currentUrl).search;
            undiciResponse = await this.socketClient.request({
              path: urlPath || '/',
              method: currentMethod as any,
              headers: currentHeaders,
              body: bodyWithProgress as any,
              signal: req.signal,
            });
          } else {
            undiciResponse = await undiciRequest(currentUrl, undiciOptions);
          }

          // Handle redirects (Manual or Automatic)
          const statusCode = undiciResponse.statusCode;
          const isRedirect = statusCode >= 300 && statusCode < 400;

          if (isRedirect && followRedirects && redirectCount < maxRedirects) {
            const locationHeader = undiciResponse.headers['location'];
            const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader;

            if (location) {
              // Resolve relative URLs
              const nextUrl = new URL(location, currentUrl).toString();

              // Run hook if provided
              if (handleRedirectsManually) {
                // Convert undici headers to Headers object for the hook
                const responseHeaders = new Headers();
                for (const [key, value] of Object.entries(undiciResponse.headers)) {
                  if (value !== undefined) {
                    if (Array.isArray(value)) {
                      value.forEach(v => responseHeaders.append(key, v));
                    } else {
                      responseHeaders.set(key, value);
                    }
                  }
                }

                const redirectInfo: RedirectInfo = {
                  from: currentUrl,
                  to: nextUrl,
                  status: statusCode,
                  headers: responseHeaders,
                };

                // Call beforeRedirect hook
                const hookResult = await req.beforeRedirect!(redirectInfo);

                // Check if redirect should be stopped
                if (hookResult === false) {
                  // Return the redirect response without following
                  const finalResponse = req.onDownloadProgress
                    ? wrapDownloadResponse(undiciResponse, req.onDownloadProgress)
                    : undiciResponse;

                  return new HttpResponse(finalResponse, {
                    timings: requestContext.timings,
                    connection: requestContext.connection
                  });
                }

                // Update URL (possibly modified by hook)
                if (typeof hookResult === 'string') {
                    currentUrl = hookResult;
                } else {
                    currentUrl = nextUrl;
                }
              } else {
                  // No hook, just follow
                  currentUrl = nextUrl;
              }

              // Handle method and body changes based on status code
              // 301/302: GET request follows (browsers behavior, though spec says preserve)
              // 303: Always GET
              // 307/308: Preserve method and body
              if (statusCode === 303 || ((statusCode === 301 || statusCode === 302) && currentMethod !== 'GET' && currentMethod !== 'HEAD')) {
                currentMethod = 'GET';
                currentBody = null;
                delete currentHeaders['content-type'];
                delete currentHeaders['content-length'];
                delete currentHeaders['Content-Type'];
                delete currentHeaders['Content-Length'];
              }

              // Consume the response body to free up the connection
              await undiciResponse.body.arrayBuffer().catch(() => {});

              redirectCount++;
              continue;
            }
          }

          const finalResponse = req.onDownloadProgress
            ? wrapDownloadResponse(undiciResponse, req.onDownloadProgress)
            : undiciResponse;

          const ttfb = performance.now() - startTime;
          const totalTime = performance.now() - requestContext.requestStartTime;

          if (!requestContext.timings.firstByte) {
              requestContext.timings.firstByte = ttfb;
          }
          if (!requestContext.timings.total) {
              requestContext.timings.total = totalTime;
          }

          return new HttpResponse(finalResponse, {
            timings: requestContext.timings,
            connection: requestContext.connection
          });
        }
      } catch (error: any) {
        // Map Undici timeout errors to our phase-specific TimeoutError
        if (error instanceof undiciErrors.ConnectTimeoutError || error.code === 'UND_ERR_CONNECT_TIMEOUT') {
          throw new TimeoutError(req, {
            phase: 'connect',
            timeout: timeouts.connectTimeout
          });
        }

        if (error instanceof undiciErrors.HeadersTimeoutError || error.code === 'UND_ERR_HEADERS_TIMEOUT') {
          throw new TimeoutError(req, {
            phase: 'response',
            timeout: timeouts.headersTimeout
          });
        }

        if (error instanceof undiciErrors.BodyTimeoutError || error.code === 'UND_ERR_BODY_TIMEOUT') {
          throw new TimeoutError(req, {
            phase: 'send',
            timeout: timeouts.bodyTimeout
          });
        }

        // Handle AbortSignal timeout (total request timeout)
        if (error.name === 'AbortError' || error.code === 'ABORT_ERR') {
          throw new TimeoutError(req, {
            phase: 'request',
            timeout: timeouts.totalTimeout
          });
        }

        const code = error.code || error?.cause?.code;

        if (code === 'UND_ERR_HEADERS_OVERFLOW') {
          throw new MaxSizeExceededError(
            16 * 1024, // default max header size
            undefined,
            req
          );
        }

        throw new NetworkError(error.message, code, req);
      } finally {
        // Clean up total timeout
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    });
  }

  /**
   * Fast dispatch path - skips AsyncLocalStorage and diagnostics_channel processing
   * Used when observability is disabled for maximum performance
   */
  private async dispatchFast(
    req: ReckerRequest,
    headers: Record<string, string>,
    currentUrl: string,
    timeouts: ReturnType<typeof mapTimeoutOptions>,
    handleRedirectsManually: boolean,
    maxRedirects: number,
    followRedirects: boolean,
    uploadTotal?: number
  ): Promise<ReckerResponse> {
    let timeoutController: AbortController | undefined;
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      let redirectCount = 0;
      let currentMethod = req.method;
      let currentBody = req.body;
      let currentHeaders = { ...headers };
      let effectiveSignal = req.signal;

      if (timeouts.totalTimeout) {
        timeoutController = new AbortController();

        if (req.signal) {
          const originalSignal = req.signal;
          effectiveSignal = timeoutController.signal;

          const onOriginalAbort = () => {
            timeoutController!.abort();
          };

          if (originalSignal.aborted) {
            timeoutController.abort();
          } else {
            originalSignal.addEventListener('abort', onOriginalAbort, { once: true });
          }
        } else {
          effectiveSignal = timeoutController.signal;
        }

        timeoutId = setTimeout(() => {
          timeoutController!.abort();
        }, timeouts.totalTimeout);
      }

      while (true) {
        const dispatcher = this.socketClient || determineDispatcher({
          explicit: (req as any)._dispatcher,
          proxyAgent: this.proxyAgent,
          agentManager: this.agentManager,
          dnsAgent: this.dnsAgent,
          url: currentUrl,
          bypass: this.proxyBypassList
        });

        const bodyWithProgress = redirectCount === 0
          ? wrapUploadBody(currentBody, req.onUploadProgress, uploadTotal)
          : currentBody;

        let finalBody = bodyWithProgress;

        // Workaround for undici FormData issues
        if (finalBody instanceof FormData) {
          const tempResponse = new Response(finalBody);
          finalBody = tempResponse.body;
          tempResponse.headers.forEach((value, key) => {
            if (key.toLowerCase() === 'content-type') {
              currentHeaders[key] = value;
              delete currentHeaders['Content-Type'];
            } else if (!currentHeaders[key]) {
              currentHeaders[key] = value;
            }
          });
        }

        const undiciOptions: any = {
          method: currentMethod as any,
          headers: currentHeaders,
          body: finalBody as any,
          signal: effectiveSignal,
          dispatcher: dispatcher,
          connectTimeout: timeouts.connectTimeout,
          headersTimeout: timeouts.headersTimeout,
          bodyTimeout: timeouts.bodyTimeout,
          maxRedirections: 0, // Always handle redirects manually
        };

        // Stream body handling
        if (finalBody && (
          finalBody instanceof ReadableStream ||
          (typeof (finalBody as any).pipe === 'function') ||
          (finalBody as any)[Symbol.asyncIterator]
        )) {
          undiciOptions.duplex = 'half';
        }

        const tlsOptions = mapTlsOptions(this.tlsOptions);
        if (tlsOptions) {
          undiciOptions.tls = tlsOptions;
        }

        // HTTP/2 configuration
        const http2Enabled = req.http2 !== undefined
          ? req.http2
          : this.options.http2?.enabled;

        if (http2Enabled) {
          undiciOptions.allowH2 = true;
        } else if (req.http2 === false) {
          undiciOptions.allowH2 = false;
        }

        if (http2Enabled && this.options.http2) {
          if (this.options.http2.maxConcurrentStreams !== undefined) {
            undiciOptions.maxConcurrentStreams = this.options.http2.maxConcurrentStreams;
          }
          if (this.options.http2.pipelining !== undefined) {
            undiciOptions.pipelining = this.options.http2.pipelining;
          }
        }

        let undiciResponse;
        if (this.socketClient) {
          const urlPath = new URL(currentUrl).pathname + new URL(currentUrl).search;
          undiciResponse = await this.socketClient.request({
            path: urlPath || '/',
            method: currentMethod as any,
            headers: currentHeaders,
            body: bodyWithProgress as any,
            signal: req.signal,
          });
        } else {
          undiciResponse = await undiciRequest(currentUrl, undiciOptions);
        }

        // Handle redirects (Manual or Automatic)
        const statusCode = undiciResponse.statusCode;
        const isRedirect = statusCode >= 300 && statusCode < 400;

        if (isRedirect && followRedirects && redirectCount < maxRedirects) {
          const locationHeader = undiciResponse.headers['location'];
          const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader;

          if (location) {
            const nextUrl = new URL(location, currentUrl).toString();

            if (handleRedirectsManually) {
                const responseHeaders = new Headers();
                for (const [key, value] of Object.entries(undiciResponse.headers)) {
                  if (value !== undefined) {
                    if (Array.isArray(value)) {
                      value.forEach(v => responseHeaders.append(key, v));
                    } else {
                      responseHeaders.set(key, value);
                    }
                  }
                }

                const redirectInfo: RedirectInfo = {
                  from: currentUrl,
                  to: nextUrl,
                  status: statusCode,
                  headers: responseHeaders,
                };

                const hookResult = await req.beforeRedirect!(redirectInfo);

                if (hookResult === false) {
                  const finalResponse = req.onDownloadProgress
                    ? wrapDownloadResponse(undiciResponse, req.onDownloadProgress)
                    : undiciResponse;

                  // Return with empty timings/connection (observability disabled)
                  return new HttpResponse(finalResponse, {
                    timings: {},
                    connection: {}
                  });
                }
                
                if (typeof hookResult === 'string') {
                    currentUrl = hookResult;
                } else {
                    currentUrl = nextUrl;
                }
            } else {
                currentUrl = nextUrl;
            }

            if (statusCode === 303 || ((statusCode === 301 || statusCode === 302) && currentMethod !== 'GET' && currentMethod !== 'HEAD')) {
              currentMethod = 'GET';
              currentBody = null;
              delete currentHeaders['content-type'];
              delete currentHeaders['content-length'];
              delete currentHeaders['Content-Type'];
              delete currentHeaders['Content-Length'];
            }

            await undiciResponse.body.arrayBuffer().catch(() => {});
            redirectCount++;
            continue;
          }
        }

        const finalResponse = req.onDownloadProgress
          ? wrapDownloadResponse(undiciResponse, req.onDownloadProgress)
          : undiciResponse;

        // Return with empty timings/connection (observability disabled)
        return new HttpResponse(finalResponse, {
          timings: {},
          connection: {}
        });
      }
    } catch (error: any) {
      // Map Undici timeout errors
      if (error instanceof undiciErrors.ConnectTimeoutError || error.code === 'UND_ERR_CONNECT_TIMEOUT') {
        throw new TimeoutError(req, {
          phase: 'connect',
          timeout: timeouts.connectTimeout
        });
      }

      if (error instanceof undiciErrors.HeadersTimeoutError || error.code === 'UND_ERR_HEADERS_TIMEOUT') {
        throw new TimeoutError(req, {
          phase: 'response',
          timeout: timeouts.headersTimeout
        });
      }

      if (error instanceof undiciErrors.BodyTimeoutError || error.code === 'UND_ERR_BODY_TIMEOUT') {
        throw new TimeoutError(req, {
          phase: 'send',
          timeout: timeouts.bodyTimeout
        });
      }

      if (error.name === 'AbortError' || error.code === 'ABORT_ERR') {
        throw new TimeoutError(req, {
          phase: 'request',
          timeout: timeouts.totalTimeout
        });
      }

      const code = error.code || error?.cause?.code;

      if (code === 'UND_ERR_HEADERS_OVERFLOW') {
        throw new MaxSizeExceededError(
          16 * 1024, // default max header size
          undefined,
          req
        );
      }

      throw new NetworkError(error.message, code, req);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}

/**
 * Normalize TLS options to the shape Undici/Node expects.
 */
function mapTlsOptions(options?: TLSOptions): any | undefined {
  if (!options) return undefined;

  const tls: any = {};

  if (options.minVersion) tls.minVersion = options.minVersion;
  if (options.maxVersion) tls.maxVersion = options.maxVersion;
  if (options.ciphers) tls.ciphers = options.ciphers;
  if (options.honorCipherOrder !== undefined) tls.honorCipherOrder = options.honorCipherOrder;
  if (options.ca) tls.ca = options.ca;
  if (options.cert) tls.cert = options.cert;
  if (options.key) tls.key = options.key;
  if (options.passphrase) tls.passphrase = options.passphrase;
  if (options.rejectUnauthorized !== undefined) tls.rejectUnauthorized = options.rejectUnauthorized;
  if (options.alpnProtocols) tls.ALPNProtocols = options.alpnProtocols;
  if (options.sessionTimeout !== undefined) tls.sessionTimeout = options.sessionTimeout;
  if (options.sessionIdContext) tls.sessionIdContext = options.sessionIdContext;

  if (options.servername !== undefined) {
    tls.servername = options.servername === false ? '' : options.servername;
  }

  return tls;
}

interface DispatcherParams {
  explicit?: any;
  proxyAgent?: ProxyAgent;
  agentManager?: AgentManager;
  dnsAgent?: Agent;
  url: string;
  bypass?: string[];
}

function determineDispatcher(params: DispatcherParams) {
  if (params.explicit) return params.explicit;

  const { proxyAgent, agentManager, dnsAgent, url, bypass } = params;

  const bypassProxy = shouldBypassProxy(url, bypass);

  if (proxyAgent && !bypassProxy) return proxyAgent;
  if (agentManager) return agentManager.getAgentForUrl(url);
  if (dnsAgent) return dnsAgent;

  return undefined;
}

/**
 * Detect proxy type from URL protocol
 */
function detectProxyType(protocol: string): 'http' | 'https' | 'socks4' | 'socks4a' | 'socks5' | undefined {
  const p = protocol.toLowerCase().replace(':', '');
  switch (p) {
    case 'http':
      return 'http';
    case 'https':
      return 'https';
    case 'socks4':
      return 'socks4';
    case 'socks4a':
      return 'socks4a';
    case 'socks5':
    case 'socks':
      return 'socks5';
    default:
      return undefined;
  }
}

/**
 * Check if an IP address matches a CIDR range
 */
function matchesCIDR(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split('/');
  if (!bits) return ip === range;

  const mask = parseInt(bits, 10);
  if (isNaN(mask)) return false;

  // Simple IPv4 CIDR matching
  const ipParts = ip.split('.').map(Number);
  const rangeParts = range.split('.').map(Number);

  if (ipParts.length !== 4 || rangeParts.length !== 4) return false;
  if (ipParts.some(isNaN) || rangeParts.some(isNaN)) return false;

  const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const rangeNum = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];
  const maskNum = ~((1 << (32 - mask)) - 1);

  return (ipNum & maskNum) === (rangeNum & maskNum);
}

function shouldBypassProxy(url: string, bypass?: string[]): boolean {
  if (!bypass || bypass.length === 0) return false;

  let hostname = '';
  let port = '';
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    port = parsed.port;
  } catch {
    return false;
  }

  for (const rule of bypass) {
    if (rule === '*') return true;

    // CIDR notation (e.g., 192.168.0.0/16)
    if (rule.includes('/')) {
      if (matchesCIDR(hostname, rule)) return true;
      continue;
    }

    // Host:port pattern
    if (rule.includes(':') && !rule.includes('/')) {
      const [hostRule, portRule] = rule.split(':');
      if (hostname === hostRule && (!portRule || port === portRule)) return true;
      continue;
    }

    // Wildcard subdomain (*.example.com)
    if (rule.startsWith('*.')) {
      const suffix = rule.slice(1);
      if (hostname.endsWith(suffix)) return true;
      continue;
    }

    // Domain suffix (.example.com)
    if (rule.startsWith('.')) {
      if (hostname.endsWith(rule)) return true;
      continue;
    }

    // Exact match
    if (hostname === rule) {
      return true;
    }
  }

  return false;
}

function parseContentLength(headers: any): number | undefined {
  if (!headers) return undefined;

  if (typeof (headers as any).get === 'function') {
    const raw = (headers as Headers).get('content-length');
    return raw ? parseInt(raw, 10) : undefined;
  }

  const raw = (headers['content-length'] as any) ?? (headers['Content-Length'] as any);
  if (raw === undefined) return undefined;
  const parsed = parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function wrapDownloadResponse(response: any, onProgress: ProgressCallback): any {
  if (!onProgress) return response;

  // Native Response path
  if (typeof Response !== 'undefined' && response instanceof Response) {
    if (!response.body) return response;
    const total = parseContentLength(response.headers);
    const body = createProgressStream(response.body, onProgress, {
      total,
      direction: 'download'
    });
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }

  // Dispatcher.ResponseData path (undici request)
  const total = parseContentLength(response.headers);
  const nodeBody = (response as any).body;
  if (!nodeBody) return response;

  const webBody = createProgressStream(nodeToWebStream(nodeBody), onProgress, {
    total,
    direction: 'download'
  });
  return new Response(webBody, {
    status: response.statusCode,
    statusText: String(response.statusCode),
    headers: response.headers as HeadersInit
  });
}

function wrapUploadBody(body: any, onProgress?: ProgressCallback, total?: number): any {
  // If body is FormData, pass it directly. Undici handles progress internally for FormData.
  // We cannot wrap FormData with our generic createProgressStream as FormData is not a ReadableStream directly.
  if (body instanceof FormData) {
    return body;
  }

  // If onProgress is not active or body is null/undefined after FormData check, return body as-is.
  if (!onProgress || !body) return body;

  // Existing logic for other body types
  // Web ReadableStream
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    return createProgressStream(body, onProgress, { total, direction: 'upload' });
  }

  // Blob
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return createProgressStream(body.stream(), onProgress, { total: body.size, direction: 'upload' });
  }

  // Node.js readable stream
  if (isNodeReadable(body)) {
    const webStream = nodeToWebStream(body as any);
    return createProgressStream(webStream, onProgress, { total, direction: 'upload' });
  }

  // Buffer / TypedArray / ArrayBuffer
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    const view = body instanceof ArrayBuffer
      ? new Uint8Array(body)
      : new Uint8Array((body as ArrayBufferView).buffer, (body as ArrayBufferView).byteOffset, (body as ArrayBufferView).byteLength);
    return bufferToProgressStream(view, onProgress);
  }

  // String
  if (typeof body === 'string') {
    const encoder = new TextEncoder();
    const view = encoder.encode(body);
    return bufferToProgressStream(view, onProgress);
  }

  return body;
}

function bufferToProgressStream(buffer: Uint8Array, onProgress: ProgressCallback, chunkSize = 64 * 1024) {
  let offset = 0;
  const total = buffer.byteLength;

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= total) {
        controller.close();
        return;
      }
      const end = Math.min(offset + chunkSize, total);
      controller.enqueue(buffer.slice(offset, end));
      offset = end;
    }
  });

  return createProgressStream(stream, onProgress, { total, direction: 'upload' });
}

function isNodeReadable(obj: any): obj is NodeJS.ReadableStream {
  return obj && typeof obj.pipe === 'function' && typeof obj.on === 'function';
}
