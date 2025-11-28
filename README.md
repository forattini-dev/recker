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

**Recker** is not just another `fetch` wrapper. It combines the ergonomics of `ky` with the resilience of `got` and the raw performance of `undici` into a unified **DevX Powerhouse**.

## ⚡ Why Recker?

| Feature | Description |
| :--- | :--- |
| **🛡️ Contract-First** | Define Zod schemas and get a fully typed SDK. No more `any`. |
| **🚦 Task Pool** | Global Rate Limiting & Concurrency Control (Semaphore/Token Bucket). |
| **👁️ Visual Debug** | Beautiful "Matrix-style" logs and cURL export. |
| **🤖 AI Ready** | First-class Server-Sent Events (SSE) support for LLM streaming. |
| **🔌 Plug & Play** | Circuit Breaker, Deduplication, Caching (SWR), and Retry built-in. |
| **🌐 Universal** | Works in Node.js (Undici) and Edge/Browsers (Fetch). |

## 📦 Installation

```bash
npm install recker
# or
pnpm add recker
```

## 🚀 Quick Start

### 1. The "Classic" Way
Simple and intuitive API with better defaults and full type safety.

```typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://jsonplaceholder.typicode.com'
});

// Auto-parse JSON, Typed response
const todo = await client.get<{ title: string }>('/todos/1').json();
console.log(todo.title);
```

### 2. The "Pro" Way (Contract-First)
Stop guessing URLs. Define your API contract.

```typescript
import { z } from 'zod';
import { createContract } from 'recker';

const api = createContract(client, {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    params: z.object({ id: z.string() }),
    response: z.object({ name: z.string() })
  }
});

// Fully typed! Typescript errors if you forget 'params.id'
const user = await api.getUser({ params: { id: '1' } });
```

### 3. The "Resilient" Way
Protect your downstream services with Circuit Breakers and Rate Limiting.

```typescript
import { circuitBreaker, rateLimit } from 'recker';

const resilientClient = createClient({
  // Never send more than 10 requests/sec
  rateLimit: { requestsPerInterval: 10, interval: 1000 },
  plugins: [
    // Stop calling if 50% of requests fail
    circuitBreaker({ threshold: 5 })
  ]
});
```

## 📚 Documentation

Read the full documentation at [recker.js.org](https://recker.js.org) (mock link).

- [Client Configuration](/docs/guides/client-config.md)
- [Concurrency Guide](/docs/guides/concurrency.md)
- [Streaming & SSE](/docs/guides/streaming.md)

## License

MIT