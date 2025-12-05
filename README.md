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

## Features

| Feature | Description |
|:---|:---|
| **Zero Config** | Direct functions work out of the box. No setup required. |
| **Multi-Protocol** | HTTP, WebSocket, DNS, WHOIS, RDAP, FTP, SFTP, Telnet in one SDK. |
| **AI-Native** | SSE streaming, token counting, provider abstraction. |
| **Type-Safe** | Full TypeScript with Zod schema validation. |
| **Observable** | DNS/TCP/TLS/TTFB timing breakdown per request. |
| **Resilient** | Retry, circuit breaker, rate limiting, deduplication. |
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

### Scraping

```typescript
const doc = await client.scrape('https://example.com');
const titles = doc.selectAll('h1').map(el => el.text());
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

# Mock servers for testing
rek serve http    # HTTP on :3000
rek serve ws      # WebSocket on :8080
rek serve hls     # HLS streaming on :8082
```

See [CLI Documentation](./docs/cli/01-overview.md) for more.

## Documentation

- **[Quick Start](./docs/http/01-quickstart.md)** - Get running in 2 minutes
- **[CLI Guide](./docs/cli/01-overview.md)** - Terminal client documentation
- **[API Reference](./docs/reference/01-api.md)** - Complete API documentation
- **[Configuration](./docs/http/05-configuration.md)** - Client options
- **[Plugins](./docs/http/10-plugins.md)** - Extend functionality
- **[AI Integration](./docs/ai/01-overview.md)** - OpenAI, Anthropic, and more
- **[Protocols](./docs/protocols/01-websocket.md)** - WebSocket, DNS, WHOIS
- **[Mock Servers](./docs/cli/08-mock-servers.md)** - Built-in test servers

## License

MIT © [Forattini](https://github.com/forattini-dev)
