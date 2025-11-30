# Troubleshooting

Common issues and solutions.

## Connection Errors

### ECONNREFUSED

**Error**: `NetworkError: connect ECONNREFUSED 127.0.0.1:3000`

**Cause**: Server not running or wrong port.

**Solutions**:
```typescript
// Check if server is running
// netstat -tlnp | grep 3000

// Verify base URL
const client = createClient({
  baseUrl: 'http://localhost:3000'  // Check protocol and port
});

// For Docker, use service name
const client = createClient({
  baseUrl: 'http://api:3000'  // Service name instead of localhost
});
```

### ENOTFOUND

**Error**: `NetworkError: getaddrinfo ENOTFOUND api.example.com`

**Cause**: DNS resolution failed.

**Solutions**:
```typescript
// Check DNS
// nslookup api.example.com

// Use IP directly
const client = createClient({
  baseUrl: 'http://192.168.1.100:3000'
});

// Override DNS
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: {
      'api.example.com': '192.168.1.100'
    }
  }
});
```

### ECONNRESET

**Error**: `NetworkError: read ECONNRESET`

**Cause**: Connection closed by server.

**Solutions**:
```typescript
// Enable retry
const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: {
    maxAttempts: 3,
    backoff: 'exponential'
  }
});

// Check keep-alive settings
const client = createClient({
  baseUrl: 'https://api.example.com',
  pool: {
    keepAliveTimeout: 30000
  }
});
```

### ETIMEDOUT

**Error**: `TimeoutError: connect ETIMEDOUT`

**Cause**: Connection timeout (server too slow or unreachable).

**Solutions**:
```typescript
// Increase timeout
const client = createClient({
  baseUrl: 'https://api.example.com',
  timeout: {
    connect: 30000,  // 30s connect timeout
    total: 120000    // 2 min total
  }
});

// Check firewall/proxy settings
```

## Timeout Issues

### Request Timeout

**Error**: `TimeoutError: Request timed out after 30000ms`

**Solutions**:
```typescript
// Increase total timeout
const client = createClient({
  timeout: 60000  // 60 seconds
});

// Or per-request
await client.get('/slow-endpoint', {
  timeout: 120000  // 2 minutes
});
```

### First Byte Timeout

**Error**: `TimeoutError: Time to first byte exceeded`

**Solutions**:
```typescript
const client = createClient({
  timeout: {
    firstByte: 60000  // Allow 60s for first byte
  }
});
```

### Stream Timeout

**Error**: `TimeoutError: Time between bytes exceeded`

**Solutions**:
```typescript
const client = createClient({
  timeout: {
    betweenBytes: 30000  // Allow 30s between chunks
  }
});
```

## HTTP Errors

### 401 Unauthorized

**Error**: `HttpError: 401 Unauthorized`

**Solutions**:
```typescript
// Check authentication
const client = createClient({
  headers: {
    'Authorization': 'Bearer your-token'  // Verify token is correct
  }
});

// Token refresh
client.onError(async (error, req) => {
  if (error instanceof HttpError && error.status === 401) {
    const newToken = await refreshToken();
    return client.request(req.method, req.url, {
      headers: { 'Authorization': `Bearer ${newToken}` }
    });
  }
});
```

### 403 Forbidden

**Error**: `HttpError: 403 Forbidden`

**Solutions**:
- Check API permissions/scopes
- Verify IP whitelist
- Check CORS configuration

### 429 Too Many Requests

**Error**: `HttpError: 429 Too Many Requests`

**Solutions**:
```typescript
// Enable rate limiting
const client = createClient({
  concurrency: {
    requestsPerInterval: 10,
    interval: 1000  // 10 requests per second
  }
});

// Retry with backoff
const client = createClient({
  retry: {
    maxAttempts: 5,
    backoff: 'exponential',
    jitter: true,
    retryOn: [429]
  }
});

// Check Retry-After header
client.onError(async (error, req) => {
  if (error instanceof HttpError && error.status === 429) {
    const retryAfter = error.response.headers.get('Retry-After');
    if (retryAfter) {
      await sleep(parseInt(retryAfter) * 1000);
      return client.request(req.method, req.url);
    }
  }
});
```

### 500 Internal Server Error

**Error**: `HttpError: 500 Internal Server Error`

**Solutions**:
```typescript
// Retry server errors
const client = createClient({
  retry: {
    maxAttempts: 3,
    retryOn: [500, 502, 503, 504]
  }
});

// Log for debugging
client.onError((error, req) => {
  console.error(`Server error on ${req.url}:`, error.message);
});
```

## Proxy Issues

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

// Common proxy errors:
// 407 - Proxy Authentication Required
// 502 - Bad Gateway (proxy can't reach target)
// 504 - Gateway Timeout
```

## SSL/TLS Issues

### Self-Signed Certificate

**Error**: `Error: self-signed certificate`

**Solutions**:
```typescript
// Development only - not for production!
const client = createClient({
  tls: {
    rejectUnauthorized: false
  }
});

// Better: Add custom CA
const client = createClient({
  tls: {
    ca: fs.readFileSync('./ca-cert.pem')
  }
});
```

### Certificate Expired

**Error**: `Error: certificate has expired`

**Solutions**:
- Update server certificate
- Check system time is correct
- Temporarily disable validation (dev only)

### Hostname Mismatch

**Error**: `Error: hostname/IP does not match certificate's altnames`

**Solutions**:
```typescript
// Check you're using correct hostname
const client = createClient({
  baseUrl: 'https://api.example.com'  // Must match cert
});

// For development
const client = createClient({
  tls: {
    servername: 'api.example.com'
  }
});
```

## Response Issues

### JSON Parse Error

**Error**: `SyntaxError: Unexpected token`

**Solutions**:
```typescript
// Check response is actually JSON
const response = await client.get('/endpoint');
const text = await response.text();
console.log('Raw response:', text);

// Handle non-JSON responses
try {
  const data = await client.get('/endpoint').json();
} catch (error) {
  if (error instanceof SyntaxError) {
    const text = await client.get('/endpoint').text();
    console.log('Non-JSON response:', text);
  }
}
```

### Empty Response

**Error**: Response body is empty

**Solutions**:
```typescript
// Check status code first
const response = await client.get('/endpoint');

if (response.status === 204) {
  // No content is expected
  return null;
}

const data = await response.json();
```

### Large Response

**Error**: Out of memory or slow parsing

**Solutions**:
```typescript
// Stream large responses
for await (const chunk of client.get('/large-file')) {
  processChunk(chunk);
}

// Save to file
await client.get('/large-file').write('./output.bin');
```

### MaxSizeExceededError

**Error**: Response exceeded maximum allowed size.

**Solutions**:
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

// Set global limit
const client = createClient({
  maxResponseSize: 50 * 1024 * 1024  // 50MB
});
```

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

## Validation Issues

### Zod Validation Error

**Error**: `ZodError: validation failed`

**Solutions**:
```typescript
import { z } from 'zod';

const Schema = z.object({
  id: z.number(),
  name: z.string()
});

// Use safeParse for detailed errors
const result = await client.get('/data').safeParse(Schema);

if (!result.success) {
  console.error('Validation errors:', result.error.issues);
} else {
  console.log('Valid data:', result.data);
}
```

## Debug Mode

### Enable Debugging

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  debug: true
});

// Or via environment
// DEBUG=recker node app.js
```

### Custom Logger

```typescript
import pino from 'pino';

const logger = pino({ level: 'debug' });

const client = createClient({
  baseUrl: 'https://api.example.com',
  debug: true,
  logger
});
```

### Log Requests/Responses

```typescript
client.beforeRequest((req) => {
  console.log(`→ ${req.method} ${req.url}`);
  console.log('Headers:', Object.fromEntries(req.headers));
});

client.afterResponse((req, res) => {
  console.log(`← ${res.status} ${req.url} (${res.timings?.total}ms)`);
});
```

## Performance Issues

### Slow Requests

**Solutions**:
```typescript
// Check timings
const response = await client.get('/endpoint');
console.log('Timings:', response.timings);
// { dns: 50, tcp: 30, tls: 100, firstByte: 200, total: 380 }

// Enable connection pooling
const client = createClient({
  pool: {
    connections: 10,
    keepAliveTimeout: 30000
  }
});

// Enable HTTP/2
const client = createClient({
  http2: true
});
```

### High Memory Usage

**Solutions**:
```typescript
// Stream large responses instead of buffering
for await (const chunk of client.get('/large')) {
  processChunk(chunk);
}

// Limit concurrent requests
const client = createClient({
  concurrency: {
    max: 10
  }
});
```

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

### 5. "Rate limited (429)"

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

### 6. "Redirect not followed"

```typescript
// Recker follows redirects by default (up to 20)
// Check if redirect was disabled
const response = await client.get('/redirect', {
  follow: 10  // Follow up to 10 redirects
});

// Get final URL after redirects
console.log('Final URL:', response.url);
```

### 7. "CORS errors in browser"

```typescript
// CORS is a browser security feature
// Recker runs in Node.js, so no CORS issues

// If you see CORS errors, you're likely:
// 1. Running in browser (use fetch instead)
// 2. Server needs CORS headers
// 3. Proxy your requests through Node.js
```

## Common Mistakes

### Wrong Content-Type

```typescript
// Wrong: Sending JSON without content-type
await client.post('/api', {
  body: JSON.stringify({ name: 'John' })
});

// Correct: Use json option
await client.post('/api', {
  json: { name: 'John' }
});
```

### Missing await

```typescript
// Wrong: Missing await
const data = client.get('/api').json();
console.log(data);  // Promise, not data

// Correct: Await the promise
const data = await client.get('/api').json();
console.log(data);  // Actual data
```

### Response Already Consumed

```typescript
// Wrong: Reading body twice
const response = await client.get('/api');
const text = await response.text();
const json = await response.json();  // Error!

// Correct: Clone if needed
const response = await client.get('/api');
const clone = response.clone();
const text = await response.text();
const json = await clone.json();
```

## Debug Checklist

When troubleshooting issues:

1. ✅ **Enable debug mode**: `debug: true`
2. ✅ **Check response timings**: `response.timings`
3. ✅ **Verify URL is correct**: `response.url`
4. ✅ **Check status code**: `response.status`
5. ✅ **Inspect headers**: `response.headers`
6. ✅ **Test with curl**: `curl -v URL`
7. ✅ **Check network**: `ping` / `traceroute`

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

## Next Steps

- **[API Reference](01-api.md)** - Full API documentation
- **[Testing](03-testing.md)** - Test your applications
