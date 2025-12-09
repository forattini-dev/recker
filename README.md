<div align="center">

# ⚡ Recker

### The Network SDK for the AI Era

**Zero-config HTTP. Multi-protocol support. AI-native streaming. Observable to the millisecond.**

[![npm version](https://img.shields.io/npm/v/recker.svg?style=flat-square&color=F5A623)](https://www.npmjs.com/package/recker)
[![npm downloads](https://img.shields.io/npm/dm/recker.svg?style=flat-square&color=34C759)](https://www.npmjs.com/package/recker)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Coverage](https://img.shields.io/badge/coverage-90%25-34C759?style=flat-square)](https://github.com/forattini-dev/recker)
[![License](https://img.shields.io/npm/l/recker.svg?style=flat-square&color=007AFF)](https://github.com/forattini-dev/recker/blob/main/LICENSE)

[Documentation](https://forattini-dev.github.io/recker) · [API Reference](./docs/reference/01-api.md) · [Examples](./docs/examples/README.md)

</div>

---

## Install

```bash
npm install recker
```

## Quick Start

```typescript
import { get, post, whois, dns } from 'recker';
import { rdap, supportsRDAP } from 'recker/utils/rdap';

// HTTP - zero config
const users = await get('https://api.example.com/users').json();
await post('https://api.example.com/users', { json: { name: 'John' } });

// WHOIS
const info = await whois('github.com');

// RDAP (modern WHOIS)
if (supportsRDAP('com')) {
  const data = await rdap(client, 'google.com');
  console.log(data.status, data.events);
}

// DNS
const ips = await dns('google.com');
```

### Unified Namespace

```typescript
import { recker } from 'recker';

// Everything in one place
await recker.get('https://api.example.com/users').json();
await recker.whois('github.com');
await recker.dns('google.com');
await recker.ai.chat('Hello!');

const socket = recker.ws('wss://api.example.com/ws');
```

### With Configuration

```typescript
import { createClient } from 'recker';

const api = createClient({
  baseUrl: 'https://api.example.com',
  headers: { 'Authorization': 'Bearer token' },
  timeout: 10000,
  retry: { maxAttempts: 3 }
});

const user = await api.get('/users/:id', { params: { id: '123' } }).json();
```

### Mini Client (Maximum Performance)

Need raw speed? Use `recker-mini` for ~2% overhead vs raw undici:

```typescript
import { createMiniClient, miniGet } from 'recker/mini';

// Client instance
const fast = createMiniClient({ baseUrl: 'https://api.example.com' });
const data = await fast.get('/users').then(r => r.json());

// Or direct function (even faster)
const users = await miniGet('https://api.example.com/users').then(r => r.json());
```

| Mode | Speed | Features |
|------|-------|----------|
| `recker-mini` | ~146µs (2% overhead) | Base URL, headers, JSON |
| `recker` | ~265µs (86% overhead) | Retry, cache, auth, hooks, plugins |

See [Mini Client documentation](./docs/http/18-mini-client.md) for more.

## Features

| Feature | Description |
|:---|:---|
| **Zero Config** | Direct functions work out of the box. No setup required. |
| **Multi-Protocol** | HTTP, WebSocket, DNS, WHOIS, RDAP, FTP, SFTP, Telnet in one SDK. |
| **AI-Native** | SSE streaming, token counting, provider abstraction. |
| **Type-Safe** | Full TypeScript with Zod schema validation. |
| **Observable** | DNS/TCP/TLS/TTFB timing breakdown per request. |
| **Resilient** | Retry, circuit breaker, rate limiting, deduplication. |
| **SEO Analysis** | 250+ rules across 21 categories. Site-wide crawling with duplicate detection. |
| **Spider Crawler** | Web crawler with URL deduplication, depth control, and concurrency. |
| **GeoIP (Offline)** | MaxMind GeoLite2 database with bogon detection. |
| **RDAP Support** | Modern WHOIS with IANA Bootstrap and TLD detection. |

## Highlights

### AI Streaming

```typescript
for await (const event of recker.ai.stream({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
})) {
  process.stdout.write(event.choices[0]?.delta?.content || '');
}
```

### Request Timing

```typescript
const response = await get('https://api.example.com/data');
console.log(response.timings);
// { dns: 12, tcp: 8, tls: 45, firstByte: 23, total: 156 }
```

### Scraping & Spider

```typescript
// Scrape single page
const doc = await client.scrape('https://example.com');
const titles = doc.selectAll('h1').map(el => el.text());

// Crawl entire site
import { spider } from 'recker/scrape';
const result = await spider('https://example.com', { maxPages: 50 });
console.log(`Crawled ${result.pages.length} pages`);
```

### SEO Analysis

```typescript
import { analyzeSeo, seoSpider } from 'recker/seo';

// Single page analysis - 250+ checks across 21 categories
const report = await analyzeSeo(html, { baseUrl: 'https://example.com' });
console.log(`Score: ${report.score}/100 (${report.grade})`);

// Site-wide analysis - detect duplicates and orphan pages
const siteReport = await seoSpider('https://example.com', { seo: true });
console.log(`Duplicate titles: ${siteReport.summary.duplicateTitles}`);
```

### Circuit Breaker

```typescript
import { createClient, circuitBreaker } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [
    circuitBreaker({ threshold: 5, resetTimeout: 30000 })
  ]
});
```

## CLI (`rek`)

A powerful terminal client that replaces curl:

```bash
# Install globally
npm install -g recker

# Simple requests
rek httpbin.org/json
rek POST api.com/users name="John" age:=30

# Pipe to bash (like curl)
rek -q https://get.docker.com | bash

# Save to file
rek -o data.json api.com/export

# Interactive shell
rek shell

# SEO analysis
rek seo https://example.com

# Mock servers for testing
rek serve http    # HTTP on :3000
rek serve ws      # WebSocket on :8080
rek serve hls     # HLS streaming on :8082
```

See [CLI Documentation](./docs/cli/01-overview.md) for more.

## Documentation

- **[Quick Start](./docs/http/01-quickstart.md)** - Get running in 2 minutes
- **[Mini Client](./docs/http/18-mini-client.md)** - Maximum performance mode
- **[CLI Guide](./docs/cli/01-overview.md)** - Terminal client documentation
- **[SEO Analysis](./docs/http/19-seo.md)** - 250+ rules, site-wide crawling
- **[Web Scraping](./docs/http/14-scraping.md)** - HTML parsing and Spider crawler
- **[API Reference](./docs/reference/01-api.md)** - Complete API documentation
- **[Configuration](./docs/http/05-configuration.md)** - Client options
- **[Plugins](./docs/http/10-plugins.md)** - Extend functionality
- **[AI Integration](./docs/ai/01-overview.md)** - OpenAI, Anthropic, and more
- **[Protocols](./docs/protocols/01-websocket.md)** - WebSocket, DNS, WHOIS
- **[Mock Servers](./docs/cli/08-mock-servers.md)** - Built-in test servers
- **[Benchmarks](./docs/benchmarks.md)** - Performance comparisons

## License

MIT © [Forattini](https://github.com/forattini-dev)
