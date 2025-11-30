# Observability

Logging, debugging, timings, metrics, and monitoring.

## Debug Mode

### Enable Debug

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  debug: true
});

// Or via environment variable
// DEBUG=recker node app.js
```

Debug output includes:
- Request method and URL
- Response status and timing
- Error details with stack traces
- Concurrency configuration

### Debug with Custom Logger

```typescript
import pino from 'pino';

const logger = pino({ level: 'debug' });

const client = createClient({
  baseUrl: 'https://api.example.com',
  debug: true,
  logger
});
```

## Logger Plugin

### Basic Logging

```typescript
import { logger } from 'recker/plugins/logger';

const client = createClient({
  baseUrl: 'https://api.example.com'
});

client.use(logger());

// Output:
// → GET https://api.example.com/users
// ← 200 GET https://api.example.com/users (150ms)
```

### With Pino

```typescript
import pino from 'pino';
import { logger } from 'recker/plugins/logger';

const log = pino({ level: 'debug' });

const client = createClient({
  baseUrl: 'https://api.example.com'
});

client.use(logger({ logger: log }));
```

### With Winston

```typescript
import winston from 'winston';
import { logger } from 'recker/plugins/logger';

const log = winston.createLogger({
  level: 'debug',
  transports: [new winston.transports.Console()]
});

const client = createClient({
  baseUrl: 'https://api.example.com'
});

client.use(logger({ logger: log }));
```

### Logger Options

```typescript
client.use(logger({
  logger: pino(),
  level: 'debug',        // 'debug' | 'info'
  showHeaders: true,     // Log request/response headers
  showBody: true,        // Log request body
  showTimings: true      // Include timing breakdown
}));
```

### Structured Logging Output

When using Pino or similar structured loggers:

```json
{
  "type": "request",
  "method": "POST",
  "url": "https://api.example.com/users",
  "headers": { "content-type": "application/json" },
  "body": { "name": "John" }
}
```

```json
{
  "type": "response",
  "method": "POST",
  "url": "https://api.example.com/users",
  "status": 201,
  "statusText": "Created",
  "ok": true,
  "duration": 150,
  "size": 245,
  "timings": {
    "dns": 15,
    "tcp": 20,
    "tls": 30,
    "firstByte": 100,
    "total": 150
  }
}
```

## Request Timings

### Access Timings

```typescript
const response = await client.get('/api/data');

console.log(response.timings);
// {
//   queuing: 2,      // Time in queue
//   dns: 15,         // DNS lookup
//   tcp: 20,         // TCP connection
//   tls: 30,         // TLS handshake
//   firstByte: 100,  // Time to first byte (TTFB)
//   content: 50,     // Content download
//   total: 217       // Total request time
// }
```

### Timing Breakdown

| Timing | Description |
|--------|-------------|
| `queuing` | Time waiting in request queue |
| `dns` | DNS resolution time |
| `tcp` | TCP connection establishment |
| `tls` | TLS/SSL handshake |
| `firstByte` | Time To First Byte (TTFB) |
| `content` | Response body download time |
| `total` | Total request duration |

### Timing Hooks

```typescript
client.afterResponse((req, res) => {
  const { timings } = res;

  // Log slow requests
  if (timings && timings.total > 1000) {
    console.warn(`Slow request: ${req.url} took ${timings.total}ms`);
  }

  // Track TTFB
  if (timings?.firstByte && timings.firstByte > 500) {
    console.warn(`High TTFB: ${timings.firstByte}ms for ${req.url}`);
  }
});
```

## Connection Info

### Access Connection Details

```typescript
const response = await client.get('/api/data');

console.log(response.connection);
// {
//   protocol: 'h2',           // HTTP version
//   cipher: 'TLS_AES_256_GCM', // TLS cipher
//   remoteAddress: '93.184.216.34',
//   remotePort: 443,
//   localAddress: '192.168.1.100',
//   localPort: 52341,
//   reused: true              // Connection was reused
// }
```

### HTTP/2 Connection Info

```typescript
if (response.connection?.http2) {
  console.log('Stream ID:', response.connection.http2.streamId);
  console.log('Max streams:', response.connection.http2.maxConcurrentStreams);
  console.log('Active streams:', response.connection.http2.currentStreams);
  console.log('Pending streams:', response.connection.http2.pendingStreams);
  console.log('Window size:', response.connection.http2.localWindowSize);
}
```

### Connection Reuse Tracking

```typescript
client.afterResponse((req, res) => {
  if (res.connection?.reused) {
    console.log('Connection reused for', req.url);
  } else {
    console.log('New connection for', req.url);
  }
});
```

## cURL Export

### Generate cURL Command

```typescript
import { toCurl } from 'recker/plugins/logger';

client.beforeRequest((req) => {
  console.log(toCurl(req));
});

// Output:
// curl \
//   -X POST \
//   'https://api.example.com/users' \
//   -H 'content-type: application/json' \
//   -H 'authorization: [REDACTED]' \
//   -d '{"name":"John"}'
```

### Debug with cURL

```typescript
client.onError((error, req) => {
  console.error('Request failed. Reproduce with:');
  console.error(toCurl(req));
});
```

## HAR Recording

Record a full session to a `.har` file, compatible with Chrome DevTools, Postman, and Insomnia.

### Record Requests

```typescript
import { createClient, harRecorder } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [
    harRecorder({ path: './session.har' })
  ]
});

// Make requests...
await client.get('/users');
await client.post('/users', { json: { name: 'John' } });

// HAR file is automatically saved
```

### HAR Recorder Options

```typescript
harRecorder({
  path: './session.har',       // Output file path
  includeTimings: true,        // Include timing data
  includeCookies: true,        // Include cookies
  redactHeaders: [             // Headers to redact
    'authorization',
    'x-api-key'
  ],
  onEntry: (entry) => {        // Callback for each entry
    console.log(`Recorded: ${entry.request.url}`);
  }
});
```

### HAR File Structure

```json
{
  "log": {
    "version": "1.2",
    "creator": { "name": "Recker", "version": "1.0.0" },
    "entries": [
      {
        "startedDateTime": "2024-01-15T10:30:00.000Z",
        "time": 150,
        "request": {
          "method": "GET",
          "url": "https://api.example.com/users",
          "headers": [...]
        },
        "response": {
          "status": 200,
          "content": { "size": 1234, "mimeType": "application/json" }
        },
        "timings": {
          "dns": 10, "connect": 25, "ssl": 40,
          "send": 1, "wait": 64, "receive": 10
        }
      }
    ]
  }
}
```

## HAR Replay (Time Travel)

Mock your entire network layer using a recorded HAR file. Zero network calls, deterministic tests.

### Replay Recorded Session

```typescript
import { createClient, harPlayer } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [
    harPlayer({
      path: './session.har',
      strict: true  // Throw if no matching entry found
    })
  ]
});

// Returns the recorded response instantly - no network!
const users = await client.get('/users').json();
```

### Mixed Mode

In non-strict mode, unmatched requests pass through to the network:

```typescript
harPlayer({
  path: './session.har',
  strict: false,     // Pass through if no match
  onMiss: (req) => { // Callback when no match found
    console.log(`No HAR entry for: ${req.url}`);
  }
});
```

### Use Cases

```typescript
// 1. Deterministic CI tests
describe('API Integration', () => {
  const client = createClient({
    plugins: [harPlayer({ path: './fixtures/api.har', strict: true })]
  });

  it('fetches users', async () => {
    const users = await client.get('/users').json();
    expect(users).toHaveLength(3);
  });
});

// 2. Offline development
const devClient = createClient({
  plugins: [harPlayer({ path: './dev-session.har', strict: false })]
});

// 3. Performance testing (no network latency)
const perfClient = createClient({
  plugins: [harPlayer({ path: './benchmark.har' })]
});
```

## Server-Timing

Inspect backend performance metrics from the `Server-Timing` header:

### Parse Server-Timing

```typescript
import { createClient, serverTiming } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [serverTiming()]
});

const response = await client.get('/dashboard');

console.log(response.serverTimings);
// [
//   { name: 'db', duration: 50, description: 'Database query' },
//   { name: 'redis', duration: 2, description: 'Cache lookup' },
//   { name: 'auth', duration: 15, description: 'Token validation' }
// ]
```

### Aggregate Server Timings

```typescript
function serverMetricsPlugin(metrics: MetricsClient): Plugin {
  return (client) => {
    client.use(serverTiming());

    client.afterResponse((req, res) => {
      for (const timing of res.serverTimings || []) {
        metrics.histogram(`server.${timing.name}`, timing.duration, {
          endpoint: new URL(req.url).pathname
        });
      }
    });
  };
}
```

## HTTP/2 Insights

When ALPN negotiates `h2`, Recker records session-level details:

### Access HTTP/2 Metadata

```typescript
const response = await client.get('/api/data');

if (response.connection?.http2) {
  const h2 = response.connection.http2;

  console.log('Max concurrent streams:', h2.maxConcurrentStreams);
  console.log('Current streams:', h2.currentStreams);
  console.log('Pending streams:', h2.pendingStreams);
  console.log('Stream ID:', h2.streamId);
  console.log('Local window size:', h2.localWindowSize);
  console.log('Remote window size:', h2.remoteWindowSize);
}
```

### HTTP/2 Session Settings

```typescript
// Access SETTINGS frames
console.log(response.connection?.http2?.localSettings);
// {
//   headerTableSize: 4096,
//   maxConcurrentStreams: 100,
//   initialWindowSize: 65535,
//   maxFrameSize: 16384,
//   maxHeaderListSize: 8192
// }
```

### Detect Head-of-Line Blocking

```typescript
function h2MonitorPlugin(): Plugin {
  return (client) => {
    client.afterResponse((req, res) => {
      const h2 = res.connection?.http2;
      if (!h2) return;

      // Warn if approaching stream limit
      if (h2.currentStreams > h2.maxConcurrentStreams * 0.8) {
        console.warn('High stream utilization:', {
          current: h2.currentStreams,
          max: h2.maxConcurrentStreams
        });
      }

      // Detect window exhaustion
      if (h2.localWindowSize < 1000) {
        console.warn('Flow control window nearly exhausted');
      }
    });
  };
}
```

## HTTP/3 Insights

QUIC/HTTP/3 sessions surface additional connection info:

### Access HTTP/3 Metadata

```typescript
const response = await client.get('/api/data', { http3: true });

if (response.connection?.http3) {
  const h3 = response.connection.http3;

  console.log('QUIC version:', h3.quicVersion);
  console.log('0-RTT used:', h3.zeroRTT);
  console.log('Max streams:', h3.maxStreams);
  console.log('Handshake confirmed:', h3.handshakeConfirmed);
  console.log('RTT:', h3.rtt, 'ms');
}
```

### Monitor QUIC Performance

```typescript
function quicMetricsPlugin(metrics: MetricsClient): Plugin {
  return (client) => {
    client.afterResponse((req, res) => {
      const h3 = res.connection?.http3;
      if (!h3) return;

      metrics.gauge('quic.rtt', h3.rtt);
      metrics.increment(h3.zeroRTT ? 'quic.0rtt.hit' : 'quic.0rtt.miss');
    });
  };
}
```

## CDN Detection

Detect and extract CDN-specific headers:

### Parse CDN Headers

```typescript
const response = await client.get('/assets/image.png');

console.log(response.cdn);
// {
//   provider: 'cloudflare',
//   cacheStatus: 'HIT',
//   pop: 'LAX',
//   rayId: 'abc123',
//   age: 3600
// }
```

### Supported CDN Providers

| Provider | Detection Headers |
|----------|------------------|
| Cloudflare | `cf-ray`, `cf-cache-status` |
| Fastly | `x-served-by`, `x-cache` |
| Akamai | `x-akamai-request-id` |
| AWS CloudFront | `x-amz-cf-id`, `x-cache` |
| Vercel | `x-vercel-id`, `x-vercel-cache` |
| Netlify | `x-nf-request-id` |

### CDN-Aware Caching

```typescript
client.afterResponse((req, res) => {
  if (res.cdn?.cacheStatus === 'HIT') {
    console.log(`CDN cache hit from ${res.cdn.pop}`);
  } else if (res.cdn?.cacheStatus === 'MISS') {
    console.log('CDN cache miss - request hit origin');
  }
});
```

## Logger Interface

### Custom Logger

```typescript
import { Logger } from 'recker';

const myLogger: Logger = {
  debug: (msgOrObj, ...args) => {
    // Custom debug handling
    sendToLogService('DEBUG', msgOrObj, args);
  },
  info: (msgOrObj, ...args) => {
    sendToLogService('INFO', msgOrObj, args);
  },
  warn: (msgOrObj, ...args) => {
    sendToLogService('WARN', msgOrObj, args);
  },
  error: (msgOrObj, ...args) => {
    sendToLogService('ERROR', msgOrObj, args);
  }
};

const client = createClient({
  baseUrl: 'https://api.example.com',
  logger: myLogger,
  debug: true
});
```

### Level Filtering

```typescript
import { createLevelLogger, consoleLogger } from 'recker';

// Only log info level and above
const filteredLogger = createLevelLogger(consoleLogger, 'info');

const client = createClient({
  baseUrl: 'https://api.example.com',
  logger: filteredLogger,
  debug: true
});
```

### Silent Logger

```typescript
import { silentLogger } from 'recker';

// Disable all logging
const client = createClient({
  baseUrl: 'https://api.example.com',
  logger: silentLogger
});
```

## Metrics Collection

### Custom Metrics Plugin

```typescript
import { Plugin, Middleware } from 'recker';

function metricsPlugin(metrics: MetricsClient): Plugin {
  return (client) => {
    client.afterResponse((req, res) => {
      // Record duration
      metrics.histogram('http_request_duration_ms', res.timings?.total || 0, {
        method: req.method,
        status: String(res.status),
        host: new URL(req.url).host
      });

      // Count requests
      metrics.increment('http_requests_total', {
        method: req.method,
        status: String(res.status)
      });

      // Track response size
      const size = res.headers.get('content-length');
      if (size) {
        metrics.histogram('http_response_size_bytes', parseInt(size), {
          method: req.method
        });
      }
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

### Prometheus Metrics

```typescript
import { Registry, Histogram, Counter } from 'prom-client';

const registry = new Registry();

const requestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'status', 'host'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [registry]
});

const requestCount = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'status'],
  registers: [registry]
});

function prometheusPlugin(): Plugin {
  return (client) => {
    client.afterResponse((req, res) => {
      const duration = (res.timings?.total || 0) / 1000;
      requestDuration.observe(
        { method: req.method, status: res.status, host: new URL(req.url).host },
        duration
      );
      requestCount.inc({ method: req.method, status: res.status });
    });
  };
}
```

### StatsD Metrics

```typescript
import StatsD from 'hot-shots';

const statsd = new StatsD({ prefix: 'http.' });

function statsdPlugin(): Plugin {
  return (client) => {
    client.afterResponse((req, res) => {
      const tags = [`method:${req.method}`, `status:${res.status}`];

      statsd.timing('request.duration', res.timings?.total || 0, tags);
      statsd.increment('request.count', tags);
    });

    client.onError((error, req) => {
      statsd.increment('request.error', [`method:${req.method}`, `error:${error.name}`]);
    });
  };
}
```

## Header Information

### Cache Headers

```typescript
const response = await client.get('/api/data');

console.log(response.cache);
// {
//   hit: true,
//   provider: 'cloudflare',
//   age: 120,
//   maxAge: 3600
// }
```

### Rate Limit Headers

```typescript
const response = await client.get('/api/data');

console.log(response.rateLimit);
// {
//   limit: 100,
//   remaining: 95,
//   reset: 1699876543,
//   retryAfter: null
// }

if (response.rateLimit.remaining < 10) {
  console.warn('Rate limit almost exhausted');
}
```

### All Header Info

```typescript
const response = await client.get('/api/data');

console.log(response.headerInfo);
// {
//   cache: { hit: true, provider: 'cloudflare', ... },
//   rateLimit: { limit: 100, remaining: 95, ... },
//   ...
// }
```

## Tracing

### Request ID Injection

```typescript
function tracingPlugin(): Plugin {
  return (client) => {
    client.beforeRequest((req) => {
      const requestId = crypto.randomUUID();
      const traceId = getTraceIdFromContext(); // from OpenTelemetry, etc.

      return req
        .withHeader('X-Request-ID', requestId)
        .withHeader('X-Trace-ID', traceId || requestId);
    });
  };
}
```

### Distributed Tracing

```typescript
import { trace, context, propagation } from '@opentelemetry/api';

function otelPlugin(): Plugin {
  return (client) => {
    const tracer = trace.getTracer('recker');

    const middleware: Middleware = async (req, next) => {
      const span = tracer.startSpan(`HTTP ${req.method}`, {
        attributes: {
          'http.method': req.method,
          'http.url': req.url
        }
      });

      // Inject trace context into headers
      const headers: Record<string, string> = {};
      propagation.inject(context.active(), headers);

      let modifiedReq = req;
      for (const [key, value] of Object.entries(headers)) {
        modifiedReq = modifiedReq.withHeader(key, value);
      }

      try {
        const response = await next(modifiedReq);

        span.setAttribute('http.status_code', response.status);
        span.setStatus({ code: response.ok ? 0 : 1 });
        span.end();

        return response;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: 2 });
        span.end();
        throw error;
      }
    };

    client.use(middleware);
  };
}
```

## Performance Monitoring

### Slow Request Detection

```typescript
function slowRequestPlugin(threshold: number = 1000): Plugin {
  return (client) => {
    client.afterResponse((req, res) => {
      if (res.timings && res.timings.total > threshold) {
        console.warn(`Slow request detected:`, {
          url: req.url,
          method: req.method,
          duration: res.timings.total,
          timings: res.timings
        });
      }
    });
  };
}
```

### Performance Summary

```typescript
class PerformanceTracker {
  private requests: Array<{ url: string; duration: number }> = [];

  track(url: string, duration: number) {
    this.requests.push({ url, duration });
  }

  summary() {
    const durations = this.requests.map(r => r.duration);
    const sorted = [...durations].sort((a, b) => a - b);

    return {
      count: durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
}

const tracker = new PerformanceTracker();

client.afterResponse((req, res) => {
  if (res.timings?.total) {
    tracker.track(req.url, res.timings.total);
  }
});

// Later
console.log(tracker.summary());
// { count: 1000, min: 50, max: 5000, avg: 200, p50: 150, p95: 500, p99: 1000 }
```

## Disable Observability

For maximum performance when you don't need timings:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  observability: false
});

// response.timings and response.connection will be empty
// But request processing is faster
```

## Best Practices

### 1. Use Structured Logging in Production

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined
});

client.use(logger({ logger, showTimings: true }));
```

### 2. Redact Sensitive Data

```typescript
// Authorization headers are automatically redacted
// Add custom redaction for other sensitive headers

client.beforeRequest((req) => {
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    if (k.toLowerCase().includes('secret') || k.toLowerCase().includes('token')) {
      headers[k] = '[REDACTED]';
    } else {
      headers[k] = v;
    }
  });
  logger.debug({ headers }, 'Request headers');
});
```

### 3. Sample High-Volume Requests

```typescript
function sampledLogger(sampleRate: number = 0.1): Plugin {
  return (client) => {
    client.afterResponse((req, res) => {
      if (Math.random() < sampleRate) {
        console.log({
          url: req.url,
          status: res.status,
          duration: res.timings?.total
        });
      }
    });
  };
}
```

### 4. Set Up Alerts

```typescript
function alertingPlugin(alerter: Alerter): Plugin {
  let errorCount = 0;
  const errorThreshold = 10;
  const windowMs = 60000;

  setInterval(() => {
    if (errorCount > errorThreshold) {
      alerter.send('High error rate detected', { errorCount });
    }
    errorCount = 0;
  }, windowMs);

  return (client) => {
    client.onError(() => {
      errorCount++;
    });
  };
}
```

## Next Steps

- **[Plugins](10-plugins.md)** - Create custom observability plugins
- **[Testing](../reference/testing.md)** - Test with mocked responses
- **[Resilience](07-resilience.md)** - Monitor retry behavior
