# Logger Plugin

The **Logger** plugin provides detailed logging of HTTP requests and responses, useful for debugging and observability.

## Quick Start

```typescript
import { createClient, logger } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(logger());

await client.get('/users').json();
// [16:30:45] GET https://api.example.com/users
// [16:30:45] 200 OK (145ms)
```

## Configuration

```typescript
interface LoggerOptions {
  // Custom log function (default: console.log)
  log?: (...args: any[]) => void;

  // Log request (default: true)
  logRequest?: boolean;

  // Log response (default: true)
  logResponse?: boolean;

  // Log headers (default: false)
  logHeaders?: boolean;

  // Log body (default: false)
  logBody?: boolean;

  // Log timings (default: true)
  logTimings?: boolean;

  // Log errors (default: true)
  logErrors?: boolean;

  // Filter requests by URL
  filter?: (req: ReckerRequest) => boolean;

  // Format output
  formatter?: (entry: LogEntry) => string;
}
```

## Detail Levels

### Basic (Default)

```typescript
client.use(logger());

// GET https://api.example.com/users
// 200 OK (145ms)
```

### With Headers

```typescript
client.use(logger({
  logHeaders: true,
}));

// GET https://api.example.com/users
// Headers: { "Accept": "application/json", "Authorization": "Bearer ..." }
// 200 OK (145ms)
// Response Headers: { "Content-Type": "application/json", ... }
```

### With Body

```typescript
client.use(logger({
  logBody: true,
}));

// POST https://api.example.com/users
// Body: { "name": "John", "email": "john@example.com" }
// 201 Created (234ms)
// Response: { "id": 123, "name": "John", ... }
```

### Full

```typescript
client.use(logger({
  logHeaders: true,
  logBody: true,
  logTimings: true,
}));
```

## Custom Logger

### Pino

```typescript
import pino from 'pino';

const log = pino();

client.use(logger({
  log: (message) => log.info(message),
}));
```

### Winston

```typescript
import winston from 'winston';

const winstonLogger = winston.createLogger({ /* config */ });

client.use(logger({
  log: (...args) => winstonLogger.info(args.join(' ')),
}));
```

### Structured

```typescript
client.use(logger({
  log: (entry) => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      method: entry.method,
      url: entry.url,
      status: entry.status,
      duration: entry.duration,
    }));
  },
}));
```

## Filters

### By URL

```typescript
client.use(logger({
  filter: (req) => !req.url.includes('/health'),
}));

// Doesn't log requests to /health
```

### By Method

```typescript
client.use(logger({
  filter: (req) => req.method !== 'OPTIONS',
}));

// Doesn't log preflight requests
```

### Errors Only

```typescript
client.use(logger({
  logRequest: false,
  logResponse: false,
  logErrors: true,
}));

// Only logs when there's an error
```

## Custom Formatter

```typescript
client.use(logger({
  formatter: (entry) => {
    const emoji = entry.status >= 400 ? '❌' : '✅';
    return `${emoji} ${entry.method} ${entry.url} → ${entry.status} (${entry.duration}ms)`;
  },
}));

// ✅ GET https://api.example.com/users → 200 (145ms)
// ❌ POST https://api.example.com/users → 400 (89ms)
```

## Observability Integration

### OpenTelemetry

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('http-client');

client.use(logger({
  log: (entry) => {
    const span = tracer.startSpan(`HTTP ${entry.method}`);
    span.setAttribute('http.method', entry.method);
    span.setAttribute('http.url', entry.url);
    span.setAttribute('http.status_code', entry.status);
    span.end();
  },
}));
```

### Datadog

```typescript
import { tracer } from 'dd-trace';

client.use(logger({
  log: (entry) => {
    const span = tracer.startSpan('http.request');
    span.setTag('http.method', entry.method);
    span.setTag('http.url', entry.url);
    span.setTag('http.status_code', entry.status);
    span.finish();
  },
}));
```

## Debug Mode

For quick debugging, use the built-in debug mode:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  debug: true, // Enables automatic logging
});

// Or via env var
// DEBUG=recker node app.js
```

## Examples

### Development

```typescript
const isDev = process.env.NODE_ENV === 'development';

client.use(logger({
  logHeaders: isDev,
  logBody: isDev,
  log: isDev ? console.log : () => {},
}));
```

### Production Metrics

```typescript
const metrics = {
  requests: 0,
  errors: 0,
  totalDuration: 0,
};

client.use(logger({
  logRequest: false,
  logResponse: false,
  log: (entry) => {
    metrics.requests++;
    metrics.totalDuration += entry.duration;
    if (entry.status >= 400) metrics.errors++;
  },
}));

// Expose metrics
app.get('/metrics', (req, res) => {
  res.json({
    ...metrics,
    avgDuration: metrics.totalDuration / metrics.requests,
    errorRate: metrics.errors / metrics.requests,
  });
});
```

### Request Correlation

```typescript
import { randomUUID } from 'node:crypto';

client.use(logger({
  formatter: (entry) => {
    const correlationId = entry.headers?.['x-correlation-id'] || randomUUID();
    return JSON.stringify({
      correlationId,
      ...entry,
    });
  },
}));
```

## Tips

1. **Disable in production** for high-frequency requests
2. **Use filters** to avoid excessive logs
3. **Structured logs** for later analysis
4. **Don't log tokens** - sanitize sensitive headers
5. **Combine with tracing** for complete observability
