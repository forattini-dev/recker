# Playbooks (Quick Recipes)

> Opinionated examples for common production scenarios.

## On this page
- [Auth with automatic refresh](#auth-with-automatic-refresh)
- [Large upload with progress + retry](#large-upload-with-progress--retry)
- [SSE/streaming with reconnect](#ssestreaming-with-reconnect)
- [Strict rate-limited API](#strict-rate-limited-api)

## Auth with automatic refresh

```typescript
let token = await login();

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.beforeRequest((req) => req.withHeader('Authorization', `Bearer ${token}`));

client.onError(async (err, req) => {
  if ((err as any).status === 401) {
    token = await refreshToken();
    return req.withHeader('Authorization', `Bearer ${token}`);
  }
});
```

- `beforeRequest` injects the token.
- `onError` refreshes and retries on 401.

## Large upload with progress + retry

```typescript
const fileStream = createReadStream('./big.zip');

const client = createClient({
  baseUrl: 'https://storage.example.com',
  retry: { maxAttempts: 4, backoff: 'exponential', jitter: true },
});

const res = await client.put('/uploads/big.zip', fileStream, {
  onUploadProgress: (p) => {
    console.log(`Sent ${p.percent?.toFixed(1)}% | ${p.rate ? (p.rate/1024).toFixed(1) : 0} KB/s`);
  },
});

console.log('Status', res.status);
```

- Backoff with jitter avoids thundering herd.
- `onUploadProgress` tracks bytes sent; combine with `retry` for flaky links.

## SSE/streaming with reconnect

```typescript
async function consume() {
  for await (const event of client.get('/chat/stream', { timeout: 30000 }).sse()) {
    if (event.data === '[DONE]') break;
    process.stdout.write(JSON.parse(event.data).delta || '');
  }
}

let attempts = 0;
while (attempts < 3) {
  try {
    await consume();
    break;
  } catch (err) {
    attempts++;
    await new Promise((r) => setTimeout(r, 500 * attempts)); // simple backoff
  }
}
```

- Reconnects if the stream drops; tune timeout/backoff for your upstream.

## Strict rate-limited API

```typescript
const client = createClient({
  baseUrl: 'https://api.rate-limited.com',
  rateLimit: { concurrency: 2, requestsPerInterval: 5, interval: 1000 },
  retry: {
    maxAttempts: 3,
    backoff: 'decorrelated',
    onRetry: ({ attempt, delay }) => console.log(`retry #${attempt} in ${delay}ms`)
  }
});

const { results } = await client.batch(
  [{ path: '/users/1' }, { path: '/users/2' }, { path: '/users/3' }],
  { mapResponse: (res) => res.json() }
);
```

- TaskPool caps cadence and fan-out; decorrelated retries help with 429/503.
- Use `batch` for batches; the pool takes precedence over local concurrency.
