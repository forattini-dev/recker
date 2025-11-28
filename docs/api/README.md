# API Reference

> Complete API documentation for Recker HTTP client

This page provides comprehensive documentation for all public APIs, classes, interfaces, and types in Recker.

## Table of Contents

- [Client](#client)
- [Request Methods](#request-methods)
- [Response](#response)
- [Plugins](#plugins)
- [Utilities](#utilities)
- [Types](#types)
- [WebSocket](#websocket)
- [WHOIS](#whois)
- [DNS](#dns)

---

## Client

### createClient()

Creates a new HTTP client instance.

```typescript
function createClient(options: ClientOptions): Client
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `options` | `ClientOptions` | Configuration options |

**Returns:** `Client` instance

**Example:**

```typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'Authorization': 'Bearer token123'
  },
  timeout: 5000,
  retry: { attempts: 3, delay: 1000 }
});
```

### ClientOptions

```typescript
interface ClientOptions {
  // Base configuration
  baseUrl?: string;
  headers?: Record<string, string>;
  timeout?: number;

  // Transport
  transport?: 'undici' | 'fetch';

  // Resilience
  retry?: RetryOptions;

  // Performance
  cache?: CacheOptions;
  dedup?: DedupOptions;
  rateLimit?: RateLimitOptions;
  compression?: boolean;

  // Security
  xsrf?: boolean | XSRFOptions;
  cookieJar?: CookieJarOptions;

  // Networking
  proxy?: ProxyOptions;
  dns?: DNSOptions;
  tls?: TLSOptions;

  // Observability
  logger?: LoggerOptions;
  metrics?: boolean;

  // Validation
  contract?: ContractOptions;
}
```

---

## Request Methods

### client.request()

Generic request method.

```typescript
request<T = any>(path: string, options?: RequestOptions): ReckerResponse<T>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Request path (relative to baseUrl) |
| `options` | `RequestOptions` | Request configuration |

**Returns:** `ReckerResponse<T>`

### client.get()

HTTP GET request.

```typescript
get<T = any>(path: string, options?: RequestOptions): ReckerResponse<T>
```

**Example:**

```typescript
const response = await client.get('/users/123');
const user = await response.json();
```

### client.post()

HTTP POST request.

```typescript
post<T = any>(path: string, options?: RequestOptions): ReckerResponse<T>
```

**Example:**

```typescript
const response = await client.post('/users', {
  body: { name: 'John Doe', email: 'john@example.com' }
});
const created = await response.json();
```

### client.put()

HTTP PUT request.

```typescript
put<T = any>(path: string, options?: RequestOptions): ReckerResponse<T>
```

### client.patch()

HTTP PATCH request.

```typescript
patch<T = any>(path: string, options?: RequestOptions): ReckerResponse<T>
```

### client.delete()

HTTP DELETE request.

```typescript
delete<T = any>(path: string, options?: RequestOptions): ReckerResponse<T>
```

### client.head()

HTTP HEAD request.

```typescript
head(path: string, options?: RequestOptions): ReckerResponse<never>
```

### client.options()

HTTP OPTIONS request.

```typescript
options(path: string, options?: RequestOptions): ReckerResponse<never>
```

### RequestOptions

```typescript
interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, any>;
  timeout?: number;
  signal?: AbortSignal;

  // Override client defaults
  retry?: RetryOptions | false;
  cache?: CacheOptions | false;
  dedup?: boolean;

  // Response handling
  responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer' | 'stream';

  // Validation
  contract?: Contract | false;
}
```

---

## Response

### ReckerResponse

Extended Response object with additional methods.

```typescript
class ReckerResponse<T = any> extends Response {
  // Timing information
  timing: {
    dns?: number;
    tcp?: number;
    tls?: number;
    firstByte?: number;
    content?: number;
    total?: number;
  };

  // Retry information
  retries?: number;

  // Cache information
  cached?: boolean;
  cacheAge?: number;

  // Methods
  json<U = T>(): Promise<U>;
  text(): Promise<string>;
  blob(): Promise<Blob>;
  arrayBuffer(): Promise<ArrayBuffer>;
  formData(): Promise<FormData>;

  // Streaming
  stream(): ReadableStream<Uint8Array>;
  sse(): AsyncIterableIterator<ServerSentEvent>;

  // Validation
  validate<Schema>(schema: Schema): Promise<TypeFromSchema<Schema>>;
}
```

### Response Methods

#### json()

Parse response as JSON.

```typescript
json<T = any>(): Promise<T>
```

**Example:**

```typescript
const response = await client.get('/users');
const users = await response.json<User[]>();
```

#### text()

Get response as text.

```typescript
text(): Promise<string>
```

#### blob()

Get response as Blob.

```typescript
blob(): Promise<Blob>
```

#### stream()

Get response as ReadableStream.

```typescript
stream(): ReadableStream<Uint8Array>
```

**Example:**

```typescript
const response = await client.get('/large-file');
const stream = response.stream();

for await (const chunk of stream) {
  console.log('Chunk:', chunk.length);
}
```

#### sse()

Parse Server-Sent Events.

```typescript
sse(): AsyncIterableIterator<ServerSentEvent>
```

**Example:**

```typescript
const response = await client.get('/events');

for await (const event of response.sse()) {
  console.log('Event:', event.data);
}
```

---

## Plugins

### Retry Plugin

```typescript
interface RetryOptions {
  attempts?: number;          // Default: 3
  delay?: number;            // Default: 1000ms
  backoff?: 'linear' | 'exponential' | 'constant';  // Default: 'exponential'
  maxDelay?: number;         // Default: 30000ms
  retryOn?: (error: Error, attempt: number) => boolean;
  onRetry?: (error: Error, attempt: number) => void;
}
```

**Example:**

```typescript
const client = createClient({
  retry: {
    attempts: 5,
    delay: 1000,
    backoff: 'exponential',
    maxDelay: 10000,
    retryOn: (error, attempt) => {
      // Retry on 5xx or network errors
      return error.status >= 500 || error.code === 'ECONNRESET';
    }
  }
});
```

### Cache Plugin

```typescript
interface CacheOptions {
  driver?: 'memory' | 'file';
  ttl?: number;              // Default: 60000ms (1 minute)
  maxSize?: number;          // Memory: items, File: bytes
  dir?: string;              // File cache directory
  key?: (req: Request) => string;
  shouldCache?: (res: Response) => boolean;
}
```

**Example:**

```typescript
const client = createClient({
  cache: {
    driver: 'memory',
    ttl: 300000,  // 5 minutes
    maxSize: 100,  // 100 items
    shouldCache: (res) => res.status === 200 && res.ok
  }
});
```

### Dedup Plugin

```typescript
interface DedupOptions {
  enabled?: boolean;         // Default: true
  key?: (req: Request) => string;
}
```

### Rate Limit Plugin

```typescript
interface RateLimitOptions {
  concurrency?: number;           // Max concurrent requests
  requestsPerInterval?: number;   // Max requests per interval
  interval?: number;              // Interval in ms
}
```

**Example:**

```typescript
const client = createClient({
  rateLimit: {
    concurrency: 10,
    requestsPerInterval: 100,
    interval: 1000  // 100 req/s, max 10 concurrent
  }
});
```

### Circuit Breaker Plugin

```typescript
interface CircuitBreakerOptions {
  threshold?: number;         // Failure threshold
  timeout?: number;          // Circuit open duration
  resetTimeout?: number;     // Reset attempt delay
}
```

### Cookie Jar Plugin

```typescript
interface CookieJarOptions {
  enabled?: boolean;
  storage?: 'memory' | 'file';
  file?: string;
}
```

### XSRF Plugin

```typescript
interface XSRFOptions {
  cookieName?: string;       // Default: 'XSRF-TOKEN'
  headerName?: string;       // Default: 'X-XSRF-TOKEN'
}
```

### Compression Plugin

Automatically handles gzip, brotli, and deflate compression.

```typescript
compression?: boolean  // Default: false
```

### Logger Plugin

```typescript
interface LoggerOptions {
  level?: 'debug' | 'info' | 'warn' | 'error';
  logger?: (message: string, level: string, data?: any) => void;
}
```

---

## Utilities

### Header Parsing

#### parseHeaders()

Parse all headers at once.

```typescript
function parseHeaders(headers: Headers, status: number): HeaderInfo
```

**Returns:**

```typescript
interface HeaderInfo {
  cache: CacheInfo;
  cloud: CloudInfo;
  rateLimit: RateLimitInfo;
  compression: CompressionInfo;
  csp: CSPInfo;
  contentType: ContentTypeInfo;
  accept: AcceptInfo;
}
```

#### parseCacheInfo()

Extract cache information.

```typescript
function parseCacheInfo(headers: Headers): CacheInfo
```

**Returns:**

```typescript
interface CacheInfo {
  hit: boolean;
  status?: 'HIT' | 'MISS' | 'EXPIRED' | 'STALE' | 'BYPASS' | 'REVALIDATED';
  age?: number;
  maxAge?: number;
  provider?: 'cloudflare' | 'fastly' | 'akamai' | 'cloudfront' | 'nginx' | 'varnish' | 'unknown';
}
```

#### parseCloudInfo()

Detect cloud provider.

```typescript
function parseCloudInfo(headers: Headers): CloudInfo
```

**Returns:**

```typescript
interface CloudInfo {
  provider?: 'cloudflare' | 'aws' | 'gcp' | 'azure' | 'fastly' | 'akamai' | 'vercel' | 'netlify' | 'unknown';
  region?: string;
  server?: string;
  ray?: string;
  requestId?: string;
}
```

#### parseRateLimitInfo()

Extract rate limit details.

```typescript
function parseRateLimitInfo(headers: Headers, status: number): RateLimitInfo
```

**Returns:**

```typescript
interface RateLimitInfo {
  limited: boolean;
  limit?: number;
  remaining?: number;
  reset?: Date;
  retryAfter?: number;
  policy?: string;
}
```

#### parseCompressionInfo()

Get compression details.

```typescript
function parseCompressionInfo(headers: Headers): CompressionInfo
```

**Returns:**

```typescript
interface CompressionInfo {
  encoding?: 'gzip' | 'br' | 'deflate' | 'compress' | 'identity' | string;
  originalSize?: number;
  compressedSize?: number;
  ratio?: number;
}
```

#### parseCSPInfo()

Parse Content Security Policy.

```typescript
function parseCSPInfo(headers: Headers): CSPInfo
```

**Returns:**

```typescript
interface CSPInfo {
  policy?: string;
  directives: Record<string, string[]>;
  reportOnly: boolean;
}
```

#### parseContentType()

Parse Content-Type header.

```typescript
function parseContentType(headers: Headers): ContentTypeInfo
```

**Returns:**

```typescript
interface ContentTypeInfo {
  mediaType?: string;
  charset?: string;
  boundary?: string;
  type?: string;
  subtype?: string;
}
```

#### parseAcceptInfo()

Parse Accept-* headers.

```typescript
function parseAcceptInfo(headers: Headers): AcceptInfo
```

**Returns:**

```typescript
interface AcceptInfo {
  types: Array<{
    mediaType: string;
    q: number;
    type?: string;
    subtype?: string;
  }>;
  encodings: Array<{
    encoding: string;
    q: number;
  }>;
  languages: Array<{
    language: string;
    q: number;
  }>;
}
```

### Request Runner

#### RequestRunner

Batch request executor with concurrency control.

```typescript
class RequestRunner extends EventEmitter {
  constructor(options?: RunnerOptions);

  add<T>(
    fn: () => Promise<T>,
    options?: { priority?: number; id?: string }
  ): void;

  run<T>(
    items: any[],
    processor: (item: any, index: number) => Promise<T>,
    options?: { priority?: number }
  ): Promise<RunnerResult<T>>;

  getProgress(): ProgressInfo;
}
```

**Options:**

```typescript
interface RunnerOptions {
  concurrency?: number;  // Default: 5
}
```

**Events:**

- `taskStart(task)` - Task begins execution
- `taskComplete({ task, result })` - Task completes
- `taskError({ task, error })` - Task fails
- `progress(progress)` - Progress update
- `drained()` - All tasks complete

**Example:**

```typescript
import { RequestRunner } from 'recker';

const runner = new RequestRunner({ concurrency: 10 });

runner.on('progress', (progress) => {
  console.log(`${progress.percent}% complete`);
});

const { results, stats } = await runner.run(
  [1, 2, 3, 4, 5],
  async (item) => {
    const res = await fetch(`https://api.example.com/items/${item}`);
    return res.json();
  }
);
```

### Request Pool

#### RequestPool

Rate limiting pool.

```typescript
class RequestPool {
  constructor(options?: RequestPoolOptions);

  run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T>;
}
```

**Options:**

```typescript
interface RequestPoolOptions {
  concurrency?: number;
  requestsPerInterval?: number;
  interval?: number;
}
```

---

## Types

### ReckerError

Base error class.

```typescript
class ReckerError extends Error {
  name: string;
  message: string;
  code?: string;
  status?: number;
  statusText?: string;
  request?: Request;
  response?: Response;
  cause?: Error;
}
```

### NetworkError

Network-related errors.

```typescript
class NetworkError extends ReckerError {
  code: 'ECONNREFUSED' | 'ENOTFOUND' | 'ETIMEDOUT' | 'ECONNRESET' | string;
}
```

### TimeoutError

Request timeout.

```typescript
class TimeoutError extends ReckerError {
  timeout: number;
}
```

### HTTPError

HTTP error responses (4xx, 5xx).

```typescript
class HTTPError extends ReckerError {
  status: number;
  statusText: string;
  response: Response;
}
```

### RetryError

Retry exhausted.

```typescript
class RetryError extends ReckerError {
  attempts: number;
  errors: Error[];
}
```

---

## WebSocket

### client.websocket()

Create WebSocket connection.

```typescript
websocket(path: string, options?: WebSocketOptions): ReckerWebSocket
```

**Options:**

```typescript
interface WebSocketOptions {
  protocols?: string | string[];
  reconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
  heartbeatMessage?: string;
}
```

**Returns:** `ReckerWebSocket`

### ReckerWebSocket

```typescript
class ReckerWebSocket extends EventEmitter implements AsyncIterable<MessageEvent> {
  // Connection
  connect(): Promise<void>;
  disconnect(): void;

  // Messaging
  send(data: string | ArrayBuffer | Blob): void;

  // State
  get readyState(): number;

  // Async iteration
  [Symbol.asyncIterator](): AsyncIterator<MessageEvent>;

  // Events
  on(event: 'open', listener: () => void): this;
  on(event: 'message', listener: (event: MessageEvent) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'close', listener: (event: CloseEvent) => void): this;
  on(event: 'reconnecting', listener: (attempt: number) => void): this;
  on(event: 'reconnected', listener: () => void): this;
}
```

**Example:**

```typescript
const ws = client.websocket('/chat', {
  reconnect: true,
  heartbeatInterval: 30000
});

// Event-based
ws.on('message', (msg) => {
  console.log('Received:', msg.data);
});

ws.on('reconnecting', (attempt) => {
  console.log(`Reconnecting... attempt ${attempt}`);
});

// Async iterator
for await (const message of ws) {
  console.log('Message:', message.data);

  if (message.data === 'exit') {
    break;
  }
}

ws.send('Hello!');
```

---

## WHOIS

### client.whois()

Query WHOIS information.

```typescript
whois(query: string, options?: WhoisOptions): Promise<WhoisResult>
```

**Options:**

```typescript
interface WhoisOptions {
  server?: string;
  port?: number;
  timeout?: number;
  follow?: boolean;
}
```

**Returns:**

```typescript
interface WhoisResult {
  raw: string;
  query: string;
  server: string;
  data: Record<string, string | string[]>;
}
```

**Example:**

```typescript
const result = await client.whois('example.com');

console.log('Domain:', result.query);
console.log('Registrar:', result.data['registrar']);
console.log('Created:', result.data['creation date']);
console.log('Expires:', result.data['registry expiry date']);
```

### client.isDomainAvailable()

Check if domain is available.

```typescript
isDomainAvailable(domain: string, options?: WhoisOptions): Promise<boolean>
```

**Example:**

```typescript
const available = await client.isDomainAvailable('my-app.com');

if (available) {
  console.log('Domain is available!');
}
```

---

## DNS

### DNSOptions

Custom DNS configuration.

```typescript
interface DNSOptions {
  override?: Record<string, string>;  // Hostname -> IP mapping
  servers?: string[];                 // Custom DNS servers
  timeout?: number;                   // Lookup timeout
  preferIPv4?: boolean;               // Prefer IPv4 over IPv6
}
```

**Example:**

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: {
      'api.example.com': '1.2.3.4'
    },
    servers: ['8.8.8.8', '1.1.1.1'],
    timeout: 5000,
    preferIPv4: true
  }
});
```

---

## Batch Requests

### client.batch()

Execute multiple requests concurrently.

```typescript
batch<T>(
  requests: Array<{ path: string; options?: RequestOptions }>,
  options?: BatchOptions
): Promise<RunnerResult<T>>
```

**Options:**

```typescript
interface BatchOptions {
  concurrency?: number;
  mapResponse?: (res: ReckerResponse) => Promise<T> | T;
}
```

**Returns:**

```typescript
interface RunnerResult<T> {
  results: (T | Error)[];
  stats: {
    total: number;
    successful: number;
    failed: number;
    duration: number;
  };
}
```

**Example:**

```typescript
const { results, stats } = await client.batch<User>(
  [
    { path: '/users/1' },
    { path: '/users/2' },
    { path: '/users/3' }
  ],
  {
    concurrency: 3,
    mapResponse: (res) => res.json()
  }
);

console.log(`Completed ${stats.successful}/${stats.total} in ${stats.duration}ms`);

results.forEach((result, i) => {
  if (result instanceof Error) {
    console.error(`Request ${i} failed:`, result.message);
  } else {
    console.log(`User ${i}:`, result.name);
  }
});
```

---

## Contract Validation

### client.contract()

Create type-safe client with contract validation.

```typescript
contract<Schema>(schema: Schema): ContractClient<Schema>
```

**Example:**

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email()
});

const contractClient = client.contract({
  '/users/:id': {
    GET: {
      response: UserSchema
    }
  }
});

// Type-safe!
const user = await contractClient.get('/users/123');
// user is typed as: { id: number; name: string; email: string }
```

---

## See Also

- [Client Configuration Guide](../guides/client-config.md)
- [Plugins Guide](../guides/plugins.md)
- [Batch Requests Guide](../guides/performance/batch-requests.md)
- [Header Parsing Guide](../guides/header-parsing.md)
- [WebSocket Guide](../guides/websocket.md)
- [WHOIS Guide](../guides/whois.md)
- [DNS Guide](../guides/dns.md)
