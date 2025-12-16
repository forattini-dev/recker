# Clients Overview

Recker provides three HTTP clients for different use cases, all with consistent APIs but different trade-offs.

## Comparison Table

| Feature | Standard Client | Mini Client | Browser Client |
|---------|-----------------|-------------|----------------|
| **Transport** | undici | undici (direct) | fetch |
| **Environment** | Node.js | Node.js | Browser |
| **HTTP Methods** | All (9) | All (10+) | 7 (browser limits) |
| **Middleware/Plugins** | Yes | No | No |
| **Hooks (before/after)** | Yes | No | No |
| **Retry** | Yes | No | No |
| **Cache** | Yes | No | No |
| **Rate Limiting** | Yes | No | No |
| **Auth Plugins** | Yes | No | No |
| **Timeout Handling** | Yes | Manual | Yes |
| **Chainable Response** | Yes | No | Yes |
| **JSON Auto-parse** | Yes | Yes | Yes |
| **HAR Recording** | Yes | No | Yes |
| **WebSocket** | Yes | No | Yes (native) |
| **SEO Analysis** | Yes | No | Yes |
| **AI Integration** | Yes | No | Yes |
| **Overhead** | ~86µs | ~2µs | ~50µs |

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
| `TRACE` | Yes | Yes | **No** | Blocked by browsers (XST security) |
| `CONNECT` | Yes | Yes | **No** | Blocked by browsers (tunneling) |
| `PURGE` | No | Yes | **No** | CDN-specific, browsers reject |
| Custom | via `request()` | via `request()` | via `fetch()` | Any method* |

> **Note:** Browsers block TRACE (Cross-Site Tracing attacks), CONNECT (HTTP tunneling), and may reject non-standard methods like PURGE.

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

// Same API as Node.js, uses fetch internally
const users = await recker.get('/api/users').json();

// Native WebSocket
const ws = recker.ws('wss://api.example.com/ws');
```

**Use when:**
- Building browser applications
- Want consistent API with Node.js
- Need HAR recording in browser
- Using AI features in browser

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
```

## Feature Matrix

| Need | Recommendation |
|------|----------------|
| Production API client | Standard |
| Maximum throughput | Mini |
| Browser application | Browser |
| Retry on failure | Standard |
| Cache responses | Standard |
| Complex auth flows | Standard |
| CDN cache purge | Mini (has PURGE) |
| WebSocket in browser | Browser (native) |
| One-off scripts | Mini |
| Isomorphic code | Standard + Browser |

---

# Node.js vs Browser Differences

## Summary

| Aspect | Node.js | Browser |
|--------|---------|---------|
| **Features** | 100% | ~85% |
| **Bundle Size** | N/A | 800KB minified |
| **Transport** | Undici (high-performance) | Fetch API |
| **Crypto** | Node.js crypto (sync) | SubtleCrypto (async) |
| **Cache** | Memory, File, Redis | Memory, IndexedDB, Service Worker |
| **Protocols** | HTTP, WS, FTP, SFTP, DNS, WHOIS | HTTP, WS only |
| **AI** | Full | Full |
| **Presets** | 38 APIs | 38 APIs |

## Complete Feature Matrix

### HTTP & Core

| Feature | Node.js | Browser | Notes |
|---------|:-------:|:-------:|-------|
| GET, POST, PUT, PATCH, DELETE | Yes | Yes | Full support |
| HEAD, OPTIONS | Yes | Yes | Full support |
| TRACE, CONNECT | Yes | **No** | Blocked by browsers |
| Request timeout | Yes | Yes | AbortController |
| Streaming response | Yes | Yes | ReadableStream |
| Upload progress | Yes | Limited | Limited in browser |
| Download progress | Yes | Yes | Via ReadableStream |
| Response types (JSON, text, blob) | Yes | Yes | Full support |
| Custom headers | Yes | Yes | Full support |
| Query parameters | Yes | Yes | Full support |
| Request body (JSON, form, raw) | Yes | Yes | Full support |

### Plugins (Resilience)

| Plugin | Node.js | Browser | Notes |
|--------|:-------:|:-------:|-------|
| retry | Yes | Yes | Exponential backoff, jitter |
| rate-limit | Yes | Yes | Token bucket algorithm |
| circuit-breaker | Yes | Yes | Fail-fast pattern |
| dedup | Yes | Yes | Request deduplication |
| timeout | Yes | Yes | Per-phase or total |

### Plugins (Protocols)

| Plugin | Node.js | Browser | Notes |
|--------|:-------:|:-------:|-------|
| graphql | Yes | Yes | Queries, mutations, subscriptions |
| soap | Yes | Yes | SOAP 1.1/1.2 |
| xml | Yes | Yes | XML parsing/building |
| jsonrpc | Yes | Yes | JSON-RPC 2.0 |
| odata | Yes | Yes | OData v4 |
| grpc-web | Yes | Yes | gRPC-Web protocol |

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
| File | Yes | No | Requires file system |
| Redis | Yes | No | Requires Redis server |

### Protocols

| Protocol | Node.js | Browser | Notes |
|----------|:-------:|:-------:|-------|
| HTTP/1.1 | Yes | Yes | Full support |
| HTTP/2 | Yes | Yes | Browser auto-negotiates |
| HTTP/3 | Yes | Yes | Browser auto-negotiates |
| WebSocket | Yes | Yes | Native browser WebSocket |
| SSE | Yes | Yes | Full parsing support |
| DNS | Yes | **No** | Requires dns module |
| WHOIS | Yes | **No** | Requires raw sockets |
| FTP | Yes | **No** | Requires raw sockets |
| SFTP | Yes | **No** | Requires SSH |
| Telnet | Yes | **No** | Requires raw sockets |

### Other Features

| Feature | Node.js | Browser | Notes |
|---------|:-------:|:-------:|-------|
| AI Layer | Yes | Yes | Full support via Fetch |
| 38 API Presets | Yes | Yes | All presets available |
| CLI (`rek`) | Yes | No | Terminal-only |
| MCP Server | Yes | No | Node.js process |
| GeoIP | Yes | No | MaxMind database |
| Proxy rotation | Yes | No | Network access |
| Service Worker Cache | No | Yes | Persistent cache via Cache API |
| Network Simulation | Yes | Yes | Simulate latency/offline |

## Why Features Are Missing in Browser

### Raw Socket Access
Browsers don't provide raw TCP/UDP socket access for security reasons:
- **DNS**: Uses Node.js `dns` module
- **WHOIS**: Requires TCP port 43
- **FTP/SFTP**: Requires FTP protocol
- **Telnet**: Requires raw TCP

### HTTP Methods
Browsers block certain HTTP methods for security:
- **TRACE**: Blocked to prevent XST (Cross-Site Tracing) attacks
- **CONNECT**: Blocked to prevent HTTP tunneling/proxying

### File System Access
Browsers have limited file system access:
- **HAR Recording**: Works! Uses Blob + download for export
- **File Cache**: Use IndexedDB or Service Worker Cache instead
- **GeoIP**: Needs to read MaxMind database files (Node.js only)

### Client Certificates (mTLS)
Browsers don't expose APIs for programmatic client certificates

## Transport Differences

### Node.js: UndiciTransport (Default)

```typescript
import { createClient, UndiciTransport } from 'recker';

const client = createClient({
  transport: new UndiciTransport({
    connections: 100,      // Connection pool size
    pipelining: 10,        // HTTP pipelining
    keepAliveTimeout: 30000
  })
});
```

**Benefits:**
- HTTP/2 multiplexing
- Connection pooling
- Request pipelining
- Low-level timing hooks

### Browser: FetchTransport (Default)

```typescript
import { createClient, FetchTransport } from 'recker/browser';

const client = createClient({
  transport: new FetchTransport({
    credentials: 'include',  // Cookie handling
    cache: 'no-store',       // Cache control
    keepalive: true          // Keep connections alive
  })
});
```

**Benefits:**
- Native browser integration
- Automatic HTTP/2 and HTTP/3
- Built-in CORS handling
- Service Worker compatible
- Streaming support (SSE, chunked responses)

## Migration Guide: Node.js → Browser

### 1. Change Import Path

```typescript
// Node.js
import { recker, createClient } from 'recker';

// Browser
import { recker, createClient } from 'recker/browser';
```

### 2. Replace File Cache with IndexedDB

```typescript
// Node.js
import { FileStorage } from 'recker';
const storage = new FileStorage('./cache');

// Browser
import { IndexedDBStorage } from 'recker/browser';
const storage = new IndexedDBStorage({ dbName: 'cache' });
await storage.init();
```

### 3. Handle Missing Features

```typescript
// Check before using
if (!recker.unavailable.includes('dns')) {
  await recker.dns('example.com');
}
```

### 4. Consider CORS

```typescript
// May need proxy for cross-origin requests
const client = recker.client({
  baseUrl: '/api',  // Use relative path for same-origin
});
```

## Next Steps

- [Mini Client](/mini/01-overview.md) - Zero-overhead client details
- [Browser Client](/browser/01-quickstart.md) - Browser-specific guide
- [Standard Client](/http/02-fundamentals.md) - Full-featured client
