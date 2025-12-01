# Retry Plugin

O plugin de **Retry** implementa retentativas automáticas com backoff exponencial, linear ou decorrelated, incluindo jitter para evitar thundering herd.

## Quick Start

```typescript
import { createClient, retry } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(retry({
  maxAttempts: 3,
  backoff: 'exponential',
}));

// Retenta automaticamente em caso de falha
const data = await client.get('/unstable-endpoint').json();
```

## Configuração

```typescript
interface RetryOptions {
  // Número máximo de tentativas (default: 3)
  maxAttempts?: number;

  // Delay inicial em ms (default: 1000)
  delay?: number;

  // Delay máximo em ms (default: 30000)
  maxDelay?: number;

  // Estratégia de backoff (default: 'exponential')
  backoff?: 'linear' | 'exponential' | 'decorrelated';

  // Adicionar jitter para evitar thundering herd (default: true)
  jitter?: boolean;

  // Status codes que devem ser retentados
  statusCodes?: number[];

  // Função customizada para decidir se deve retentar
  shouldRetry?: (error: unknown) => boolean;

  // Callback chamado a cada retentativa
  onRetry?: (attempt: number, error: unknown, delay: number) => void;

  // Respeitar header Retry-After (default: true)
  respectRetryAfter?: boolean;
}
```

## Estratégias de Backoff

### Exponential (Recomendado)

Delay cresce exponencialmente: 1s → 2s → 4s → 8s...

```typescript
client.use(retry({
  backoff: 'exponential',
  delay: 1000,
  maxDelay: 30000,
}));

// Attempt 1: falha, espera ~1s
// Attempt 2: falha, espera ~2s
// Attempt 3: falha, espera ~4s
// Attempt 4: sucesso!
```

### Linear

Delay cresce linearmente: 1s → 2s → 3s → 4s...

```typescript
client.use(retry({
  backoff: 'linear',
  delay: 1000,
}));
```

### Decorrelated (AWS Style)

Delay aleatório entre `delay` e `previousDelay * 3`. Usado pela AWS.

```typescript
client.use(retry({
  backoff: 'decorrelated',
  delay: 1000,
}));
```

## Jitter

Jitter adiciona ±25% de aleatoriedade ao delay para evitar que múltiplos clientes retentem simultaneamente (thundering herd):

```typescript
// Com jitter (default)
client.use(retry({
  delay: 1000,
  jitter: true, // delay será entre 750ms e 1250ms
}));

// Sem jitter
client.use(retry({
  delay: 1000,
  jitter: false, // delay será exatamente 1000ms
}));
```

## Status Codes

Por padrão, o plugin retenta em erros de rede e timeouts. Você pode especificar status codes:

```typescript
client.use(retry({
  statusCodes: [408, 429, 500, 502, 503, 504],
}));
```

## Retry-After Header

O plugin respeita o header `Retry-After` de respostas 429 (Too Many Requests) e 503 (Service Unavailable):

```typescript
client.use(retry({
  respectRetryAfter: true, // default
}));

// Se o servidor responder:
// HTTP/1.1 429 Too Many Requests
// Retry-After: 60
//
// O plugin esperará 60 segundos antes de retentar
```

Formatos suportados:
- Segundos: `Retry-After: 120`
- HTTP-date: `Retry-After: Wed, 21 Oct 2025 07:28:00 GMT`

## Custom Retry Logic

```typescript
client.use(retry({
  shouldRetry: (error) => {
    // Retentar apenas erros de rede
    if (error instanceof NetworkError) return true;

    // Retentar apenas alguns status codes
    if (error instanceof HttpError) {
      return [429, 503].includes(error.status);
    }

    return false;
  },
}));
```

## Logging de Retentativas

```typescript
client.use(retry({
  onRetry: (attempt, error, delay) => {
    console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
    console.log(`Error: ${error.message}`);
  },
}));
```

## Exemplos

### API Rate Limited

```typescript
const client = createClient({
  baseUrl: 'https://api.github.com',
});

client.use(retry({
  maxAttempts: 5,
  backoff: 'exponential',
  statusCodes: [429, 503],
  respectRetryAfter: true,
  onRetry: (attempt, error, delay) => {
    console.log(`Rate limited, retry ${attempt} in ${delay}ms`);
  },
}));
```

### Microservices Resilient

```typescript
client.use(retry({
  maxAttempts: 3,
  delay: 500,
  backoff: 'decorrelated',
  jitter: true,
  statusCodes: [500, 502, 503, 504],
}));
```

### Retry Apenas Timeouts

```typescript
import { TimeoutError } from 'recker';

client.use(retry({
  maxAttempts: 2,
  delay: 2000,
  shouldRetry: (error) => error instanceof TimeoutError,
}));
```

## Combinando com Outros Plugins

O retry funciona bem com outros plugins:

```typescript
import { createClient, retry, circuitBreaker, cache } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

// Ordem importa! Circuit breaker deve vir antes do retry
client.use(circuitBreaker({ threshold: 5 }));
client.use(retry({ maxAttempts: 3 }));
client.use(cache({ ttl: 60000 }));
```

## Dicas

1. **Use jitter** em ambientes com múltiplos clientes
2. **Respeite Retry-After** para APIs bem comportadas
3. **Limite maxAttempts** para evitar loops infinitos
4. **Use backoff exponential** para falhas persistentes
5. **Combine com Circuit Breaker** para proteção completa
