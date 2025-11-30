# HTTP Fundamentals

Master the basics of HTTP requests with Recker.

## HTTP Methods

Recker supports all standard HTTP methods plus WebDAV and CDN-specific methods.

### Standard Methods

```typescript
// GET - Retrieve data
await client.get('/users');

// POST - Create resource
await client.post('/users', { json: { name: 'John' } });

// PUT - Full update
await client.put('/users/1', { json: { name: 'John', age: 30 } });

// PATCH - Partial update
await client.patch('/users/1', { json: { age: 31 } });

// DELETE - Remove resource
await client.delete('/users/1');

// HEAD - Get headers only (no body)
await client.head('/users');

// OPTIONS - Get allowed methods
await client.options('/users');
```

### Diagnostic Methods

```typescript
// TRACE - Debug request path
await client.trace('/debug');

// CONNECT - Establish tunnel (proxies)
await client.connect('proxy.example.com:443');
```

### WebDAV Methods

```typescript
// PROPFIND - Get properties
await client.propfind('/files/doc.txt');

// PROPPATCH - Set properties
await client.proppatch('/files/doc.txt', {
  body: '<?xml version="1.0"?>...'
});

// MKCOL - Create collection (directory)
await client.mkcol('/files/new-folder');

// COPY - Copy resource
await client.copy('/files/doc.txt', {
  headers: { 'Destination': '/backup/doc.txt' }
});

// MOVE - Move resource
await client.move('/files/old.txt', {
  headers: { 'Destination': '/files/new.txt' }
});

// LOCK - Lock resource
await client.lock('/files/doc.txt');

// UNLOCK - Unlock resource
await client.unlock('/files/doc.txt', {
  headers: { 'Lock-Token': '<token>' }
});
```

### CDN/Cache Methods

```typescript
// PURGE - Invalidate cache (Varnish, Fastly, Cloudflare)
await client.purge('/cached-page');
```

## URL Parameters

### Path Parameters

Use `:param` syntax to interpolate values into the URL path:

```typescript
// Single parameter
const user = await client.get('/users/:id', {
  params: { id: '123' }
}).json();
// → GET /users/123

// Multiple parameters
const comment = await client.get('/posts/:postId/comments/:commentId', {
  params: { postId: '456', commentId: '789' }
}).json();
// → GET /posts/456/comments/789
```

### Query Parameters

Use `query` option for query string parameters:

```typescript
// Simple query
const results = await client.get('/search', {
  query: { q: 'recker', page: 1 }
}).json();
// → GET /search?q=recker&page=1

// Array values
const users = await client.get('/users', {
  query: { ids: [1, 2, 3] }
}).json();
// → GET /users?ids=1&ids=2&ids=3

// Nested objects (flattened)
const data = await client.get('/filter', {
  query: {
    filter: { status: 'active', type: 'admin' }
  }
}).json();
// → GET /filter?filter[status]=active&filter[type]=admin
```

### Combining Path and Query

```typescript
const userPosts = await client.get('/users/:id/posts', {
  params: { id: '123' },
  query: { status: 'published', limit: 10 }
}).json();
// → GET /users/123/posts?status=published&limit=10
```

## Request Headers

### Setting Headers

```typescript
// Per-request headers
const response = await client.get('/api/data', {
  headers: {
    'Authorization': 'Bearer token123',
    'Accept': 'application/json',
    'X-Request-ID': 'abc-123'
  }
});

// Using Headers object
const headers = new Headers();
headers.set('Authorization', 'Bearer token');
await client.get('/api/data', { headers });
```

### Default Headers

Set headers that apply to all requests:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'Authorization': 'Bearer token',
    'Accept': 'application/json'
  }
});

// All requests include these headers
await client.get('/users');
await client.post('/users', { json: { name: 'John' } });
```

### Common Headers

```typescript
// Authentication
headers: { 'Authorization': 'Bearer <token>' }
headers: { 'Authorization': 'Basic ' + btoa('user:pass') }
headers: { 'X-API-Key': 'your-api-key' }

// Content negotiation
headers: { 'Accept': 'application/json' }
headers: { 'Accept': 'text/html, application/json;q=0.9' }
headers: { 'Accept-Language': 'en-US,en;q=0.9' }
headers: { 'Accept-Encoding': 'gzip, deflate, br' }

// Content type (auto-set for json option)
headers: { 'Content-Type': 'application/json' }
headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
headers: { 'Content-Type': 'multipart/form-data' }

// Caching
headers: { 'Cache-Control': 'no-cache' }
headers: { 'If-None-Match': '"etag-value"' }
headers: { 'If-Modified-Since': 'Wed, 21 Oct 2024 07:28:00 GMT' }

// Custom
headers: { 'X-Request-ID': 'unique-id' }
headers: { 'X-Correlation-ID': 'trace-123' }
```

## Request Body

### JSON Body

```typescript
// Using json option (auto-sets Content-Type)
await client.post('/users', {
  json: {
    name: 'John Doe',
    email: 'john@example.com',
    age: 30
  }
});
```

### Form Data

```typescript
// URL-encoded form
await client.post('/login', {
  form: {
    username: 'john',
    password: 'secret'
  }
});
// Content-Type: application/x-www-form-urlencoded
// Body: username=john&password=secret

// Multipart form (file uploads)
const formData = new FormData();
formData.append('file', fileBlob, 'document.pdf');
formData.append('description', 'My document');

await client.post('/upload', {
  body: formData
});
// Content-Type: multipart/form-data
```

### Raw Body

```typescript
// String body
await client.post('/webhook', {
  body: 'raw string data',
  headers: { 'Content-Type': 'text/plain' }
});

// Buffer body
await client.post('/binary', {
  body: Buffer.from([0x00, 0x01, 0x02]),
  headers: { 'Content-Type': 'application/octet-stream' }
});

// Stream body
import { createReadStream } from 'fs';

await client.post('/upload', {
  body: createReadStream('./large-file.zip'),
  headers: { 'Content-Type': 'application/zip' }
});
```

### XML Body

```typescript
await client.post('/soap', {
  body: `<?xml version="1.0"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <GetUser><id>123</id></GetUser>
      </soap:Body>
    </soap:Envelope>`,
  headers: { 'Content-Type': 'application/xml' }
});
```

## Response Basics

### Status & Headers

```typescript
const response = await client.get('/users');

// Status
console.log(response.status);     // 200
console.log(response.statusText); // "OK"
console.log(response.ok);         // true (status 200-299)

// Headers
console.log(response.headers.get('content-type'));
console.log(response.headers.get('x-request-id'));

// All headers
for (const [name, value] of response.headers) {
  console.log(`${name}: ${value}`);
}
```

### URL Information

```typescript
const response = await client.get('/redirect');

// Final URL (after redirects)
console.log(response.url);

// Check if redirected
console.log(response.redirected);
```

## Error Handling

### HTTP Errors

By default, Recker throws on non-2xx responses:

```typescript
import { HttpError, NetworkError, TimeoutError } from 'recker';

try {
  await client.get('/not-found').json();
} catch (error) {
  if (error instanceof HttpError) {
    // HTTP error (4xx, 5xx)
    console.log('Status:', error.status);
    console.log('Status Text:', error.statusText);

    // Access response
    const body = await error.response.json();
    console.log('Error message:', body.error);
  }
}
```

### Disable Throwing

```typescript
const response = await client.get('/maybe-404', {
  throwHttpErrors: false
});

if (response.ok) {
  const data = await response.json();
} else {
  console.log('Request failed:', response.status);
}
```

### Network Errors

```typescript
try {
  await client.get('/api').json();
} catch (error) {
  if (error instanceof NetworkError) {
    console.log('Network error:', error.code);
    // ECONNREFUSED, ENOTFOUND, ECONNRESET, etc.
  }
}
```

### Timeout Errors

```typescript
try {
  await client.get('/slow', { timeout: 1000 }).json();
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Request timed out');
  }
}
```

### Complete Error Handling

```typescript
import {
  HttpError,
  NetworkError,
  TimeoutError,
  ReckerError
} from 'recker';

try {
  const data = await client.get('/api').json();
} catch (error) {
  if (error instanceof HttpError) {
    // Server returned error status
    if (error.status === 401) {
      // Handle unauthorized
    } else if (error.status === 404) {
      // Handle not found
    } else if (error.status >= 500) {
      // Handle server error
    }
  } else if (error instanceof TimeoutError) {
    // Request timed out
  } else if (error instanceof NetworkError) {
    // Network issue
  } else if (error instanceof ReckerError) {
    // Other Recker error
  } else {
    // Unknown error
    throw error;
  }
}
```

## Redirects

### Default Behavior

Recker follows redirects automatically (up to 20):

```typescript
const response = await client.get('/redirect');
console.log(response.url);        // Final URL
console.log(response.redirected); // true
```

### Configure Redirects

```typescript
// Disable redirects
const response = await client.get('/redirect', {
  redirect: 'manual'
});

if (response.status === 301 || response.status === 302) {
  const location = response.headers.get('location');
  console.log('Redirect to:', location);
}

// Throw on redirect
await client.get('/redirect', {
  redirect: 'error'
}); // Throws if server returns redirect

// Limit redirect count
const client = createClient({
  maxRedirects: 5
});
```

## Request Options Summary

```typescript
interface RequestOptions {
  // URL
  params?: Record<string, string>;    // Path parameters
  query?: Record<string, any>;        // Query string

  // Headers
  headers?: Record<string, string>;   // Request headers

  // Body
  json?: any;                         // JSON body
  form?: Record<string, string>;      // Form-urlencoded
  body?: BodyInit;                    // Raw body

  // Behavior
  timeout?: number;                   // Timeout in ms
  signal?: AbortSignal;               // Abort signal
  redirect?: 'follow' | 'manual' | 'error';
  throwHttpErrors?: boolean;          // Throw on 4xx/5xx

  // Auth
  auth?: {
    username: string;
    password: string;
  };
}
```

## Next Steps

- **[Responses & Data](03-responses.md)** - Parsing, streaming, downloads
- **[Validation](04-validation.md)** - Type-safe requests with Zod
- **[Configuration](05-configuration.md)** - Client options and hooks
