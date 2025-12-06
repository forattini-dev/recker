# API Reference

Complete API reference for Recker.

## Direct Functions

Zero-config functions for immediate use:

```typescript
import { get, post, put, patch, del, head, options } from 'recker';
import { whois, whoisAvailable, dns, dnsSecurity, ws } from 'recker';
```

### HTTP Functions

```typescript
get(url: string, options?: RequestOptions): RequestPromise
post(url: string, options?: RequestOptions): RequestPromise
put(url: string, options?: RequestOptions): RequestPromise
patch(url: string, options?: RequestOptions): RequestPromise
del(url: string, options?: RequestOptions): RequestPromise
head(url: string, options?: RequestOptions): RequestPromise
options(url: string, options?: RequestOptions): RequestPromise
```

### Protocol Functions

```typescript
// WHOIS lookup
whois(query: string, options?: WhoisOptions): Promise<WhoisResult>

// Domain availability check
whoisAvailable(domain: string): Promise<boolean>

// DNS resolution
dns(hostname: string, type?: 'A' | 'AAAA' | 'MX' | 'TXT' | 'NS' | 'CNAME'): Promise<string[]>

// DNS security records (SPF, DMARC, DKIM, CAA)
dnsSecurity(domain: string): Promise<DnsSecurityRecords>

// WebSocket connection
ws(url: string, options?: WebSocketOptions): ReckerWebSocket
```

## recker Namespace

Unified access to all Recker functionality:

```typescript
import { recker } from 'recker';

// HTTP
recker.get(url, options)
recker.post(url, options)
recker.put(url, options)
recker.patch(url, options)
recker.delete(url, options)
recker.head(url, options)
recker.options(url, options)

// Protocols
recker.whois(query)
recker.whoisAvailable(domain)
recker.dns(hostname, type)
recker.dnsSecurity(domain)
recker.ws(url, options)

// AI
recker.ai.chat(prompt)
recker.ai.stream(options)
recker.ai.embed(options)

// Factory methods (when you need custom config)
recker.client(options)      // → Client
recker.dnsClient(options)   // → DNSClient
recker.whoisClient(options) // → WhoisClient
recker.aiClient(options)    // → AIClient
```

---

## createClient

Creates a configured HTTP client instance.

```typescript
import { createClient } from 'recker';

const client = createClient(options?: ClientOptions);
```

### ClientOptions

```typescript
interface ClientOptions {
  // Base URL for all requests
  baseUrl?: string;

  // Default headers
  headers?: Record<string, string>;

  // Default query parameters
  params?: Record<string, string | number | boolean>;

  // Timeout in ms or detailed config
  timeout?: number | TimeoutOptions;

  // Retry configuration
  retry?: RetryOptions;

  // Cache configuration
  cache?: CacheOptions;

  // Request deduplication
  dedup?: boolean;

  // Debug logging
  debug?: boolean;

  // Throw on non-2xx responses (default: true)
  throwHttpErrors?: boolean;

  // Follow redirects (default: true)
  followRedirects?: boolean;

  // Max redirects (default: 10)
  maxRedirects?: number;

  // Plugins array
  plugins?: Plugin[];
}
```

### TimeoutOptions

```typescript
interface TimeoutOptions {
  connect?: number;     // Connection timeout
  firstByte?: number;   // Time to first byte
  betweenBytes?: number; // Idle timeout between chunks
  total?: number;       // Total request timeout
}
```

### RetryOptions

```typescript
interface RetryOptions {
  maxAttempts?: number;  // Max retry attempts (default: 3)
  backoff?: 'linear' | 'exponential' | 'decorrelated';
  delay?: number;        // Base delay in ms (default: 1000)
  jitter?: boolean;      // Add randomness to prevent thundering herd
  retryOn?: number[];    // Status codes to retry (default: [429, 500, 502, 503, 504])
  onRetry?: (attempt: number, error: Error) => void;
}
```

### CacheOptions

```typescript
interface CacheOptions {
  storage?: CacheStorage; // Memory or file storage
  ttl?: number;           // Time to live in ms
  strategy?: 'cache-first' | 'stale-while-revalidate' | 'network-only';
  methods?: string[];     // Methods to cache (default: ['GET'])
}
```

---

## RequestOptions

Options for individual requests:

```typescript
interface RequestOptions {
  // URL path parameters (:param substitution)
  params?: Record<string, string | number | boolean>;

  // Query string parameters
  query?: Record<string, string | number | boolean>;

  // Request headers
  headers?: Record<string, string>;

  // Request body
  body?: BodyInit;

  // JSON body (auto-serialized)
  json?: unknown;

  // Form data (URL encoded)
  form?: Record<string, string>;

  // Multipart form data
  formData?: FormData;

  // Abort signal
  signal?: AbortSignal;

  // Override timeout
  timeout?: number | TimeoutOptions;

  // Override retry
  retry?: RetryOptions | false;

  // Override throw behavior
  throwHttpErrors?: boolean;

  // Progress callbacks
  onDownloadProgress?: (progress: Progress) => void;
  onUploadProgress?: (progress: Progress) => void;
}
```

---

## RequestPromise

Chainable promise returned by request methods:

```typescript
interface RequestPromise extends Promise<ReckerResponse> {
  // Parse response body
  json<T = unknown>(): Promise<T>;
  text(): Promise<string>;
  blob(): Promise<Blob>;
  buffer(): Promise<Buffer>;

  // Validate with Zod
  parse<T>(schema: ZodSchema<T>): Promise<T>;
  safeParse<T>(schema: ZodSchema<T>): Promise<SafeParseResult<T>>;

  // Write to file
  write(path: string): Promise<void>;

  // Cancel request
  cancel(): void;

  // SSE streaming
  sse(): AsyncGenerator<SSEEvent>;

  // Raw byte streaming
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array>;
}
```

---

## ReckerResponse

Response object with metadata:

```typescript
interface ReckerResponse {
  // HTTP status
  status: number;
  statusText: string;
  ok: boolean;

  // Headers
  headers: Headers;

  // Request URL (after redirects)
  url: string;

  // Timing information
  timings?: ResponseTimings;

  // Connection info
  connection?: ConnectionInfo;

  // Body methods
  json<T = unknown>(): Promise<T>;
  text(): Promise<string>;
  blob(): Promise<Blob>;
  buffer(): Promise<Buffer>;

  // Clone response
  clone(): ReckerResponse;

  // SSE iterator
  sse(): AsyncGenerator<SSEEvent>;

  // Clean text (strips HTML)
  cleanText(): Promise<string>;
}
```

### ResponseTimings

```typescript
interface ResponseTimings {
  queuing: number;   // Time in queue
  dns: number;       // DNS lookup
  tcp: number;       // TCP connection
  tls: number;       // TLS handshake
  firstByte: number; // Time to first byte
  content: number;   // Content download
  total: number;     // Total time
}
```

### ConnectionInfo

```typescript
interface ConnectionInfo {
  protocol: string;      // 'h2', 'HTTP/1.1'
  cipher?: string;       // TLS cipher
  remoteAddress: string;
  remotePort: number;
  localAddress: string;
  localPort: number;
  reused: boolean;       // Connection reused
}
```

### Progress

```typescript
interface Progress {
  loaded: number;     // Bytes transferred
  total?: number;     // Total bytes (if known)
  percent?: number;   // Percentage complete
  rate?: number;      // Bytes per second
  estimated?: number; // Estimated time remaining (ms)
}
```

---

## Errors

```typescript
import {
  ReckerError,     // Base error class
  HttpError,       // Non-2xx response
  TimeoutError,    // Request timeout
  NetworkError,    // Connection error
  ValidationError  // Zod validation error
} from 'recker';
```

### HttpError

```typescript
interface HttpError extends ReckerError {
  status: number;
  statusText: string;
  response: ReckerResponse;
}
```

### TimeoutError

```typescript
interface TimeoutError extends ReckerError {
  type: 'connect' | 'firstByte' | 'betweenBytes' | 'total';
}
```

### NetworkError

```typescript
interface NetworkError extends ReckerError {
  code: string;  // 'ECONNRESET', 'ENOTFOUND', etc.
}
```

---

## Hooks

```typescript
// Transform requests before sending
client.beforeRequest((request: ReckerRequest) => {
  return request.withHeader('X-Timestamp', Date.now().toString());
});

// Transform responses after receiving
client.afterResponse((request, response) => {
  console.log(`${request.method} ${request.url} → ${response.status}`);
  return response;
});

// Handle errors
client.onError((error, request) => {
  if (error instanceof HttpError && error.status === 401) {
    // Return fallback response
    return new ReckerResponse({ status: 200, body: '{}' });
  }
  throw error;
});
```

---

## Plugins

```typescript
type Plugin = (client: Client) => void;
type Middleware = (request: ReckerRequest, next: Next) => Promise<ReckerResponse>;

// Using plugins
import { retryPlugin, cachePlugin, dedupPlugin, circuitBreakerPlugin } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [
    retryPlugin({ maxAttempts: 3, backoff: 'exponential' }),
    cachePlugin({ ttl: 60000 }),
    dedupPlugin(),
    circuitBreakerPlugin({ threshold: 5 })
  ]
});
```

---

## AI Client

```typescript
import { createAI } from 'recker/ai';
// or
const ai = recker.aiClient(options);
```

### AIClientConfig

```typescript
interface AIClientConfig {
  defaultProvider?: 'openai' | 'anthropic';
  providers?: {
    openai?: {
      apiKey?: string;
      organization?: string;
      baseUrl?: string;
    };
    anthropic?: {
      apiKey?: string;
      version?: string;
      baseUrl?: string;
    };
  };
  timeout?: number;
  retry?: RetryOptions;
}
```

### AI Methods

```typescript
// Simple chat
ai.chat(prompt: string): Promise<string>
ai.chat(options: ChatOptions): Promise<ChatResponse>

// Streaming
ai.stream(options: ChatOptions): AsyncGenerator<StreamEvent>

// Embeddings
ai.embed(options: EmbedOptions): Promise<EmbedResponse>

// Extended client with defaults
ai.extend(defaults: Partial<ChatOptions>): AIClient
```

---

## DNS Client

```typescript
import { createDNS } from 'recker/dns';
// or
const dns = recker.dnsClient(options);
```

### DNSClientOptions

```typescript
interface DNSClientOptions {
  provider?: 'system' | 'cloudflare' | 'google';
  timeout?: number;
}
```

### DNS Methods

```typescript
dns.resolve(hostname: string, type: string): Promise<string[]>
dns.resolve4(hostname: string): Promise<string[]>
dns.resolve6(hostname: string): Promise<string[]>
dns.resolveMx(hostname: string): Promise<MXRecord[]>
dns.resolveTxt(hostname: string): Promise<string[]>
dns.resolveAll(hostname: string): Promise<Record<string, unknown[]>>
dns.getSecurityRecords(domain: string): Promise<DnsSecurityRecords>
```

### DnsSecurityRecords

```typescript
interface DnsSecurityRecords {
  spf: string[];
  dmarc: string[];
  dkim: string[];
  caa: string[];
}
```

---

## WHOIS Client

```typescript
import { createWhois } from 'recker';
// or
const whois = recker.whoisClient(options);
```

### WhoisOptions

```typescript
interface WhoisOptions {
  server?: string;  // Custom WHOIS server
  timeout?: number;
}
```

### WhoisResult

```typescript
interface WhoisResult {
  raw: string;
  parsed: Record<string, string>;
  domainName?: string;
  registrar?: string;
  creationDate?: Date;
  expirationDate?: Date;
  nameServers?: string[];
}
```

### WHOIS Methods

```typescript
whois.lookup(query: string): Promise<WhoisResult>
whois.isAvailable(domain: string): Promise<boolean>
whois.getRegistrar(domain: string): Promise<string | null>
whois.getExpiration(domain: string): Promise<Date | null>
whois.getNameServers(domain: string): Promise<string[]>
```

---

## WebSocket

```typescript
import { createWebSocket } from 'recker';
// or
const ws = recker.ws(url, options);
```

### WebSocketOptions

```typescript
interface WebSocketOptions {
  protocols?: string | string[];
  headers?: Record<string, string>;
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnects?: number;
}
```

### ReckerWebSocket

```typescript
interface ReckerWebSocket {
  send(data: string | Buffer): void;
  close(code?: number, reason?: string): void;

  on(event: 'open', handler: () => void): void;
  on(event: 'message', handler: (data: MessageEvent) => void): void;
  on(event: 'error', handler: (error: Error) => void): void;
  on(event: 'close', handler: (code: number, reason: string) => void): void;

  readyState: number;
  url: string;
}
```

---

## Next Steps

- **[Recipes](./02-recipes.md)** - Common patterns
- **[Testing](./03-testing.md)** - Mock and test your code
- **[Presets](./04-presets.md)** - Pre-configured clients for popular APIs
