# Browser Quickstart

Recker provides a browser-compatible build with ~70% of features. This guide covers getting started with Recker in browser environments.

> **Browser Support:** Chrome 90+, Firefox 90+, Safari 15+, Edge 90+

## Quick Summary

**What works in browser:**
- ✅ All HTTP methods (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS)
- ✅ Streaming responses & SSE
- ✅ Native WebSocket
- ✅ Portable plugins (retry, rate-limit, circuit-breaker, graphql, etc.)
- ✅ Manual auth via headers (Basic/Bearer/API key)
- ✅ Memory & IndexedDB cache
- ✅ All response types (JSON, text, blob, stream)
- ✅ **AI Chat** (OpenAI, Anthropic, etc.)
- ✅ **SEO Analysis** (Page grading)
- ✅ **HAR Recording** (Network debug)
- ✅ **Network Simulation** (Latency/Throttling)

**What doesn't work in browser:**
- ❌ DNS/WHOIS (requires raw sockets)
- ❌ FTP/SFTP/Telnet (requires raw sockets)
- ❌ mTLS Auth (client certificates)
- ❌ File/Redis Cache (server-side only)
- ❌ Auth plugins (OAuth2, SigV4, etc.)
- ❌ Presets (GitHub, Stripe, etc.)
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

### Slim Bundle (~480 KB)

**Recommended for most projects.** Use when you only need HTTP requests and core plugins:

```html
<!-- Slim UMD -->
<script src="https://unpkg.com/recker/dist/browser/index.slim.umd.min.js"></script>

<!-- Slim ESM -->
<script type="module">
  import { recker } from 'https://unpkg.com/recker/dist/browser/index.slim.min.js';
  const data = await recker.get('https://api.example.com/users').json();
  console.log(data);
</script>
```

```typescript
// With bundlers (Vite, Webpack, etc.)
import { recker } from 'recker/browser-slim';
```

> **Slim excludes:** AI providers, SEO analysis, web scraping.
> **Note:** Presets and auth helpers are Node-only (not in any browser build).
> See [Bundle Sizes](#bundle-sizes) for the full comparison.

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

## AI Chat (Client-Side)

Use LLMs directly from the browser (requires API Key):

```typescript
import { recker } from 'recker/browser';

// Configure AI client
const ai = recker.ai({
  defaultProvider: 'openai',
  providers: {
    openai: { apiKey: 'sk-...' } // User provides key
  }
});

// Stream response
const stream = await ai.stream({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello browser!' }]
});

for await (const chunk of stream) {
  if (chunk.type === 'text') console.log(chunk.content);
}
```

## SEO Analysis

Analyze HTML content for SEO best practices:

```typescript
import { recker } from 'recker/browser';

const html = document.documentElement.outerHTML;
const report = await recker.seo(html, { baseUrl: window.location.href });

console.log(`Grade: ${report.grade} (${report.score}/100)`);
console.log('Issues:', report.checks.filter(c => c.status === 'fail'));
```

## Network Debugging

### HAR Recorder

Record network activity and download as `.har` file (compatible with Chrome DevTools):

```typescript
import { recker } from 'recker/browser';

// Start recording
recker.har.start();

await recker.get('https://api.example.com/users');
await recker.get('https://api.example.com/posts');

// Stop and download
recker.har.stop();
recker.har.download('my-session.har');
```

### Network Simulation

Simulate slow connections for UI testing:

```typescript
import { recker } from 'recker/browser';

// Add 2 seconds latency
const client = recker.client();
client.use(recker.simulateNetwork({ latency: 2000 }));

console.time('req');
await client.get('https://httpbin.org/get');
console.timeEnd('req'); // ~2000ms + network time
```

## Using Plugins

All portable plugins work in the browser:

```typescript
import { recker, createClient, FetchTransport } from 'recker/browser';
import { retryPlugin } from 'recker/plugins/retry';
import { rateLimitPlugin } from 'recker/plugins/rate-limit';
import { circuitBreakerPlugin } from 'recker/plugins/circuit-breaker';

const client = recker.client({
  baseUrl: 'https://api.example.com'
});

// Add retry with exponential backoff
client.use(retryPlugin({
  maxAttempts: 3,
  backoff: 'exponential',
  delay: 1000
}));

// Add rate limiting
client.use(rateLimitPlugin({
  limit: 100,
  window: 60000
}));

// Add circuit breaker
client.use(circuitBreakerPlugin({
  threshold: 5,
  timeout: 30000
}));
```

## Authentication

Auth helpers are Node-only. In the browser, set headers directly (or use your auth library):

```typescript
import { createClient } from 'recker/browser';

const client = createClient({
  baseUrl: 'https://api.example.com'
});

// Bearer token
const users = await client.get('/users', {
  headers: { Authorization: 'Bearer your-token' }
});

// API Key
const metrics = await client.get('/metrics', {
  headers: { 'X-API-Key': 'your-api-key' }
});
```

## IndexedDB Cache

Persistent cache using IndexedDB:

```typescript
import { createClient, IndexedDBStorage } from 'recker/browser';
import { cachePlugin } from 'recker/plugins/cache';

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

client.use(cachePlugin({ storage }));
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

## Bundle Sizes

Recker provides two browser builds:

| Build | Import Path | Minified | What's Included |
|:------|:------------|:---------|:----------------|
| **Full** | `recker/browser` | ~1.1 MB | HTTP, WebSocket, SSE, AI, SEO, Scrape, portable plugins |
| **Slim** | `recker/browser-slim` | ~480 KB | HTTP, WebSocket, SSE, core plugins only |

### Which Build to Choose?

| Use Case | Recommended |
|:---------|:------------|
| Simple HTTP requests | `recker/browser-slim` (57% smaller) |
| Need AI streaming | `recker/browser` |
| Need SEO analysis | `recker/browser` |
| Need web scraping | `recker/browser` |
| Bundle size is critical | `recker/browser-slim` |

### Tree-Shaking

For smallest possible bundle, import only what you need:

```typescript
// ❌ Large: imports everything
import { recker } from 'recker/browser';

// ✅ Smaller: use slim build
import { recker } from 'recker/browser-slim';

// ✅ Smallest: import only functions
import { get, post } from 'recker/browser-slim';
```

## Detecting Browser Build

```typescript
import { recker } from 'recker/browser';

if (recker.isBrowser) {
  console.log('Running in browser');
  console.log('Unavailable features:', recker.unavailable);
  // ['whois', 'whoisAvailable', 'dns', 'dnsSecurity', 'dnsClient', 'whoisClient']
}
```

## Next Steps

- [Browser vs Node Differences](./02-differences.md) - Complete feature comparison
