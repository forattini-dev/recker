# API Reference

Complete API reference for Recker.

## createClient

Creates an HTTP client instance.

```typescript
import { createClient } from 'recker';

const client = createClient(options?: ClientOptions);
```

### ClientOptions

```typescript
interface ClientOptions {
  // Base URL for all requests
  baseUrl?: string;

  // Default headers for all requests
  headers?: Record<string, string>;

  // Default query parameters
  params?: Record<string, string | number | boolean>;

  // Timeout configuration
  timeout?: number | TimeoutOptions;

  // Retry configuration
  retry?: RetryOptions;

  // Cache configuration
  cache?: CacheOptions;

  // Request deduplication
  dedup?: boolean;

  // Debug mode
  debug?: boolean;

  // Custom logger
  logger?: Logger;

  // Throw on non-2xx responses
  throwHttpErrors?: boolean;

  // Follow redirects
  followRedirects?: boolean;

  // Max redirects to follow
  maxRedirects?: number;

  // DNS configuration
  dns?: DNSOptions;

  // Connection pool configuration
  pool?: PoolOptions;

  // Proxy configuration
  proxy?: ProxyOptions | string;

  // TLS options
  tls?: TLSOptions;

  // Enable HTTP/2
  http2?: boolean;

  // Custom transport
  transport?: Transport;

  // Enable observability (timings, connection info)
  observability?: boolean;
}
```

### TimeoutOptions

```typescript
interface TimeoutOptions {
  // Timeout for establishing connection
  connect?: number;

  // Time to first byte
  firstByte?: number;

  // Time between bytes
  betweenBytes?: number;

  // Total request timeout
  total?: number;
}
```

### RetryOptions

```typescript
interface RetryOptions {
  // Max retry attempts
  maxAttempts?: number;

  // Backoff strategy
  backoff?: 'linear' | 'exponential' | 'decorrelated';

  // Base delay in milliseconds
  delay?: number;

  // Enable jitter
  jitter?: boolean;

  // Status codes to retry
  retryOn?: number[];

  // Model fallbacks (for AI)
  fallback?: Record<string, string>;

  // Retry callback
  onRetry?: (attempt: number, error: Error) => void;
}
```

### CacheOptions

```typescript
interface CacheOptions {
  // Cache storage backend
  storage?: CacheStorage;

  // Time to live in milliseconds
  ttl?: number;

  // Cache strategy
  strategy?: 'cache-first' | 'stale-while-revalidate' | 'network-only';

  // Methods to cache
  methods?: string[];

  // Cache key generator
  keyGenerator?: (req: Request) => string;
}
```

## Client Methods

### HTTP Methods

```typescript
// GET request
client.get(path: string, options?: RequestOptions): RequestPromise;

// POST request
client.post(path: string, options?: RequestOptions): RequestPromise;

// PUT request
client.put(path: string, options?: RequestOptions): RequestPromise;

// PATCH request
client.patch(path: string, options?: RequestOptions): RequestPromise;

// DELETE request
client.delete(path: string, options?: RequestOptions): RequestPromise;

// HEAD request
client.head(path: string, options?: RequestOptions): RequestPromise;

// OPTIONS request
client.options(path: string, options?: RequestOptions): RequestPromise;
```

### Additional Methods

```typescript
// WebDAV methods
client.propfind(path: string, options?: RequestOptions): RequestPromise;
client.proppatch(path: string, options?: RequestOptions): RequestPromise;
client.mkcol(path: string, options?: RequestOptions): RequestPromise;
client.copy(path: string, options?: RequestOptions): RequestPromise;
client.move(path: string, options?: RequestOptions): RequestPromise;
client.lock(path: string, options?: RequestOptions): RequestPromise;
client.unlock(path: string, options?: RequestOptions): RequestPromise;

// CDN methods
client.purge(path: string, options?: RequestOptions): RequestPromise;

// Diagnostic methods
client.trace(path: string, options?: RequestOptions): RequestPromise;
client.connect(path: string, options?: RequestOptions): RequestPromise;
```

### RequestOptions

```typescript
interface RequestOptions {
  // Path parameters
  params?: Record<string, string | number | boolean>;

  // Query parameters
  query?: Record<string, string | number | boolean>;

  // Request headers
  headers?: Record<string, string>;

  // Request body
  body?: BodyInit;

  // JSON body (auto-serialized)
  json?: any;

  // Form data body
  form?: Record<string, string>;

  // Multipart form data
  formData?: FormData;

  // Abort signal
  signal?: AbortSignal;

  // Override timeout
  timeout?: number | TimeoutOptions;

  // Override retry
  retry?: RetryOptions;

  // Override throw behavior
  throwHttpErrors?: boolean;

  // Response format
  responseFormat?: 'json' | 'text' | 'blob' | 'buffer' | 'stream';

  // Download progress callback
  onDownloadProgress?: (progress: Progress) => void;

  // Upload progress callback
  onUploadProgress?: (progress: Progress) => void;
}
```

## Response Object

### ReckerResponse

```typescript
interface ReckerResponse {
  // HTTP status code
  status: number;

  // Status text
  statusText: string;

  // Response OK (2xx)
  ok: boolean;

  // Response headers
  headers: Headers;

  // Request URL
  url: string;

  // Response timing information
  timings?: ResponseTimings;

  // Connection information
  connection?: ConnectionInfo;

  // Rate limit information
  rateLimit?: RateLimitInfo;

  // Cache information
  cache?: CacheInfo;

  // Body methods
  json<T>(): Promise<T>;
  text(): Promise<string>;
  blob(): Promise<Blob>;
  buffer(): Promise<Buffer>;
  stream(): ReadableStream;

  // Clone response
  clone(): ReckerResponse;

  // SSE iterator
  sse(): AsyncGenerator<SSEEvent>;

  // Clean text for AI
  cleanText(): Promise<string>;
}
```

### ResponseTimings

```typescript
interface ResponseTimings {
  queuing: number;    // Time in queue
  dns: number;        // DNS lookup time
  tcp: number;        // TCP connection time
  tls: number;        // TLS handshake time
  firstByte: number;  // Time to first byte
  content: number;    // Content download time
  total: number;      // Total request time
}
```

### ConnectionInfo

```typescript
interface ConnectionInfo {
  protocol: string;       // 'h2', 'HTTP/1.1'
  cipher?: string;        // TLS cipher
  remoteAddress: string;  // Server IP
  remotePort: number;     // Server port
  localAddress: string;   // Client IP
  localPort: number;      // Client port
  reused: boolean;        // Connection reused
}
```

## RequestPromise

Chainable promise-like object returned by request methods.

```typescript
interface RequestPromise extends Promise<ReckerResponse> {
  // Parse as JSON
  json<T>(): Promise<T>;

  // Parse as text
  text(): Promise<string>;

  // Parse as blob
  blob(): Promise<Blob>;

  // Parse as buffer
  buffer(): Promise<Buffer>;

  // Parse with Zod schema
  parse<T>(schema: ZodSchema<T>): Promise<T>;

  // Safe parse with Zod
  safeParse<T>(schema: ZodSchema<T>): Promise<{ success: boolean; data?: T; error?: ZodError }>;

  // Write to file
  write(path: string): Promise<void>;

  // Cancel request
  cancel(): void;

  // SSE iterator
  sse(): AsyncGenerator<SSEEvent>;

  // Async iteration (raw bytes)
  [Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array>;
}
```

## Hooks

### beforeRequest

```typescript
client.beforeRequest(
  (request: ReckerRequest) => ReckerRequest | void | Promise<ReckerRequest | void>
);
```

### afterResponse

```typescript
client.afterResponse(
  (request: ReckerRequest, response: ReckerResponse) => ReckerResponse | void | Promise<ReckerResponse | void>
);
```

### onError

```typescript
client.onError(
  (error: Error, request: ReckerRequest) => ReckerResponse | void | Promise<ReckerResponse | void>
);
```

## Plugins

### Plugin Interface

```typescript
type Plugin = (client: Client) => void;
```

### Using Plugins

```typescript
client.use(plugin: Plugin | Middleware): Client;
```

### Middleware Interface

```typescript
type Middleware = (
  request: ReckerRequest,
  next: (request: ReckerRequest) => Promise<ReckerResponse>
) => Promise<ReckerResponse>;
```

## Errors

### Error Classes

```typescript
import {
  ReckerError,      // Base error class
  HttpError,        // Non-2xx response error
  TimeoutError,     // Request timeout
  NetworkError,     // Network connectivity error
  ValidationError   // Schema validation error
} from 'recker';
```

### Error Properties

```typescript
interface ReckerError {
  message: string;
  name: string;
  code?: string;
  cause?: Error;
  suggestions?: string[];
}

interface HttpError extends ReckerError {
  status: number;
  statusText: string;
  response: ReckerResponse;
}

interface TimeoutError extends ReckerError {
  type: 'connect' | 'firstByte' | 'betweenBytes' | 'total';
}

interface NetworkError extends ReckerError {
  code: string;  // 'ECONNRESET', 'ENOTFOUND', etc.
}
```

## AI Client

### createAIClient

```typescript
import { createAIClient, ai } from 'recker/ai';

const client = createAIClient(options?: AIClientOptions);

// Or use default client
await ai.chat('Hello!');
```

### AIClientOptions

```typescript
interface AIClientOptions {
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
  timeout?: TimeoutOptions;
  retry?: RetryOptions;
  debug?: boolean;
}
```

### AI Methods

```typescript
// Chat completion
client.chat(options: ChatOptions): Promise<AIResponse>;
client.chat(prompt: string): Promise<AIResponse>;

// Streaming
client.stream(options: ChatOptions): Promise<AsyncIterable<StreamEvent>>;

// Embeddings
client.embed(options: EmbedOptions): Promise<EmbedResponse>;

// Extended client
client.extend(options: Partial<ChatOptions>): AIClient;

// Metrics
client.metrics.summary(): MetricsSummary;
client.metrics.reset(): void;
```

## MCP Client

### createMCPClient

```typescript
import { createMCPClient } from 'recker/mcp';

const mcp = createMCPClient(options: MCPClientOptions);
```

### MCPClientOptions

```typescript
interface MCPClientOptions {
  endpoint: string;
  clientName?: string;
  clientVersion?: string;
  protocolVersion?: string;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  debug?: boolean;
}
```

### MCP Methods

```typescript
// Connection
mcp.connect(): Promise<MCPServerInfo>;
mcp.disconnect(): Promise<void>;
mcp.isConnected(): boolean;
mcp.ping(): Promise<void>;

// Tools
mcp.tools.list(): Promise<MCPTool[]>;
mcp.tools.get(name: string): Promise<MCPTool | undefined>;
mcp.tools.call(name: string, args?: object): Promise<MCPToolResult>;

// Resources
mcp.resources.list(): Promise<MCPResource[]>;
mcp.resources.read(uri: string): Promise<MCPResourceContent[]>;
mcp.resources.subscribe(uri: string): Promise<void>;
mcp.resources.unsubscribe(uri: string): Promise<void>;

// Prompts
mcp.prompts.list(): Promise<MCPPrompt[]>;
mcp.prompts.get(name: string, args?: object): Promise<MCPPromptMessage[]>;
```

## Protocols

### WebSocket

```typescript
import { websocket, ReckerWebSocket } from 'recker/websocket';

const ws = websocket(url: string, options?: WebSocketOptions);
// or
const ws = new ReckerWebSocket(url, options);
await ws.connect();
```

### FTP

```typescript
import { createFTP, ftp } from 'recker/protocols';

const client = createFTP(config: FTPConfig);
// or one-shot
await ftp(config, async (client) => { ... });
```

### SFTP

```typescript
import { createSFTP, sftp } from 'recker/protocols';

const client = createSFTP(config: SFTPConfig);
// or one-shot
await sftp(config, async (client) => { ... });
```

### Telnet

```typescript
import { createTelnet, telnet } from 'recker/protocols';

const client = createTelnet(config: TelnetConfig);
// or one-shot
await telnet(config, async (client) => { ... });
```

### WHOIS

```typescript
import { whois, isDomainAvailable } from 'recker/utils/whois';

const result = await whois(query: string, options?: WhoisOptions);
const available = await isDomainAvailable(domain: string);
```

## Next Steps

- **[Recipes](02-recipes.md)** - Common patterns
- **[Testing](03-testing.md)** - Test your code
