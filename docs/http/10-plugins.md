# Plugins

Plugin architecture, built-in plugins, and creating custom plugins.

## Plugin System

Plugins are functions that configure the client with middleware, hooks, or other behavior.

### Plugin Interface

```typescript
type Plugin = (client: Client) => void;
```

### Middleware vs Hooks

There are two mechanisms to extend Recker:

| Mechanism | Use Case | Execution Model |
|-----------|----------|-----------------|
| **Middleware** | Control request flow, wrap execution, retry, short-circuit | Onion model (wraps `next()`) |
| **Hooks** | React to events, lightweight mutations | Sequential callbacks |

**Use Middleware when you need to:**
- Modify request before dispatch
- Modify response after receipt
- Retry requests
- Short-circuit (return response without network)
- Wrap the entire execution

**Use Hooks when you need to:**
- React to specific lifecycle events
- Perform lightweight mutations
- Log or collect metrics
- Not wrap the entire stack

### Using Plugins

```typescript
import { createClient } from 'recker';
import { myPlugin, anotherPlugin } from './plugins';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [myPlugin(), anotherPlugin({ option: 'value' })]
});
```

## Built-in Plugins

### Retry Plugin

Automatic retry with exponential backoff:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    maxAttempts: 3,
    delay: 1000,
    backoff: 'exponential',
    jitter: true,
    statusCodes: [429, 500, 502, 503, 504],
    onRetry: (attempt, error, delay) => {
      console.log(`Retry ${attempt} in ${delay}ms`);
    }
  }
});
```

### Cache Plugin

Response caching with multiple strategies:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    strategy: 'cache-first',
    ttl: 60000,
    driver: 'memory'
  }
});
```

### Dedup Plugin

Deduplicate concurrent identical requests:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dedup: {
    enabled: true
  }
});

// These share one HTTP request
const [a, b, c] = await Promise.all([
  client.get('/users').json(),
  client.get('/users').json(),
  client.get('/users').json()
]);
```

## Creating Custom Plugins

### Basic Plugin

```typescript
import { Plugin, Middleware } from 'recker';

function loggingPlugin(): Plugin {
  return (client) => {
    client.beforeRequest((req) => {
      console.log(`→ ${req.method} ${req.url}`);
    });

    client.afterResponse((req, res) => {
      console.log(`← ${res.status} ${req.url}`);
    });
  };
}

// Usage
const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [loggingPlugin()]
});
```

### Plugin with Options

```typescript
interface AuthPluginOptions {
  token: string;
  refreshToken?: () => Promise<string>;
}

function authPlugin(options: AuthPluginOptions): Plugin {
  let currentToken = options.token;

  return (client) => {
    client.beforeRequest(async (req) => {
      return req.withHeader('Authorization', `Bearer ${currentToken}`);
    });

    client.onError(async (error, req) => {
      if (error instanceof HttpError && error.status === 401) {
        if (options.refreshToken) {
          currentToken = await options.refreshToken();
          // Retry with new token
          return client.request(req.url, {
            method: req.method,
            headers: { 'Authorization': `Bearer ${currentToken}` }
          });
        }
      }
    });
  };
}

// Usage
const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [
    authPlugin({
      token: 'initial-token',
      refreshToken: async () => {
        const response = await fetch('/auth/refresh');
        const data = await response.json();
        return data.token;
      }
    })
  ]
});
```

### Plugin with Middleware

```typescript
function timingPlugin(): Plugin {
  return (client) => {
    const middleware: Middleware = async (req, next) => {
      const start = performance.now();

      try {
        const response = await next(req);
        const duration = performance.now() - start;

        console.log(`${req.method} ${req.url} - ${duration.toFixed(2)}ms`);

        return response;
      } catch (error) {
        const duration = performance.now() - start;
        console.log(`${req.method} ${req.url} - FAILED ${duration.toFixed(2)}ms`);
        throw error;
      }
    };

    client.use(middleware);
  };
}
```

## Plugin Patterns

### Metrics Collection

```typescript
function metricsPlugin(metrics: MetricsClient): Plugin {
  return (client) => {
    client.afterResponse((req, res) => {
      metrics.histogram('http_request_duration', res.timings?.total || 0, {
        method: req.method,
        status: res.status,
        host: new URL(req.url).host
      });

      metrics.increment('http_requests_total', {
        method: req.method,
        status: res.status
      });
    });

    client.onError((error, req) => {
      metrics.increment('http_errors_total', {
        method: req.method,
        error: error.name
      });
    });
  };
}
```

### Request ID Injection

```typescript
function requestIdPlugin(): Plugin {
  return (client) => {
    client.beforeRequest((req) => {
      const requestId = crypto.randomUUID();
      return req
        .withHeader('X-Request-ID', requestId)
        .withHeader('X-Correlation-ID', getCorrelationId());
    });
  };
}
```

### Response Transformation

```typescript
function unwrapPlugin(): Plugin {
  return (client) => {
    client.afterResponse(async (req, res) => {
      // Unwrap API response wrapper
      // { success: true, data: { ... } } → { ... }
      const original = res.raw.clone();
      const json = await original.json();

      if (json.success && json.data) {
        const modified = new Response(JSON.stringify(json.data), {
          status: res.status,
          headers: res.headers
        });
        return new HttpResponse(modified);
      }

      return res;
    });
  };
}
```

### Rate Limiting

```typescript
function rateLimitPlugin(options: {
  requestsPerSecond: number;
}): Plugin {
  const queue: Array<() => void> = [];
  let tokens = options.requestsPerSecond;

  setInterval(() => {
    tokens = Math.min(tokens + 1, options.requestsPerSecond);
    if (queue.length > 0 && tokens > 0) {
      tokens--;
      queue.shift()!();
    }
  }, 1000 / options.requestsPerSecond);

  return (client) => {
    client.use(async (req, next) => {
      if (tokens > 0) {
        tokens--;
        return next(req);
      }

      await new Promise<void>((resolve) => queue.push(resolve));
      return next(req);
    });
  };
}
```

### Response Mocking (Short-Circuit)

Return fake responses without hitting the network:

```typescript
import { Plugin, Middleware, HttpResponse } from 'recker';

function mockRoute(path: string, json: any): Plugin {
  const mockMiddleware: Middleware = async (req, next) => {
    if (req.url.endsWith(path)) {
      // Short-circuit! DO NOT call next(req)
      const fakeResponse = new Response(JSON.stringify(json), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      return new HttpResponse(fakeResponse);
    }

    // Not our route, pass it on
    return next(req);
  };

  return (client) => client.use(mockMiddleware);
}

// Usage
const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [
    mockRoute('/users/1', { id: 1, name: 'Mock User' })
  ]
});

// Returns mock data, no network request
const user = await client.get('/users/1').json();
```

## Network Hooks

Low-level hooks for observability and metrics collection. These hooks are zero-overhead when not registered.

### Available Network Hooks

| Hook | Fires When | Info Object |
|------|------------|-------------|
| `onDnsLookup` | DNS resolution complete | `{ hostname, address, duration }` |
| `onTcpConnect` | TCP connection established | `{ host, port, duration }` |
| `onTlsHandshake` | TLS handshake complete | `{ protocol, cipher, duration }` |
| `onRequestSent` | Request fully sent | `{ method, url, bodySize }` |
| `onResponseStart` | First byte received | `{ status, headers }` |

### Low-Level Metrics Collection

```typescript
function metricsCollector(statsClient: StatsClient): Plugin {
  return (client) => {
    // Track DNS resolution time
    client.hooks.onDnsLookup = [(info, req) => {
      statsClient.histogram('http.dns.duration_ms', info.duration, {
        hostname: info.hostname
      });
    }];

    // Track TCP connection time
    client.hooks.onTcpConnect = [(info, req) => {
      statsClient.histogram('http.tcp.duration_ms', info.duration, {
        host: info.host
      });
    }];

    // Track TLS handshake time
    client.hooks.onTlsHandshake = [(info, req) => {
      statsClient.histogram('http.tls.duration_ms', info.duration, {
        protocol: info.protocol
      });
    }];

    // Track response status codes
    client.hooks.onResponseStart = [(info, req) => {
      statsClient.increment(`http.status.${info.status}`, {
        method: req.method,
        host: new URL(req.url).host
      });
    }];

    // Track retries
    client.hooks.onRetry = [(err, attempt) => {
      statsClient.increment('http.retry.count', {
        attempt: String(attempt),
        error: err.name
      });
    }];
  };
}
```

### OpenTelemetry Integration

```typescript
import { trace, SpanKind, SpanStatusCode } from '@opentelemetry/api';

function otelPlugin(): Plugin {
  const tracer = trace.getTracer('recker');

  return (client) => {
    client.use(async (req, next) => {
      const span = tracer.startSpan(`HTTP ${req.method}`, {
        kind: SpanKind.CLIENT,
        attributes: {
          'http.method': req.method,
          'http.url': req.url,
          'http.target': new URL(req.url).pathname
        }
      });

      try {
        const response = await next(req);

        span.setAttribute('http.status_code', response.status);
        span.setStatus({ code: SpanStatusCode.OK });

        return response;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message
        });
        throw error;
      } finally {
        span.end();
      }
    });

    // Add timing attributes from network hooks
    client.hooks.onDnsLookup = [(info) => {
      const span = trace.getActiveSpan();
      span?.setAttribute('http.dns_duration_ms', info.duration);
    }];

    client.hooks.onTcpConnect = [(info) => {
      const span = trace.getActiveSpan();
      span?.setAttribute('http.tcp_duration_ms', info.duration);
    }];
  };
}
```

## Plugin Composition

### Combining Plugins

```typescript
function createApiClient(apiKey: string) {
  return createClient({
    baseUrl: 'https://api.example.com',
    plugins: [
      authPlugin({ apiKey }),
      loggingPlugin(),
      metricsPlugin(metrics),
      rateLimitPlugin({ requestsPerSecond: 10 }),
      retryPlugin({ maxAttempts: 3 })
    ]
  });
}
```

### Plugin Order

Plugins are applied in array order. Middleware executes in onion model:

```typescript
// Applied first → executes outer layer
// Applied last → executes inner layer (closest to transport)

plugins: [
  outerPlugin(),   // Request first, Response last
  innerPlugin()    // Request last, Response first
]
```

### Conditional Plugins

```typescript
const plugins: Plugin[] = [
  loggingPlugin()
];

if (process.env.NODE_ENV === 'development') {
  plugins.push(debugPlugin());
}

if (process.env.METRICS_ENABLED) {
  plugins.push(metricsPlugin(metrics));
}

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins
});
```

## Best Practices

### 1. Keep Plugins Focused

```typescript
// ✅ Good: Single responsibility
function authPlugin() { ... }
function loggingPlugin() { ... }
function cachingPlugin() { ... }

// ❌ Bad: Does too much
function everythingPlugin() { ... }
```

### 2. Make Plugins Configurable

```typescript
// ✅ Good: Configurable
function myPlugin(options: Options = {}) {
  const { enabled = true, level = 'info' } = options;
  return (client) => { ... };
}

// ❌ Bad: Hardcoded behavior
function myPlugin() {
  return (client) => { ... };
}
```

### 3. Handle Errors Gracefully

```typescript
function safePlugin(): Plugin {
  return (client) => {
    client.afterResponse((req, res) => {
      try {
        // Plugin logic that might fail
        processResponse(res);
      } catch (error) {
        // Don't break the request
        console.error('Plugin error:', error);
      }
      return res;
    });
  };
}
```

### 4. Document Plugin Behavior

```typescript
/**
 * Adds retry functionality with exponential backoff.
 *
 * @param options.maxAttempts - Maximum retry attempts (default: 3)
 * @param options.delay - Initial delay in ms (default: 1000)
 *
 * @example
 * ```typescript
 * const client = createClient({
 *   plugins: [retryPlugin({ maxAttempts: 5 })]
 * });
 * ```
 */
function retryPlugin(options?: RetryOptions): Plugin {
  // ...
}
```

### 5. Use Immutable Request Methods

```typescript
// ✅ Good: Use immutable methods in middleware
const middleware: Middleware = async (req, next) => {
  const modifiedReq = req
    .withHeader('X-Custom', 'value')
    .withBody(JSON.stringify(data));
  return next(modifiedReq);
};

// ✅ OK: Mutate directly in beforeRequest hook (allowed for performance)
client.beforeRequest((req) => {
  req.headers.set('X-Custom', 'value');
});
```

### 6. State Management

Keep plugin state in closures, not on the client:

```typescript
// ✅ Good: State in closure (encapsulated)
function myPlugin(): Plugin {
  const cache = new Map();  // Private state

  return (client) => {
    client.use(async (req, next) => {
      const cached = cache.get(req.url);
      if (cached) return cached;

      const response = await next(req);
      cache.set(req.url, response.clone());
      return response;
    });
  };
}

// ❌ Bad: Attaching to client (pollutes, may conflict)
function myPlugin(): Plugin {
  return (client) => {
    (client as any).myCache = new Map();  // Don't do this
  };
}
```

### 7. Zero-Overhead When Disabled

```typescript
function conditionalPlugin(options: { enabled?: boolean }): Plugin {
  return (client) => {
    // Don't register anything if disabled
    if (options.enabled === false) return;

    client.use(async (req, next) => {
      // ... expensive logic
    });
  };
}
```

### 8. Export Types

```typescript
// ✅ Good: Export options interface for consumers
export interface MyPluginOptions {
  enabled?: boolean;
  level?: 'debug' | 'info' | 'warn';
  onEvent?: (event: Event) => void;
}

export function myPlugin(options: MyPluginOptions = {}): Plugin {
  // ...
}
```

## Middleware Execution Flow

Understanding the onion model:

```
Request enters
       │
       ▼
┌──────────────────┐
│  Plugin A (outer)│ ─┐
│  ┌────────────┐  │  │
│  │ Plugin B   │  │  │  Request flows DOWN
│  │ ┌────────┐ │  │  │
│  │ │Plugin C│ │  │  │
│  │ │        │ │  │  ▼
│  │ │Transport│ │  │
│  │ │        │ │  │  ▲
│  │ └────────┘ │  │  │  Response flows UP
│  └────────────┘  │  │
└──────────────────┘ ─┘
       │
       ▼
Response returns
```

```typescript
// Execution order example
const client = createClient({
  plugins: [
    (c) => c.use(async (req, next) => {
      console.log('A: before');
      const res = await next(req);
      console.log('A: after');
      return res;
    }),
    (c) => c.use(async (req, next) => {
      console.log('B: before');
      const res = await next(req);
      console.log('B: after');
      return res;
    })
  ]
});

await client.get('/test');
// Output:
// A: before
// B: before
// [network request]
// B: after
// A: after
```

## Next Steps

- **[Specialties](11-specialties.md)** - GraphQL, SOAP, scraping
- **[Observability](12-observability.md)** - Debug and metrics
