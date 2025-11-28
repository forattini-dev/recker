import { request as undiciRequest, errors as undiciErrors, ProxyAgent, Agent } from 'undici';
import { ConnectionInfo, ReckerRequest, ReckerResponse, Timings, Transport, ProxyOptions, HTTP2Options, DNSOptions, AgentOptions } from '../types/index.js';
import { HttpResponse } from '../core/response.js';
import { NetworkError, TimeoutError } from '../core/errors.js';
import { performance } from 'perf_hooks';
import { AsyncLocalStorage } from 'async_hooks';
import { channel } from 'node:diagnostics_channel';
import { createLookupFunction } from '../utils/dns.js';
import { AgentManager } from '../utils/agent-manager.js';

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
}

export class UndiciTransport implements Transport {
  private baseUrl: string;
  private options: UndiciTransportOptions;
  private proxyAgent?: ProxyAgent;
  private dnsAgent?: Agent;
  private agentManager?: AgentManager;

  constructor(baseUrl: string, options: UndiciTransportOptions = {}) {
    this.baseUrl = baseUrl;
    this.options = options;

    if (options.proxy) {
      const proxyUrl = typeof options.proxy === 'string' ? options.proxy : options.proxy.url;
      const proxyAuth = typeof options.proxy === 'object' && options.proxy.auth
        ? `${options.proxy.auth.username}:${options.proxy.auth.password}`
        : undefined;

      const finalProxyUrl = proxyAuth
        ? proxyUrl.replace('://', `://${proxyAuth}@`)
        : proxyUrl;

      this.proxyAgent = new ProxyAgent(finalProxyUrl);
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
  }

  async dispatch(req: ReckerRequest): Promise<ReckerResponse> {
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const path = req.url.startsWith(this.baseUrl) ? req.url.substring(this.baseUrl.length) : req.url;
    const fullUrl = new URL(path, this.baseUrl).toString();
    
    const requestContext: RequestContext = {
      timings: {},
      connection: {},
      requestStartTime: 0,
      requestCorrelationId: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
      hooks: req._hooks
    };

    return requestStorage.run(requestContext, async () => {
      try {
        const startTime = performance.now();
        if (requestContext.requestStartTime === 0) {
            requestContext.requestStartTime = startTime;
        }

        // Determine which dispatcher to use (request-specific > proxy > dns)
        // @ts-ignore - _dispatcher is injected by plugins like proxyRotator
        const dispatcher = req._dispatcher || this.proxyAgent || this.dnsAgent;

        const undiciOptions: any = {
          method: req.method as any,
          headers: headers,
          body: req.body as any,
          signal: req.signal,
          dispatcher: dispatcher,
          connectTimeout: this.options.connectTimeout,
          headersTimeout: this.options.headersTimeout,
          bodyTimeout: this.options.bodyTimeout,
          maxRedirections: this.options.maxRedirections,
        };

        if (this.options.http2) {
          if (this.options.http2.enabled) {
            undiciOptions.allowH2 = true;
          }
          if (this.options.http2.maxConcurrentStreams !== undefined) {
            undiciOptions.maxConcurrentStreams = this.options.http2.maxConcurrentStreams;
          }
          if (this.options.http2.pipelining !== undefined) {
            undiciOptions.pipelining = this.options.http2.pipelining;
          }
        }

        const undiciResponse = await undiciRequest(fullUrl, undiciOptions);
        
        const ttfb = performance.now() - startTime;
        const totalTime = performance.now() - requestContext.requestStartTime;
        
        if (!requestContext.timings.firstByte) {
            requestContext.timings.firstByte = ttfb;
        }
        if (!requestContext.timings.total) {
            requestContext.timings.total = totalTime;
        }

        return new HttpResponse(undiciResponse, { 
          timings: requestContext.timings, 
          connection: requestContext.connection 
        });
      } catch (error: any) {
        if (error instanceof undiciErrors.ConnectTimeoutError || 
            error instanceof undiciErrors.HeadersTimeoutError || 
            error instanceof undiciErrors.BodyTimeoutError) {
          throw new TimeoutError(req);
        }
        
        if (error.code === 'UND_ERR_CONNECT_TIMEOUT' || error.code === 'UND_ERR_HEADERS_TIMEOUT') {
           throw new TimeoutError(req);
        }

        throw new NetworkError(error.message, error.code, req);
      }
    });
  }
}
