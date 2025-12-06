# Features

> Complete overview of Recker's capabilities

Recker is a modern HTTP client built for Node.js 18+ with developer experience and AI integration in mind. Here's everything it can do:

## 🚀 Core Features

### HTTP Client
- **Modern API**: Promise-based with async/await support
- **TypeScript-first**: Full type safety and IntelliSense
- **Multiple transports**: Native high-performance engine and Fetch API
- **Request chaining**: Fluent, chainable API design
- **JSON by default**: Automatic content-type handling

```typescript
import { createClient } from 'recker';

const client = createClient({ baseUrl: 'https://api.example.com' });
const user = await client.get('/user').json();
```

### Comprehensive HTTP Methods
- **Standard methods**: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
- **Diagnostic methods**: TRACE, CONNECT
- **CDN/Cache methods**: PURGE (Varnish, Fastly, Cloudflare)
- **WebDAV methods**: PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK
- **Link methods**: LINK, UNLINK (RFC 2068)

```typescript
// Standard methods
await client.get('/users').json();
await client.post('/users', { name: 'John' }).json();

// WebDAV
await client.mkcol('/webdav/newfolder');
await client.copy('/source', { headers: { 'Destination': '/dest' } });

// Cache invalidation
await client.purge('/cached-resource');
```

[See all HTTP methods →](examples.md#http-methods)

### HTTP/2 and HTTP/3
- **Automatic HTTP/2**: Uses HTTP/2 when server supports it (via Undici)
- **ALPN detection**: Automatic protocol detection
- **Detailed metrics**: Stream IDs, priorities, window sizes
- **HTTP/3 Discovery**: Alt-Svc header parsing and endpoint detection
- **QUIC Ready**: Types and infrastructure for future native QUIC support (Node.js 23+)

> **Note**: Native HTTP/3/QUIC transport requires Node.js 23+ with `--experimental-quic` flag. Currently, HTTP/3 endpoints are discovered via Alt-Svc headers but requests use HTTP/2 fallback.

[Learn more →](http/05-configuration.md)

## 🔌 Protocol Support

### WebSocket
- **Auto-reconnection**: Configurable reconnect strategy with exponential backoff
- **Heartbeat/Ping**: Keep-alive mechanism
- **Event-based**: EventEmitter pattern
- **Async Iterator**: Stream messages with `for await`

```typescript
const ws = client.websocket('/chat', {
  reconnect: true,
  heartbeatInterval: 30000
});

ws.on('message', (msg) => console.log(msg.data));

// Or use async iterator
for await (const message of ws) {
  console.log(message.data);
}
```

[Learn more →](protocols/01-websocket.md)

### WHOIS Lookup
- **Domain information**: Query WHOIS servers for domain data
- **IP lookup**: Support for IPv4 and IPv6
- **30+ TLDs**: Default servers for common TLDs
- **Domain availability**: Check if domains are registered

```typescript
const result = await client.whois('example.com');
console.log(result.data);

const available = await client.isDomainAvailable('my-startup.com');
```

[Learn more →](protocols/05-whois-rdap.md)

### RDAP (Modern WHOIS)
- **Structured JSON**: Machine-readable responses
- **IANA Bootstrap**: Automatic server discovery with 24h cache
- **TLD Detection**: Know which TLDs support RDAP vs WHOIS
- **IP Lookups**: Via Regional Internet Registries (RIRs)

```typescript
import { rdap, supportsRDAP } from 'recker/utils/rdap';

// Check TLD support
if (supportsRDAP('com')) {
  const result = await rdap(client, 'example.com');
  console.log(result.status, result.events);
}
```

[Learn more →](protocols/05-whois-rdap.md#rdap)

### GeoIP (Offline)
- **MaxMind GeoLite2**: Offline database lookups
- **IPv4/IPv6**: Full dual-stack support
- **Bogon detection**: Identifies private/reserved IPs
- **ASN info**: Autonomous System Number data

```typescript
// Via CLI
rek geoip 8.8.8.8
// Country: United States (US)
// City: Mountain View
// ASN: AS15169 (Google LLC)
```

[Learn more →](cli/06-protocols.md#geoip)

## 🛠️ Advanced Configuration

### Custom DNS
- **DNS Override**: Map hostnames to IPs
- **Custom servers**: Use Google DNS, Cloudflare DNS, etc.
- **Timeout control**: Configure DNS lookup timeout
- **IPv4/IPv6 preference**: Control IP version preference

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: { 'api.example.com': '1.2.3.4' },
    servers: ['8.8.8.8', '1.1.1.1'],
    timeout: 5000
  }
});
```

[Learn more →](protocols/04-dns.md)

### Proxy Support
- **HTTP/HTTPS/SOCKS**: Full proxy support
- **Authentication**: Username/password auth
- **Per-request**: Configure proxy per client or per request

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  proxy: {
    url: 'http://proxy.example.com:8080',
    auth: { username: 'user', password: 'pass' }
  }
});
```

[Learn more →](http/05-configuration.md)

## 🔄 Request Management

### Unified Concurrency Control
- **Global concurrency**: Limit total concurrent requests across all operations
- **Batch concurrency**: Per-batch concurrency limits for parallel batch execution
- **Rate limiting**: Control request start rate (requests per interval)
- **Connection pooling**: Auto-optimized TCP connection pooling
- **Multi-domain**: Separate connection pools per domain
- **HTTP/2 streams**: Auto-configured concurrent streams

```typescript
// Simple: Global concurrency limit
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: 20  // Max 20 concurrent requests
});

// Advanced: Global + rate limiting
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    max: 50,                    // Max 50 concurrent requests
    requestsPerInterval: 100,   // Start max 100 req/sec
    interval: 1000,
    agent: {
      connections: 'auto',      // Auto-optimized connections
      perDomainPooling: true    // Separate pools per domain
    }
  }
});

// Batch-only: No global limit, only per-batch
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    runner: { concurrency: 10 }  // Each batch limited to 10
  }
});

// Run multiple batches in parallel (30 total concurrent)
await Promise.all([
  client.batch(requests1, { concurrency: 10 }),
  client.batch(requests2, { concurrency: 10 }),
  client.batch(requests3, { concurrency: 10 })
]);
```

[Learn more →](http/08-concurrency.md)

### Batch Requests
- **Parallel execution**: Execute multiple requests concurrently
- **Per-batch concurrency**: Override concurrency per batch
- **Stats tracking**: Success/failure/duration stats
- **Error handling**: Individual error handling per request
- **Custom mapping**: Transform responses with mapResponse

```typescript
const { results, stats } = await client.batch([
  { path: '/users/1' },
  { path: '/users/2' },
  { path: '/users/3' }
], {
  concurrency: 5,
  mapResponse: (res) => res.json()
});

console.log(stats); // { total, successful, failed, duration }
```

[Learn more →](http/08-concurrency.md)

## 🔌 Plugins

### Retry
- **Automatic retries**: Configurable retry logic
- **Exponential backoff**: Smart delay between retries
- **Conditional**: Retry only on specific status codes
- **Timeout handling**: Separate retry logic for timeouts

```typescript
const result = await client.get('/flaky-endpoint', {
  retry: {
    attempts: 3,
    delay: 1000,
    statusCodes: [429, 500, 502, 503]
  }
});
```

[Learn more →](http/07-resilience.md)

### Cache
- **In-memory**: Fast memory-based cache
- **File-based**: Persistent file system cache
- **TTL control**: Time-to-live and stale-while-revalidate
- **Cache keys**: Smart cache key generation

```typescript
const client = createClient({
  cache: {
    driver: 'memory',
    ttl: 60000,  // 1 minute
    staleTtl: 300000  // 5 minutes stale
  }
});
```

[Learn more →](http/09-cache.md)

### Request Deduplication
- **Automatic dedup**: Prevent duplicate in-flight requests
- **Shared responses**: Multiple callers get same response
- **Cache integration**: Works with cache plugin

```typescript
const client = createClient({
  dedup: true
});

// Only one actual request, both get same response
const [user1, user2] = await Promise.all([
  client.get('/user/123'),
  client.get('/user/123')
]);
```

[Learn more →](http/10-plugins.md)

### Circuit Breaker
- **Failure detection**: Automatically detect failing endpoints
- **Open/Half-Open/Closed**: Standard circuit breaker states
- **Auto-recovery**: Automatic recovery attempts
- **Configurable thresholds**: Control when to trip

[Learn more →](http/07-resilience.md)

### Cookie Jar
- **Auto-persist cookies**: Automatic cookie handling
- **Per-domain**: Respects domain boundaries
- **Secure/HttpOnly**: Proper flag handling

[Learn more →](http/10-plugins.md)

### XSRF/CSRF Protection
- **Token extraction**: Auto-extract from cookies
- **Header injection**: Auto-inject in requests
- **Configurable**: Custom cookie/header names

```typescript
const client = createClient({
  xsrf: {
    cookieName: 'XSRF-TOKEN',
    headerName: 'X-XSRF-TOKEN'
  }
});
```

[Learn more →](http/10-plugins.md)

### Compression
- **Request compression**: gzip, br, deflate
- **Automatic**: Auto-compress based on content-type
- **Threshold**: Only compress above size threshold

[Learn more →](http/10-plugins.md)

## 📊 Observability

### Header Parsing
- **Cache detection**: Detect cache hits/misses
- **Cloud provider**: Identify hosting provider
- **Rate limit info**: Extract rate limit headers

```typescript
const response = await client.get('/data');

console.log(response.cache);      // { hit: true, provider: 'cloudflare' }
console.log(response.cloud);      // { provider: 'aws', region: 'us-east-1' }
console.log(response.rateLimit);  // { limit: 100, remaining: 95 }
```

[Learn more →](http/03-responses.md)

### Timing Metrics
- **DNS lookup**: DNS resolution time
- **TCP connect**: Connection establishment
- **TLS handshake**: TLS negotiation time
- **First byte**: Time to first byte
- **Total**: End-to-end request time

```typescript
const response = await client.get('/data');
console.log(response.timings);
// {
//   dns: 50,
//   connect: 100,
//   tls: 150,
//   firstByte: 200,
//   total: 500
// }
```

[Learn more →](http/12-observability.md)

### Connection Info
- **Protocol**: HTTP/1.1, h2, h3
- **TLS version**: TLS 1.2, 1.3
- **Cipher**: Cipher suite used
- **Certificate**: Certificate info
- **Reused**: Connection reuse detection

[Learn more →](http/12-observability.md)

## 📡 Streaming

### Server-Sent Events (SSE)
- **Async iterator**: Stream events with `for await`
- **Auto-parse**: Automatic event parsing
- **Reconnection**: Handle connection drops

```typescript
const response = await client.get('/events');

for await (const event of response.sse()) {
  console.log(event.data);
}
```

[Learn more →](ai/02-streaming.md)

### Download Progress
- **Progress tracking**: Track download progress
- **Speed calculation**: Bytes per second
- **ETA**: Estimated time remaining

```typescript
const response = await client.get('/large-file.zip');

for await (const progress of response.download()) {
  console.log(`${progress.percent}% - ${progress.rate} bytes/sec`);
}
```

[Learn more →](ai/02-streaming.md)

### Response Streaming
- **ReadableStream**: Web Streams API
- **Node.js Stream**: Convert to Node Readable
- **Pipe support**: Pipe to files, other requests

```typescript
import { createWriteStream } from 'fs';

const response = await client.get('/file.zip');
await response.pipe(createWriteStream('./file.zip'));
```

[Learn more →](ai/02-streaming.md)

## 🔍 Type Safety

### TypeScript Contract
- **Runtime validation**: Zod-based validation
- **Type inference**: Automatic type inference from schema
- **Error messages**: Clear validation errors

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.number(),
  name: z.string()
});

const user = await client
  .get('/user/123')
  .contract(UserSchema);
// user is typed as { id: number; name: string }
```

[Learn more →](http/04-validation.md)

## 🪝 Hooks & Middleware

### Hooks
- **beforeRequest**: Modify requests before sending
- **afterResponse**: Process responses
- **onError**: Handle errors globally

```typescript
client
  .beforeRequest((req) => req.withHeader('x-request-id', uuid()))
  .afterResponse((req, res) => console.log(`${res.status} ${req.url}`))
  .onError((error) => console.error(error));
```

[Learn more →](http/05-configuration.md)

### Middleware
- **Custom logic**: Implement complex request/response processing
- **Plugin system**: Create reusable plugins
- **Composable**: Stack multiple middlewares

[Learn more →](http/05-configuration.md)

## 🎯 Pagination

### Auto-pagination
- **Async iterator**: Stream all pages automatically
- **Custom extractors**: Support any pagination format
- **Configurable**: Page param, limit param, results path

```typescript
const users = client.paginate('/users', {
  limitParam: 'per_page',
  pageParam: 'page',
  hasMore: (data) => data.hasNext,
  getNextPage: (data) => data.nextPage
});

for await (const page of users) {
  console.log(page);
}
```

[Learn more →](examples/02-intermediate-pagination.ts)

## 📦 Bundle Size

- **Tree-shakeable**: Only bundle what you use
- **Minimal dependencies**: Lightweight and efficient
- **47.9 kB gzipped**: Tiny bundle size
- **Subpath exports**: Import only what you need

```typescript
// Import only what you need
import { retryPlugin } from 'recker/plugins/retry';
import { whois } from 'recker/utils/whois';
```

## 🎨 Developer Experience

- **IntelliSense**: Full autocomplete support
- **Type safety**: Catch errors at compile time
- **Fluent API**: Chainable, readable code
- **Great errors**: Clear, actionable error messages
- **Debug mode**: Built-in request/response logging

## 📚 Next Steps

- [Installation](getting-started/installation.md)
- [Quick Start](getting-started/quickstart.md)
- [API Reference](api/README.md)
- [Examples](examples.md)
