# Configuration Quick Reference

> A single-page cheatsheet of all Recker configuration options. For detailed explanations, see the linked pages.

## Client Creation

```typescript
import recker from 'recker'

const client = recker({
  // Base configuration
  baseUrl?: string                    // Base URL for all requests
  timeout?: number                    // Global timeout in ms (default: 30000)
  headers?: HeadersInit               // Default headers for all requests

  // Connection & Performance
  pool?: PoolOptions                  // Connection pool configuration
  compression?: boolean | CompressionOptions  // Auto compression

  // Resilience
  retry?: RetryOptions                // Retry configuration
  circuitBreaker?: CircuitBreakerOptions  // Circuit breaker settings
  concurrency?: ConcurrencyOptions    // Concurrency control

  // Extensions
  plugins?: Plugin[]                  // Array of plugins
  hooks?: HooksConfig                 // Lifecycle hooks

  // Type Safety
  validateResponse?: boolean          // Enable response validation
  throwOnError?: boolean              // Throw on HTTP errors (default: false)
})
```

**Detailed:** [Client Options](/configuration/client-options.md)

## Request Options

```typescript
await client.get('/path', {
  // Standard fetch options
  headers?: HeadersInit               // Request-specific headers
  body?: BodyInit                     // Request body
  signal?: AbortSignal                // Abort controller signal

  // Recker enhancements
  timeout?: number                    // Override global timeout
  retry?: RetryOptions | false        // Override or disable retry
  searchParams?: Record<string, any>  // URL search parameters
  json?: any                          // Auto-serialize as JSON
  form?: Record<string, any>          // Send as form data

  // Response handling
  throwOnError?: boolean              // Throw on HTTP errors
  validateResponse?: (res) => boolean // Custom validation
})
```

**Detailed:** [Request Options](/configuration/request-options.md)

## Pool Options

```typescript
pool: {
  maxConnections: number              // Max connections per origin (default: 10)
  maxConcurrentStreams: number        // HTTP/2 streams per connection (default: 100)
  keepAliveTimeout: number            // Keep-alive duration in ms (default: 4000)
  keepAliveMaxTimeout: number         // Max keep-alive duration (default: 600000)
  pipelining: number                  // HTTP/1.1 pipelining factor (default: 1)
}
```

**Detailed:** [Connection Pooling](/guides/performance/connection-pooling.md)

## Retry Options

```typescript
retry: {
  maxAttempts: number                 // Max retry attempts (default: 3)
  methods: string[]                   // Methods to retry (default: GET, HEAD, OPTIONS, PUT, DELETE)
  statusCodes: number[]               // Status codes to retry (default: 408, 413, 429, 500, 502, 503, 504)
  delay: number                       // Initial delay in ms (default: 100)
  maxDelay: number                    // Max delay in ms (default: 10000)
  factor: number                      // Backoff factor (default: 2)
  jitter: boolean                     // Add randomization (default: true)
  onRetry?: (error, attempt) => void  // Retry callback
}
```

**Detailed:** [Retry Configuration](/configuration/advanced.md#retry) | [Retry Guide](/guides/advanced/retry.md)

## Circuit Breaker Options

```typescript
circuitBreaker: {
  threshold: number                   // Failures before opening (default: 5)
  timeout: number                     // Time before half-open in ms (default: 60000)
  resetTimeout: number                // Time before reset in ms (default: 30000)
  onStateChange?: (state) => void     // State change callback
}
```

**Detailed:** [Circuit Breaker Guide](/guides/advanced/circuit-breaker.md)

## Concurrency Options

```typescript
concurrency: {
  max: number                         // Max concurrent requests (default: Infinity)
  queue: number                       // Max queued requests (default: Infinity)
  queueBehavior: 'fifo' | 'lifo'      // Queue order (default: 'fifo')
  onQueue?: (request) => void         // Queue callback
  onDequeue?: (request) => void       // Dequeue callback
}
```

**Detailed:** [Concurrency Guide](/guides/performance/concurrency.md)

## Compression Options

```typescript
compression: {
  encoding: 'gzip' | 'deflate' | 'br' // Algorithm (default: 'gzip')
  threshold: number                   // Min bytes to compress (default: 1024)
  contentTypes: string[]              // Content types to compress
  level: number                       // Compression level 0-9 (default: 6)
}
```

**Detailed:** [Compression Guide](/guides/performance/compression.md)

## Hooks Configuration

```typescript
hooks: {
  beforeRequest: [(request: ReckerRequest) => Promise<ReckerRequest>]
  afterResponse: [(response: ReckerResponse) => Promise<ReckerResponse>]
  onError: [(error: ReckerError) => Promise<void>]
}

// Or add hooks after creation
client.hooks.beforeRequest.push(async (request) => {
  // Modify request
  return request
})
```

**Detailed:** [Hooks Guide](/guides/advanced/hooks.md)

## Plugin System

```typescript
// Use built-in plugins
import { retry, cache, compression } from 'recker/plugins'

const client = recker({
  plugins: [
    retry({ maxAttempts: 3 }),
    cache({ ttl: 60000 }),
    compression()
  ]
})

// Create custom plugin
const myPlugin = (client) => {
  client.hooks.beforeRequest.push(async (req) => {
    // Plugin logic
    return req
  })
  return client
}
```

**Detailed:** [Plugin Guide](/guides/plugins.md)

## Headers

```typescript
// Set default headers
const client = recker({
  headers: {
    'User-Agent': 'MyApp/1.0',
    'Accept': 'application/json'
  }
})

// Per-request headers
await client.get('/api', {
  headers: {
    'Authorization': 'Bearer token'
  }
})

// Helper methods
client.setHeader('X-Api-Key', 'key123')
client.deleteHeader('X-Api-Key')
```

## Timeouts

```typescript
// Global timeout
const client = recker({ timeout: 5000 })

// Per-request timeout
await client.get('/api', { timeout: 10000 })

// Different timeouts for different operations
await client.get('/fast', { timeout: 1000 })
await client.post('/slow', { timeout: 30000 })

// Disable timeout
await client.get('/no-timeout', { timeout: 0 })
```

**Detailed:** [Advanced Configuration](/configuration/advanced.md#timeouts)

## Error Handling

```typescript
// Throw on HTTP errors
const client = recker({ throwOnError: true })

try {
  await client.get('/api')
} catch (error) {
  if (error instanceof ReckerError) {
    console.log(error.status)      // HTTP status
    console.log(error.retries)     // Retry attempts
    console.log(error.timing)      // Request timing
    console.log(error.request)     // Original request
  }
}

// Custom error handling
const client = recker({
  hooks: {
    onError: [async (error) => {
      // Log, report, recover
    }]
  }
})
```

**Detailed:** [Error Handling Guide](/guides/basics/error-handling.md)

## TypeScript Configuration

```typescript
// Type-safe responses
interface User {
  id: number
  name: string
}

const response = await client.get<User>('/users/1')
const user: User = await response.json()

// Runtime validation with Zod
import { z } from 'zod'

const UserSchema = z.object({
  id: z.number(),
  name: z.string()
})

const validated = await client
  .get('/users/1')
  .then(r => r.json())
  .then(UserSchema.parse)

// Type-safe error handling
try {
  await client.get('/api')
} catch (error) {
  if (error instanceof ReckerError) {
    // Full type information available
  }
}
```

**Detailed:** [TypeScript Configuration](/configuration/typescript.md)

## Environment Variables

```typescript
// Common patterns
const client = recker({
  baseUrl: process.env.API_BASE_URL,
  timeout: parseInt(process.env.API_TIMEOUT || '30000'),
  headers: {
    'Authorization': `Bearer ${process.env.API_KEY}`
  }
})

// Environment-specific configuration
const isDev = process.env.NODE_ENV === 'development'

const client = recker({
  retry: isDev ? { maxAttempts: 0 } : { maxAttempts: 3 },
  circuitBreaker: isDev ? false : { threshold: 5 }
})
```

## Quick Examples

### Minimal Setup
```typescript
import recker from 'recker'

const client = recker({ baseUrl: 'https://api.example.com' })
const response = await client.get('/users')
```

### Production-Ready Setup
```typescript
const client = recker({
  baseUrl: process.env.API_BASE_URL,
  timeout: 10000,
  retry: {
    maxAttempts: 3,
    methods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']
  },
  circuitBreaker: {
    threshold: 5,
    timeout: 60000
  },
  pool: {
    maxConnections: 20,
    keepAliveTimeout: 10000
  },
  headers: {
    'User-Agent': 'MyApp/1.0'
  },
  throwOnError: true
})
```

### Full-Featured Setup
```typescript
import recker from 'recker'
import { retry, cache, compression, logger } from 'recker/plugins'

const client = recker({
  baseUrl: process.env.API_BASE_URL,
  timeout: 10000,

  plugins: [
    retry({ maxAttempts: 3 }),
    cache({ ttl: 300000 }),
    compression(),
    logger({ level: 'debug' })
  ],

  pool: {
    maxConnections: 20,
    keepAliveTimeout: 10000
  },

  circuitBreaker: {
    threshold: 5,
    timeout: 60000
  },

  concurrency: {
    max: 10,
    queue: 100
  },

  hooks: {
    beforeRequest: [
      async (req) => {
        req.headers.set('X-Request-ID', crypto.randomUUID())
        return req
      }
    ]
  },

  throwOnError: true
})
```

## Next Steps

- **Detailed client options** → [Client Options](/configuration/client-options.md)
- **Request-specific config** → [Request Options](/configuration/request-options.md)
- **Advanced features** → [Advanced Configuration](/configuration/advanced.md)
- **TypeScript setup** → [TypeScript Configuration](/configuration/typescript.md)
- **See examples** → [Examples](/examples/README.md)
