# Troubleshooting

This guide covers common issues, debugging techniques, and solutions for Recker.

## Quick Diagnosis

```typescript
// Enable debug mode for full request/response logging
const client = createClient({
  baseUrl: 'https://api.example.com',
  debug: true
});

// Or via environment variable
// DEBUG=recker node app.js
```

---

## Common Errors

### NetworkError

Connection-level failures before the request completes.

```typescript
import { NetworkError } from 'recker';

try {
  await client.get('/api');
} catch (error) {
  if (error instanceof NetworkError) {
    console.log('Code:', error.code);  // ECONNRESET, ENOTFOUND, ECONNREFUSED
    console.log('Message:', error.message);
  }
}
```

**Common Codes:**

| Code | Meaning | Solution |
|------|---------|----------|
| `ECONNRESET` | Connection reset by server | Retry, check server health |
| `ENOTFOUND` | DNS lookup failed | Check URL, verify DNS |
| `ECONNREFUSED` | Server refused connection | Check server is running |
| `ETIMEDOUT` | Connection timed out | Increase timeout, check network |
| `CERT_HAS_EXPIRED` | SSL certificate expired | Update server certificate |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | SSL verification failed | Check certificate chain |

**Solutions:**

```typescript
// Retry on connection reset
const client = createClient({
  plugins: [
    retry({
      maxAttempts: 3,
      shouldRetry: (error) => {
        if (error instanceof NetworkError) {
          return ['ECONNRESET', 'ETIMEDOUT'].includes(error.code);
        }
        return false;
      }
    })
  ]
});
```

### TimeoutError

Request exceeded the configured timeout.

```typescript
import { TimeoutError } from 'recker';

try {
  await client.get('/slow-endpoint', { timeout: 5000 });
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Request timed out after', error.timeout, 'ms');
  }
}
```

**Solutions:**

```typescript
// Increase timeout
const response = await client.get('/slow-endpoint', {
  timeout: 30000  // 30 seconds
});

// Per-phase timeouts to identify bottleneck
const response = await client.get('/endpoint', {
  timeout: {
    lookup: 5000,    // DNS lookup
    connect: 10000,  // TCP connection
    secureConnect: 10000,  // TLS handshake
    request: 60000   // Total request
  }
});
```

### HttpError

Server returned a non-2xx status code.

```typescript
import { HttpError } from 'recker';

try {
  await client.get('/not-found');
} catch (error) {
  if (error instanceof HttpError) {
    console.log('Status:', error.status);        // 404
    console.log('StatusText:', error.statusText); // "Not Found"
    console.log('Response:', error.response);     // Full Response object
  }
}
```

**Disable for specific requests:**

```typescript
// Don't throw on 4xx/5xx
const response = await client.get('/maybe-exists', {
  throwHttpErrors: false
});

if (response.ok) {
  const data = await response.json();
} else {
  console.log('Request failed with status:', response.status);
}
```

### MaxSizeExceededError

Response exceeded the maximum allowed size.

```typescript
import { MaxSizeExceededError } from 'recker';

try {
  await client.get('/large-file', {
    maxResponseSize: 10 * 1024 * 1024  // 10MB limit
  });
} catch (error) {
  if (error instanceof MaxSizeExceededError) {
    console.log('Response too large:', error.received, 'bytes');
  }
}
```

---

## Debug Mode

### Enabling Debug Mode

```typescript
// Via options
const client = createClient({
  debug: true
});

// Via environment variable
// DEBUG=recker node app.js
// DEBUG=recker:* node app.js  // More verbose
```

### Debug Output

```
→ GET https://api.example.com/users
  Headers: Authorization: Bearer ***, Content-Type: application/json
← 200 OK (127ms)
  Timings: dns=12ms tcp=23ms tls=45ms ttfb=89ms total=127ms
  Headers: content-type: application/json, x-request-id: abc123
```

### Custom Debug Logger

```typescript
import { createClient, createLogger } from 'recker';

const logger = createLogger({
  level: 'debug',
  pretty: true
});

const client = createClient({
  debug: true,
  logger
});
```

---

## Timeout Issues

### Diagnosing Slow Requests

```typescript
const response = await client.get('/slow-endpoint');

// Check timings
console.log('Timings:', response.timings);
// {
//   queuing: 5,     // Time in queue
//   dns: 45,        // DNS lookup
//   tcp: 23,        // TCP connection
//   tls: 67,        // TLS handshake
//   firstByte: 234, // Time to first byte
//   total: 374      // Total duration
// }

// Identify bottleneck
const { dns, tcp, tls, firstByte, total } = response.timings;
if (dns > 100) console.log('DNS is slow - consider caching');
if (tcp > 100) console.log('TCP slow - check network');
if (tls > 200) console.log('TLS slow - check cipher suite');
if (firstByte > 500) console.log('Server slow - optimize backend');
```

### Timeout Strategies

```typescript
// Global timeout for all requests
const client = createClient({
  timeout: 10000  // 10 seconds
});

// Per-request override
await client.get('/fast', { timeout: 2000 });
await client.get('/slow', { timeout: 60000 });

// Phase-specific timeouts
await client.get('/endpoint', {
  timeout: {
    lookup: 2000,        // DNS
    connect: 5000,       // TCP
    secureConnect: 5000, // TLS
    request: 30000       // Total
  }
});
```

---

## SSL/TLS Problems

### Certificate Verification Failed

```
Error: UNABLE_TO_VERIFY_LEAF_SIGNATURE
Error: CERT_HAS_EXPIRED
Error: SELF_SIGNED_CERT_IN_CHAIN
```

**Development workaround (NOT for production):**

```typescript
const client = createClient({
  tls: {
    rejectUnauthorized: false  // Disable verification
  }
});
```

**Proper solutions:**

```typescript
// Use custom CA certificate
const client = createClient({
  tls: {
    ca: fs.readFileSync('./ca-certificate.pem')
  }
});

// Use system CA bundle
const client = createClient({
  tls: {
    ca: require('ssl-root-cas').create()
  }
});
```

### TLS Version Issues

```typescript
// Force specific TLS version
const client = createClient({
  tls: {
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3'
  }
});

// Check TLS version used
const response = await client.get('/secure');
console.log('TLS Protocol:', response.connection.protocol);
// 'TLSv1.3'
```

### Cipher Suite Problems

```typescript
// Specify allowed ciphers
const client = createClient({
  tls: {
    ciphers: 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256'
  }
});

// Check cipher used
const response = await client.get('/secure');
console.log('Cipher:', response.connection.cipher);
// 'TLS_AES_256_GCM_SHA384'
```

---

## Proxy Configuration

### Basic Proxy Setup

```typescript
const client = createClient({
  proxy: {
    url: 'http://proxy.company.com:8080'
  }
});
```

### Authenticated Proxy

```typescript
const client = createClient({
  proxy: {
    url: 'http://proxy.company.com:8080',
    auth: {
      username: 'user',
      password: 'pass'
    }
  }
});
```

### Proxy Bypass

```typescript
const client = createClient({
  proxy: {
    url: 'http://proxy.company.com:8080',
    bypass: [
      'localhost',
      '127.0.0.1',
      '*.internal.company.com',
      '10.0.0.0/8'
    ]
  }
});
```

### HTTPS Through Proxy

```typescript
const client = createClient({
  proxy: {
    url: 'http://proxy.company.com:8080',
    tunnel: true  // Use CONNECT method for HTTPS
  }
});
```

### Debugging Proxy Issues

```typescript
// Check if proxy is being used
const response = await client.get('/api');
console.log('Via Proxy:', response.headers.get('Via'));

// Common proxy errors
// 407 - Proxy Authentication Required
// 502 - Bad Gateway (proxy can't reach target)
// 504 - Gateway Timeout
```

---

## Memory Issues

### Large Response Handling

```typescript
// DON'T: Load entire response into memory
const data = await client.get('/huge-file').json();

// DO: Stream the response
const response = await client.get('/huge-file');
for await (const chunk of response) {
  processChunk(chunk);
}

// Or write directly to file
await client.get('/huge-file').write('./downloaded-file.bin');
```

### Limiting Response Size

```typescript
// Global limit
const client = createClient({
  maxResponseSize: 50 * 1024 * 1024  // 50MB
});

// Per-request limit
await client.get('/file', {
  maxResponseSize: 10 * 1024 * 1024  // 10MB
});
```

### Memory Leak Prevention

```typescript
// Always consume or cancel responses
const response = await client.get('/data');
await response.json();  // Consume body

// Or explicitly cancel
const promise = client.get('/data');
promise.cancel();

// Clean up abort controllers
const controller = new AbortController();
try {
  await client.get('/data', { signal: controller.signal });
} finally {
  // Controller is cleaned up automatically
}
```

### Connection Pool Management

```typescript
// Limit connections to prevent memory growth
const client = createClient({
  concurrency: {
    agent: {
      keepAliveTimeout: 4000,
      keepAliveMaxTimeout: 600000,
      maxRequestsPerClient: 1000,
      clientTtl: 300000  // Recycle connections every 5 min
    }
  }
});
```

---

## Performance Issues

### Slow First Request

The first request is often slower due to:
- DNS lookup (cached for subsequent requests)
- TCP connection establishment
- TLS handshake
- Connection pool warmup

```typescript
// Warm up connection pool
await client.head('/health');

// Now subsequent requests are faster
const data = await client.get('/users').json();
```

### HTTP/2 Optimization

```typescript
// Enable HTTP/2 for connection multiplexing
const client = createClient({
  http2: {
    enabled: true,
    maxConcurrentStreams: 200
  }
});

// Verify HTTP/2 is being used
const response = await client.get('/api');
console.log('Protocol:', response.connection.protocol);
// 'h2' for HTTP/2
```

### Request Deduplication

```typescript
import { createClient, dedup } from 'recker';

const client = createClient({
  plugins: [dedup()]
});

// These run as a single request
const [a, b, c] = await Promise.all([
  client.get('/users').json(),
  client.get('/users').json(),  // Deduplicated
  client.get('/users').json()   // Deduplicated
]);
```

### Caching

```typescript
import { createClient, cache, MemoryStorage } from 'recker';

const client = createClient({
  plugins: [
    cache({
      storage: new MemoryStorage(),
      ttl: 60000,  // 1 minute
      strategy: 'cache-first'
    })
  ]
});

// Second request is instant (from cache)
await client.get('/static-data').json();
await client.get('/static-data').json();  // Cache hit
```

### Batch Requests

```typescript
// Instead of sequential requests
for (const id of userIds) {
  await client.get(`/users/${id}`).json();  // Slow!
}

// Use batch for parallel execution
const { results } = await client.batch(
  userIds.map(id => ({ path: `/users/${id}` })),
  { concurrency: 10 }
);
```

---

## Common Scenarios

### 1. "Request failed with no response"

```typescript
// Usually a network or timeout issue
try {
  await client.get('/api');
} catch (error) {
  if (error instanceof NetworkError) {
    // DNS, connection, or TLS failure
    console.log('Network error:', error.code);
  } else if (error instanceof TimeoutError) {
    // Request took too long
    console.log('Timeout after:', error.timeout, 'ms');
  }
}
```

### 2. "Response body already consumed"

```typescript
// WRONG: Can't read body twice
const response = await client.get('/api');
const text = await response.text();
const json = await response.json();  // Error!

// RIGHT: Clone if you need both
const response = await client.get('/api');
const clone = response.clone();
const text = await response.text();
const json = await clone.json();

// OR: Just use the response method you need
const data = await client.get('/api').json();
```

### 3. "Headers are empty"

```typescript
// Response headers might be lowercase
const response = await client.get('/api');

// Use get() with any casing
const contentType = response.headers.get('Content-Type');
const contentType2 = response.headers.get('content-type');  // Same

// Iterate all headers
for (const [key, value] of response.headers.entries()) {
  console.log(`${key}: ${value}`);
}
```

### 4. "JSON parse error"

```typescript
// Server might not return JSON
const response = await client.get('/api');
const contentType = response.headers.get('Content-Type');

if (contentType?.includes('application/json')) {
  const data = await response.json();
} else {
  console.log('Not JSON:', await response.text());
}

// Or use safe parsing
const data = await client.get('/api')
  .json()
  .catch(() => null);  // Returns null if not JSON
```

### 5. "CORS errors in browser"

```typescript
// CORS is a browser security feature
// Recker runs in Node.js, so no CORS issues

// If you see CORS errors, you're likely:
// 1. Running in browser (use fetch instead)
// 2. Server needs CORS headers
// 3. Proxy your requests through Node.js
```

### 6. "Rate limited (429)"

```typescript
import { createClient, retry } from 'recker';

const client = createClient({
  plugins: [
    retry({
      maxAttempts: 5,
      statusCodes: [429],
      respectRetryAfter: true,  // Wait for Retry-After header
      backoff: 'exponential',
      jitter: true
    })
  ]
});
```

### 7. "Redirect not followed"

```typescript
// Recker follows redirects by default (up to 20)
// Check if redirect was disabled
const response = await client.get('/redirect', {
  follow: 10  // Follow up to 10 redirects
});

// Get final URL after redirects
console.log('Final URL:', response.url);
```

---

## Getting Help

### Debug Checklist

1. ✅ Enable debug mode: `debug: true`
2. ✅ Check response timings: `response.timings`
3. ✅ Verify URL is correct: `response.url`
4. ✅ Check status code: `response.status`
5. ✅ Inspect headers: `response.headers`
6. ✅ Test with curl: `curl -v URL`
7. ✅ Check network: `ping` / `traceroute`

### Reporting Issues

When reporting issues, include:

```typescript
// Version info
import { version } from 'recker';
console.log('Recker version:', version);
console.log('Node.js version:', process.version);

// Minimal reproduction
const client = createClient({
  baseUrl: 'https://api.example.com',
  debug: true
});

try {
  await client.get('/problematic-endpoint');
} catch (error) {
  console.log('Error:', error);
  console.log('Stack:', error.stack);
}
```

### Resources

- [GitHub Issues](https://github.com/your-org/recker/issues)
- [API Reference](/api/README.md)
- [Examples](/examples/)
