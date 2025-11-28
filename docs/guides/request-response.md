# Requests & Responses

> The core request flow in Recker and how to work with responses, timeouts, and aborts.

## On this page
- [Building requests](#building-requests)
- [Timeouts and aborts](#timeouts-and-aborts)
- [Bodies and headers](#bodies-and-headers)
- [Responses: json, text, streaming](#responses-json-text-streaming)
- [Useful helpers](#useful-helpers)

## Building requests

```typescript
import { createClient } from 'recker';

const client = createClient({ baseUrl: 'https://api.example.com' });

// GET with params
const users = await client.get('/users', { params: { page: 1 } }).json();

// POST with auto-JSON
const created = await client.post('/users', { name: 'Ada', role: 'admin' }).json();
```

- `baseUrl` composes relative paths (`/users` → `https://.../users`).
- `params` accepts numbers/strings and resolves route placeholders (`/users/:id`).

## Timeouts and aborts

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(new Error('User abort')), 200);

await client.get('/slow', { timeout: 500, signal: controller.signal });
```

- `timeout` aborts the request if it exceeds the limit.
- `signal` is propagated: aborting while queued (with [Task Pool](/guides/rate-limits.md)) or in-flight cancels the request.

## Bodies and headers

```typescript
await client.post('/upload', fileStream, {
  headers: { 'Content-Type': 'application/octet-stream' }
});

await client.put('/users/:id', { name: 'New' }, {
  params: { id: 123 },
  headers: { Authorization: `Bearer ${token}` }
});
```

- Objects/arrays are serialized as JSON and `Content-Type` is set if missing.
- FormData and streams are sent as-is.

## Responses: json, text, streaming

```typescript
const res = await client.get('/reports/summary');

const asJson = await res.json();
const asText = await res.text();

// Chunked streaming
for await (const chunk of res) {
  process.stdout.write(Buffer.from(chunk));
}
```

- `response.cleanText()` strips HTML for LLM-friendly text.
- `response.download()` emits download progress (see [Client Configuration](/guides/client-config.md)).

## Useful helpers

- `.safe()` on any request: returns `[ok, err, data]` to avoid try/catch.
- `paginate()` and `getAll()` for large lists.
- Hooks: `beforeRequest` / `afterResponse` / `onError` for cross-cutting concerns.
- `debug: true` prints a timeline (DNS/TCP/TLS/TTFB) during development.
