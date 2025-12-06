# Retry Plugin

The **Retry** plugin implements automatic retries with exponential, linear, or decorrelated backoff, including jitter to prevent thundering herd.

## Quick Start

```typescript
import { createClient, retryPlugin } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(retryPlugin({
  maxAttempts: 3,
  backoff: 'exponential',
}));

// Automatically retries on failure
const data = await client.get('/unstable-endpoint').json();
```

## Configuration

```typescript
interface RetryOptions {
  // Maximum number of attempts (default: 3)
  maxAttempts?: number;

  // Initial delay in ms (default: 1000)
  delay?: number;

  // Maximum delay in ms (default: 30000)
  maxDelay?: number;

  // Backoff strategy (default: 'exponential')
  backoff?: 'linear' | 'exponential' | 'decorrelated';

  // Add jitter to prevent thundering herd (default: true)
  jitter?: boolean;

  // Status codes that should be retried
  statusCodes?: number[];

  // Custom function to decide whether to retry
  shouldRetry?: (error: unknown) => boolean;

  // Callback called on each retry
  onRetry?: (attempt: number, error: unknown, delay: number) => void;

  // Respect Retry-After header (default: true)
  respectRetryAfter?: boolean;
}
```

## Backoff Strategies

### Exponential (Recommended)

Delay grows exponentially: 1s → 2s → 4s → 8s...

```typescript
client.use(retryPlugin({
  backoff: 'exponential',
  delay: 1000,
  maxDelay: 30000,
}));

// Attempt 1: fails, waits ~1s
// Attempt 2: fails, waits ~2s
// Attempt 3: fails, waits ~4s
// Attempt 4: success!
```

### Linear

Delay grows linearly: 1s → 2s → 3s → 4s...

```typescript
client.use(retryPlugin({
  backoff: 'linear',
  delay: 1000,
}));
```

### Decorrelated (AWS Style)

Random delay between `delay` and `previousDelay * 3`. Used by AWS.

```typescript
client.use(retryPlugin({
  backoff: 'decorrelated',
  delay: 1000,
}));
```

## Jitter

Jitter adds ±25% randomness to the delay to prevent multiple clients from retrying simultaneously (thundering herd):

```typescript
// With jitter (default)
client.use(retryPlugin({
  delay: 1000,
  jitter: true, // delay will be between 750ms and 1250ms
}));

// Without jitter
client.use(retryPlugin({
  delay: 1000,
  jitter: false, // delay will be exactly 1000ms
}));
```

## Status Codes

By default, the plugin retries on network errors and timeouts. You can specify status codes:

```typescript
client.use(retryPlugin({
  statusCodes: [408, 429, 500, 502, 503, 504],
}));
```

## Retry-After Header

The plugin respects the `Retry-After` header from 429 (Too Many Requests) and 503 (Service Unavailable) responses:

```typescript
client.use(retryPlugin({
  respectRetryAfter: true, // default
}));

// If the server responds with:
// HTTP/1.1 429 Too Many Requests
// Retry-After: 60
//
// The plugin will wait 60 seconds before retrying
```

Supported formats:
- Seconds: `Retry-After: 120`
- HTTP-date: `Retry-After: Wed, 21 Oct 2025 07:28:00 GMT`

## Custom Retry Logic

```typescript
client.use(retryPlugin({
  shouldRetry: (error) => {
    // Only retry network errors
    if (error instanceof NetworkError) return true;

    // Only retry certain status codes
    if (error instanceof HttpError) {
      return [429, 503].includes(error.status);
    }

    return false;
  },
}));
```

## Retry Logging

```typescript
client.use(retryPlugin({
  onRetry: (attempt, error, delay) => {
    console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
    console.log(`Error: ${error.message}`);
  },
}));
```

## Examples

### Rate Limited API

```typescript
const client = createClient({
  baseUrl: 'https://api.github.com',
});

client.use(retryPlugin({
  maxAttempts: 5,
  backoff: 'exponential',
  statusCodes: [429, 503],
  respectRetryAfter: true,
  onRetry: (attempt, error, delay) => {
    console.log(`Rate limited, retry ${attempt} in ${delay}ms`);
  },
}));
```

### Resilient Microservices

```typescript
client.use(retryPlugin({
  maxAttempts: 3,
  delay: 500,
  backoff: 'decorrelated',
  jitter: true,
  statusCodes: [500, 502, 503, 504],
}));
```

### Retry Only Timeouts

```typescript
import { TimeoutError } from 'recker';

client.use(retryPlugin({
  maxAttempts: 2,
  delay: 2000,
  shouldRetry: (error) => error instanceof TimeoutError,
}));
```

## Combining with Other Plugins

Retry works well with other plugins:

```typescript
import { createClient, retryPlugin, circuitBreakerPlugin, cachePlugin } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

// Order matters! Circuit breaker should come before retry
client.use(circuitBreakerPlugin({ threshold: 5 }));
client.use(retryPlugin({ maxAttempts: 3 }));
client.use(cachePlugin({ ttl: 60000 }));
```

## Tips

1. **Use jitter** in environments with multiple clients
2. **Respect Retry-After** for well-behaved APIs
3. **Limit maxAttempts** to avoid infinite loops
4. **Use exponential backoff** for persistent failures
5. **Combine with Circuit Breaker** for complete protection
