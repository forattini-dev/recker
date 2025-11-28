# Client Options

> Comprehensive guide to configuring your Recker client for production use.

## Table of Contents

- [Basic Configuration](#basic-configuration)
- [Connection & Pool Options](#connection--pool-options)
- [Default Headers](#default-headers)
- [Timeouts](#timeouts)
- [HTTP/2 Configuration](#http2-configuration)
- [Proxy Settings](#proxy-settings)
- [Debug Mode](#debug-mode)
- [Error Handling](#error-handling)
- [Environment-Specific Setup](#environment-specific-setup)

## Basic Configuration

### Minimal Setup

```typescript
import recker from 'recker'

const client = recker({
  baseUrl: 'https://api.example.com'
})
```

### Recommended Production Setup

```typescript
const client = recker({
  baseUrl: process.env.API_BASE_URL,
  timeout: 10000,
  headers: {
    'User-Agent': 'MyApp/1.0.0',
    'Accept': 'application/json'
  },
  throwOnError: true,
  retry: {
    maxAttempts: 3
  },
  pool: {
    maxConnections: 20,
    keepAliveTimeout: 10000
  }
})
```

**Related:** [Quick Reference](/configuration/quick-reference.md) | [Quick Start](/getting-started/quickstart.md)

## Connection & Pool Options

Recker uses Undici's connection pooling for optimal performance. Configure how connections are managed:

### Pool Configuration

```typescript
const client = recker({
  baseUrl: 'https://api.example.com',
  pool: {
    // Maximum connections per origin
    maxConnections: 10,           // Default: 10

    // HTTP/2 streams per connection
    maxConcurrentStreams: 100,    // Default: 100

    // Keep-alive timeout (ms)
    keepAliveTimeout: 4000,       // Default: 4000

    // Maximum keep-alive time (ms)
    keepAliveMaxTimeout: 600000,  // Default: 600000 (10 minutes)

    // HTTP/1.1 pipelining factor
    pipelining: 1                 // Default: 1 (disabled)
  }
})
```

### When to Tune Pool Settings

**High-Traffic Applications:**
```typescript
pool: {
  maxConnections: 50,           // More connections
  keepAliveTimeout: 30000       // Longer keep-alive
}
```

**Serverless Environments:**
```typescript
pool: {
  maxConnections: 5,            // Fewer connections
  keepAliveTimeout: 1000        // Short keep-alive
}
```

**API with Rate Limits:**
```typescript
pool: {
  maxConnections: 2,            // Limit concurrency
  pipelining: 0                 // Disable pipelining
}
```

**Related:** [Connection Pooling Guide](/guides/performance/connection-pooling.md) | [Performance Tips](/guides/performance/README.md)

## Default Headers

Set headers that apply to all requests:

### Common Headers

```typescript
const client = recker({
  headers: {
    // User identification
    'User-Agent': 'MyApp/1.0.0 (https://example.com)',

    // Content negotiation
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',

    // Authentication (use environment variables!)
    'Authorization': `Bearer ${process.env.API_TOKEN}`,

    // Custom headers
    'X-App-Version': '1.0.0',
    'X-Client-ID': 'web-client'
  }
})
```

### Dynamic Headers with Hooks

For headers that change per request (timestamps, request IDs):

```typescript
const client = recker({
  hooks: {
    beforeRequest: [
      async (request) => {
        request.headers.set('X-Request-ID', crypto.randomUUID())
        request.headers.set('X-Timestamp', new Date().toISOString())
        return request
      }
    ]
  }
})
```

### Header Precedence

Headers are merged in this order (last wins):
1. Client default headers
2. Request-specific headers
3. Hook-modified headers

```typescript
const client = recker({
  headers: { 'X-Foo': 'default' }
})

// This request will have X-Foo: 'override'
await client.get('/api', {
  headers: { 'X-Foo': 'override' }
})
```

**Related:** [Headers Guide](/guides/basics/headers.md) | [Authentication Examples](/examples/02-intermediate-auth-interceptors.ts)

## Timeouts

Control how long operations can take:

### Global Timeout

```typescript
const client = recker({
  timeout: 30000  // 30 seconds for all requests
})
```

### Per-Request Timeout

```typescript
// Override global timeout
await client.get('/fast-endpoint', { timeout: 5000 })
await client.post('/slow-endpoint', { timeout: 60000 })

// Disable timeout
await client.get('/streaming', { timeout: 0 })
```

### Recommended Timeouts by Operation

```typescript
const client = recker({ timeout: 10000 })  // Default

// Fast reads
await client.get('/health', { timeout: 1000 })

// Normal operations
await client.get('/users', { timeout: 5000 })

// Slow writes
await client.post('/uploads', { timeout: 60000 })

// Streaming/SSE
await client.get('/stream', { timeout: 0 })
```

### Using AbortController

For more control, use AbortController:

```typescript
const controller = new AbortController()

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000)

try {
  await client.get('/api', {
    signal: controller.signal
  })
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request cancelled')
  }
}
```

**Related:** [Timeout Configuration](/configuration/advanced.md#timeouts)

## HTTP/2 Configuration

Recker automatically negotiates HTTP/2 when the server supports it (via ALPN).

### Default Behavior

```typescript
// HTTP/2 is automatic - no configuration needed!
const client = recker({
  baseUrl: 'https://api.example.com'  // Uses HTTP/2 if available
})
```

### HTTP/2-Specific Settings

```typescript
const client = recker({
  baseUrl: 'https://api.example.com',
  pool: {
    // HTTP/2 multiplexing - multiple requests per connection
    maxConcurrentStreams: 100,    // Streams per HTTP/2 connection

    // Connection limits still apply
    maxConnections: 10            // Total HTTP/2 connections
  }
})
```

### HTTP/2 Benefits

- **Multiplexing** - Multiple requests share one connection
- **Header Compression** - HPACK reduces overhead
- **Server Push** - Proactive resource delivery
- **Stream Prioritization** - Critical requests first

### Detecting HTTP/2

```typescript
const response = await client.get('/api')

// Check protocol used
console.log(response.httpVersion)  // '2.0' for HTTP/2
```

**Related:** [HTTP/2 Guide](/guides/performance/http2.md) | [Connection Pooling](/guides/performance/connection-pooling.md)

## Proxy Settings

Route requests through an HTTP proxy:

### Basic Proxy

```typescript
const client = recker({
  baseUrl: 'https://api.example.com',
  proxy: 'http://proxy.example.com:8080'
})
```

### Proxy with Authentication

```typescript
const client = recker({
  proxy: {
    url: 'http://proxy.example.com:8080',
    auth: {
      username: process.env.PROXY_USER,
      password: process.env.PROXY_PASS
    }
  }
})
```

### Environment-Based Proxy

```typescript
const client = recker({
  proxy: process.env.HTTP_PROXY || process.env.http_proxy
})
```

### Bypassing Proxy for Specific Hosts

```typescript
const client = recker({
  proxy: process.env.HTTP_PROXY,
  noProxy: ['localhost', '127.0.0.1', '.internal.example.com']
})
```

**Related:** [Proxy Guide](/guides/advanced/proxy.md)

## Debug Mode

Enable detailed logging for development and troubleshooting:

### Basic Debug Mode

```typescript
const client = recker({
  debug: true  // Logs all requests and responses
})
```

### Environment-Based Debug

```typescript
const client = recker({
  debug: process.env.NODE_ENV === 'development'
})
```

### What Gets Logged

With `debug: true`, you'll see:
- Request method, URL, headers
- Request body (truncated if large)
- Response status, headers
- Response body (truncated if large)
- Timing information
- Retry attempts

```
[Recker] GET https://api.example.com/users
[Recker]   Headers: { Accept: 'application/json', ... }
[Recker]   Timing: DNS=5ms, TCP=20ms, TLS=45ms, Request=120ms
[Recker] ← 200 OK (120ms)
[Recker]   Headers: { Content-Type: 'application/json', ... }
```

### Custom Debug Handler

```typescript
const client = recker({
  debug: true,
  onDebug: (level, message, data) => {
    // Custom logging (Winston, Pino, etc.)
    logger[level](message, data)
  }
})
```

**Related:** [Debug Guide](/guides/basics/debug.md) | [Observability](/guides/observability/observability.md)

## Error Handling

Configure how errors are handled:

### Throw on HTTP Errors

```typescript
// Don't throw - check response manually
const client = recker({ throwOnError: false })  // Default

const response = await client.get('/api')
if (!response.ok) {
  console.error('Failed:', response.status)
}

// Throw on 4xx/5xx status codes
const strictClient = recker({ throwOnError: true })

try {
  await strictClient.get('/api')
} catch (error) {
  console.error('Request failed:', error.status)
}
```

### Custom Error Handler

```typescript
const client = recker({
  hooks: {
    onError: [
      async (error) => {
        // Log to error tracking service
        errorTracker.captureError(error, {
          url: error.request.url,
          status: error.status,
          retries: error.retries
        })

        // Optionally recover
        if (error.status === 503) {
          return new Response(JSON.stringify({ maintenance: true }))
        }

        throw error
      }
    ]
  }
})
```

### Error Types

```typescript
import { ReckerError, NetworkError, TimeoutError } from 'recker'

try {
  await client.get('/api')
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Request timed out')
  } else if (error instanceof NetworkError) {
    console.log('Network failure')
  } else if (error instanceof ReckerError) {
    console.log('HTTP error:', error.status)
  }
}
```

**Related:** [Error Handling Guide](/guides/basics/error-handling.md)

## Environment-Specific Setup

Configure differently for development, staging, and production:

### Using Environment Variables

```typescript
const client = recker({
  baseUrl: process.env.API_BASE_URL,
  timeout: parseInt(process.env.API_TIMEOUT || '10000'),
  headers: {
    'Authorization': `Bearer ${process.env.API_TOKEN}`
  },
  debug: process.env.NODE_ENV === 'development',
  throwOnError: process.env.NODE_ENV === 'production'
})
```

### Configuration by Environment

```typescript
const config = {
  development: {
    baseUrl: 'http://localhost:3000',
    timeout: 30000,
    debug: true,
    retry: { maxAttempts: 0 },  // No retries in dev
    circuitBreaker: false
  },
  staging: {
    baseUrl: 'https://staging-api.example.com',
    timeout: 10000,
    debug: false,
    retry: { maxAttempts: 2 },
    circuitBreaker: { threshold: 10 }
  },
  production: {
    baseUrl: 'https://api.example.com',
    timeout: 5000,
    debug: false,
    retry: { maxAttempts: 3 },
    circuitBreaker: { threshold: 5 },
    throwOnError: true
  }
}

const env = process.env.NODE_ENV || 'development'
const client = recker(config[env])
```

### Validation

```typescript
import { z } from 'zod'

const ConfigSchema = z.object({
  API_BASE_URL: z.string().url(),
  API_TOKEN: z.string().min(1),
  API_TIMEOUT: z.string().regex(/^\d+$/).optional()
})

// Validate environment variables
const env = ConfigSchema.parse(process.env)

const client = recker({
  baseUrl: env.API_BASE_URL,
  headers: { 'Authorization': `Bearer ${env.API_TOKEN}` },
  timeout: parseInt(env.API_TIMEOUT || '10000')
})
```

## Next Steps

- **Request configuration** → [Request Options](/configuration/request-options.md)
- **Advanced features** → [Advanced Configuration](/configuration/advanced.md)
- **TypeScript setup** → [TypeScript Configuration](/configuration/typescript.md)
- **See examples** → [Examples](/examples/README.md)
- **Back to overview** → [Configuration Quick Reference](/configuration/quick-reference.md)
