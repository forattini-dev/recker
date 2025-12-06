# Resilience

Retry strategies, error handling, and fault tolerance.

## Retry Plugin

### Enable Retry

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    maxAttempts: 3
  }
});
```

### Retry Options

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    maxAttempts: 5,           // Total attempts (default: 3)
    delay: 1000,              // Initial delay in ms (default: 1000)
    maxDelay: 30000,          // Maximum delay cap (default: 30000)
    backoff: 'exponential',   // Strategy: 'linear' | 'exponential' | 'decorrelated'
    jitter: true,             // Add randomness (default: true)
    statusCodes: [429, 500, 502, 503, 504], // HTTP codes to retry
    respectRetryAfter: true,  // Honor Retry-After header (default: true)
    onRetry: (attempt, error, delay) => {
      console.log(`Retry ${attempt} in ${delay}ms: ${error.message}`);
    }
  }
});
```

## Backoff Strategies

### Linear Backoff

Delay increases linearly: `delay * attempt`

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    maxAttempts: 3,
    delay: 1000,
    backoff: 'linear'
  }
});

// Attempt 1: fails → wait 1000ms
// Attempt 2: fails → wait 2000ms
// Attempt 3: final attempt
```

### Exponential Backoff

Delay doubles each attempt: `2^attempt * delay`

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    maxAttempts: 5,
    delay: 1000,
    backoff: 'exponential'
  }
});

// Attempt 1: fails → wait 1000ms
// Attempt 2: fails → wait 2000ms
// Attempt 3: fails → wait 4000ms
// Attempt 4: fails → wait 8000ms
// Attempt 5: final attempt
```

### Decorrelated Backoff

AWS-style random delay to prevent thundering herd:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    maxAttempts: 5,
    delay: 1000,
    backoff: 'decorrelated'
  }
});

// Random delay between baseDelay and (previous delay * 3)
// Spreads retries across time
```

## Jitter

Jitter adds randomness (±25%) to prevent synchronized retries:

```typescript
// Enable jitter (default)
retry: {
  jitter: true  // Delays become 1000ms ± 250ms
}

// Disable jitter
retry: {
  jitter: false // Exact delay times
}
```

**Why jitter matters:**

Without jitter, if 1000 clients fail at the same time, they all retry at the exact same moment, potentially causing another failure cascade.

## Retry-After Header

Respect server's `Retry-After` header for rate limiting:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    maxAttempts: 5,
    respectRetryAfter: true // Default: true
  }
});

// When server responds with:
// HTTP 429 Too Many Requests
// Retry-After: 60
//
// Client waits 60 seconds before retry
```

The plugin supports both formats:
- Seconds: `Retry-After: 120`
- HTTP-date: `Retry-After: Wed, 21 Oct 2025 07:28:00 GMT`

## Custom Retry Logic

### Custom shouldRetry

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    maxAttempts: 3,
    shouldRetry: (error) => {
      // Retry on network errors
      if (error instanceof NetworkError) return true;

      // Retry on specific status codes
      if (error instanceof HttpError) {
        // Don't retry 4xx client errors (except 429)
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
          return false;
        }
        return true;
      }

      // Retry on connection reset
      if (error.code === 'ECONNRESET') return true;

      return false;
    }
  }
});
```

### Default Retry Conditions

By default, retry triggers for:

**Network Errors:**
- `ECONNRESET` - Connection reset
- `ETIMEDOUT` - Connection timeout
- `ENOTFOUND` - DNS resolution failed

**HTTP Status Codes:**
- `408` - Request Timeout
- `429` - Too Many Requests
- `500` - Internal Server Error
- `502` - Bad Gateway
- `503` - Service Unavailable
- `504` - Gateway Timeout

## Retry Hooks

### onRetry Callback

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    maxAttempts: 5,
    onRetry: (attempt, error, delay) => {
      console.log(`Retry attempt ${attempt}`);
      console.log(`Error: ${error.message}`);
      console.log(`Waiting ${delay}ms before retry`);

      // Report to monitoring
      metrics.increment('http.retry', {
        attempt,
        error: error.name,
        endpoint: error.request?.url
      });
    }
  }
});
```

### Global onRetry Hook

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: { maxAttempts: 3 },
  hooks: {
    onRetry: [
      (error, attempt, delay, req) => {
        console.log(`Global retry hook: ${req.url} attempt ${attempt}`);
      }
    ]
  }
});
```

## Timeout Configuration

### Simple Timeout

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  timeout: 30000 // 30 seconds
});
```

### Per-Phase Timeouts

Fine-grained control for precise failure detection:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  timeout: {
    lookup: 1000,        // DNS lookup (fast fail on DNS issues)
    connect: 5000,       // TCP connection
    secureConnect: 5000, // TLS handshake
    socket: 10000,       // Socket assignment from pool
    send: 10000,         // Request send
    response: 30000,     // Time to first byte (TTFB)
    request: 60000       // Total request time
  }
});
```

### Combining Retry with Timeout

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  timeout: 5000, // Each attempt has 5s timeout
  retry: {
    maxAttempts: 3,
    delay: 1000,
    backoff: 'exponential'
  }
});

// Total max time = 5s + 1s + 5s + 2s + 5s = 18s
// (attempt1 + delay1 + attempt2 + delay2 + attempt3)
```

## Error Types

Recker provides typed errors with rich context:

| Error Type | Fields | Retriable |
|------------|--------|-----------|
| `HttpError` | `status`, `statusText`, `response`, `suggestions` | Depends on status |
| `TimeoutError` | `phase`, `timeout`, `elapsed`, `suggestions` | Yes |
| `NetworkError` | `code` (ECONNRESET, ENOTFOUND), `suggestions` | Yes |
| `MaxSizeExceededError` | `maxSize`, `actualSize` | No |
| `GraphQLError` | `errors[]`, `response`, `suggestions` | Usually no |

All errors extend `ReckerError` with `suggestions` (actionable hints) and `retriable` flags.

## Error Handling Patterns

### Catch Specific Errors

```typescript
import { HttpError, NetworkError, TimeoutError } from 'recker';

try {
  await client.get('/api/data').json();
} catch (error) {
  if (error instanceof HttpError) {
    console.log(error.status);       // 404
    console.log(error.suggestions);  // actionable hints
    console.log(error.retriable);    // can I retry safely?

    switch (error.status) {
      case 401:
        await refreshToken();
        break;
      case 429:
        // Rate limited - wait and retry manually
        await sleep(60000);
        break;
      case 500:
        // Server error - already retried by plugin
        reportError(error);
        break;
    }
  } else if (error instanceof TimeoutError) {
    console.log(error.phase);    // 'connect' | 'response' | etc.
    console.log(error.elapsed);  // actual time before timeout
    console.log('Request took too long');
  } else if (error instanceof NetworkError) {
    console.log(error.code);     // ECONNRESET, ENOTFOUND, etc.
    console.log('Network issue:', error.code);
  }
}
```

### Fallback Responses

Using `onError` hook:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com'
});

client.onError((error, req) => {
  if (error instanceof TimeoutError) {
    // Return cached/default response
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ cached: true, data: getCachedData(req.url) })
    };
  }
  // Return void to rethrow
});
```

### Graceful Degradation

```typescript
async function fetchWithFallback(url: string) {
  try {
    return await client.get(url).json();
  } catch (error) {
    // Return default value
    console.warn(`Failed to fetch ${url}, using fallback`);
    return { default: true };
  }
}
```

### Safe Result Pattern

Avoid `try/catch` with `.safe()` - returns a tuple `[ok, error, data]`:

```typescript
interface User { name: string }

// No try-catch needed!
const [ok, err, user] = await client.get('/users/1').safe<User>();

if (!ok) {
  // 'err' is strictly typed as Error
  console.error('Failed to fetch user:', err);
  return;
}

// TypeScript knows 'user' is defined here
console.log(user.name);
```

**Why use `.safe()`:**
- **No hidden flow control** - Errors are values, not exceptions
- **Type safety** - Must handle error case before accessing data
- **Cleaner code** - Reduces `try/catch` indentation

### Disable Auto-Throw

Handle status codes manually:

```typescript
const res = await client.get('/users/1', { throwHttpErrors: false });

if (!res.ok) {
  console.log('Manual handling:', res.status);
}
```

## Circuit Breaker Pattern

Prevent cascading failures by stopping requests to failing services.

### State Machine

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ┌──────────┐    failures >= threshold    ┌──────────┐ │
│  │  CLOSED  │ ──────────────────────────> │   OPEN   │ │
│  │ (Normal) │                             │(Tripped) │ │
│  └──────────┘                             └──────────┘ │
│       ▲                                        │       │
│       │                                        │       │
│       │ success                   resetTimeout │       │
│       │                                        ▼       │
│       │              ┌───────────┐                     │
│       └───────────── │ HALF-OPEN │ ────────────┘       │
│         (test req)   │(Recovery) │    failure          │
│                      └───────────┘                     │
└─────────────────────────────────────────────────────────┘
```

- **CLOSED** (Normal): Requests pass through. Failures increment counter.
- **OPEN** (Tripped): Requests fail immediately with `CircuitBreakerError`.
- **HALF-OPEN** (Recovery): One test request allowed. Success closes circuit, failure reopens.

### Using the Plugin

```typescript
import { createClient, circuitBreakerPlugin } from 'recker';

const client = createClient({
  baseUrl: 'https://api.fragile-service.com',
  plugins: [
    circuitBreakerPlugin({
      threshold: 5,             // Trip after 5 failures
      resetTimeout: 30000,      // Wait 30s before testing
      shouldTrip: (err, res) => {
        // Customize what counts as a failure
        return res && res.status >= 500;
      },
      onStateChange: (state, service) => {
        console.log(`Circuit for ${service} is now ${state}`);
      }
    })
  ]
});
```

### Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `threshold` | `number` | `5` | Consecutive failures to open circuit |
| `resetTimeout` | `number` | `30000` | Time in OPEN before HALF-OPEN (ms) |
| `shouldTrip` | `fn` | `status >= 500` | Determine if response counts as failure |
| `onStateChange` | `fn` | `undefined` | Callback on state transitions |

### Handling Circuit Errors

```typescript
import { CircuitBreakerError } from 'recker/plugins';

try {
  await client.get('/data');
} catch (err) {
  if (err instanceof CircuitBreakerError) {
    // Service is known to be down, use cached data
    console.warn('Service unavailable, using fallback');
    return getCachedData();
  }
  throw err;
}
```

### Custom Implementation

For full control, implement manually:

```typescript
import { Plugin } from 'recker';

function circuitBreakerPlugin(options: {
  threshold: number;
  timeout: number;
}): Plugin {
  let failures = 0;
  let circuitState: 'closed' | 'open' | 'half-open' = 'closed';
  let lastFailure = 0;

  return (client) => {
    client.use(async (req, next) => {
      if (circuitState === 'open') {
        if (Date.now() - lastFailure > options.timeout) {
          circuitState = 'half-open';
        } else {
          throw new Error('Circuit breaker is open');
        }
      }

      try {
        const response = await next(req);
        if (circuitState === 'half-open') {
          circuitState = 'closed';
          failures = 0;
        }
        return response;
      } catch (error) {
        failures++;
        lastFailure = Date.now();
        if (failures >= options.threshold) {
          circuitState = 'open';
        }
        throw error;
      }
    });
  };
}

## Rate Limiting Awareness

### Client-Side Rate Limiting

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  concurrency: {
    max: 10,
    requestsPerInterval: 100,  // Max 100 requests
    interval: 1000             // Per second
  }
});
```

### Handle 429 Responses

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    maxAttempts: 5,
    statusCodes: [429],        // Only retry rate limits
    respectRetryAfter: true,   // Use server's suggested delay
    maxDelay: 120000           // Cap at 2 minutes
  }
});
```

## Advanced Patterns

### Retry Budget

Limit total retry time instead of attempt count:

```typescript
function retryWithBudget(budgetMs: number) {
  const startTime = Date.now();

  return retryPlugin({
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

### Idempotency Keys

Enable safe retries for mutations:

```typescript
const client = createClient({
  plugins: [
    retryPlugin({
      maxAttempts: 3,
      shouldRetry: (error, request) => {
        // Only retry mutations with idempotency key
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

### Per-Request Retry Override

```typescript
// Global retry config
const client = createClient({
  plugins: [retryPlugin({ maxAttempts: 3 })]
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

### Circuit Breaker + Retry

Combine for comprehensive resilience:

```typescript
import { createClient, retryPlugin, circuitBreakerPlugin } from 'recker';

const client = createClient({
  plugins: [
    // Circuit breaker first - fails fast when service is down
    circuitBreakerPlugin({
      threshold: 5,
      resetTimeout: 30000
    }),
    // Retry only if circuit is closed
    retryPlugin({
      maxAttempts: 3,
      backoff: 'exponential'
    })
  ]
});
```

## When NOT to Retry

### Client Errors (4xx)

Don't retry validation or authentication errors:

```typescript
retryPlugin({
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

// GOOD: Use idempotency key
await client.post('/orders', {
  json: order,
  headers: { 'Idempotency-Key': orderId }
});
```

### Time-Sensitive Operations

```typescript
retryPlugin({
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

## Resilience Best Practices

### 1. Always Set Timeouts

```typescript
// Never rely on default/infinite timeouts
const client = createClient({
  baseUrl: 'https://api.example.com',
  timeout: 30000
});
```

### 2. Use Exponential Backoff

```typescript
retry: {
  backoff: 'exponential',
  jitter: true
}
```

### 3. Cap Maximum Delay

```typescript
retry: {
  maxDelay: 30000 // Don't wait more than 30s
}
```

### 4. Limit Total Attempts

```typescript
retry: {
  maxAttempts: 3 // Fail fast, don't retry forever
}
```

### 5. Monitor Retries

```typescript
retry: {
  onRetry: (attempt, error, delay) => {
    metrics.increment('retry', { attempt, error: error.name });
  }
}
```

### 6. Consider Idempotency

Only retry idempotent operations safely:

```typescript
// Safe to retry
await client.get('/users');
await client.put('/users/1', { json: userData });

// Potentially unsafe to retry
await client.post('/orders', { json: orderData });
// Consider implementing idempotency keys
```

## Next Steps

- **[Concurrency](08-concurrency.md)** - Batch requests, rate limiting
- **[Caching](09-cache.md)** - Response caching strategies
- **[Plugins](10-plugins.md)** - Plugin architecture
