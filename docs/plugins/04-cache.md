# Cache Plugin

O plugin de **Cache** implementa caching HTTP com suporte a múltiplas estratégias, storage backends, e compliance RFC 7234.

## Quick Start

```typescript
import { createClient, cache, MemoryStorage } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(cache({
  storage: new MemoryStorage({ maxMemoryBytes: 100 * 1024 * 1024 }),
  ttl: 60000, // 1 minuto
}));

// Primeira chamada - busca da API
const users1 = await client.get('/users').json();

// Segunda chamada - retorna do cache
const users2 = await client.get('/users').json();
```

## Configuração

```typescript
interface CacheOptions {
  // Backend de armazenamento
  storage?: CacheStorage;

  // Estratégia de cache
  strategy?: CacheStrategy;

  // TTL padrão em ms (fallback quando não há Cache-Control)
  ttl?: number;

  // Métodos HTTP a cachear (default: ['GET'])
  methods?: string[];

  // Gerador de chave customizado
  keyGenerator?: (req: ReckerRequest) => string;

  // Respeitar Cache-Control headers (default: true)
  respectCacheControl?: boolean;

  // Incluir Vary header na chave do cache (default: true)
  respectVary?: boolean;

  // Tempo máximo para servir conteúdo stale (default: 0)
  maxStale?: number;

  // Forçar revalidação em cada request (default: false)
  forceRevalidate?: boolean;
}
```

## Estratégias

### cache-first (Default)

Retorna do cache se disponível, senão busca da rede:

```typescript
client.use(cache({
  strategy: 'cache-first',
  ttl: 300000, // 5 minutos
}));

// 1. Verifica cache
// 2. Se encontrou e não expirou → retorna cache
// 3. Se não encontrou → busca da rede, salva no cache
```

### stale-while-revalidate

Retorna cache imediatamente (mesmo stale), atualiza em background:

```typescript
client.use(cache({
  strategy: 'stale-while-revalidate',
  ttl: 60000,
  maxStale: 300000, // Aceita até 5 min de stale
}));

// 1. Retorna cache imediatamente (mesmo expirado)
// 2. Busca atualização em background
// 3. Próximo request terá dados frescos
```

### network-only

Sempre busca da rede, ignora cache:

```typescript
client.use(cache({
  strategy: 'network-only',
}));

// Útil para forçar refresh em requests específicos
```

### rfc-compliant

Implementação completa do RFC 7234:

```typescript
client.use(cache({
  strategy: 'rfc-compliant',
  respectCacheControl: true,
  respectVary: true,
}));

// Respeita:
// - Cache-Control: max-age, no-cache, no-store, private, public
// - Expires header
// - ETag e Last-Modified para revalidação
// - Vary header para variantes
```

### revalidate

Sempre revalida com servidor antes de usar cache:

```typescript
client.use(cache({
  strategy: 'revalidate',
}));

// Sempre envia If-None-Match ou If-Modified-Since
// Servidor retorna 304 Not Modified se não mudou
```

## Storage Backends

### MemoryStorage (Default)

```typescript
import { MemoryStorage } from 'recker';

client.use(cache({
  storage: new MemoryStorage({
    maxMemoryBytes: 100 * 1024 * 1024,
    compression: { enabled: true },
    evictionPolicy: 'lru',
  }),
}));
```

Ver [Memory Cache](./01-memory-cache.md) para documentação completa.

### FileStorage

```typescript
import { FileStorage } from 'recker';

client.use(cache({
  storage: new FileStorage({
    directory: './cache',
    maxSize: 500 * 1024 * 1024, // 500MB
  }),
}));
```

### RedisStorage

```typescript
import { RedisStorage } from 'recker';
import { createClient as createRedisClient } from 'redis';

const redis = createRedisClient({ url: 'redis://localhost:6379' });
await redis.connect();

client.use(cache({
  storage: new RedisStorage({ client: redis }),
}));
```

### Custom Storage

Implemente a interface `CacheStorage`:

```typescript
interface CacheStorage {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, entry: CacheEntry, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  has?(key: string): boolean;
  clear?(): void;
}

class MyStorage implements CacheStorage {
  async get(key: string) { /* ... */ }
  async set(key: string, entry: CacheEntry, ttl?: number) { /* ... */ }
  async delete(key: string) { /* ... */ }
}

client.use(cache({ storage: new MyStorage() }));
```

## Cache-Control

O plugin respeita headers Cache-Control do servidor:

```typescript
client.use(cache({
  respectCacheControl: true, // default
}));

// Resposta com Cache-Control: max-age=3600
// → Cacheado por 1 hora

// Resposta com Cache-Control: no-store
// → Não cacheado

// Resposta com Cache-Control: no-cache
// → Cacheado, mas sempre revalida

// Resposta com Cache-Control: private
// → Não cacheado (dados específicos do usuário)
```

## Vary Header

O plugin considera o header Vary para criar variantes do cache:

```typescript
client.use(cache({
  respectVary: true, // default
}));

// Resposta com Vary: Accept-Language
// → Cache separado para cada idioma

// Request com Accept-Language: en
// → Cache key inclui "en"

// Request com Accept-Language: pt-BR
// → Cache key inclui "pt-BR"
```

## Custom Key Generator

```typescript
client.use(cache({
  keyGenerator: (req) => {
    // Incluir usuário na chave
    const userId = req.headers.get('X-User-Id') || 'anonymous';
    return `${userId}:${req.method}:${req.url}`;
  },
}));
```

## Bypass Cache

### Por Request

```typescript
// Força refresh
const fresh = await client.get('/users', {
  headers: { 'Cache-Control': 'no-cache' },
}).json();

// Sem cache neste request
const noStore = await client.get('/users', {
  headers: { 'Cache-Control': 'no-store' },
}).json();
```

### Invalidação Manual

```typescript
const storage = new MemoryStorage();

client.use(cache({ storage }));

// Após um POST/PUT/DELETE, invalidar
await client.post('/users', { body: newUser });
storage.clearByPrefix('GET:https://api.example.com/users');
```

## Exemplos

### API com Rate Limit

```typescript
client.use(cache({
  storage: new MemoryStorage({ maxMemoryBytes: 50 * 1024 * 1024 }),
  strategy: 'cache-first',
  ttl: 300000, // 5 min
}));

// Reduz chamadas à API, evita rate limiting
```

### Real-time com Fallback

```typescript
client.use(cache({
  strategy: 'stale-while-revalidate',
  ttl: 5000, // 5 segundos
  maxStale: 60000, // Aceita até 1 min stale
}));

// Sempre responde rápido com dados "recentes o suficiente"
// Atualiza em background
```

### Static Assets

```typescript
const assetClient = createClient({
  baseUrl: 'https://cdn.example.com',
});

assetClient.use(cache({
  storage: new FileStorage({ directory: './asset-cache' }),
  strategy: 'cache-first',
  ttl: 86400000, // 24 horas
}));
```

### Multi-tenant

```typescript
client.use(cache({
  keyGenerator: (req) => {
    const tenantId = req.headers.get('X-Tenant-Id') || 'default';
    return `tenant:${tenantId}:${req.method}:${req.url}`;
  },
  storage: new MemoryStorage({ maxMemoryBytes: 100 * 1024 * 1024 }),
}));
```

## Métricas

```typescript
const storage = new MemoryStorage({ trackStats: true });

client.use(cache({ storage }));

// Após algum uso...
const stats = storage.getStats();
console.log(`Hit rate: ${stats.hitRate}%`);
console.log(`Cache size: ${storage.size()} items`);
```

## Dicas

1. **Use MemoryStorage** para baixa latência
2. **Use FileStorage** para persistência entre restarts
3. **Use RedisStorage** para cache compartilhado entre instâncias
4. **Ajuste TTL** baseado na natureza dos dados
5. **Use stale-while-revalidate** para UX melhor
6. **Monitore hit rate** para ajustar configuração
7. **Combine com retry** para resiliência completa
