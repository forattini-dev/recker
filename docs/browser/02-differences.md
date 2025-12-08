# Browser vs Node.js Differences

This document provides a complete comparison between the browser and Node.js builds of Recker.

## Summary

| Aspect | Node.js | Browser |
|--------|---------|---------|
| **Features** | 100% | ~70% |
| **Transport** | Undici (high-performance) | Fetch API |
| **Crypto** | Node.js crypto (sync) | SubtleCrypto (async) |
| **Cache** | Memory, File, Redis | Memory, IndexedDB |
| **Protocols** | HTTP, WS, FTP, SFTP, DNS, WHOIS | HTTP, WS only |

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
| har-recorder | ✅ | ❌ | Requires file I/O |
| har-player | ✅ | ❌ | Requires file I/O |

### Plugins (Performance)

| Plugin | Node.js | Browser | Notes |
|--------|:-------:|:-------:|-------|
| compression | ✅ | ⚠️ | Browser handles automatically |
| http2-push | ✅ | ⚠️ | Browser handles automatically |
| http3 | ✅ | ⚠️ | Browser handles automatically |

### Authentication (15/16 available)

| Auth Method | Node.js | Browser | Notes |
|-------------|:-------:|:-------:|-------|
| Basic | ✅ | ✅ | Base64 encoding |
| Bearer | ✅ | ✅ | Token header |
| API Key | ✅ | ✅ | Header or query |
| Digest | ✅ | ✅ | Uses SubtleCrypto |
| OAuth2 | ✅ | ✅ | Token refresh support |
| AWS SigV4 | ✅ | ✅ | Uses SubtleCrypto |
| OIDC | ✅ | ✅ | OpenID Connect |
| Auth0 | ✅ | ✅ | Auth0 integration |
| Okta | ✅ | ✅ | Okta integration |
| Azure AD | ✅ | ✅ | Microsoft identity |
| Cognito | ✅ | ✅ | AWS Cognito |
| Firebase | ✅ | ✅ | Firebase Auth |
| Google Service Account | ✅ | ✅ | JWT signing |
| GitHub App | ✅ | ✅ | GitHub App auth |
| mTLS | ✅ | ❌ | **Requires client certificates** |

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
| AI Layer | ✅ | ❌ | Node.js dependencies |
| 38 API Presets | ✅ | ❌ | Some require AI layer |
| CLI (`rek`) | ✅ | ❌ | Terminal-only |
| MCP Server | ✅ | ❌ | Node.js process |
| GeoIP | ✅ | ❌ | MaxMind database |
| Proxy rotation | ✅ | ❌ | Network access |
| Interface rotation | ✅ | ❌ | Network access |

## Why Features Are Missing

### Raw Socket Access
Browsers don't provide raw TCP/UDP socket access for security reasons. This affects:
- **DNS**: Uses Node.js `dns` module
- **WHOIS**: Requires TCP port 43
- **FTP/SFTP**: Requires FTP protocol
- **Telnet**: Requires raw TCP

### File System Access
Browsers have limited file system access:
- **HAR Recording**: Needs to write files
- **File Cache**: Needs persistent storage (use IndexedDB instead)
- **GeoIP**: Needs to read MaxMind database files

### Client Certificates (mTLS)
Browsers don't expose APIs for programmatic client certificates:
- **mTLS**: Certificate must be installed in browser

### Node.js Dependencies
Some features depend on Node.js-specific modules:
- **AI Layer**: Some providers use Node.js streams
- **CLI**: Uses terminal APIs

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

### Browser: FetchTransport

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

> **Important:** Browser crypto uses SubtleCrypto which is Promise-based. Auth plugins that use crypto (Digest, AWS SigV4) handle this automatically.

## Cache Differences

### Node.js Options

```typescript
import { createClient, MemoryStorage, FileStorage, RedisStorage } from 'recker';
import { cache } from 'recker/plugins';

// Memory (default)
client.use(cache({ storage: new MemoryStorage() }));

// File (persistent)
client.use(cache({ storage: new FileStorage('./cache') }));

// Redis (distributed)
client.use(cache({ storage: new RedisStorage('redis://localhost') }));
```

### Browser Options

```typescript
import { createClient, MemoryStorage, IndexedDBStorage } from 'recker/browser';
import { cache } from 'recker/plugins';

// Memory (lost on page reload)
client.use(cache({ storage: new MemoryStorage() }));

// IndexedDB (persistent across sessions)
const storage = new IndexedDBStorage({
  dbName: 'my-cache',
  maxEntries: 1000,
  ttl: 3600000 // 1 hour
});
await storage.init();
client.use(cache({ storage }));
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
// ['whois', 'whoisAvailable', 'dns', 'dnsSecurity', 'dnsClient', 'whoisClient', 'ai', 'aiClient']

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
