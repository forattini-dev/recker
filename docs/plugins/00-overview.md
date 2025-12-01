# Plugins

Recker uses a middleware-based plugin architecture, allowing you to extend functionality in a modular and composable way.

## Architecture

Plugins are functions that receive a `Client` instance and register middlewares:

```typescript
type Plugin = (client: Client) => void;

type Middleware = (
  request: ReckerRequest,
  next: (req: ReckerRequest) => Promise<ReckerResponse>
) => Promise<ReckerResponse>;
```

### Onion Model

Requests pass through a stack of middlewares:

```
Request →  Plugin 1  →  Plugin 2  →  Plugin 3  →  Transport  → Network
                                                      ↓
Response ← Plugin 1  ←  Plugin 2  ←  Plugin 3  ←  Transport  ← Network
```

## Available Plugins

### Resilience

| Plugin | Description |
|--------|-------------|
| [Retry](./02-retry.md) | Automatic retries with exponential backoff |
| [Circuit Breaker](./03-circuit-breaker.md) | Protection against cascading failures |
| [Dedup](./05-dedup.md) | Deduplication of simultaneous requests |

### Performance

| Plugin | Description |
|--------|-------------|
| [Cache](./04-cache.md) | HTTP caching with multiple strategies |
| [Memory Cache](./01-memory-cache.md) | High-performance in-memory cache storage |
| Compression | Automatic request compression |

### Security

| Plugin | Description |
|--------|-------------|
| [Auth](./06-auth.md) | Authentication (Bearer, Basic, API Key) |
| [Cookie Jar](./08-cookie-jar.md) | Automatic cookie management |
| XSRF | CSRF protection |

### Observability

| Plugin | Description |
|--------|-------------|
| [Logger](./07-logger.md) | Request and response logging |
| Server Timing | Server-Timing header parsing |
| HAR Recorder | Request recording in HAR format |

### Protocols

| Plugin | Description |
|--------|-------------|
| GraphQL | Integrated GraphQL client |
| SOAP | SOAP/XML client |
| JSON-RPC | JSON-RPC 2.0 client |
| gRPC-Web | gRPC-Web client |
| OData | OData client |

### Specialties

| Plugin | Description |
|--------|-------------|
| Pagination | Automatic pagination |
| Scrape | Web scraping with CSS selectors |
| HLS | HLS streaming |
| Proxy Rotator | Proxy rotation |
| Interface Rotator | Network interface rotation |

## Using Plugins

### Basic Installation

```typescript
import { createClient, retry, cache, dedup } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

// Add plugins
client.use(retry({ maxAttempts: 3 }));
client.use(cache({ ttl: 60000 }));
client.use(dedup());
```

### Via Configuration

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: { maxAttempts: 3 },
  cache: { ttl: 60000 },
});
```

### Plugin Order

Order matters! Plugins are executed in the order they are added:

```typescript
// ✅ Recommended order
client.use(circuitBreaker()); // 1. Fail fast if circuit is open
client.use(retry());          // 2. Retry failures
client.use(dedup());          // 3. Deduplicate requests
client.use(cache());          // 4. Check cache
client.use(auth());           // 5. Add authentication
client.use(logger());         // 6. Log everything

// ❌ Problematic order
client.use(retry());          // Will retry even with circuit open!
client.use(circuitBreaker());
```

## Creating Plugins

### Simple Plugin

```typescript
import { Plugin, Middleware } from 'recker';

function myPlugin(options = {}): Plugin {
  const middleware: Middleware = async (request, next) => {
    // Before request
    console.log(`Starting: ${request.method} ${request.url}`);

    // Pass to next middleware
    const response = await next(request);

    // After response
    console.log(`Completed: ${response.status}`);

    return response;
  };

  return (client) => {
    client.use(middleware);
  };
}

// Use it
client.use(myPlugin());
```

### Plugin with Hooks

```typescript
function myPlugin(): Plugin {
  return (client) => {
    // Hook before request
    client.beforeRequest((request) => {
      return request.withHeader('X-Custom', 'value');
    });

    // Hook after response
    client.afterResponse((request, response) => {
      console.log(`${request.url}: ${response.status}`);
    });

    // Error hook
    client.onError((request, error) => {
      console.error(`Error on ${request.url}:`, error);
      // Can return a fallback response
    });
  };
}
```

### Plugin with State

```typescript
function rateLimiter(options: { maxRequests: number; window: number }): Plugin {
  const requests = new Map<number, number>();

  return (client) => {
    client.use(async (request, next) => {
      const now = Math.floor(Date.now() / options.window);
      const count = requests.get(now) || 0;

      if (count >= options.maxRequests) {
        throw new Error('Rate limit exceeded');
      }

      requests.set(now, count + 1);

      // Clean old entries
      for (const [time] of requests) {
        if (time < now) requests.delete(time);
      }

      return next(request);
    });
  };
}
```

## Composition

Combine plugins for complex scenarios:

### Resilient API

```typescript
client.use(circuitBreaker({ threshold: 5 }));
client.use(retry({ maxAttempts: 3, backoff: 'exponential' }));
client.use(cache({ strategy: 'stale-while-revalidate' }));
client.use(dedup());
```

### Scraping

```typescript
client.use(cookieJar({ jar: new MemoryCookieJar() }));
client.use(retry({ maxAttempts: 2 }));
client.use(logger({ filter: (req) => !req.url.includes('/static/') }));
```

### Microservices

```typescript
client.use(auth({ type: 'bearer', token: getServiceToken }));
client.use(circuitBreaker({ threshold: 3 }));
client.use(retry({ statusCodes: [502, 503, 504] }));
client.use(logger({ log: structuredLog }));
```

## Best Practices

1. **Correct order** - Circuit breaker before retry
2. **Dedup with cache** - Dedup before cache
3. **Auth first** - Except for circuit breaker
4. **Logger last** - To capture everything
5. **Don't block** - Use async/await correctly
6. **Handle errors** - Don't swallow exceptions
7. **Document options** - Use TypeScript for typing
