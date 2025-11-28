# Building Plugins

Recker was designed to be extended. In fact, core features like **Retry**, **Cache**, and **Rate Limiting** are just plugins distributed with the library.

This guide will teach you how to write robust, type-safe, and performant plugins.

## What is a Plugin?

Technically, a plugin is simply a function that receives the `Client` instance.

```typescript
import { Plugin } from 'recker';

const myPlugin: Plugin = (client) => {
  // Configure the client here
  client.defaults.params['foo'] = 'bar';
};
```

Most plugins follow the **Factory Pattern** to accept configuration options:

```typescript
export function myPlugin(options: MyOptions): Plugin {
  return (client) => {
    // Use options to configure behavior
  };
}
```

## Two Ways to Extend

There are two main mechanisms to extend Recker: **Middleware** and **Hooks**.

### 1. Middleware ("The Onion")

Use Middleware when you need to **control the flow** of the request.
*   **Wrap** the request execution.
*   **Modify** the request before it goes out.
*   **Modify** the response before it returns.
*   **Retry** or **Short-circuit** (return a response without network).

**Signature:** `(req: ReckerRequest, next: NextFunction) => Promise<ReckerResponse>`

```typescript
const authMiddleware: Middleware = async (req, next) => {
  // 1. Before Request (Downstream)
  const token = await getToken();
  const authedReq = req.withHeader('Authorization', `Bearer ${token}`);

  // 2. Call Next (Pass control to next middleware/transport)
  const response = await next(authedReq);

  // 3. After Response (Upstream)
  if (response.status === 401) {
    // Example: Refresh token logic could go here
  }

  return response;
};

// Registering in a plugin
export function auth(): Plugin {
  return (client) => {
    client.use(authMiddleware);
  };
}
```

### 2. Hooks (Lifecycle Events)

Use Hooks when you want to **react to specific events** or perform **lightweight mutations** without wrapping the entire execution stack. Hooks are generally simpler and have specific purposes.

Available Hooks:
*   `beforeRequest(req)`: Modify request immediately before dispatch.
*   `afterResponse(req, res)`: Inspect or modify response.
*   `onError(error, req)`: Recover from errors.
*   `onRetry(error, attempt, delay)`: Notification only.
*   **Network Hooks:** `onDnsLookup`, `onTcpConnect`, `onRequestSent`, `onResponseStart`.

```typescript
export function simpleLogger(): Plugin {
  return (client) => {
    client.beforeRequest((req) => {
      console.log(`Fetching ${req.url}...`);
    });

    client.afterResponse((req, res) => {
      console.log(`Done! Status: ${res.status}`);
    });
  };
}
```

---

## Example 1: An "API Key" Plugin

Let's build a simple plugin that injects an API Key header into every request.

```typescript
// src/plugins/api-key.ts
import { Plugin } from 'recker';

interface ApiKeyOptions {
  header?: string;
  key: string;
}

export function apiKey(options: ApiKeyOptions): Plugin {
  const headerName = options.header || 'X-API-Key';

  return (client) => {
    // We use a Hook because we just need to mutate the request headers.
    // It's lighter than a full middleware.
    client.beforeRequest((req) => {
      if (!req.headers.has(headerName)) {
        req.headers.set(headerName, options.key);
      }
    });
  };
}

// Usage
const client = createClient({
  plugins: [
    apiKey({ key: 'secret-123' })
  ]
});
```

## Example 2: A "Time-Travel" Middleware (Response Mocking)

Let's build a middleware that intercepts requests to specific URLs and returns a fake response, skipping the network entirely.

```typescript
import { Plugin, Middleware, HttpResponse } from 'recker';

export function mockRoute(path: string, json: any): Plugin {
  const mockMiddleware: Middleware = async (req, next) => {
    if (req.url.endsWith(path)) {
      // Short-circuit! We DO NOT call next(req).
      // We construct a fake response using the internal HttpResponse class
      // or a standard Response object.
      
      const fakeResponse = new Response(JSON.stringify(json), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

      // Wrap it to match ReckerResponse interface
      return new HttpResponse(fakeResponse);
    }

    // Not our route, pass it on
    return next(req);
  };

  return (client) => client.use(mockMiddleware);
}
```

## Example 3: Advanced Observability (Low-Level Hooks)

Recker exposes zero-overhead low-level network hooks. This is how you build metrics plugins (like for Datadog or Prometheus).

```typescript
export function metricsCollector(statsClient: any): Plugin {
  return (client) => {
    // These hooks are only instrumented if registered
    
    // 1. Track DNS resolution time
    client.hooks.onDnsLookup = [(info, req) => {
      statsClient.histogram('http.dns.duration', info.duration);
    }];

    // 2. Track pure Latency (TTFB)
    client.hooks.onResponseStart = [(info, req) => {
      // 'info' contains status and headers
      statsClient.increment(`http.status.${info.status}`);
    }];
    
    // 3. Track Retries
    client.hooks.onRetry = [(err, attempt) => {
      statsClient.increment('http.retry.count');
    }];
  };
}
```

## Best Practices

1.  **Immutability:** The `ReckerRequest` object is immutable-ish. Use helpers like `req.withHeader()` if you want to return a *new* request reference in middleware, or mutate `req.headers` directly in `beforeRequest` hooks (Recker allows this for performance in hooks).
2.  **Zero-Overhead:** Do not perform heavy computations inside the plugin factory. Do them inside the middleware/hook only when needed.
3.  **Error Handling:** If your middleware can fail, wrap `next()` in a `try/catch` block. Recker expects errors to be thrown to trigger retries.
4.  **Type Exports:** Always export your `Options` interface so users can type their configuration objects.

## Accessing Client State

Sometimes a plugin needs to share state (like a Cookie Jar or Cache).

You can attach properties to the `client` instance, but be careful with TypeScript types.

```typescript
// In your plugin
const myState = new Map();

return (client) => {
  // Attach state to client for other plugins to see?
  // Ideally, keep state inside the closure of the plugin factory (Encapsulation).
  // This is safer and prevents collisions.
  
  client.use(async (req, next) => {
    const val = myState.get('key');
    // ...
  });
};
```