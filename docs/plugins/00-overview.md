# Plugins

O Recker usa uma arquitetura de plugins baseada em middleware, permitindo estender funcionalidades de forma modular e composável.

## Arquitetura

Plugins são funções que recebem uma instância do `Client` e registram middlewares:

```typescript
type Plugin = (client: Client) => void;

type Middleware = (
  request: ReckerRequest,
  next: (req: ReckerRequest) => Promise<ReckerResponse>
) => Promise<ReckerResponse>;
```

### Modelo Onion

Requests passam por uma pilha de middlewares:

```
Request →  Plugin 1  →  Plugin 2  →  Plugin 3  →  Transport  → Network
                                                      ↓
Response ← Plugin 1  ←  Plugin 2  ←  Plugin 3  ←  Transport  ← Network
```

## Plugins Disponíveis

### Resiliência

| Plugin | Descrição |
|--------|-----------|
| [Retry](./02-retry.md) | Retentativas com backoff exponencial |
| [Circuit Breaker](./03-circuit-breaker.md) | Proteção contra falhas em cascata |
| [Dedup](./05-dedup.md) | Deduplicação de requests simultâneos |

### Performance

| Plugin | Descrição |
|--------|-----------|
| [Cache](./04-cache.md) | Caching HTTP com múltiplas estratégias |
| [Memory Cache](./01-memory-cache.md) | Storage de cache em memória de alta performance |
| Compression | Compressão automática de requests |

### Segurança

| Plugin | Descrição |
|--------|-----------|
| [Auth](./06-auth.md) | Autenticação (Bearer, Basic, API Key) |
| [Cookie Jar](./08-cookie-jar.md) | Gerenciamento automático de cookies |
| XSRF | Proteção contra CSRF |

### Observabilidade

| Plugin | Descrição |
|--------|-----------|
| [Logger](./07-logger.md) | Logging de requests e responses |
| Server Timing | Parse de headers Server-Timing |
| HAR Recorder | Gravação de requests em formato HAR |

### Protocolos

| Plugin | Descrição |
|--------|-----------|
| GraphQL | Cliente GraphQL integrado |
| SOAP | Cliente SOAP/XML |
| JSON-RPC | Cliente JSON-RPC 2.0 |
| gRPC-Web | Cliente gRPC-Web |
| OData | Cliente OData |

### Especialidades

| Plugin | Descrição |
|--------|-----------|
| Pagination | Paginação automática |
| Scrape | Web scraping com seletores CSS |
| HLS | Streaming HLS |
| Proxy Rotator | Rotação de proxies |
| Interface Rotator | Rotação de interfaces de rede |

## Usando Plugins

### Instalação Básica

```typescript
import { createClient, retry, cache, dedup } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

// Adicionar plugins
client.use(retry({ maxAttempts: 3 }));
client.use(cache({ ttl: 60000 }));
client.use(dedup());
```

### Via Configuração

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  retry: { maxAttempts: 3 },
  cache: { ttl: 60000 },
});
```

### Ordem dos Plugins

A ordem importa! Plugins são executados na ordem em que são adicionados:

```typescript
// ✅ Ordem recomendada
client.use(circuitBreaker()); // 1. Falha rápido se circuito aberto
client.use(retry());          // 2. Retenta falhas
client.use(dedup());          // 3. Deduplica requests
client.use(cache());          // 4. Verifica cache
client.use(auth());           // 5. Adiciona autenticação
client.use(logger());         // 6. Loga tudo

// ❌ Ordem problemática
client.use(retry());          // Vai retentar mesmo com circuito aberto!
client.use(circuitBreaker());
```

## Criando Plugins

### Plugin Simples

```typescript
import { Plugin, Middleware } from 'recker';

function myPlugin(options = {}): Plugin {
  const middleware: Middleware = async (request, next) => {
    // Antes do request
    console.log(`Starting: ${request.method} ${request.url}`);

    // Passar para o próximo middleware
    const response = await next(request);

    // Depois do response
    console.log(`Completed: ${response.status}`);

    return response;
  };

  return (client) => {
    client.use(middleware);
  };
}

// Usar
client.use(myPlugin());
```

### Plugin com Hooks

```typescript
function myPlugin(): Plugin {
  return (client) => {
    // Hook antes do request
    client.beforeRequest((request) => {
      return request.withHeader('X-Custom', 'value');
    });

    // Hook depois do response
    client.afterResponse((request, response) => {
      console.log(`${request.url}: ${response.status}`);
    });

    // Hook de erro
    client.onError((request, error) => {
      console.error(`Error on ${request.url}:`, error);
      // Pode retornar um response de fallback
    });
  };
}
```

### Plugin com Estado

```typescript
function rateLimiter(options: { maxRequests: number; window: number }): Plugin {
  const requests = new Map<number, number>();

  return (client) => {
    client.use(async (request, next) => {
      const now = Math.floor(Date.now() / options.window);
      const count = requests.get(now) || 0;

      if (count >= options.maxRequests) {
        throw new Error('Rate limit exceeded');
      }

      requests.set(now, count + 1);

      // Limpar entradas antigas
      for (const [time] of requests) {
        if (time < now) requests.delete(time);
      }

      return next(request);
    });
  };
}
```

## Composição

Combine plugins para cenários complexos:

### API Resiliente

```typescript
client.use(circuitBreaker({ threshold: 5 }));
client.use(retry({ maxAttempts: 3, backoff: 'exponential' }));
client.use(cache({ strategy: 'stale-while-revalidate' }));
client.use(dedup());
```

### Scraping

```typescript
client.use(cookieJar({ jar: new MemoryCookieJar() }));
client.use(retry({ maxAttempts: 2 }));
client.use(logger({ filter: (req) => !req.url.includes('/static/') }));
```

### Microservices

```typescript
client.use(auth({ type: 'bearer', token: getServiceToken }));
client.use(circuitBreaker({ threshold: 3 }));
client.use(retry({ statusCodes: [502, 503, 504] }));
client.use(logger({ log: structuredLog }));
```

## Melhores Práticas

1. **Ordem correta** - Circuit breaker antes de retry
2. **Dedup com cache** - Dedup antes de cache
3. **Auth antes de tudo** - Exceto circuit breaker
4. **Logger no final** - Para capturar tudo
5. **Não bloqueie** - Use async/await corretamente
6. **Trate erros** - Não engula exceções
7. **Documente opções** - Use TypeScript para tipagem
