# Clients Overview

Recker provides three HTTP clients for different use cases, all with consistent APIs but different trade-offs.

## Comparison Table

| Feature | Standard Client | Mini Client | Browser Client |
|---------|-----------------|-------------|----------------|
| **Transport** | undici | undici (direct) | fetch |
| **Environment** | Node.js | Node.js | Browser |
| **HTTP Methods** | All (10) | All (10) | 8 shortcuts* |
| **Middleware/Plugins** | Yes | No | Yes |
| **Hooks (before/after)** | Yes | No | Yes |
| **Retry** | Yes | No | Yes |
| **Cache** | Yes | No | Yes (IndexedDB) |
| **Rate Limiting** | Yes | No | Yes |
| **Auth Plugins** | Yes | No | Yes (15/16) |
| **Timeout Handling** | Yes | Manual | Yes |
| **Chainable Response** | Yes | No | Yes |
| **JSON Auto-parse** | Yes | Yes | Yes |
| **HAR Recording** | Yes | No | Yes |
| **WebSocket** | Yes | No | Yes (native) |
| **SEO Analysis** | Yes | No | Yes |
| **AI Integration** | Yes | No | Yes |
| **Overhead** | ~86µs | ~2µs | ~50µs |

> *Browser shortcuts expose 8 methods. Full Client via `recker.client()` has all 10, but TRACE/CONNECT are blocked by fetch spec.

## HTTP Methods Support

| Method | Standard | Mini | Browser | Description |
|--------|:--------:|:----:|:-------:|-------------|
| `GET` | Yes | Yes | Yes | Retrieve data |
| `POST` | Yes | Yes | Yes | Create resource |
| `PUT` | Yes | Yes | Yes | Replace resource |
| `PATCH` | Yes | Yes | Yes | Partial update |
| `DELETE` | Yes | Yes | Yes | Remove resource |
| `HEAD` | Yes | Yes | Yes | Headers only |
| `OPTIONS` | Yes | Yes | Yes | CORS preflight |
| `TRACE` | Yes | Yes | Blocked* | Debug (XST risk) |
| `CONNECT` | Yes | Yes | Blocked* | Proxy tunnel |
| `PURGE` | Yes | Yes | Yes | CDN cache invalidation |

> *TRACE and CONNECT are forbidden by the [Fetch specification](https://fetch.spec.whatwg.org/#methods) for security reasons.

## When to Use Each Client

### Standard Client

Best for **production applications** that need reliability and features.

```typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: { maxAttempts: 3 },
  timeout: 10000
});

// Chainable API with auto-retry
const users = await client.get('/users').json();
```

**Use when:**
- Building production APIs
- Need retry, cache, or rate limiting
- Want middleware/hooks
- Complex auth (OAuth, AWS SigV4)
- Need observability (logging, timing)

### Mini Client

Best for **maximum performance** when you don't need features.

```typescript
import { createMiniClient } from 'recker/mini';

const client = createMiniClient({
  baseUrl: 'https://api.example.com'
});

// ~2% overhead vs raw undici
const users = await client.get('/users').then(r => r.json());
```

**Use when:**
- Processing millions of requests
- Writing CLI tools or scripts
- Internal services on fast networks
- Every microsecond matters
- You handle retry/auth externally

### Browser Client

Best for **browser applications** with the same API as Node.js.

```typescript
import { recker } from 'recker/browser';

// Simple requests via shortcuts
const users = await recker.get('/api/users').json();

// Full client with hooks and plugins
const client = recker.client({
  baseUrl: 'https://api.example.com',
  retry: { maxAttempts: 3 },
  plugins: [/* your plugins */]
});

// Hooks work exactly like Node.js
client.beforeRequest((req) => {
  return req.withHeader('X-Request-ID', crypto.randomUUID());
});

// Native WebSocket
const ws = recker.ws('wss://api.example.com/ws');
```

**Use when:**
- Building browser applications
- Want consistent API with Node.js
- Need hooks and plugins in browser
- Need HAR recording in browser
- Using AI features in browser

## Browser Client Features

The browser client has **full feature parity** with the Standard Client:

### Hooks

```typescript
import { recker } from 'recker/browser';

const client = recker.client({ baseUrl: 'https://api.example.com' });

// Before request hook
client.beforeRequest((req) => {
  console.log('Sending:', req.method, req.url);
  return req;
});

// After response hook
client.afterResponse((req, res) => {
  console.log('Received:', res.status);
  return res;
});

// Error hook
client.onError((error, req) => {
  console.error('Failed:', error.message);
  throw error;
});
```

### Plugins

```typescript
import { recker, retry, rateLimit, cache } from 'recker/browser';
import { IndexedDBStorage } from 'recker/browser';

const client = recker.client({
  baseUrl: 'https://api.example.com',
  plugins: [
    retry({ maxAttempts: 3 }),
    rateLimit({ limit: 100, window: 60000 }),
    cache({ storage: new IndexedDBStorage('my-cache'), ttl: 300000 })
  ]
});
```

### Cache Storage Options

```typescript
import { MemoryStorage, IndexedDBStorage, ServiceWorkerCache } from 'recker/browser';

// Memory (lost on page reload)
const memoryCache = new MemoryStorage();

// IndexedDB (persistent across sessions)
const idbCache = new IndexedDBStorage('my-app-cache');

// Service Worker Cache (modern, fast, persistent)
const swCache = new ServiceWorkerCache({ cacheName: 'api-cache-v1' });
```

## Performance Comparison

```
GET JSON Response (lower is better)
═══════════════════════════════════════════════════════
undici (raw)     ██████                              142µs
Mini Client      ██████                              146µs  (~2% overhead)
Browser Client   ██████████                          210µs  (fetch-based)
Standard Client  ████████████                        265µs  (full features)
axios            █████████████                       318µs
got              ████████████████                    395µs
```

## Quick Comparison

```typescript
// Standard Client - full features, chainable
import { createClient } from 'recker';
const client = createClient({ baseUrl: 'https://api.example.com' });
const data = await client.get('/users').json();

// Mini Client - raw speed, manual parsing
import { createMiniClient } from 'recker/mini';
const mini = createMiniClient({ baseUrl: 'https://api.example.com' });
const data = await mini.get('/users').then(r => r.json());

// Browser Client - same API, uses fetch
import { recker } from 'recker/browser';
const data = await recker.get('https://api.example.com/users').json();

// Browser Client with full features
const client = recker.client({
  baseUrl: 'https://api.example.com',
  retry: { maxAttempts: 3 }
});
```

## Feature Matrix

| Need | Recommendation |
|------|----------------|
| Production API client | Standard |
| Maximum throughput | Mini |
| Browser application | Browser |
| Retry on failure | Standard or Browser |
| Cache responses | Standard or Browser |
| Complex auth flows | Standard or Browser |
| CDN cache purge | All three |
| WebSocket in browser | Browser (native) |
| One-off scripts | Mini |
| Isomorphic code | Standard + Browser |

---

# Node.js vs Browser Differences

## Summary

| Aspect | Node.js | Browser |
|--------|---------|---------|
| **Features** | 100% | ~90% |
| **Bundle Size** | N/A | 800KB minified |
| **Transport** | Undici (high-performance) | Fetch API |
| **Crypto** | Node.js crypto (sync) | SubtleCrypto (async) |
| **Cache** | Memory, File, Redis | Memory, IndexedDB, ServiceWorker |
| **Protocols** | HTTP, WS, FTP, SFTP, DNS, WHOIS | HTTP, WS only |
| **AI** | Full | Full |
| **Presets** | 38 APIs | 38 APIs |
| **Hooks** | Full | Full |
| **Plugins** | All | Most (18 portable) |

## Complete Feature Matrix

### HTTP & Core

| Feature | Node.js | Browser | Notes |
|---------|:-------:|:-------:|-------|
| GET, POST, PUT, PATCH, DELETE | Yes | Yes | Full support |
| HEAD, OPTIONS, PURGE | Yes | Yes | Full support |
| TRACE, CONNECT | Yes | **Blocked** | Fetch spec restriction |
| Hooks (before/after) | Yes | Yes | Full support |
| Plugins | Yes | Yes | 18 portable plugins |
| Request timeout | Yes | Yes | AbortController |
| Streaming response | Yes | Yes | ReadableStream |
| Upload progress | Yes | Limited | Limited in browser |
| Download progress | Yes | Yes | Via ReadableStream |

### Plugins

| Plugin | Node.js | Browser | Notes |
|--------|:-------:|:-------:|-------|
| retry | Yes | Yes | Exponential backoff, jitter |
| rate-limit | Yes | Yes | Token bucket algorithm |
| circuit-breaker | Yes | Yes | Fail-fast pattern |
| dedup | Yes | Yes | Request deduplication |
| cache | Yes | Yes | IndexedDB/ServiceWorker in browser |
| logger | Yes | Yes | Uses console in browser |
| graphql | Yes | Yes | Full support |
| soap | Yes | Yes | SOAP 1.1/1.2 |
| jsonrpc | Yes | Yes | JSON-RPC 2.0 |
| odata | Yes | Yes | OData v4 |
| har-recorder | Yes | Yes | Blob + download in browser |

### Authentication

| Auth Method | Node.js | Browser | Notes |
|-------------|:-------:|:-------:|-------|
| Basic | Yes | Yes | Base64 encoding |
| Bearer | Yes | Yes | Token header |
| API Key | Yes | Yes | Header or query |
| Digest | Yes | Yes | Uses SubtleCrypto |
| OAuth2 | Yes | Yes | Token refresh support |
| AWS SigV4 | Yes | Yes | Uses SubtleCrypto |
| mTLS | Yes | **No** | Requires client certificates |

### Cache Storage

| Storage | Node.js | Browser | Notes |
|---------|:-------:|:-------:|-------|
| Memory | Yes | Yes | In-memory, lost on reload |
| IndexedDB | No | Yes | Persistent, browser-only |
| ServiceWorker | No | Yes | Modern, fast, persistent |
| File | Yes | No | Requires file system |
| Redis | Yes | No | Requires Redis server |

### Protocols

| Protocol | Node.js | Browser | Notes |
|----------|:-------:|:-------:|-------|
| HTTP/1.1, HTTP/2, HTTP/3 | Yes | Yes | Browser auto-negotiates |
| WebSocket | Yes | Yes | Native browser WebSocket |
| SSE | Yes | Yes | Full parsing support |
| DNS | Yes | **No** | Requires dns module |
| WHOIS | Yes | **No** | Requires raw sockets |
| FTP/SFTP | Yes | **No** | Requires raw sockets |

## Why Features Are Missing in Browser

### Raw Socket Access
Browsers don't provide raw TCP/UDP socket access for security reasons:
- **DNS**: Uses Node.js `dns` module
- **WHOIS**: Requires TCP port 43
- **FTP/SFTP**: Requires FTP protocol

### HTTP Methods
Browsers block certain HTTP methods per [Fetch specification](https://fetch.spec.whatwg.org/#methods):
- **TRACE**: Blocked to prevent XST (Cross-Site Tracing) attacks
- **CONNECT**: Blocked to prevent HTTP tunneling/proxying

### Client Certificates (mTLS)
Browsers don't expose APIs for programmatic client certificates

## Transport Differences

### Node.js: UndiciTransport (Default)

```typescript
import { createClient, UndiciTransport } from 'recker';

const client = createClient({
  transport: new UndiciTransport({
    connections: 100,
    pipelining: 10,
    keepAliveTimeout: 30000
  })
});
```

### Browser: FetchTransport (Default)

```typescript
import { recker } from 'recker/browser';

const client = recker.client({
  // FetchTransport is automatic
  // Same hooks and plugins as Node.js!
});
```

## Migration Guide: Node.js → Browser

### 1. Change Import Path

```typescript
// Node.js
import { createClient } from 'recker';

// Browser
import { recker } from 'recker/browser';
const client = recker.client({ /* same options */ });
```

### 2. Replace File Cache with IndexedDB

```typescript
// Node.js
import { FileStorage } from 'recker';
const storage = new FileStorage('./cache');

// Browser
import { IndexedDBStorage } from 'recker/browser';
const storage = new IndexedDBStorage('cache');
```

### 3. Hooks and Plugins Work the Same

```typescript
// This code works in BOTH Node.js and Browser!
client.beforeRequest((req) => {
  return req.withHeader('X-Custom', 'value');
});

client.use(retry({ maxAttempts: 3 }));
```

## Next Steps

- [Mini Client](/mini/01-overview.md) - Zero-overhead client details
- [Browser Client](/browser/01-quickstart.md) - Browser-specific guide
- [Standard Client](/http/02-fundamentals.md) - Full-featured client
