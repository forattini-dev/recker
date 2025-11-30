# Configuration & Hooks

Client options, hooks, plugins, and middleware.

## Basic Configuration

### Creating a Client

```typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  timeout: 30000,
  headers: {
    'Authorization': 'Bearer token123'
  }
});
```

### Essential Options

```typescript
const client = createClient({
  // Base URL for all requests
  baseUrl: 'https://api.example.com',

  // Default timeout (ms)
  timeout: 30000,

  // Default headers for all requests
  headers: {
    'Authorization': 'Bearer token',
    'Accept': 'application/json'
  },

  // Default URL parameters
  defaults: {
    params: {
      version: 'v2'
    }
  },

  // Enable debug logging
  debug: true
});
```

## Hooks System

Hooks allow you to intercept and transform requests/responses.

### beforeRequest

Transform requests before they're sent:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com'
});

// Add hook via method (chainable)
client.beforeRequest((req) => {
  console.log(`→ ${req.method} ${req.url}`);

  // Add dynamic header
  return req.withHeader('X-Timestamp', Date.now().toString());
});

// Multiple hooks execute in order
client.beforeRequest((req) => {
  // Add correlation ID
  return req.withHeader('X-Correlation-ID', crypto.randomUUID());
});
```

### afterResponse

Transform or inspect responses:

```typescript
client.afterResponse((req, res) => {
  console.log(`← ${res.status} ${req.url}`);

  // Log timing
  if (res.timings?.total) {
    console.log(`  Duration: ${res.timings.total}ms`);
  }
});

// Modify response
client.afterResponse((req, res) => {
  // Add custom property
  res.requestId = res.headers.get('x-request-id');
  return res;
});
```

### onError

Handle errors or provide fallback responses:

```typescript
client.onError(async (error, req) => {
  console.error(`Request failed: ${error.message}`);

  // Return fallback response for specific errors
  if (error.name === 'TimeoutError') {
    return {
      ok: false,
      status: 504,
      statusText: 'Gateway Timeout',
      headers: new Headers(),
      json: async () => ({ error: 'Request timed out' })
    };
  }

  // Return void to rethrow error
});
```

### Constructor Hooks

Define hooks at creation time:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  hooks: {
    beforeRequest: [
      (req) => req.withHeader('X-Custom', 'value'),
      (req) => console.log('Request:', req.url)
    ],
    afterResponse: [
      (req, res) => console.log('Response:', res.status)
    ],
    onError: [
      (error) => console.error('Error:', error.message)
    ],
    onRetry: [
      (error, attempt, delay) => {
        console.log(`Retry ${attempt} after ${delay}ms`);
      }
    ]
  }
});
```

### Hook Execution Order

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
│  4. afterResponse[0]    ──┐      │
│  5. afterResponse[N]    ──┘      │
│           │                      │
│      [Response]                  │
└──────────────────────────────────┘

┌── Error ─────────────────────────┐
│  4. onError[0]  ──┐ First hook   │
│  5. onError[N]  ──┘ to return    │
│          │         Response wins │
│   [Fallback or Rethrow]          │
└──────────────────────────────────┘
```

### Error Monitoring (Sentry, DataDog)

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

### Circuit Breaker via Hooks

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
  });
```

### AI-First Hook Patterns

#### Token Usage Tracking

```typescript
client.afterResponse((req, res) => {
  if (req.url.includes('openai.com')) {
    const usage = res.headers.get('X-Request-Tokens');
    if (usage) {
      console.log(`Tokens used: ${usage}`);
    }
  }
  return res;
});
```

#### Streaming Detection

```typescript
client.afterResponse((req, res) => {
  const contentType = res.headers.get('Content-Type');
  if (contentType?.includes('text/event-stream')) {
    console.log('SSE stream started for:', req.url);
  }
  return res;
});
```

#### Model Fallback on Rate Limit

```typescript
client.onError(async (error, req) => {
  if (error.status === 429 && req.url.includes('gpt-5.1')) {
    console.log('GPT-5.1 rate limited, falling back to GPT-5.1-mini');
    const body = JSON.parse(await req.text());
    body.model = 'gpt-5.1-mini';
    return client.post(req.url, { json: body });
  }
});
```

## Middleware

Middleware wraps the entire request lifecycle.

### Creating Middleware

```typescript
import { Middleware } from 'recker';

const loggingMiddleware: Middleware = async (req, next) => {
  const start = Date.now();

  // Before request
  console.log(`→ ${req.method} ${req.url}`);

  // Call next middleware or transport
  const response = await next(req);

  // After response
  console.log(`← ${response.status} (${Date.now() - start}ms)`);

  return response;
};
```

### Registering Middleware

```typescript
// At creation
const client = createClient({
  baseUrl: 'https://api.example.com',
  middlewares: [loggingMiddleware, authMiddleware]
});

// After creation
client.use(loggingMiddleware);
```

### Middleware Order

Middleware executes in an onion model:

```
Request → [Middleware 1] → [Middleware 2] → [Transport]
                                               ↓
Response ← [Middleware 1] ← [Middleware 2] ← [Response]
```

```typescript
const middleware1: Middleware = async (req, next) => {
  console.log('1: before');
  const res = await next(req);
  console.log('1: after');
  return res;
};

const middleware2: Middleware = async (req, next) => {
  console.log('2: before');
  const res = await next(req);
  console.log('2: after');
  return res;
};

// Output:
// 1: before
// 2: before
// 2: after
// 1: after
```

## Plugins

Plugins are functions that configure the client.

### Using Built-in Plugins

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',

  // Retry plugin
  retry: {
    attempts: 3,
    backoff: 'exponential'
  },

  // Cache plugin
  cache: {
    ttl: 60000,
    strategy: 'cache-first'
  },

  // Deduplication plugin
  dedup: {
    enabled: true
  }
});
```

### Creating Custom Plugins

```typescript
import { Plugin, Middleware } from 'recker';

function myPlugin(options: { header: string }): Plugin {
  return (client) => {
    // Add middleware
    client.use(async (req, next) => {
      const modifiedReq = req.withHeader('X-Plugin', options.header);
      return next(modifiedReq);
    });

    // Add hooks
    client.beforeRequest((req) => {
      console.log('Plugin: before request');
    });
  };
}

// Use plugin
const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [myPlugin({ header: 'custom-value' })]
});
```

## Timeout Configuration

### Simple Timeout

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  timeout: 30000 // 30 seconds total
});

// Per-request override
await client.get('/slow-endpoint', { timeout: 60000 });
```

### Per-Phase Timeouts

Fine-grained control over each connection phase:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  timeout: {
    lookup: 1000,       // DNS lookup
    connect: 5000,      // TCP connection
    secureConnect: 5000, // TLS handshake
    socket: 60000,      // Socket assignment from pool
    send: 10000,        // Request send
    response: 60000,    // Time to first byte (TTFB)
    request: 120000     // Total request time
  }
});
```

## Debug & Logging

### Enable Debug Mode

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  debug: true
});

// Or via environment variable
// DEBUG=recker node app.js
```

### Custom Logger

```typescript
import pino from 'pino';

const client = createClient({
  baseUrl: 'https://api.example.com',
  debug: true,
  logger: pino({ level: 'debug' })
});

// Winston example
import winston from 'winston';

const client = createClient({
  baseUrl: 'https://api.example.com',
  debug: true,
  logger: winston.createLogger({ level: 'debug' })
});
```

### Logger Interface

```typescript
interface Logger {
  debug(msg: string): void;
  debug(obj: object, msg: string): void;
  info(msg: string): void;
  info(obj: object, msg: string): void;
  warn(msg: string): void;
  warn(obj: object, msg: string): void;
  error(msg: string): void;
  error(obj: object, msg: string): void;
}
```

## Authentication

Recker provides built-in support for multiple authentication schemes.

### Basic Auth

```typescript
import { createClient, basicAuth } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com'
});

client.use(basicAuth({
  username: 'user',
  password: 'pass'
}));

// All requests now include Authorization: Basic <base64>
```

### Bearer Token

```typescript
import { bearerAuth } from 'recker';

// Static token
client.use(bearerAuth({
  token: 'my-api-token'
}));

// Dynamic token (refreshed on each request)
client.use(bearerAuth({
  token: async () => await getAccessToken()
}));

// Custom header name
client.use(bearerAuth({
  token: 'my-token',
  type: 'Token',              // Default: 'Bearer'
  headerName: 'X-Auth-Token'  // Default: 'Authorization'
}));
```

### API Key

```typescript
import { apiKeyAuth } from 'recker';

// In header (default)
client.use(apiKeyAuth({
  key: 'my-api-key',
  name: 'X-API-Key'
}));

// In query parameter
client.use(apiKeyAuth({
  key: 'my-api-key',
  in: 'query',
  name: 'api_key'
}));
// Requests become: /endpoint?api_key=my-api-key
```

### OAuth 2.0 with Token Refresh

```typescript
import { oauth2 } from 'recker';

class TokenStore {
  private accessToken: string = '';
  private refreshToken: string = '';

  async refresh() {
    const response = await authClient.post('/oauth/token', {
      json: {
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken
      }
    });
    const data = await response.json();
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
  }

  getAccessToken() {
    return this.accessToken;
  }
}

const tokenStore = new TokenStore();

client.use(oauth2({
  accessToken: () => tokenStore.getAccessToken(),
  onTokenExpired: async () => {
    await tokenStore.refresh();
    return tokenStore.getAccessToken();
  }
}));
```

### Digest Authentication

HTTP Digest Authentication (RFC 7616) with automatic challenge handling:

```typescript
import { digestAuth } from 'recker';

client.use(digestAuth({
  username: 'user',
  password: 'pass',
  preemptive: false  // Wait for 401 challenge (default)
}));

// First request gets 401 with WWW-Authenticate
// Middleware automatically retries with computed digest
```

### AWS Signature V4

For AWS services and compatible APIs (S3, DynamoDB, etc.):

```typescript
import { awsSignatureV4 } from 'recker';

client.use(awsSignatureV4({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  sessionToken: process.env.AWS_SESSION_TOKEN,  // For STS
  region: 'us-east-1',
  service: 's3'  // or 'execute-api', 'dynamodb', etc.
}));
```

### Conditional Auth via Hooks

```typescript
client.beforeRequest(async (req) => {
  if (req.url.includes('/admin')) {
    return req.withHeader('Authorization', `Bearer ${adminToken}`);
  }
  if (req.url.includes('/api')) {
    return req.withHeader('X-API-Key', apiKey);
  }
  return req;
});
```

## Cookie Handling

### Enable Cookies

```typescript
// Simple - use built-in memory jar
const client = createClient({
  baseUrl: 'https://api.example.com',
  cookies: true
});

// With options
const client = createClient({
  baseUrl: 'https://api.example.com',
  cookies: {
    jar: true,
    ignoreInvalid: true // Ignore malformed cookies
  }
});
```

### Using cookieJar Plugin

```typescript
import { createClient, cookieJar } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [cookieJar()]
});

// 1. Login (Server sends Set-Cookie: session=abc)
await client.post('/login', { json: { user: 'me', pass: '123' } });

// 2. Next request automatically sends "Cookie: session=abc"
const profile = await client.get('/profile').json();
```

### Custom Cookie Store

```typescript
const myStore = new Map();
myStore.set('session_id', 'secret-token');

const client = createClient({
  plugins: [cookieJar({ store: myStore })]
});
```

### Custom Cookie Jar

```typescript
import { CookieJar } from 'tough-cookie';

const client = createClient({
  baseUrl: 'https://api.example.com',
  cookies: {
    jar: new CookieJar()
  }
});
```

### Cookie Security

Recker's `cookieJar` implements basic **Domain Scoping**:
- Cookies set by `api.example.com` are sent to `api.example.com`
- Cookies with `Domain=example.com` are sent to `*.example.com`
- Does **not** enforce `Secure`, `HttpOnly`, or `Path` restrictions strictly

## Proxy Configuration

### Simple Proxy

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  proxy: 'http://proxy.example.com:8080'
});
```

### Authenticated Proxy

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  proxy: {
    url: 'http://proxy.example.com:8080',
    auth: {
      username: 'user',
      password: 'password'
    }
  }
});
```

### SOCKS Proxy

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  proxy: {
    url: 'socks5://proxy.example.com:1080',
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
  baseUrl: 'https://api.example.com',
  proxy: {
    url: 'http://proxy.example.com:8080',
    bypass: [
      'localhost',
      '127.0.0.1',
      '*.internal.com',
      '192.168.0.0/16' // CIDR notation
    ]
  }
});
```

## TLS/SSL Configuration

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  tls: {
    // Protocol versions
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3',

    // Custom CA bundle
    ca: fs.readFileSync('/path/to/ca.pem'),

    // Client certificate (mTLS)
    cert: fs.readFileSync('/path/to/client.pem'),
    key: fs.readFileSync('/path/to/client-key.pem'),

    // Skip certificate validation (dangerous!)
    rejectUnauthorized: false
  }
});
```

## DNS Configuration

### Custom DNS Servers

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    servers: ['8.8.8.8', '1.1.1.1'],
    timeout: 5000,
    preferIPv4: true
  }
});
```

### DNS Override

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  dns: {
    override: {
      'api.example.com': '192.168.1.100',
      'cdn.example.com': '192.168.1.101'
    }
  }
});
```

## XSRF Protection

```typescript
// Enable with defaults
const client = createClient({
  baseUrl: 'https://api.example.com',
  xsrf: true
});

// Custom cookie/header names
const client = createClient({
  baseUrl: 'https://api.example.com',
  xsrf: {
    cookieName: 'XSRF-TOKEN',
    headerName: 'X-XSRF-TOKEN'
  }
});
```

## Request Compression

```typescript
// Enable with defaults (gzip, >1KB)
const client = createClient({
  baseUrl: 'https://api.example.com',
  compression: true
});

// Custom configuration
const client = createClient({
  baseUrl: 'https://api.example.com',
  compression: {
    algorithm: 'br', // 'gzip' | 'deflate' | 'br'
    threshold: 5120, // Only compress bodies > 5KB
    methods: ['POST', 'PUT', 'PATCH']
  }
});
```

## Response Size Limit

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  maxResponseSize: 10 * 1024 * 1024 // 10 MB
});

// Per-request override
await client.get('/large-file', {
  maxResponseSize: 100 * 1024 * 1024 // 100 MB
});
```

## Unix Socket

```typescript
// Connect to Docker daemon
const docker = createClient({
  baseUrl: 'http://localhost',
  socketPath: '/var/run/docker.sock'
});

const containers = await docker.get('/containers/json').json();
```

## Complete Configuration Reference

```typescript
interface ClientOptions {
  // Core
  baseUrl?: string;
  headers?: HeadersInit;
  timeout?: number | TimeoutOptions;

  // Defaults
  defaults?: {
    params?: Record<string, string | number>;
  };

  // Plugins (auto-wired)
  retry?: RetryOptions;
  cache?: CacheOptions;
  dedup?: DedupOptions;

  // Manual plugins
  plugins?: Plugin[];
  middlewares?: Middleware[];
  hooks?: Hooks;

  // Network
  proxy?: ProxyOptions | string;
  tls?: TLSOptions;
  dns?: DNSOptions;
  socketPath?: string;

  // HTTP/2
  http2?: boolean | HTTP2Options;

  // Concurrency
  concurrency?: number | ConcurrencyConfig;

  // Security
  xsrf?: boolean | XSRFOptions;
  cookies?: boolean | CookieOptions;

  // Performance
  compression?: boolean | CompressionOptions;
  maxResponseSize?: number;
  observability?: boolean;

  // Debugging
  debug?: boolean;
  logger?: Logger;

  // Pagination defaults
  pagination?: PaginationConfig;

  // Custom transport
  transport?: Transport;
}
```

## Best Practices

### 1. Use Base Clients

```typescript
// Create base client
const apiClient = createClient({
  baseUrl: 'https://api.example.com',
  headers: { 'Authorization': 'Bearer token' },
  timeout: 30000,
  retry: { attempts: 3 }
});

// Use throughout application
export { apiClient };
```

### 2. Environment-Based Config

```typescript
const client = createClient({
  baseUrl: process.env.API_URL,
  debug: process.env.NODE_ENV === 'development',
  timeout: parseInt(process.env.API_TIMEOUT || '30000'),
  proxy: process.env.HTTP_PROXY
});
```

### 3. Separate Concerns

```typescript
// Logging plugin
const loggingPlugin: Plugin = (client) => {
  client.afterResponse((req, res) => {
    metrics.recordRequest(req.url, res.status, res.timings?.total);
  });
};

// Auth plugin
const authPlugin: Plugin = (client) => {
  client.beforeRequest((req) => {
    return req.withHeader('Authorization', `Bearer ${getToken()}`);
  });
};

// Compose
const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [loggingPlugin, authPlugin]
});
```

### 4. Fail Fast

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  timeout: {
    lookup: 1000,    // Fast DNS failure
    connect: 3000,   // Fast connection failure
    response: 10000  // Reasonable TTFB
  }
});
```

### 5. Pool Environment Presets

```typescript
// High-traffic production
pool: { maxConnections: 50, keepAliveTimeout: 30000 }

// Serverless (short-lived functions)
pool: { maxConnections: 5, keepAliveTimeout: 1000 }

// Rate-limited API
pool: { maxConnections: 2, pipelining: 0 }
```

### 6. Environment Configuration

```typescript
const config = {
  development: {
    baseUrl: 'http://localhost:3000',
    timeout: 30000,
    debug: true,
    retry: { maxAttempts: 0 }
  },
  production: {
    baseUrl: 'https://api.example.com',
    timeout: 5000,
    debug: false,
    retry: { maxAttempts: 3 },
    throwHttpErrors: true
  }
};

const env = process.env.NODE_ENV || 'development';
const client = createClient(config[env]);
```

## Next Steps

- **[Performance](06-performance.md)** - HTTP/2, pooling, compression
- **[Resilience](07-resilience.md)** - Retry and circuit breaker
- **[Concurrency](08-concurrency.md)** - Batch requests, rate limiting
