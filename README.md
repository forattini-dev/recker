# Recker

<div align="center">

<img src="docs/assets/logo.svg" alt="Recker Logo" width="200" />

### The HTTP SDK for the AI Era

**Stop fetching. Start orchestrating.**

[![npm version](https://img.shields.io/npm/v/recker.svg?style=flat-square&color=F5A623)](https://www.npmjs.com/package/recker)
[![npm downloads](https://img.shields.io/npm/dm/recker.svg?style=flat-square&color=34C759)](https://www.npmjs.com/package/recker)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Coverage](https://img.shields.io/badge/coverage-85%25-F5A623?style=flat-square)](https://github.com/forattini-dev/recker)
[![License](https://img.shields.io/npm/l/recker.svg?style=flat-square&color=007AFF)](https://github.com/forattini-dev/recker/blob/main/LICENSE)

[Documentation](https://forattini-dev.github.io/recker) · [Examples](./docs/examples/README.md) · [Migration](./docs/migration.md)

</div>

---

## 📦 Install

```bash
npm install recker
```

## 🚀 Quick Start

```typescript
import { createClient } from 'recker';

const client = createClient({ baseUrl: 'https://api.example.com' });

// GET with JSON
const users = await client.get('/users').json();

// POST with body
await client.post('/users', { json: { name: 'John' } });

// Path params + query
await client.get('/users/:id', { params: { id: '123', expand: 'profile' } });
```

## ✨ Why Recker?

Recker isn't just another HTTP client. It's a **complete orchestration layer** designed for modern, data-intensive applications.

| Feature | Description |
|:---|:---|
| 🔮 **19 HTTP Methods** | Beyond CRUD: WebDAV, CDN Purging, and specialized verbs. |
| 🤖 **AI-First** | Native Server-Sent Events (SSE) parsing optimized for LLMs. |
| 🕷️ **Scraping Ready** | jQuery-like HTML parsing, HLS downloading, and proxy rotation. |
| 🛡️ **Security Suite** | Built-in SSL inspection, WHOIS/RDAP, and DNS analysis. |
| ⚡ **Performance** | Connection pooling, deduplication, and deep network metrics. |
| 🛡️ **Resilience** | Circuit breakers, smart retries, and rate limit awareness. |

## 💡 Feature Highlights

### Stream AI Responses
Handle LLM streams effortlessly with the `.sse()` iterator.

```typescript
for await (const event of client.post('/v1/chat/completions', {
  json: { model: 'gpt-5', messages, stream: true }
}).sse()) {
  process.stdout.write(event.data);
}
```

### Scrape & Extract
Turn any webpage into structured data with the `.scrape()` method.

```typescript
const doc = await client.scrape('https://example.com');
const titles = doc.selectAll('h1').map(el => el.text());
```

### Reliability Built-in
Configure advanced retry policies in declarative style.

```typescript
const client = createClient({
  plugins: [
    retry({ maxAttempts: 3, backoff: 'exponential', jitter: true })
  ]
});
```

### Deep Observability
Know exactly where your latency comes from.

```typescript
const { timings } = await client.get('/api/data');
console.log(timings);
// { dns: 12ms, tcp: 8ms, tls: 45ms, firstByte: 23ms, total: 156ms }
```

## 📚 Documentation

**Getting Started**
- [Installation](./docs/getting-started/installation.md)
- [Quick Start](./docs/getting-started/quickstart.md)
- [Client Configuration](./docs/guides/client-config.md)

**Core Features**
- [HTTP Methods (19)](./docs/guides/http-methods.md)
- [Streaming & SSE](./docs/guides/streaming.md)
- [Retry & Backoff](./docs/guides/advanced/retry.md)
- [Caching](./docs/guides/caching.md)
- [Pagination](./docs/guides/pagination.md)

**Integrations**
- [GraphQL](./docs/guides/graphql.md)
- [Scraping](./docs/guides/scraping.md)
- [Hooks](./docs/guides/hooks.md)

**Reference**
- [API Reference](./docs/api/README.md)
- [Troubleshooting](./docs/guides/troubleshooting.md)
- [Examples](./docs/examples/README.md)

## ❤️ Acknowledgements

At Recker, we are passionate about these incredible open-source technologies. We are here to celebrate the past achievements that shaped the internet as we know it today, and to prepare ourselves for the future of web development.

Recker stands on the shoulders of giants. We extend our deepest gratitude to these projects:

<div align="center">

| | | |
|:---|:---|:---|
| **[Apollo Client](https://github.com/apollographql/apollo-client)** | **[Axios](https://github.com/axios/axios)** | **[Cheerio](https://github.com/cheeriojs/cheerio)** |
| **[Cookie](https://github.com/jshttp/cookie)** | **[Got](https://github.com/sindresorhus/got)** | **[GraphQL.js](https://github.com/graphql/graphql-js)** |
| **[Ky](https://github.com/sindresorhus/ky)** | **[Needle](https://github.com/tomas/needle)** | **[Node-libcurl](https://github.com/JCMais/node-libcurl)** |
| **[SuperAgent](https://github.com/ladjs/superagent)** | **[Undici](https://github.com/nodejs/undici)** | **[WS](https://github.com/websockets/ws)** |

</div>

## 🤝 Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📄 License

MIT © [Forattini](https://github.com/forattini-dev)

---

<div align="center">

**Built for the AI era.**

[Documentation](https://forattini-dev.github.io/recker) · [GitHub](https://github.com/forattini-dev/recker) · [npm](https://www.npmjs.com/package/recker)

</div>