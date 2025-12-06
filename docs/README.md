# Recker

<div align="center">

### The Network SDK for the AI Era

**Zero-config HTTP. Multi-protocol support. AI-native streaming. Observable to the millisecond.**

[![npm version](https://img.shields.io/npm/v/recker.svg?style=flat-square&color=F5A623)](https://www.npmjs.com/package/recker)
[![npm downloads](https://img.shields.io/npm/dm/recker.svg?style=flat-square&color=34C759)](https://www.npmjs.com/package/recker)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Coverage](https://img.shields.io/badge/coverage-90%25-34C759?style=flat-square)](https://github.com/forattini-dev/recker)

</div>

---

## Quick Start

```typescript
import { get, post, whois, dns } from 'recker';

// HTTP - zero config
const users = await get('https://api.example.com/users').json();
await post('https://api.example.com/users', { json: { name: 'John' } });

// WHOIS
const info = await whois('github.com');

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

## Features

| Feature | Description |
|:---|:---|
| **Zero Config** | Direct functions work out of the box. No setup required. |
| **Multi-Protocol** | HTTP, WebSocket, DNS, WHOIS in one SDK. |
| **AI-Native** | SSE streaming, token counting, provider abstraction. |
| **Type-Safe** | Full TypeScript with Zod schema validation. |
| **Observable** | DNS/TCP/TLS/TTFB timing breakdown per request. |
| **Resilient** | Retry, circuit breaker, rate limiting, deduplication. |

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
```

See [CLI Documentation](cli/01-overview.md) for more.

## Quick Navigation

<div class="feature-cards">

- **Getting Started**
  - [Installation](getting-started/installation.md)
  - [Quick Start](http/01-quickstart.md)
  - [Client Configuration](http/05-configuration.md)

- **CLI**
  - [CLI Overview](cli/01-overview.md)
  - [Quick Start](cli/02-quick-start.md)
  - [Interactive Shell](cli/03-shell.md)
  - [Mock Servers](cli/08-mock-servers.md)

- **Core Features**
  - [Streaming & SSE](ai/02-streaming.md)
  - [HTML Scraping](http/14-scraping.md)
  - [GraphQL](http/13-graphql.md)
  - [Validation & Contracts](http/04-validation.md)

- **Resilience**
  - [Retry & Circuit Breaker](http/07-resilience.md)
  - [Caching (SWR)](http/09-cache.md)

- **Protocols**
  - [WebSocket](protocols/01-websocket.md)
  - [DNS](protocols/04-dns.md)
  - [WHOIS](protocols/05-whois-rdap.md)

- **AI Integration**
  - [AI Overview](ai/01-overview.md)
  - [MCP Server](ai/06-mcp-server.md)

- **Reference**
  - [API Reference](reference/01-api.md)
  - [Testing](reference/03-testing.md)

</div>

## Install

```bash
npm install recker
```

## Highlights

### AI Streaming

```typescript
for await (const event of recker.ai.stream({
  model: 'gpt-5.1',
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

### Scraping

```typescript
const doc = await client.scrape('https://example.com');
const titles = doc.selectAll('h1').map(el => el.text());
```

### Circuit Breaker

```typescript
import { createClient, circuitBreakerPlugin } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [
    circuitBreakerPlugin({ threshold: 5, resetTimeout: 30000 })
  ]
});
```

---

<div align="center">

**Built for the AI era.**

</div>
