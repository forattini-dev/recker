# Browser Quickstart

Recker provides a browser-compatible build with ~70% of features. This guide covers getting started with Recker in browser environments.

> **Browser Support:** Chrome 90+, Firefox 90+, Safari 15+, Edge 90+

## Quick Summary

**What works in browser:**
- ✅ All HTTP methods (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- ✅ Streaming responses & SSE
- ✅ Native WebSocket
- ✅ 18 plugins (retry, rate-limit, circuit-breaker, graphql, auth, etc.)
- ✅ 15/16 auth methods (all except mTLS)
- ✅ Memory & IndexedDB cache
- ✅ All response types (JSON, text, blob, stream)

**What doesn't work in browser:**
- ❌ DNS/WHOIS (requires raw sockets)
- ❌ FTP/SFTP/Telnet (requires raw sockets)
- ❌ AI Layer (Node.js dependencies)
- ❌ HAR Recording (file system)
- ❌ mTLS Auth (client certificates)
- ❌ File/Redis Cache (server-side only)
- ❌ CLI (terminal)

## Installation

### npm/pnpm/yarn

```bash
pnpm add recker
# or
npm install recker
# or
yarn add recker
```

### CDN (UMD)

```html
<!-- Minified (recommended) -->
<script src="https://unpkg.com/recker/dist/browser/index.umd.min.js"></script>

<!-- Or from jsdelivr -->
<script src="https://cdn.jsdelivr.net/npm/recker/dist/browser/index.umd.min.js"></script>
```

### CDN (ESM)

```html
<script type="module">
  import { recker } from 'https://esm.sh/recker';

  const data = await recker.get('https://api.example.com/users').json();
  console.log(data);
</script>
```

## Basic Usage

### With Bundlers (Vite, Webpack, etc.)

```typescript
import { recker } from 'recker/browser';

// GET request
const users = await recker.get('https://api.example.com/users').json();

// POST request
const created = await recker.post('https://api.example.com/users', {
  json: { name: 'John', email: 'john@example.com' }
}).json();

// With options
const response = await recker.get('https://api.example.com/data', {
  headers: { 'Authorization': 'Bearer token123' },
  timeout: 5000
}).json();
```

### With CDN (UMD)

```html
<!DOCTYPE html>
<html>
<head>
  <title>Recker Browser Example</title>
</head>
<body>
  <script src="https://unpkg.com/recker/dist/browser/index.umd.min.js"></script>
  <script>
    // Global 'Recker' object available
    const { recker, get, post } = Recker;

    async function fetchData() {
      const users = await recker.get('https://jsonplaceholder.typicode.com/users').json();
      console.log(users);
    }

    fetchData();
  </script>
</body>
</html>
```

## Direct Functions

For quick one-off requests:

```typescript
import { get, post, put, patch, del } from 'recker/browser';

// Simple GET
const data = await get('https://api.example.com/data').json();

// POST with JSON
const result = await post('https://api.example.com/items', {
  json: { name: 'Item 1' }
}).json();
```

## Creating a Client

For configured instances:

```typescript
import { recker } from 'recker/browser';

const client = recker.client({
  baseUrl: 'https://api.example.com',
  headers: {
    'Authorization': 'Bearer your-token'
  },
  timeout: 10000
});

// All requests use the config
const users = await client.get('/users').json();
const user = await client.get('/users/1').json();
```

## WebSocket

Use native browser WebSocket:

```typescript
import { recker } from 'recker/browser';

const socket = recker.ws('wss://api.example.com/ws');

socket.onopen = () => {
  console.log('Connected');
  socket.send('Hello!');
};

socket.onmessage = (event) => {
  console.log('Received:', event.data);
};

socket.onclose = () => {
  console.log('Disconnected');
};
```

## SSE (Server-Sent Events)

```typescript
import { recker } from 'recker/browser';

const response = await recker.get('https://api.example.com/events');

for await (const event of response.sse()) {
  console.log('Event:', event.event);
  console.log('Data:', event.data);
}
```

## Using Plugins

All portable plugins work in the browser:

```typescript
import { recker, createClient, FetchTransport } from 'recker/browser';
import { retry } from 'recker/plugins/retry';
import { rateLimit } from 'recker/plugins/rate-limit';
import { circuitBreaker } from 'recker/plugins/circuit-breaker';

const client = recker.client({
  baseUrl: 'https://api.example.com'
});

// Add retry with exponential backoff
client.use(retry({
  maxAttempts: 3,
  backoff: 'exponential',
  delay: 1000
}));

// Add rate limiting
client.use(rateLimit({
  limit: 100,
  window: 60000
}));

// Add circuit breaker
client.use(circuitBreaker({
  threshold: 5,
  timeout: 30000
}));
```

## Authentication

15 auth methods are available in browser:

```typescript
import { createClient } from 'recker/browser';
import { bearerAuth, apiKeyAuth, oauth2 } from 'recker/plugins/auth';

const client = createClient({
  baseUrl: 'https://api.example.com'
});

// Bearer token
client.use(bearerAuth({ token: 'your-token' }));

// API Key
client.use(apiKeyAuth({
  key: 'your-api-key',
  name: 'X-API-Key',
  in: 'header'
}));

// OAuth2 with refresh
client.use(oauth2({
  accessToken: () => getStoredToken(),
  onTokenExpired: async () => {
    await refreshToken();
    return getNewToken();
  }
}));
```

## IndexedDB Cache

Persistent cache using IndexedDB:

```typescript
import { createClient, IndexedDBStorage } from 'recker/browser';
import { cache } from 'recker/plugins/cache';

// Create IndexedDB storage
const storage = new IndexedDBStorage({
  dbName: 'my-app-cache',
  maxEntries: 1000,
  ttl: 3600000 // 1 hour
});
await storage.init();

const client = createClient({
  baseUrl: 'https://api.example.com'
});

client.use(cache({ storage }));
```

## CORS Considerations

Browser requests are subject to CORS restrictions:

```typescript
// This may fail due to CORS if the server doesn't allow it
const data = await recker.get('https://external-api.com/data').json();
```

**Solutions:**

1. **Server-side CORS headers** - Configure the API to send proper CORS headers
2. **Proxy in development** - Use a dev proxy (Vite, webpack-dev-server)
3. **Serverless proxy** - Use a serverless function as a proxy in production

```typescript
// Include credentials (cookies) for same-origin or CORS-enabled APIs
const client = recker.client({
  baseUrl: 'https://api.example.com',
  credentials: 'include' // 'same-origin' | 'include' | 'omit'
});
```

## Bundle Size

| Format | Minified | Gzip |
|--------|----------|------|
| ESM | 734 KB | 227 KB |
| UMD | 734 KB | 227 KB |
| IIFE | 734 KB | 227 KB |

For smaller bundles, import only what you need (tree-shaking):

```typescript
// ❌ Large: imports everything
import { recker } from 'recker/browser';

// ✅ Small: imports only what's used
import { get, post } from 'recker/browser';
import { retry } from 'recker/plugins/retry';
```

## Detecting Browser Build

```typescript
import { recker } from 'recker/browser';

if (recker.isBrowser) {
  console.log('Running in browser');
  console.log('Unavailable features:', recker.unavailable);
  // ['whois', 'dns', 'ai', 'whoisClient', 'dnsClient', 'aiClient', ...]
}
```

## Next Steps

- [Browser vs Node Differences](./02-differences.md) - Complete feature comparison
