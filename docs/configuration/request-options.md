# Request Options

> Configure individual requests with method-specific options, query parameters, body handling, and more.

## Table of Contents

- [HTTP Methods](#http-methods)
- [Query Parameters](#query-parameters)
- [Request Body](#request-body)
- [Headers](#headers)
- [Timeouts & Signals](#timeouts--signals)
- [Retry Configuration](#retry-configuration)
- [Response Handling](#response-handling)

## HTTP Methods

Recker provides dedicated methods for all standard HTTP verbs:

### GET Requests

```typescript
// Simple GET
const response = await client.get('/users')

// With options
const response = await client.get('/users', {
  searchParams: { page: 1, limit: 10 },
  headers: { 'Accept': 'application/json' }
})
```

### POST Requests

```typescript
// JSON body
const response = await client.post('/users', {
  json: {
    name: 'Alice',
    email: 'alice@example.com'
  }
})

// Form data
const response = await client.post('/users', {
  form: {
    name: 'Alice',
    email: 'alice@example.com'
  }
})

// Raw body
const response = await client.post('/users', {
  body: JSON.stringify({ name: 'Alice' }),
  headers: { 'Content-Type': 'application/json' }
})
```

### PUT Requests

```typescript
// Update resource
const response = await client.put('/users/123', {
  json: {
    name: 'Alice Updated'
  }
})
```

### PATCH Requests

```typescript
// Partial update
const response = await client.patch('/users/123', {
  json: {
    email: 'newemail@example.com'
  }
})
```

### DELETE Requests

```typescript
// Delete resource
const response = await client.delete('/users/123')

// With body (rare but supported)
const response = await client.delete('/users/bulk', {
  json: { ids: [1, 2, 3] }
})
```

### HEAD Requests

```typescript
// Check resource existence
const response = await client.head('/users/123')
console.log(response.ok)  // Resource exists
console.log(response.headers.get('Content-Length'))
```

### OPTIONS Requests

```typescript
// Check allowed methods
const response = await client.options('/users')
console.log(response.headers.get('Allow'))  // 'GET, POST, PUT, DELETE'
```

**Related:** [Quick Start](/getting-started/quickstart.md) | [HTTP Methods Example](/examples/02-intermediate-http-methods-advanced.ts)

## Query Parameters

Add URL query parameters with automatic encoding:

### Basic Query Parameters

```typescript
// Using searchParams
const response = await client.get('/users', {
  searchParams: {
    page: 1,
    limit: 10,
    sort: 'name'
  }
})
// GET /users?page=1&limit=10&sort=name
```

### Array Parameters

```typescript
const response = await client.get('/users', {
  searchParams: {
    ids: [1, 2, 3],
    tags: ['admin', 'active']
  }
})
// GET /users?ids=1&ids=2&ids=3&tags=admin&tags=active
```

### Special Characters

```typescript
const response = await client.get('/search', {
  searchParams: {
    q: 'hello world',
    filter: 'status:active AND role:admin'
  }
})
// Properly URL-encoded
// GET /search?q=hello%20world&filter=status%3Aactive%20AND%20role%3Aadmin
```

### Manual URL Construction

```typescript
// If you prefer to build URL manually
const url = new URL('/users', client.baseUrl)
url.searchParams.set('page', '1')
url.searchParams.set('limit', '10')

const response = await client.get(url.toString())
```

**Related:** [Pagination Example](/examples/02-intermediate-pagination.ts)

## Request Body

Multiple ways to send request bodies:

### JSON Body (Most Common)

```typescript
// Automatically serialized and Content-Type set
const response = await client.post('/users', {
  json: {
    name: 'Alice',
    email: 'alice@example.com',
    metadata: { role: 'admin' }
  }
})
// Content-Type: application/json
```

### Form Data

```typescript
// application/x-www-form-urlencoded
const response = await client.post('/login', {
  form: {
    username: 'alice',
    password: 'secret123'
  }
})
// Content-Type: application/x-www-form-urlencoded
```

### Multipart Form Data

```typescript
// File uploads
const formData = new FormData()
formData.append('file', fileBlob, 'document.pdf')
formData.append('title', 'My Document')

const response = await client.post('/uploads', {
  body: formData
})
// Content-Type: multipart/form-data; boundary=...
```

### Raw Body

```typescript
// String body
const response = await client.post('/webhook', {
  body: 'raw text data',
  headers: { 'Content-Type': 'text/plain' }
})

// Buffer body
const response = await client.post('/binary', {
  body: Buffer.from([0x00, 0x01, 0x02]),
  headers: { 'Content-Type': 'application/octet-stream' }
})
```

### Stream Body

```typescript
import { createReadStream } from 'fs'

const stream = createReadStream('./large-file.json')

const response = await client.post('/upload', {
  body: stream,
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': fileSize.toString()
  }
})
```

**Related:** [Streaming Guide](/guides/advanced/streaming.md)

## Headers

Set request-specific headers:

### Common Header Patterns

```typescript
// Authentication
const response = await client.get('/protected', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
})

// Content negotiation
const response = await client.get('/users', {
  headers: {
    'Accept': 'application/json',
    'Accept-Language': 'en-US'
  }
})

// Custom headers
const response = await client.post('/api', {
  headers: {
    'X-Request-ID': requestId,
    'X-Custom-Header': 'value'
  }
})
```

### Header Merging

Request headers merge with client defaults:

```typescript
const client = recker({
  headers: {
    'User-Agent': 'MyApp/1.0',
    'Accept': 'application/json'
  }
})

// This request will have both User-Agent and Authorization
const response = await client.get('/api', {
  headers: {
    'Authorization': 'Bearer token'
  }
})
```

### Conditional Headers

```typescript
// ETags for cache validation
const response = await client.get('/resource', {
  headers: {
    'If-None-Match': etag
  }
})

if (response.status === 304) {
  console.log('Resource not modified, use cached version')
}

// Conditional updates
const response = await client.put('/resource', {
  json: updatedData,
  headers: {
    'If-Match': etag  // Only update if etag matches
  }
})
```

**Related:** [Authentication Example](/examples/02-intermediate-auth-interceptors.ts)

## Timeouts & Signals

Control request duration and cancellation:

### Request Timeout

```typescript
// Override client timeout for this request
const response = await client.get('/slow-endpoint', {
  timeout: 60000  // 60 seconds
})

// No timeout for streaming
const response = await client.get('/sse', {
  timeout: 0
})
```

### AbortController

```typescript
const controller = new AbortController()

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000)

try {
  const response = await client.get('/api', {
    signal: controller.signal
  })
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request was cancelled')
  }
}
```

### Manual Cancellation

```typescript
const controller = new AbortController()

// User clicks cancel button
cancelButton.addEventListener('click', () => {
  controller.abort()
})

const response = await client.post('/upload', {
  body: largeFile,
  signal: controller.signal
})
```

### Timeout vs AbortSignal

```typescript
// Timeout - automatic cancellation after duration
timeout: 5000

// AbortSignal - manual cancellation control
signal: controller.signal

// Both can be used together
const response = await client.get('/api', {
  timeout: 10000,              // Auto-cancel after 10s
  signal: controller.signal    // Or cancel manually
})
```

**Related:** [Timeout Configuration](/configuration/advanced.md#timeouts)

## Retry Configuration

Override client-level retry settings per request:

### Enable Retry

```typescript
// Retry this specific request
const response = await client.get('/unstable-api', {
  retry: {
    maxAttempts: 5,
    delay: 1000,
    factor: 2
  }
})
```

### Disable Retry

```typescript
// Don't retry this request (even if client has retry configured)
const response = await client.post('/critical-operation', {
  retry: false
})
```

### Method-Specific Retry

```typescript
// Retry a POST request (non-idempotent - use with caution!)
const response = await client.post('/orders', {
  json: orderData,
  retry: {
    maxAttempts: 3,
    methods: ['POST'],  // Explicitly allow POST retry
    statusCodes: [503]  // Only retry on 503 Service Unavailable
  }
})
```

### Retry Callback

```typescript
const response = await client.get('/api', {
  retry: {
    maxAttempts: 3,
    onRetry: (error, attempt) => {
      console.log(`Retry attempt ${attempt} after error:`, error.message)
    }
  }
})
```

**Related:** [Retry Guide](/guides/advanced/retry.md) | [Retry Configuration](/configuration/advanced.md#retry)

## Response Handling

Configure how responses are processed:

### Throw on Error

```typescript
// Throw on HTTP errors (4xx, 5xx)
try {
  const response = await client.get('/api', {
    throwOnError: true
  })
  const data = await response.json()
} catch (error) {
  console.error('Request failed:', error.status, error.message)
}
```

### Response Validation

```typescript
// Custom response validation
const response = await client.get('/api', {
  validateResponse: (response) => {
    // Return false to trigger error
    return response.ok && response.headers.get('Content-Type')?.includes('json')
  }
})
```

### Response Transformation

Use hooks for response transformation:

```typescript
const client = recker({
  hooks: {
    afterResponse: [
      async (response) => {
        // Add custom properties
        response.timestamp = Date.now()
        return response
      }
    ]
  }
})
```

### Parsing Helpers

```typescript
// JSON response
const data = await client.get('/users').then(r => r.json())

// Text response
const text = await client.get('/readme').then(r => r.text())

// Blob response (files)
const blob = await client.get('/image.png').then(r => r.blob())

// ArrayBuffer response
const buffer = await client.get('/binary').then(r => r.arrayBuffer())

// Stream response
const stream = (await client.get('/large-file')).body
```

## Complete Request Example

Putting it all together:

```typescript
const controller = new AbortController()

const response = await client.post('/api/users', {
  // URL parameters
  searchParams: {
    notify: true
  },

  // Request body
  json: {
    name: 'Alice',
    email: 'alice@example.com'
  },

  // Headers
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Request-ID': crypto.randomUUID()
  },

  // Timeout & cancellation
  timeout: 10000,
  signal: controller.signal,

  // Retry configuration
  retry: {
    maxAttempts: 3,
    methods: ['POST'],
    statusCodes: [503],
    onRetry: (error, attempt) => {
      console.log(`Retrying... (${attempt}/3)`)
    }
  },

  // Error handling
  throwOnError: true
})

const user = await response.json()
```

## Next Steps

- **Client-level configuration** → [Client Options](/configuration/client-options.md)
- **Advanced features** → [Advanced Configuration](/configuration/advanced.md)
- **See examples** → [Examples](/examples/README.md)
- **Back to overview** → [Configuration Quick Reference](/configuration/quick-reference.md)
