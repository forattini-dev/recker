# Recker

<div align="center">

### The HTTP SDK for the AI Era

**Fast. Observable. Type-safe.**

[![npm version](https://img.shields.io/npm/v/recker.svg?style=flat-square&color=F5A623)](https://www.npmjs.com/package/recker)
[![npm downloads](https://img.shields.io/npm/dm/recker.svg?style=flat-square&color=34C759)](https://www.npmjs.com/package/recker)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Coverage](https://img.shields.io/badge/coverage-78%25-F5A623?style=flat-square)](https://github.com/forattini-dev/recker)

</div>

---

Modern applications demand more than just HTTP requests. They need **streaming for LLMs**, **scraping for data extraction**, **observability for debugging**, and **resilience for production**. Recker delivers all of this in a single, type-safe package built on the fastest HTTP engine available.

```typescript
import { createClient } from 'recker';

const client = createClient({ baseUrl: 'https://api.openai.com/v1' });

// Stream AI completions with real-time SSE parsing
for await (const event of client.post('/chat/completions', {
  json: { model: 'gpt-5', messages: [...], stream: true }
}).sse()) {
  process.stdout.write(event.data);
}
```

## Highlights

| Feature | Description |
|:--------|:------------|
| **High Performance** | Built on Node.js's fastest HTTP engine with optimized connection pooling. |
| **AI-First Streaming** | Native SSE parsing, async iteration, progress tracking for LLM apps. |
| **HTML Scraping** | jQuery-like API with Cheerio. Extract links, images, meta, OpenGraph, JSON-LD. |
| **Type-Safe Contracts** | Define your API with Zod schemas. Get autocomplete and validation for free. |
| **Full Observability** | DNS/TCP/TLS/TTFB timings, connection info, HAR recording, Server-Timing. |
| **Resilience Built-In** | Retry with backoff, circuit breaker, rate limiting, request deduplication. |
| **Network Utilities** | WHOIS lookups, DNS resolution, DoH queries, SSL certificate inspection. |

## Quick Navigation

<div class="feature-cards">

- **Getting Started**
  - [Installation](getting-started/installation.md)
  - [Quick Start](getting-started/quickstart.md)
  - [Client Configuration](guides/client-config.md)

- **Core Features**
  - [Streaming & SSE](guides/streaming.md)
  - [HTML Scraping](guides/scraping.md)
  - [GraphQL](guides/graphql.md)
  - [Contract-First API](guides/contract.md)

- **Resilience**
  - [Retry Strategies](guides/advanced/retry.md)
  - [Circuit Breaker](guides/advanced/circuit-breaker.md)
  - [Caching (SWR)](guides/caching.md)

- **Advanced**
  - [Concurrency & Rate Limiting](guides/performance/concurrency.md)
  - [Network Utilities](guides/advanced-networking.md)
  - [Testing](guides/testing.md)
  - [Plugin Development](guides/plugins.md)

</div>

## Quick Install

```bash
pnpm add recker
# or
npm install recker
```

**Optional peer dependencies:**
```bash
pnpm add cheerio    # For HTML scraping
pnpm add ioredis    # For Redis cache storage
```

## Quick Example

```typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  headers: { 'Authorization': 'Bearer token' }
});

// GET with automatic JSON parsing
const users = await client.get('/users').json<User[]>();

// POST with body
const created = await client.post('/users', {
  json: { name: 'John', email: 'john@example.com' }
}).json<User>();

// Path parameters + query string
const user = await client.get('/users/:id', {
  params: { id: '123', expand: 'profile' }
}).json<User>();
// → GET /users/123?expand=profile
```

## Streaming for AI

```typescript
// Server-Sent Events (SSE) for LLM streaming
const response = client.post('/v1/chat/completions', {
  json: { model: 'gpt-5', messages, stream: true }
});

for await (const event of response.sse()) {
  if (event.event === 'message') {
    const chunk = JSON.parse(event.data);
    process.stdout.write(chunk.choices[0].delta.content || '');
  }
}
```

## HTML Scraping

```typescript
// Built-in scraping with Cheerio
const doc = await client.scrape('https://news.ycombinator.com');

// Extract structured data
const stories = doc.selectAll('.athing').map(el => ({
  title: el.find('.titleline a').text(),
  url: el.find('.titleline a').attr('href'),
  score: el.next().find('.score').text()
}));

// Quick extraction methods
const links = doc.links({ absolute: true });
const meta = doc.meta();
const og = doc.openGraph();
const jsonLd = doc.jsonLd();
```

## Observability

```typescript
const response = await client.get('/api/data');

// Detailed timing breakdown
console.log(response.timings);
// { dns: 12, tcp: 8, tls: 45, firstByte: 23, total: 156 }

// Connection info
console.log(response.connection);
// { protocol: 'h2', cipher: 'TLS_AES_256_GCM_SHA384', remoteAddress: '...' }
```

## Community

- [GitHub Repository](https://github.com/forattini-dev/recker)
- [Report Issues](https://github.com/forattini-dev/recker/issues)
- [Contributing Guide](contributing.md)

---

<div align="center">

**Built for the AI era.**

</div>
