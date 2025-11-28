# Recker

<div align="center">
  <h1>The HTTP Client for the AI Era</h1>
  
  <p>
    Build resilient, type-safe, and high-performance integrations with the 
    <strong>Smart SDK Builder</strong> designed for modern backend ecosystems.
  </p>

  <p>
    <a href="https://www.npmjs.com/package/recker">
      <img src="https://img.shields.io/npm/v/recker.svg?style=flat-square&color=F5A623" alt="npm version" />
    </a>
    <a href="https://github.com/your-org/recker/blob/main/LICENSE">
      <img src="https://img.shields.io/npm/l/recker.svg?style=flat-square&color=007AFF" alt="license" />
    </a>
    <img src="https://img.shields.io/badge/coverage-100%25-34C759?style=flat-square" alt="coverage" />
    <img src="https://img.shields.io/badge/types-included-34C759?style=flat-square" alt="types" />
  </p>
  
  <br />
</div>

---

**Recker** leverages the raw power of [Undici](https://github.com/nodejs/undici) to deliver the ultimate HTTP experience for modern Node.js applications.

Built for the AI era, it provides a unified **DevX Powerhouse** with zero-overhead abstractions, deep observability, and enterprise-grade resilience.

## Quick navigation

- [Why Recker](#why-recker)
- [Quick Install](#quick-install)
- [Quick Example](#quick-example)
- [Key Features](#key-features)
- [Observability](./guides/observability.md)
- [Unified Concurrency](./guides/concurrency.md)
- [Batch Requests](./guides/batch-requests.md)
- [Playbooks](./guides/playbooks.md)
- [Contributing](./contributing.md)

## Why Recker

Recker is built for the **modern web**. It combines blazing-fast performance with the modern features developers need:

✨ **Smart Retry** with exponential backoff
🔄 **Request Deduplication** (90% reduction in HTTP calls)
📊 **Progress Tracking** with ETA
🌊 **Native SSE Support** for AI streaming
💾 **Memory-Efficient Streaming** for large files
🎯 **Auto Pagination** for paginated APIs
⚡ **HTTP/2** with multiplexing
🔧 **All HTTP Methods** - Standard, WebDAV, CDN, diagnostics, and Link methods
🚀 **Unified Concurrency** - Global limits, rate limiting, and connection pooling
🌐 **Multi-Domain Batches** - Parallel execution across multiple domains
🔐 **XSRF Protection** built-in
🎨 **Beautiful Debug Mode**  

## Quick Install

```bash
npm install recker
# or
pnpm add recker
```

## Quick Example

```typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: { maxAttempts: 3, backoff: 'exponential' },
  cache: { strategy: 'stale-while-revalidate', ttl: 60000 },
  http2: true,
  concurrency: 20,  // Max 20 concurrent requests
  debug: true
});

// Simple GET
const data = await client.get('/users').json();

// Batch requests with concurrency control
const { results, stats } = await client.batch([
  { path: '/users/1' },
  { path: '/users/2' },
  { path: '/users/3' }
], { concurrency: 5 });

// Stream OpenAI responses
for await (const event of client.post('/chat', payload).sse()) {
  console.log(event.data);
}

// Auto pagination
for await (const user of client.paginate('/users')) {
  console.log(user.name);
}

// Streaming file download (Recker responses are async-iterable)
for await (const chunk of client.get('/large-file')) {
  process.stdout.write(Buffer.from(chunk));
}
```

## Learn More

- [Client configuration](./guides/client-config.md)
- [Streaming & SSE](./guides/streaming.md)
- [Metrics & timings](./guides/observability.md)
- [Circuit breaker & resilience](./guides/circuit-breaker.md)
- [Migration guide](./migration.md)

## Key Features

| Feature | Description |
|---------|-------------|
| **Unified Concurrency** | Global limits, rate limiting, connection pooling, HTTP/2 streams |
| **Batch Requests** | Parallel execution with per-batch concurrency control |
| **Multi-Domain** | Separate connection pools per domain for efficient multi-domain requests |
| **Smart Retry** | Exponential, linear, or decorrelated jitter backoff |
| **Deduplication** | Automatically dedup parallel requests |
| **Caching** | Multiple strategies with custom storage |
| **Progress** | Real-time upload/download progress with ETA |
| **Streaming** | Bidirectional streaming for large files |
| **SSE** | Native Server-Sent Events support |
| **Pagination** | Auto-detect Link headers, cursors, page numbers |
| **HTTP/2** | Multiplexing and server push support |
| **Compression** | Auto compress request bodies (gzip/brotli) |
| **XSRF** | Automatic CSRF token handling |
| **Proxy** | Native HTTP/HTTPS/SOCKS proxy support |
| **Debug** | Colored timeline visualization |
| **TypeScript** | Full type safety with Zod validation |

## Observability snapshot

```typescript
const res = await client.get('/health');
console.log(res.timings); // DNS/TCP/TLS/TTFB/content/total
console.log(res.connection); // protocol, cipher, reuse, http2/http3 details
```

See the full guide at [metrics & timings](./guides/observability.md).

## Performance

Recker is **fast**:

- **17% faster** than axios
- **40% faster** than got/ky
- **5x speedup** with smart caching

[See full benchmarks →](benchmarks.md)

## Community

- [GitHub Discussions](https://github.com/forattini-dev/recker/discussions)
- [Report Issues](https://github.com/forattini-dev/recker/issues)
- [Contributing Guide](./contributing.md)

---

<div style="text-align: center; color: #666; margin-top: 3rem;">
  Built with ❤️ for the Node.js community
</div>
