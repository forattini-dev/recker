# Browser vs Node.js Differences

This document provides a complete comparison between the browser and Node.js builds of Recker.

## Summary

| Aspect | Node.js | Browser |
|--------|---------|---------|
| **Features** | 100% | ~80% |
| **Bundle Size** | N/A | 800KB minified |
| **Transport** | Undici (high-performance) | Fetch API |
| **Crypto** | Node.js crypto (sync) | SubtleCrypto (async) |
| **Cache** | Memory, File, Redis | Memory, IndexedDB, Service Worker |
| **Protocols** | HTTP, WS, FTP, SFTP, DNS, WHOIS | HTTP, WS only |
| **AI** | ✅ Full | ✅ Full |
| **Presets** | ✅ 38 APIs | ❌ Node-only |

## Complete Feature Matrix

### HTTP & Core

| Feature | Node.js | Browser | Notes |
|---------|:-------:|:-------:|-------|
| GET, POST, PUT, PATCH, DELETE | ✅ | ✅ | Full support |
| HEAD, OPTIONS | ✅ | ✅ | Full support |
| Request timeout | ✅ | ✅ | AbortController |
| Streaming response | ✅ | ✅ | ReadableStream |
| Upload progress | ✅ | ⚠️ | Limited in browser |
| Download progress | ✅ | ✅ | Via ReadableStream |
| Response types (JSON, text, blob) | ✅ | ✅ | Full support |
| Custom headers | ✅ | ✅ | Full support |
| Query parameters | ✅ | ✅ | Full support |
| Request body (JSON, form, raw) | ✅ | ✅ | Full support |

### Plugins (Resilience)

| Plugin | Node.js | Browser | Notes |
|--------|:-------:|:-------:|-------|
| retry | ✅ | ✅ | Exponential backoff, jitter |
| rate-limit | ✅ | ✅ | Token bucket algorithm |
| circuit-breaker | ✅ | ✅ | Fail-fast pattern |
| dedup | ✅ | ✅ | Request deduplication |
| timeout | ✅ | ✅ | Per-phase or total |

### Plugins (Protocols)

| Plugin | Node.js | Browser | Notes |
|--------|:-------:|:-------:|-------|
| graphql | ✅ | ✅ | Queries, mutations, subscriptions |
| soap | ✅ | ✅ | SOAP 1.1/1.2 |
| xml | ✅ | ✅ | XML parsing/building |
| jsonrpc | ✅ | ✅ | JSON-RPC 2.0 |
| odata | ✅ | ✅ | OData v4 |
| grpc-web | ✅ | ✅ | gRPC-Web protocol |

### Plugins (Security)

| Plugin | Node.js | Browser | Notes |
|--------|:-------:|:-------:|-------|
| cookie-jar | ✅ | ✅ | Memory-based |
| xsrf | ✅ | ✅ | CSRF protection |

### Plugins (Observability)

| Plugin | Node.js | Browser | Notes |
|--------|:-------:|:-------:|-------|
| logger | ✅ | ✅ | Uses console.log in browser |
| server-timing | ✅ | ✅ | Header parsing |
| har-recorder | ✅ | ✅ | Browser uses Blob + download |
| har-player | ✅ | ⚠️ | Browser needs manual HAR import |

### Plugins (Performance)

| Plugin | Node.js | Browser | Notes |
|--------|:-------:|:-------:|-------|
| compression | ✅ | ⚠️ | Requires plugin; uses CompressionStream (gzip/deflate only) |
| http2-push | ✅ | ⚠️ | Browser handles automatically |
| http3 | ✅ | ⚠️ | Browser handles automatically |

### Authentication

Auth helpers are Node-only. In browser builds, set headers directly (or use your auth library):

```typescript
import { createClient } from 'recker/browser';

const client = createClient({ baseUrl: 'https://api.example.com' });
const response = await client.get('/users', {
  headers: { Authorization: 'Bearer your-token' }
});
```

### Cache Storage

| Storage | Node.js | Browser | Notes |
|---------|:-------:|:-------:|-------|
| Memory | ✅ | ✅ | In-memory, lost on reload |
| IndexedDB | ❌ | ✅ | Persistent, browser-only |
| File | ✅ | ❌ | Requires file system |
| Redis | ✅ | ❌ | Requires Redis server |

### Protocols

| Protocol | Node.js | Browser | Notes |
|----------|:-------:|:-------:|-------|
| HTTP/1.1 | ✅ | ✅ | Full support |
| HTTP/2 | ✅ | ✅ | Browser auto-negotiates |
| HTTP/3 | ✅ | ✅ | Browser auto-negotiates |
| WebSocket | ✅ | ✅ | Native browser WebSocket |
| SSE | ✅ | ✅ | Full parsing support |
| DNS | ✅ | ❌ | Requires dns module |
| WHOIS | ✅ | ❌ | Requires raw sockets |
| FTP | ✅ | ❌ | Requires raw sockets |
| SFTP | ✅ | ❌ | Requires SSH |
| Telnet | ✅ | ❌ | Requires raw sockets |

### Other Features

| Feature | Node.js | Browser | Notes |
|---------|:-------:|:-------:|-------|
| AI Layer | ✅ | ✅ | Full support via Fetch |
| 38 API Presets | ✅ | ❌ | Node-only |
| CLI (`rek`) | ✅ | ❌ | Terminal-only |
| MCP Server | ✅ | ❌ | Node.js process |
| GeoIP | ✅ | ❌ | MaxMind database |
| Proxy rotation | ✅ | ❌ | Network access |
| Interface rotation | ✅ | ❌ | Network access |
| Service Worker Cache | ❌ | ✅ | Persistent cache via Cache API |
| Network Simulation | ✅ | ✅ | Simulate latency/offline |

## Why Features Are Missing

### Raw Socket Access
Browsers don't provide raw TCP/UDP socket access for security reasons. This affects:
- **DNS**: Uses Node.js `dns` module
- **WHOIS**: Requires TCP port 43
- **FTP/SFTP**: Requires FTP protocol
- **Telnet**: Requires raw TCP

### File System Access
Browsers have limited file system access:
- **HAR Recording**: ✅ Works! Uses Blob + download for export
- **File Cache**: Use IndexedDB or Service Worker Cache instead
- **GeoIP**: Needs to read MaxMind database files (Node.js only)

### Client Certificates (mTLS)
Browsers don't expose APIs for programmatic client certificates:
- **mTLS**: Certificate must be installed in browser

### Node.js Dependencies
Some features depend on Node.js-specific modules:
- **AI Layer**: ✅ Available in browser via Fetch transport
- **CLI**: Uses terminal APIs (Node.js only)

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

### Browser: WorkerTransport (Background)

```typescript
import { createClient, WorkerTransport } from 'recker/browser';

// Requests run in Web Worker pool (non-blocking)
const client = createClient({
  transport: new WorkerTransport({
    poolSize: 4  // Number of workers (default: CPU cores)
  })
});

// Check support before using
if (WorkerTransport.isSupported()) {
  const workerClient = createClient({ transport: new WorkerTransport() });
}
```

**Benefits:**
- Non-blocking: Requests don't block main UI thread
- Better UX: Smooth scrolling during large downloads
- Parallelism: True multi-threaded HTTP requests

**Limitations:**
- No streaming: Response body fully buffered
- No SSE: Use FetchTransport for Server-Sent Events
- No progress: Download progress not available

## Crypto Differences

### Node.js (Synchronous)

```typescript
import { createHash, createHmac, randomBytes } from 'crypto';

// All sync operations
const hash = createHash('sha256').update('data').digest('hex');
const hmac = createHmac('sha256', 'key').update('data').digest('hex');
const random = randomBytes(16);
```

### Browser (Asynchronous)

```typescript
import { BrowserCrypto } from 'recker/browser';

const crypto = new BrowserCrypto();

// All async operations
const hash = await crypto.hash('SHA-256', 'data');
const hmac = await crypto.hmac('SHA-256', 'key', 'data');
const random = crypto.randomBytes(16); // This one is sync
```

> **Important:** Browser crypto uses SubtleCrypto which is Promise-based. Use it directly or via your auth library.

## Cache Differences

### Node.js Options

```typescript
import { createClient, MemoryStorage, FileStorage, RedisStorage } from 'recker';
import { cachePlugin } from 'recker/plugins';

// Memory (default)
client.use(cachePlugin({ storage: new MemoryStorage() }));

// File (persistent)
client.use(cachePlugin({ storage: new FileStorage('./cache') }));

// Redis (distributed)
client.use(cachePlugin({ storage: new RedisStorage('redis://localhost') }));
```

### Browser Options

```typescript
import { createClient, IndexedDBStorage, ServiceWorkerCache } from 'recker/browser';
import { cachePlugin } from 'recker/plugins';

// Memory (lost on page reload)
client.use(cachePlugin());

// IndexedDB (persistent across sessions)
const idbStorage = new IndexedDBStorage('my-cache');
client.use(cachePlugin({ storage: idbStorage }));

// Service Worker Cache (modern, persistent, fast)
// Best for production - uses browser's Cache API
const swCache = new ServiceWorkerCache({ cacheName: 'my-app-v1' });
client.use(cachePlugin({ storage: swCache }));

// Check if Service Worker Cache is supported
if (ServiceWorkerCache.isSupported()) {
  client.use(cachePlugin({ storage: new ServiceWorkerCache() }));
}
```

### Service Worker Cache Features

```typescript
import { ServiceWorkerCache } from 'recker/browser';

const swCache = new ServiceWorkerCache({ cacheName: 'api-cache' });

// Manual cache operations
const keys = await swCache.keys();     // List all cached keys
const size = await swCache.size();     // Get cache size
await swCache.prune();                 // Remove expired entries
await swCache.clear();                 // Clear entire cache
```

## Checking Availability at Runtime

```typescript
import { recker } from 'recker/browser';

// Check if running in browser
if (recker.isBrowser) {
  console.log('Browser build detected');
}

// List unavailable features
console.log('Unavailable:', recker.unavailable);
// ['whois', 'whoisAvailable', 'dns', 'dnsSecurity', 'dnsClient', 'whoisClient']
// Note: AI is available in browser; presets are Node-only.

// Feature detection
function hasFeature(feature: string): boolean {
  return !recker.unavailable.includes(feature);
}

if (hasFeature('dns')) {
  // This won't run in browser
  const records = await recker.dns('example.com');
}
```

## Migration Guide: Node.js → Browser

If you're porting Node.js code to browser:

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

// Or use try-catch
try {
  await recker.dns('example.com');
} catch (e) {
  console.log('DNS not available in browser');
}
```

### 4. Consider CORS

```typescript
// May need proxy for cross-origin requests
const client = recker.client({
  baseUrl: '/api',  // Use relative path for same-origin
  // Or configure CORS on server
});
```
