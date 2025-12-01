# Logger Plugin

O plugin de **Logger** fornece logging detalhado de requests e responses HTTP, útil para debugging e observabilidade.

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

## Configuração

```typescript
interface LoggerOptions {
  // Função de log customizada (default: console.log)
  log?: (...args: any[]) => void;

  // Logar request (default: true)
  logRequest?: boolean;

  // Logar response (default: true)
  logResponse?: boolean;

  // Logar headers (default: false)
  logHeaders?: boolean;

  // Logar body (default: false)
  logBody?: boolean;

  // Logar timings (default: true)
  logTimings?: boolean;

  // Logar erros (default: true)
  logErrors?: boolean;

  // Filtrar requests por URL
  filter?: (req: ReckerRequest) => boolean;

  // Formatar output
  formatter?: (entry: LogEntry) => string;
}
```

## Níveis de Detalhe

### Básico (Default)

```typescript
client.use(logger());

// GET https://api.example.com/users
// 200 OK (145ms)
```

### Com Headers

```typescript
client.use(logger({
  logHeaders: true,
}));

// GET https://api.example.com/users
// Headers: { "Accept": "application/json", "Authorization": "Bearer ..." }
// 200 OK (145ms)
// Response Headers: { "Content-Type": "application/json", ... }
```

### Com Body

```typescript
client.use(logger({
  logBody: true,
}));

// POST https://api.example.com/users
// Body: { "name": "John", "email": "john@example.com" }
// 201 Created (234ms)
// Response: { "id": 123, "name": "John", ... }
```

### Completo

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

### Estruturado

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

## Filtros

### Por URL

```typescript
client.use(logger({
  filter: (req) => !req.url.includes('/health'),
}));

// Não loga requests para /health
```

### Por Método

```typescript
client.use(logger({
  filter: (req) => req.method !== 'OPTIONS',
}));

// Não loga preflight requests
```

### Apenas Erros

```typescript
client.use(logger({
  logRequest: false,
  logResponse: false,
  logErrors: true,
}));

// Só loga quando há erro
```

## Formatter Customizado

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

## Integração com Observabilidade

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

Para debugging rápido, use o modo debug integrado:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  debug: true, // Ativa logging automático
});

// Ou via env var
// DEBUG=recker node app.js
```

## Exemplos

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

// Expor métricas
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

## Dicas

1. **Desabilite em produção** para requests de alta frequência
2. **Use filtros** para evitar logs excessivos
3. **Logs estruturados** para análise posterior
4. **Não logue tokens** - sanitize headers sensíveis
5. **Combine com tracing** para observabilidade completa
