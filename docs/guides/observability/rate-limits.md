# Rate Limits & Task Pool

> How to cap concurrency and request cadence with the TaskPool and the multi-request helper.

## On this page
- [Quick setup](#quick-setup)
- [How the queue decides what runs](#how-the-queue-decides-what-runs)
- [Abort/timeout while queued](#aborttimeout-while-queued)
- [Batch requests (`client.batch`)](#batch-requests-clientbatch)
- [Best practices](#best-practices)

## Quick setup

```typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  rateLimit: {
    concurrency: 4,            // max in-flight
    requestsPerInterval: 12,   // max 12 requests...
    interval: 1000             // ...per 1s window
  }
});
```

All requests now flow through the TaskPool and only start when a slot is free.

- Without `rateLimit`: every request fires immediately.
- With `rateLimit`: the TaskPool has priority and controls request start times.

## How the queue decides what runs

- **Concurrency:** only starts when `active < concurrency`.
- **Window:** tracks starts in the current window (`requestsPerInterval` / `interval`). If the cap is hit, waits for the next window.
- **Re-dispatch:** whenever a task finishes, the queue tries to start the next.

## Abort/timeout while queued

- If you pass `signal`, aborts are observed while queued; the request is removed and rejected before it starts.
- Per-request timeouts still apply once the task begins (see [Client Configuration](/guides/client-config.md)).

## Batch requests (`client.batch`)

Fire many requests at once:

```typescript
const { results, stats } = await client.batch(
  [
    { path: '/users/1' },
    { path: '/users/2' },
    { path: '/users/3' },
  ],
  {
    // only used when rateLimit is NOT configured
    concurrency: 2,
    mapResponse: (res) => res.json<User>(),
  }
);
```

Rules:
- If `rateLimit` is configured, the TaskPool governs start times; the `concurrency` option is ignored.
- If **no** `rateLimit` is set, `batch` uses an internal RequestRunner to cap local fan-out.

## Best practices

- Set `requestsPerInterval` + `interval` with 10–20% headroom under the upstream cap to avoid accidental bursts.
- Combine with [Retry & Backoff](/guides/retry.md) for 429/503 handling.
- Surface TaskPool metrics via `client.batch` + [Observability](/guides/observability.md) to watch throughput and queueing. 
