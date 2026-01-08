# Installation

## Requirements

- **Node.js** (Active LTS or Current)
- Works with: npm, pnpm, yarn, bun

## Try Without Installing

```bash
# Always use @latest to get the newest version
npx recker@latest shell
npx recker@latest httpbin.org/json
```

## Package Managers

<tabs>

<tab title="pnpm">

```bash
pnpm add recker
```

</tab>

<tab title="npm">

```bash
npm install recker
```

</tab>

<tab title="yarn">

```bash
yarn add recker
```

</tab>

<tab title="bun">

```bash
bun add recker
```

</tab>

</tabs>

## Verify Installation

```typescript
import { createClient } from 'recker';

const client = createClient();
console.log('Recker installed successfully!');
```

## Import Paths

Recker provides multiple entry points optimized for different environments:

### Node.js (Default)

```typescript
// Full SDK - all features
import { recker, get, post, createClient } from 'recker';

// Or using the node-specific path (same as above)
import { recker } from 'recker/node';
```

### Browser Builds

Recker provides **two browser builds** with different sizes and features:

| Build | Import Path | Size | What's Included |
|:------|:------------|:-----|:----------------|
| **Full** | `recker/browser` | ~1.1 MB | HTTP, WebSocket, SSE, AI, SEO, Scrape, portable plugins |
| **Mini** | `recker/browser-mini` | ~480 KB | HTTP, WebSocket, SSE, 18 core plugins |

#### Full Browser Build

Use when you need AI streaming, SEO analysis, or web scraping:

```typescript
import { recker, get, post, createClient } from 'recker/browser';

// Full features available
await recker.get('/api/users').json();
await recker.ai.chat('Hello!');  // AI available
const seo = await recker.seo(html);  // SEO available
```

#### Mini Browser Build

**Recommended for most projects.** Use when you only need HTTP requests and core plugins:

```typescript
import { recker, get, post, createClient } from 'recker/browser-mini';

// Core features only
await recker.get('/api/users').json();
// recker.ai → undefined (not included)
// recker.seo → undefined (not included)
```

#### Mini Build: What's Included vs Excluded

| ✅ Included in Mini | ❌ Excluded from Mini |
|:--------------------|:----------------------|
| HTTP (GET, POST, PUT, PATCH, DELETE) | AI providers (OpenAI, Anthropic, etc.) |
| WebSocket | SEO analysis (400+ rules) |
| SSE (Server-Sent Events) | Web scraping |
| Response types (JSON, text, blob, stream) | Auth helpers (Node-only) |
| Retry plugin | Template engine |
| Rate limit plugin | |
| Circuit breaker plugin | |
| Dedup plugin | |
| | Presets (Node-only) |
| GraphQL plugin | |
| Cache (Memory, IndexedDB) | |

### CDN Usage

#### UMD (Global Variable)

```html
<!-- Full build -->
<script src="https://unpkg.com/recker/dist/browser/index.umd.min.js"></script>

<!-- Mini build (recommended for smaller bundle) -->
<script src="https://unpkg.com/recker/dist/browser/index.mini.umd.min.js"></script>

<script>
  // Access via global 'Recker' object
  const { recker, get, post, createClient } = Recker;

  async function main() {
    const data = await get('https://api.example.com/users').json();
    console.log(data);
  }
  main();
</script>
```

#### ES Module (Script Tag)

```html
<script type="module">
  // Full build
  import { recker } from 'https://unpkg.com/recker/dist/browser/index.min.js';

  // Mini build
  import { recker } from 'https://unpkg.com/recker/dist/browser/index.mini.min.js';

  const data = await recker.get('https://api.example.com/users').json();
  console.log(data);
</script>
```

#### Alternative CDNs

```html
<!-- jsDelivr -->
<script src="https://cdn.jsdelivr.net/npm/recker/dist/browser/index.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/recker/dist/browser/index.mini.umd.min.js"></script>

<!-- unpkg -->
<script src="https://unpkg.com/recker/dist/browser/index.umd.min.js"></script>
<script src="https://unpkg.com/recker/dist/browser/index.mini.umd.min.js"></script>

<!-- esm.sh (ESM only) -->
<script type="module">
  import { recker } from 'https://esm.sh/recker';
</script>
```

### Which Build Should I Use?

| Your Use Case | Recommended Import |
|:--------------|:-------------------|
| **Node.js server/CLI** | `import { recker } from 'recker'` |
| **React/Vue/Angular app (simple HTTP)** | `import { recker } from 'recker/browser-mini'` |
| **Need AI streaming in browser** | `import { recker } from 'recker/browser'` |
| **Need SEO analysis in browser** | `import { recker } from 'recker/browser'` |
| **Need scraping in browser** | `import { recker } from 'recker/browser'` |
| **Bundle size is critical** | `import { recker } from 'recker/browser-mini'` |
| **Static HTML page** | `<script src="...index.mini.umd.min.js">` |

### Subpath Imports

For tree-shaking and smaller bundles, import specific modules:

```typescript
// Plugins only
import { retryPlugin, rateLimitPlugin } from 'recker/plugins';

// Specific plugin
import { retryPlugin } from 'recker/plugins/retry';

// SEO only (Node.js)
import { analyzeSeo, Spider } from 'recker/seo';

// Scraping only (Node.js)
import { scrape, Spider } from 'recker/scrape';

// AI only (Node.js)
import { ai, createAiClient } from 'recker/ai';

// DNS only (Node.js)
import { dns, dnsClient } from 'recker/dns';

// Template engine (Node.js only)
import { TemplateEngine, template } from 'recker/template';

// Testing utilities
import { MockHttpServer, MockWebSocketServer } from 'recker/testing';

// Presets
import { presets } from 'recker/presets';
import { github } from 'recker/presets/github';
```

### Browser Limitations

Some features are **not available** in browser environments due to platform constraints:

| Feature | Reason |
|---------|--------|
| DNS/WHOIS | Requires raw socket access |
| FTP/SFTP/Telnet | Requires raw socket access |
| Template Engine | Requires Node.js `fs` module |
| Auth helpers | Node-only |
| Presets | Node-only |
| mTLS Auth | Client certificates |
| Redis Cache | Server-side only |
| CLI | Terminal access |

> **Note:** AI, SEO, and Scraping work in the browser **only with the full build** (`recker/browser`). Presets and auth helpers are Node-only.

See [Node vs Browser Differences](/browser/02-differences.md) for the complete comparison.

## What's Included

When you install Recker, you get:

- ✅ **Core HTTP Client** - All HTTP methods
- ✅ **Built-in Plugins** - Retry, cache, dedup, compression
- ✅ **TypeScript Types** - Full type definitions
- ✅ **Lightweight** - Minimal dependencies
- ✅ **Browser Build** - Works in modern browsers

## TypeScript Support

Recker is written in TypeScript and provides full type safety out of the box.

```typescript
import { createClient, type ReckerResponse } from 'recker';

interface User {
  id: number;
  name: string;
}

const client = createClient({ baseUrl: 'https://api.example.com' });
const users: User[] = await client.get('/users').json<User[]>();
```

## Next Steps

- [Quick Start →](/getting-started/quickstart.md)
- [HTTP Fundamentals →](/http/02-fundamentals.md)
