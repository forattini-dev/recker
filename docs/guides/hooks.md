# Hooks

Recker provides a lightweight hooks system for cross-cutting concerns without the complexity of full middleware. Hooks are perfect for logging, authentication, metrics, and error handling.

## Quick Start

```typescript
import { createClient } from 'recker';

const client = createClient({ baseUrl: 'https://api.example.com' });

client
  .beforeRequest((req) => req.withHeader('X-Request-ID', crypto.randomUUID()))
  .afterResponse((req, res) => {
    console.log(`[${res.status}] ${req.method} ${req.url}`);
    return res;
  })
  .onError((error) => {
    console.error('Request failed:', error.message);
  });
```

## Hooks vs Middleware

| Feature | Hooks | Middleware |
|---------|-------|------------|
| Complexity | Simple functions | Onion model with `next()` |
| Control flow | Sequential | Full control |
| Error handling | Via `onError` | Try/catch around `next()` |
| Response access | After completion | During execution |
| Chainable | Yes | No |
| Use case | Cross-cutting concerns | Complex transformations |

**Use Hooks when:**
- Adding headers to all requests
- Logging requests/responses
- Simple auth token injection
- Metrics collection
- Error monitoring

**Use Middleware when:**
- Need to wrap the entire request/response cycle
- Complex retry logic with custom backoff
- Response caching with conditional logic
- Request/response transformation pipelines

---

## beforeRequest

Transform or enhance requests before they're sent.

```typescript
type BeforeRequestHook = (req: ReckerRequest) =>
  ReckerRequest | void | Promise<ReckerRequest | void>;
```

### Basic Usage

```typescript
// Add header to all requests
client.beforeRequest((req) => {
  return req.withHeader('X-Client-Version', '1.0.0');
});

// The hook runs before every request
await client.get('/users');  // Has X-Client-Version header
await client.post('/data');  // Has X-Client-Version header
```

### Common Patterns

#### Request ID Tracking

```typescript
client.beforeRequest((req) => {
  const requestId = crypto.randomUUID();
  console.log(`→ [${requestId}] ${req.method} ${req.url}`);
  return req.withHeader('X-Request-ID', requestId);
});
```

#### Dynamic Authentication

```typescript
import { getAccessToken, refreshToken, isTokenExpired } from './auth';

client.beforeRequest(async (req) => {
  let token = getAccessToken();

  // Refresh if expired
  if (isTokenExpired(token)) {
    token = await refreshToken();
  }

  return req.withHeader('Authorization', `Bearer ${token}`);
});
```

#### Conditional Headers

```typescript
client.beforeRequest((req) => {
  // Only add API key for certain paths
  if (req.url.includes('/api/v2')) {
    return req.withHeader('X-API-Key', process.env.API_KEY);
  }
  // Return void to keep request unchanged
});
```

#### Request Timing

```typescript
const requestStartTimes = new Map<string, number>();

client.beforeRequest((req) => {
  requestStartTimes.set(req.url, Date.now());
});
```

#### Content Negotiation

```typescript
client.beforeRequest((req) => {
  // Request JSON by default
  if (!req.headers.has('Accept')) {
    return req.withHeader('Accept', 'application/json');
  }
});
```

---

## afterResponse

Process responses after they complete successfully.

```typescript
type AfterResponseHook = (req: ReckerRequest, res: ReckerResponse) =>
  ReckerResponse | void | Promise<ReckerResponse | void>;
```

### Basic Usage

```typescript
client.afterResponse((req, res) => {
  console.log(`← [${res.status}] ${req.method} ${req.url}`);
  return res; // Return response (modified or original)
});
```

### Common Patterns

#### Response Logging

```typescript
client.afterResponse((req, res) => {
  const duration = res.timings?.total || 0;
  console.log(
    `[${new Date().toISOString()}] ${res.status} ${req.method} ${req.url} (${duration}ms)`
  );
  return res;
});
```

#### Metrics Collection

```typescript
import { metrics } from './monitoring';

client.afterResponse((req, res) => {
  metrics.histogram('http_request_duration_seconds', res.timings?.total / 1000, {
    method: req.method,
    path: new URL(req.url).pathname,
    status: res.status.toString()
  });

  metrics.counter('http_requests_total', 1, {
    method: req.method,
    status: res.status.toString()
  });

  return res;
});
```

#### Header Extraction

```typescript
let rateLimitRemaining = Infinity;

client.afterResponse((req, res) => {
  const remaining = res.headers.get('X-RateLimit-Remaining');
  if (remaining) {
    rateLimitRemaining = parseInt(remaining, 10);
    console.log(`Rate limit remaining: ${rateLimitRemaining}`);
  }
  return res;
});
```

#### Response Timing (paired with beforeRequest)

```typescript
const requestStartTimes = new Map<string, number>();

client
  .beforeRequest((req) => {
    requestStartTimes.set(req.url, Date.now());
  })
  .afterResponse((req, res) => {
    const startTime = requestStartTimes.get(req.url);
    if (startTime) {
      const duration = Date.now() - startTime;
      console.log(`${req.method} ${req.url} took ${duration}ms`);
      requestStartTimes.delete(req.url);
    }
    return res;
  });
```

#### Response Caching Notification

```typescript
client.afterResponse((req, res) => {
  const cacheStatus = res.headers.get('X-Cache');
  if (cacheStatus === 'HIT') {
    console.log(`Cache hit for ${req.url}`);
  }
  return res;
});
```

#### Transform Response Headers

```typescript
client.afterResponse((req, res) => {
  // Add custom header to response
  const modifiedResponse = new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: new Headers(res.headers)
  });
  modifiedResponse.headers.set('X-Processed-At', new Date().toISOString());
  return modifiedResponse as ReckerResponse;
});
```

---

## onError

Handle errors and optionally provide fallback responses.

```typescript
type OnErrorHook = (error: Error, req: ReckerRequest) =>
  ReckerResponse | void | Promise<ReckerResponse | void>;
```

### Basic Usage

```typescript
client.onError((error, req) => {
  console.error(`Request failed: ${req.method} ${req.url}`, error.message);
  // Return void to rethrow the error
});
```

### Common Patterns

#### Error Logging

```typescript
import { logger } from './logger';

client.onError((error, req) => {
  logger.error({
    type: 'http_error',
    method: req.method,
    url: req.url,
    error: error.message,
    stack: error.stack
  });
});
```

#### Error Monitoring (Sentry, DataDog)

```typescript
import * as Sentry from '@sentry/node';

client.onError((error, req) => {
  Sentry.captureException(error, {
    tags: {
      http_method: req.method,
      http_url: req.url
    },
    extra: {
      request_headers: Object.fromEntries(req.headers.entries())
    }
  });
});
```

#### Fallback Response

```typescript
client.onError((error, req) => {
  // Return fallback for 503 Service Unavailable
  if (error.status === 503) {
    return new Response(JSON.stringify({
      error: 'Service temporarily unavailable',
      fallback: true,
      retryAfter: 60
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }) as ReckerResponse;
  }
  // Return void to rethrow other errors
});
```

#### Maintenance Mode Detection

```typescript
client.onError((error, req) => {
  if (error.status === 503) {
    const retryAfter = error.response?.headers.get('Retry-After');
    if (retryAfter) {
      return new Response(JSON.stringify({
        maintenance: true,
        availableAt: new Date(Date.now() + parseInt(retryAfter) * 1000)
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }) as ReckerResponse;
    }
  }
});
```

#### Circuit Breaker Pattern

```typescript
const circuitBreaker = {
  failures: 0,
  lastFailure: 0,
  threshold: 5,
  resetTimeout: 30000,

  isOpen() {
    if (this.failures >= this.threshold) {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.failures = 0;
        return false;
      }
      return true;
    }
    return false;
  },

  recordFailure() {
    this.failures++;
    this.lastFailure = Date.now();
  },

  reset() {
    this.failures = 0;
  }
};

client
  .beforeRequest((req) => {
    if (circuitBreaker.isOpen()) {
      throw new Error('Circuit breaker is open');
    }
    return req;
  })
  .afterResponse((req, res) => {
    circuitBreaker.reset();
    return res;
  })
  .onError((error, req) => {
    circuitBreaker.recordFailure();
    console.log(`Circuit breaker: ${circuitBreaker.failures}/${circuitBreaker.threshold} failures`);
  });
```

---

## Hook Execution Order

```
Request Flow:

1. beforeRequest[0]     ──┐
2. beforeRequest[1]       │ Transform request
3. beforeRequest[N]     ──┘
         │
         ▼
    [HTTP Request]
         │
         ▼
┌── Success ───────────────────────┐
│                                  │
│  4. afterResponse[0]    ──┐      │
│  5. afterResponse[1]      │      │
│  6. afterResponse[N]    ──┘      │
│           │                      │
│           ▼                      │
│      [Response]                  │
│                                  │
└──────────────────────────────────┘

┌── Error ─────────────────────────┐
│                                  │
│  4. onError[0]  ──┐              │
│  5. onError[1]    │ First hook   │
│  6. onError[N]  ──┘ to return    │
│          │         Response wins │
│          ▼                       │
│   [Fallback or Rethrow]          │
│                                  │
└──────────────────────────────────┘
```

### Multiple Hooks

```typescript
client
  // First: Add request ID
  .beforeRequest((req) => {
    return req.withHeader('X-Request-ID', crypto.randomUUID());
  })
  // Second: Add auth
  .beforeRequest((req) => {
    return req.withHeader('Authorization', `Bearer ${token}`);
  })
  // Third: Log request
  .beforeRequest((req) => {
    console.log(`→ ${req.method} ${req.url}`);
  });

// Hooks execute in registration order:
// 1. Add X-Request-ID
// 2. Add Authorization
// 3. Log (no modification)
```

---

## Configuration via Options

Hooks can be configured during client creation:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  hooks: {
    beforeRequest: [
      (req) => req.withHeader('X-Client', 'MyApp'),
      (req) => req.withHeader('Authorization', `Bearer ${token}`)
    ],
    afterResponse: [
      (req, res) => {
        console.log(`${res.status} ${req.url}`);
        return res;
      }
    ],
    onError: [
      (error, req) => {
        console.error(`Error: ${error.message}`);
      }
    ]
  }
});
```

---

## AI-First Patterns

### Token Usage Tracking

```typescript
client.afterResponse((req, res) => {
  // Track OpenAI token usage
  if (req.url.includes('openai.com')) {
    const usage = res.headers.get('X-Request-Tokens');
    if (usage) {
      console.log(`Tokens used: ${usage}`);
    }
  }
  return res;
});
```

### Streaming Response Detection

```typescript
client.afterResponse((req, res) => {
  const contentType = res.headers.get('Content-Type');
  if (contentType?.includes('text/event-stream')) {
    console.log('SSE stream started for:', req.url);
  }
  return res;
});
```

### Model Fallback

```typescript
client.onError(async (error, req) => {
  // Fallback to different model on rate limit
if (error.status === 429 && req.url.includes('gpt-5')) {
  console.log('GPT-5 rate limited, falling back to GPT-5-mini');
  const fallbackReq = req.withUrl(req.url.replace('gpt-5', 'gpt-5-mini'));
  return client.request(fallbackReq.url, { ...fallbackReq.options, headers: fallbackReq.headers });
}
});
```

---

## Best Practices

### 1. Keep Hooks Focused

```typescript
// Good: Single responsibility
client
  .beforeRequest(addRequestId)
  .beforeRequest(addAuthentication)
  .afterResponse(logResponse)
  .afterResponse(trackMetrics);

// Avoid: Too much in one hook
client.beforeRequest((req) => {
  // Add ID, auth, log, validate, transform...
});
```

### 2. Return Responses in afterResponse

```typescript
// Good: Always return response
client.afterResponse((req, res) => {
  console.log(res.status);
  return res;  // Important!
});

// Works but less explicit
client.afterResponse((req, res) => {
  console.log(res.status);
  // Implicitly returns void, response unchanged
});
```

### 3. Handle Async Properly

```typescript
// Good: Async hook
client.beforeRequest(async (req) => {
  const token = await getToken();
  return req.withHeader('Authorization', `Bearer ${token}`);
});

// Avoid: Fire and forget
client.beforeRequest((req) => {
  refreshTokenInBackground();  // Won't wait!
  return req.withHeader('Authorization', `Bearer ${cachedToken}`);
});
```

### 4. Error Hooks: Return or Rethrow

```typescript
// Provide fallback
client.onError((error, req) => {
  if (shouldUseFallback(error)) {
    return createFallbackResponse();
  }
  // Return void to rethrow
});

// Always log, never swallow
client.onError((error, req) => {
  logError(error, req);
  // Error will be rethrown
});
```

### 5. Use TypeScript for Safety

```typescript
import type { ReckerRequest, ReckerResponse } from 'recker';

const logHook = (req: ReckerRequest, res: ReckerResponse): ReckerResponse => {
  console.log(`${res.status} ${req.url}`);
  return res;
};

client.afterResponse(logHook);
```

---

## Debugging Hooks

### Enable Debug Mode

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  debug: true  // Logs all hook activity
});
```

### Manual Hook Tracing

```typescript
function traced<T extends (...args: any[]) => any>(name: string, fn: T): T {
  return ((...args: any[]) => {
    console.log(`[Hook:${name}] Start`);
    const result = fn(...args);
    console.log(`[Hook:${name}] End`);
    return result;
  }) as T;
}

client
  .beforeRequest(traced('auth', addAuthHeader))
  .afterResponse(traced('log', logResponse));
```
