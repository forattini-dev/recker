# Client Configuration

> How to wire Recker for real projects: base URLs, headers, HTTP/2, proxies, and global defaults.

## Quick links

- [Minimal client](#minimal-client)
- [HTTP/2 & protocol hints](#http2--protocol-hints)
- [Proxy & TLS](#proxy--tls)
- [Hooks and middleware](#hooks-and-middleware)
- [Pagination defaults](#pagination-defaults)

## Minimal client

```typescript
import { createClient } from 'recker';

export const client = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    Authorization: `Bearer ${process.env.API_TOKEN}`
  },
  debug: process.env.NODE_ENV !== 'production'
});
```

- `baseUrl` is required when you rely on the built-in Undici transport.
- Provide shared headers (auth, JSON accept) here instead of repeating them on each request.

## HTTP/2 & protocol hints

Recker negotiates HTTP/2 automatically when the server supports it. To explicitly enable and tune it:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  http2: {
    enabled: true,
    maxConcurrentStreams: 200,
    pipelining: 5
  }
});
```

- When HTTP/2 is negotiated you get per-session metrics in `response.connection.http2` (stream counts, window sizes, and SETTINGS frames).
- ALPN-detected HTTP/3 surfaces in `response.connection.http3` (QUIC version, 0-RTT, handshake status). No extra config required beyond HTTPS.

## Proxy & TLS

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  proxy: {
    url: 'http://proxy.internal:8080',
    auth: { username: 'svc-user', password: 's3cret' }
  }
});
```

TLS details (cipher/protocol) are exposed on `response.connection` for debugging certificate or ALPN issues.

## Hooks and middleware

Use hooks for lightweight cross-cutting concerns without a full middleware:

```typescript
client
  .beforeRequest((req) => req.withHeader('x-request-id', crypto.randomUUID()))
  .afterResponse((req, res) => {
    console.log(`[${res.status}] ${req.method} ${req.url}`);
    return res;
  })
  .onError((error) => {
    // Fallback response example
    if ((error as any).status === 503) {
      return new Response(JSON.stringify({ maintenance: true }), { status: 200 });
    }
  });
```

- Use `middlewares` for heavier responsibilities (compression, auth, custom logging) that need access to `next`.
- Debug mode (`debug: true`) adds a zero-config logging middleware that prints timings and headers.

## Pagination defaults

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  pagination: {
    pageParam: 'page',
    limitParam: 'limit',
    resultsPath: 'data.items'
  }
});
```

These defaults are applied when you call `client.paginate()` or `client.getAll()`, so you only need to pass the per-endpoint extraction functions.

## Rate limiting with RequestPool

When your upstream has strict limits, wrap requests in the built-in request pool:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  rateLimit: {
    concurrency: 4,           // max in-flight
    requestsPerInterval: 10,  // max 10 requests
    interval: 1000            // per 1s window
  }
});

// All requests are queued and dispatched respecting the cap
const results = await Promise.all([
  client.get('/users/1').json(),
  client.get('/users/2').json(),
  client.get('/users/3').json(),
]);
```

Abort/timeout signals still propagate: if a request is aborted while queued, it is removed before dispatch.

## Batch request helper (RequestRunner + RequestPool)

Use `client.batch()` to dispatch many requests with controlled fan-out:

```typescript
const { results, stats } = await client.batch(
  [
    { path: '/users/1' },
    { path: '/users/2' },
    { path: '/users/3' },
  ],
  {
    concurrency: 2, // only used when rateLimit is not set
    mapResponse: (res) => res.json<User>()
  }
);
```

- If `rateLimit` is configured, the request pool has priority and governs start times; `batch` simply enqueues all requests and lets the pool schedule them.
- If `rateLimit` is not set, `batch` uses a lightweight `RequestRunner` to cap local concurrency (default: `requests.length`).
