# Retry & Backoff

Recker includes a sophisticated retry system with multiple backoff strategies, jitter support, and Retry-After header compliance.

## Quick Start

```typescript
import { createClient, retry } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [
    retry({
      maxAttempts: 3,
      backoff: 'exponential',
      jitter: true
    })
  ]
});
```

## Configuration Options

### Full Options Reference

```typescript
interface RetryOptions {
  // Maximum number of attempts including first try (default: 3)
  // e.g., 3 = 1 initial try + 2 retries
  maxAttempts?: number;

  // Initial delay in milliseconds (default: 1000)
  delay?: number;

  // Maximum delay cap in milliseconds (default: 30000)
  maxDelay?: number;

  // Backoff strategy (default: 'exponential')
  backoff?: 'linear' | 'exponential' | 'decorrelated';

  // Add randomness to prevent thundering herd (default: true)
  jitter?: boolean;

  // HTTP status codes to retry (default: [408, 429, 500, 502, 503, 504])
  statusCodes?: number[];

  // Custom function to determine if error is retryable
  shouldRetry?: (error: unknown) => boolean;

  // Callback invoked on each retry attempt
  onRetry?: (attempt: number, error: unknown, delay: number) => void;

  // Respect Retry-After header from 429/503 responses (default: true)
  respectRetryAfter?: boolean;
}
```

## Backoff Strategies

### Linear Backoff

Fixed step increase: delay × attempt

```typescript
retry({ backoff: 'linear', delay: 1000 })

// Attempt 1: 1000ms
// Attempt 2: 2000ms
// Attempt 3: 3000ms
// Attempt 4: 4000ms
```

**Best for:**
- Consistent, predictable delays
- Services with strict rate limits
- When you want simple, understandable behavior

### Exponential Backoff (Default)

Doubles each failure: 2^(attempt-1) × delay

```typescript
retry({ backoff: 'exponential', delay: 1000 })

// Attempt 1: 1000ms
// Attempt 2: 2000ms
// Attempt 3: 4000ms
// Attempt 4: 8000ms
```

**Best for:**
- Most general use cases
- Balancing quick retries with preventing overload
- APIs that may need time to recover

### Decorrelated (AWS Style)

Randomized within a growing window, inspired by AWS's recommendation.

```typescript
retry({ backoff: 'decorrelated', delay: 1000 })

// Attempt 1: random between 1000ms and 3000ms
// Attempt 2: random between 1000ms and 6000ms
// Attempt 3: random between 1000ms and 12000ms
```

**Best for:**
- Distributed systems with many clients
- Preventing synchronized retry storms
- High-scale microservices

## Jitter

Jitter adds ±25% randomness to prevent thundering herd:

```typescript
// Without jitter: all clients retry at exactly 4000ms
// With jitter: clients retry between 3000ms and 5000ms

retry({
  backoff: 'exponential',
  jitter: true  // default
})
```

### Visualizing Jitter Effect

```
Without Jitter (Synchronized):
Time 0s    Time 4s    Time 8s
   ↓          ↓          ↓
[All 1000 clients hit server simultaneously]

With Jitter (Spread):
Time 0s    Time 3-5s    Time 6-10s
   ↓          ↓            ↓
[Clients spread across 2 second window]
```

## Delay Capping

Use `maxDelay` to cap exponential growth:

```typescript
retry({
  backoff: 'exponential',
  delay: 1000,
  maxDelay: 30000  // Never wait more than 30 seconds
})

// Attempt 1: 1000ms
// Attempt 2: 2000ms
// Attempt 3: 4000ms
// Attempt 4: 8000ms
// Attempt 5: 16000ms
// Attempt 6: 30000ms (capped)
// Attempt 7: 30000ms (capped)
```

## Retry-After Header

Recker respects the `Retry-After` header from 429/503 responses:

```typescript
retry({
  respectRetryAfter: true  // default
})

// Server responds:
// HTTP/1.1 429 Too Many Requests
// Retry-After: 60

// Recker waits 60 seconds before retrying
```

Supports both formats:
- Seconds: `Retry-After: 120`
- HTTP-date: `Retry-After: Wed, 21 Oct 2025 07:28:00 GMT`

### Overriding Retry-After

```typescript
retry({
  respectRetryAfter: false,  // Ignore header, use backoff
  // or
  maxDelay: 10000  // Cap header value to 10 seconds
})
```

## Status Codes

Default retryable status codes:

- `408` Request Timeout
- `429` Too Many Requests
- `500` Internal Server Error
- `502` Bad Gateway
- `503` Service Unavailable
- `504` Gateway Timeout

### Custom Status Codes

```typescript
// Only retry on 503
retry({
  statusCodes: [503]
})

// Add 520-527 (Cloudflare errors)
retry({
  statusCodes: [408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527]
})
```

## Error Types

Recker automatically retries on these error types:

- `NetworkError` - Connection failures (ECONNRESET, ENOTFOUND)
- `TimeoutError` - Request timeout
- `HttpError` - HTTP errors matching `statusCodes`

### Custom Retry Logic

```typescript
import { retry, HttpError, NetworkError, GraphQLError } from 'recker';

retry({
  shouldRetry: (error) => {
    // Never retry GraphQL errors (business logic failures)
    if (error instanceof GraphQLError) {
      return false;
    }

    // Always retry network errors
    if (error instanceof NetworkError) {
      return true;
    }

    // Only retry specific HTTP errors
    if (error instanceof HttpError) {
      // Don't retry 4xx client errors (except 429)
      if (error.status >= 400 && error.status < 500 && error.status !== 429) {
        return false;
      }
      return true;
    }

    return false;
  }
})
```

### Conditional Retry by Request

```typescript
retry({
  shouldRetry: (error, request) => {
    // Don't retry POST/PUT/DELETE (non-idempotent)
    if (['POST', 'PUT', 'DELETE'].includes(request?.method)) {
      return false;
    }

    // Only retry GET/HEAD
    return error instanceof NetworkError || error instanceof TimeoutError;
  }
})
```

## onRetry Callback

Track retries for logging, metrics, or alerts:

```typescript
retry({
  maxAttempts: 5,
  onRetry: (attempt, error, delay) => {
    console.warn(`[Retry ${attempt}/5] ${error.message} - waiting ${delay}ms`);

    // Send to monitoring
    metrics.increment('http.retry', {
      attempt,
      error: error.name,
      delay
    });

    // Alert on excessive retries
    if (attempt >= 3) {
      alerting.warn(`Request required ${attempt} retries`);
    }
  }
})
```

### Dynamic Delay Adjustment

```typescript
let dynamicDelay = 1000;

retry({
  delay: 1000,
  onRetry: (attempt, error, delay) => {
    // If server is overloaded, back off more aggressively
    if (error instanceof HttpError && error.status === 503) {
      dynamicDelay = Math.min(dynamicDelay * 3, 60000);
    }
  }
})
```

## Advanced Patterns

### Retry Budget

Limit total retry time instead of attempt count:

```typescript
function retryWithBudget(budgetMs: number) {
  const startTime = Date.now();

  return retry({
    maxAttempts: Infinity,
    shouldRetry: (error) => {
      const elapsed = Date.now() - startTime;
      const remainingBudget = budgetMs - elapsed;

      // Stop if budget exhausted
      if (remainingBudget <= 0) {
        return false;
      }

      // Standard retry logic
      return error instanceof NetworkError || error instanceof TimeoutError;
    }
  });
}

// Give up after 30 seconds total
const client = createClient({
  plugins: [retryWithBudget(30000)]
});
```

### Circuit Breaker Integration

Combine retry with circuit breaker for resilience:

```typescript
import { createClient, retry, circuitBreaker } from 'recker';

const client = createClient({
  plugins: [
    // Circuit breaker first - fails fast when service is down
    circuitBreaker({
      threshold: 5,
      resetTimeout: 30000
    }),
    // Retry only if circuit is closed
    retry({
      maxAttempts: 3,
      backoff: 'exponential'
    })
  ]
});
```

### Per-Request Retry Override

```typescript
// Global retry config
const client = createClient({
  plugins: [
    retry({ maxAttempts: 3 })
  ]
});

// Disable retry for specific request
await client.get('/critical-operation', {
  retry: false
});

// Override retry count
await client.get('/flaky-endpoint', {
  retry: { maxAttempts: 5 }
});
```

### Idempotency Keys

For safe retries of mutations:

```typescript
const client = createClient({
  plugins: [
    retry({
      maxAttempts: 3,
      // Only retry mutations with idempotency key
      shouldRetry: (error, request) => {
        if (request?.method === 'POST') {
          return !!request.headers.get('Idempotency-Key');
        }
        return true;
      }
    })
  ]
});

// Safe to retry - has idempotency key
await client.post('/payments', {
  json: { amount: 100 },
  headers: {
    'Idempotency-Key': crypto.randomUUID()
  }
});
```

### Retry with Fallback

```typescript
async function fetchWithFallback(primaryUrl: string, fallbackUrl: string) {
  try {
    return await client.get(primaryUrl, {
      retry: { maxAttempts: 2, delay: 500 }
    }).json();
  } catch (error) {
    console.warn('Primary failed, trying fallback');
    return await client.get(fallbackUrl, {
      retry: { maxAttempts: 3, delay: 1000 }
    }).json();
  }
}
```

## Common Patterns

### Rate-Limited API

```typescript
retry({
  maxAttempts: 5,
  statusCodes: [429],
  respectRetryAfter: true,
  maxDelay: 60000,
  onRetry: (attempt, error, delay) => {
    if (error instanceof HttpError && error.status === 429) {
      console.log(`Rate limited, waiting ${delay}ms`);
    }
  }
})
```

### Flaky Network

```typescript
retry({
  maxAttempts: 5,
  backoff: 'exponential',
  delay: 500,
  jitter: true,
  shouldRetry: (error) => {
    if (error instanceof NetworkError) {
      return ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(error.code);
    }
    return false;
  }
})
```

### Microservices

```typescript
retry({
  maxAttempts: 3,
  backoff: 'decorrelated',
  delay: 100,
  maxDelay: 5000,
  statusCodes: [502, 503, 504],
  jitter: true
})
```

## When NOT to Retry

### Client Errors (4xx)

Don't retry validation or authentication errors:

```typescript
retry({
  statusCodes: [408, 429, 500, 502, 503, 504],
  shouldRetry: (error) => {
    if (error instanceof HttpError) {
      // Never retry 400, 401, 403, 404, 422
      if (error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) {
        return false;
      }
    }
    return true;
  }
})
```

### Non-Idempotent Operations

```typescript
// BAD: Could create duplicate orders
await client.post('/orders', { json: order });

// GOOD: Use idempotency key or disable retry
await client.post('/orders', {
  json: order,
  headers: { 'Idempotency-Key': orderId },
  retry: { maxAttempts: 3 }
});
```

### Time-Sensitive Operations

```typescript
retry({
  maxAttempts: 2,
  delay: 100,
  maxDelay: 500,
  shouldRetry: (error, request) => {
    // Don't retry if request already took too long
    if (Date.now() - request.startTime > 5000) {
      return false;
    }
    return true;
  }
})
```

## Best Practices

1. **Start conservative** - Begin with 3 attempts and adjust based on metrics
2. **Use exponential backoff** - Prevents overwhelming recovering services
3. **Enable jitter** - Essential for distributed systems
4. **Set maxDelay** - Prevent unbounded waits
5. **Log retries** - Track patterns and identify flaky dependencies
6. **Respect Retry-After** - Be a good API citizen
7. **Combine with circuit breaker** - Fail fast when service is down
8. **Use idempotency keys** - Enable safe mutation retries
