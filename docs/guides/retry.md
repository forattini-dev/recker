# Retry & Backoff

> How to configure retries with jitter and respond to 429/5xx safely.

## On this page
- [Basic setup](#basic-setup)
- [Backoff strategies](#backoff-strategies)
- [Retry hook](#retry-hook)
- [When not to retry](#when-not-to-retry)

## Basic setup

```typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    maxAttempts: 4,
    backoff: 'exponential', // linear | exponential | decorrelated
    jitter: true
  }
});
```

- `maxAttempts` includes the first try (e.g., 4 = 1 try + 3 retries).
- `jitter` reduces thundering herd during simultaneous failures.

## Backoff strategies

- `linear`: fixed step (e.g., 200ms, 400ms, 600ms…)
- `exponential`: doubles each failure (e.g., 200ms, 400ms, 800ms…)
- `decorrelated`: randomizes within a growing window; great for distributed workloads.

## Retry hook

```typescript
retry: {
  maxAttempts: 4,
  backoff: 'decorrelated',
  onRetry: ({ attempt, error, delay }) => {
    console.warn(`[retry] attempt=${attempt} delay=${delay} error=${error.message}`);
  }
}
```

Use the hook to log, emit metrics, or tweak behavior dynamically.

## When not to retry

- Validation (400/422) or auth failures (401/403) should not be retried.
- If the upstream is rate limited, combine with [Rate Limits & Task Pool](/guides/rate-limits.md) and use larger backoff for 429/503.
- For non-idempotent operations, avoid automatic retries to prevent duplicate side effects. 
