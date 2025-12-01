# Memory Cache

O **MemoryStorage** é um sistema de cache em memória de alta performance para o Recker, projetado para ser seguro, eficiente e container-aware.

## Features

- **Eviction Policies**: LRU (Least Recently Used) e FIFO (First In, First Out)
- **Memory Limits**: Por bytes, porcentagem do sistema, ou auto-calculado
- **Container-Aware**: Detecta limites de memória em Docker/Kubernetes (cgroup v1/v2)
- **Heap Pressure Monitoring**: Monitora pressão de heap do V8 e faz evição preventiva
- **Compression**: Compressão gzip automática para entradas grandes
- **Statistics**: Métricas detalhadas de hits, misses, evictions e memória
- **TTL Support**: Time-to-live por entrada com limpeza automática
- **Callbacks**: Hooks para eventos de evição e pressão de memória

## Quick Start

```typescript
import { MemoryStorage, createClient } from 'recker';

// Uso básico com o cliente
const client = createClient({
  baseUrl: 'https://api.example.com',
  cache: {
    storage: new MemoryStorage({
      maxMemoryBytes: 100 * 1024 * 1024, // 100MB
    }),
    ttl: 60000, // 1 minuto
  },
});

// Requests GET são cacheados automaticamente
const data = await client.get('/users').json();
```

## Configuração

### Opções Básicas

```typescript
import { MemoryStorage } from 'recker';

const cache = new MemoryStorage({
  // Limite por número de itens
  maxSize: 1000,

  // Limite por bytes (recomendado)
  maxMemoryBytes: 50 * 1024 * 1024, // 50MB

  // OU limite por porcentagem da memória do sistema
  maxMemoryPercent: 0.1, // 10% da memória disponível

  // TTL padrão em ms (0 = sem expiração)
  defaultTTL: 300000, // 5 minutos

  // Política de evição
  evictionPolicy: 'lru', // 'lru' | 'fifo'
});
```

### Opções Avançadas

```typescript
const cache = new MemoryStorage({
  maxMemoryBytes: 100 * 1024 * 1024,

  // Compressão automática
  compression: {
    enabled: true,
    threshold: 1024, // Comprimir entradas > 1KB
  },

  // Monitoramento de heap (evição preventiva)
  heapUsageThreshold: 0.85, // Evicta quando heap > 85%
  monitorInterval: 5000, // Verifica a cada 5s

  // Limpeza de itens expirados
  cleanupInterval: 60000, // A cada 1 minuto

  // Estatísticas
  trackStats: true,

  // Callbacks
  onEvict: (info) => {
    console.log(`Evicted ${info.key}: ${info.reason}`);
  },
  onPressure: (info) => {
    console.log(`Memory pressure: ${info.heapUsedPercent}%`);
  },
});
```

## Políticas de Evição

### LRU (Least Recently Used)

Evicta os itens menos acessados recentemente. Ideal para a maioria dos casos.

```typescript
const cache = new MemoryStorage({
  maxSize: 1000,
  evictionPolicy: 'lru',
});

// Item 'a' é o mais antigo
await cache.set('a', entry, 60000);
await cache.set('b', entry, 60000);
await cache.set('c', entry, 60000);

// Acessar 'a' o move para o fim da fila
await cache.get('a');

// Quando o cache estiver cheio, 'b' será evictado primeiro (menos recente)
```

### FIFO (First In, First Out)

Evicta os itens mais antigos, independente de acesso. Útil para dados time-sensitive.

```typescript
const cache = new MemoryStorage({
  maxSize: 1000,
  evictionPolicy: 'fifo',
});

// Ordem de inserção é mantida
await cache.set('a', entry, 60000); // Primeiro a entrar
await cache.set('b', entry, 60000);
await cache.set('c', entry, 60000);

// Mesmo acessando 'a', ele será o primeiro a sair
await cache.get('a');
```

## Limites de Memória

### Por Bytes (Recomendado)

```typescript
const cache = new MemoryStorage({
  maxMemoryBytes: 100 * 1024 * 1024, // 100MB
});
```

### Por Porcentagem do Sistema

```typescript
const cache = new MemoryStorage({
  maxMemoryPercent: 0.1, // 10% da memória disponível
});
```

> **Nota**: Não use `maxMemoryBytes` e `maxMemoryPercent` juntos - vai lançar erro.

### Auto-Calculado (Padrão Seguro)

Se você não especificar limites, o cache calcula automaticamente um limite seguro:

```typescript
const cache = new MemoryStorage({
  // Sem limites explícitos
});

// O cache considera:
// 1. Memória total do sistema (ou cgroup limit em containers)
// 2. Limite de heap do V8 (--max-old-space-size)
// 3. Aplica caps de segurança (50% do sistema, 60% do heap)
```

### Container-Aware

O cache detecta automaticamente limites de memória em containers:

```typescript
// Em um container Docker com 512MB:
const cache = new MemoryStorage({
  maxMemoryPercent: 0.2, // 20% de 512MB = ~100MB
});
```

Arquivos verificados:
- `/sys/fs/cgroup/memory.max` (cgroup v2)
- `/sys/fs/cgroup/memory/memory.limit_in_bytes` (cgroup v1)

## Compressão

A compressão gzip reduz o uso de memória para dados compressíveis:

```typescript
const cache = new MemoryStorage({
  maxMemoryBytes: 50 * 1024 * 1024,
  compression: {
    enabled: true,
    threshold: 1024, // Só comprimir entradas > 1KB
  },
});

// Dados repetitivos comprimem muito bem
await cache.set('logs', {
  status: 200,
  body: 'ERROR: Connection refused\n'.repeat(10000),
  // ...
}, 60000);

// Verificar economia
const stats = cache.getCompressionStats();
console.log(stats);
// {
//   compressedItems: 1,
//   totalItems: 1,
//   originalBytes: 270000,
//   compressedBytes: 1500,
//   spaceSavingsPercent: '99.44'
// }
```

## Monitoramento de Heap

O cache pode monitorar a pressão de heap do V8 e fazer evição preventiva:

```typescript
const cache = new MemoryStorage({
  maxMemoryBytes: 100 * 1024 * 1024,

  // Começar a evictar quando heap > 85%
  heapUsageThreshold: 0.85,

  // Verificar a cada 5 segundos
  monitorInterval: 5000,

  // Callback quando há pressão
  onPressure: (info) => {
    console.warn(`Heap pressure: ${info.heapUsedPercent.toFixed(1)}%`);
    console.warn(`Evicted ${info.itemsEvicted} items`);
  },
});
```

## Estatísticas

### Cache Stats

```typescript
const stats = cache.getStats();
console.log(stats);
// {
//   hits: 1500,
//   misses: 300,
//   hitRate: '83.33',
//   sets: 500,
//   deletes: 50,
//   evictions: 100,
//   expirations: 25,
//   size: 375
// }
```

### Memory Stats

```typescript
const memStats = cache.getMemoryStats();
console.log(memStats);
// {
//   currentMemoryBytes: 45000000,
//   maxMemoryBytes: 100000000,
//   memoryUsagePercent: '45.00',
//   totalItems: 375,
//   averageItemSize: 120000,
//   effectiveTotalMemory: 17179869184,
//   heapLimit: 4294967296,
//   heapUsed: 150000000,
//   heapUsagePercent: '3.49'
// }
```

### Compression Stats

```typescript
const compStats = cache.getCompressionStats();
console.log(compStats);
// {
//   compressedItems: 50,
//   totalItems: 375,
//   originalBytes: 5000000,
//   compressedBytes: 500000,
//   spaceSavingsPercent: '90.00',
//   compressionRatio: '10.00'
// }
```

## API Completa

### Métodos Principais

```typescript
// Armazenar entrada
await cache.set(key: string, entry: CacheEntry, ttl?: number): Promise<void>

// Recuperar entrada
await cache.get(key: string): Promise<CacheEntry | undefined>

// Deletar entrada
await cache.delete(key: string): Promise<void>

// Verificar existência
cache.has(key: string): boolean

// Limpar tudo
cache.clear(): void

// Limpar por prefixo
cache.clearByPrefix(prefix: string): void

// Listar chaves
cache.keys(): string[]

// Tamanho atual
cache.size(): number

// Desligar (limpa intervals)
cache.shutdown(): void
```

### Tipos

```typescript
interface CacheEntry {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timestamp: number;
}

interface EvictionInfo {
  key: string;
  reason: 'size' | 'memory' | 'expired' | 'pressure';
  itemSize: number;
}

interface PressureInfo {
  heapUsed: number;
  heapLimit: number;
  heapUsedPercent: number;
  itemsEvicted: number;
}
```

## Integração com Cache Plugin

O `MemoryStorage` é usado pelo plugin de cache:

```typescript
import { createClient, MemoryStorage, cachePlugin } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

// Adicionar plugin de cache
client.use(cachePlugin({
  storage: new MemoryStorage({
    maxMemoryBytes: 100 * 1024 * 1024,
    compression: { enabled: true },
  }),
  ttl: 300000, // 5 minutos
  methods: ['GET'], // Só cachear GETs
  strategy: 'cache-first', // ou 'stale-while-revalidate', 'network-only'
}));

// Agora requests GET são cacheados
const users = await client.get('/users').json();
```

## Utilities

### formatBytes

```typescript
import { formatBytes } from 'recker';

formatBytes(1024);        // '1.00 KB'
formatBytes(1048576);     // '1.00 MB'
formatBytes(1073741824);  // '1.00 GB'
```

### getEffectiveTotalMemoryBytes

```typescript
import { getEffectiveTotalMemoryBytes } from 'recker';

const totalMem = getEffectiveTotalMemoryBytes();
// Em container Docker 512MB: 536870912
// Em bare metal 16GB: 17179869184
```

### getHeapStats

```typescript
import { getHeapStats } from 'recker';

const heap = getHeapStats();
// { heapUsed: 150000000, heapLimit: 4294967296, heapRatio: 0.035 }
```

### resolveCacheMemoryLimit

```typescript
import { resolveCacheMemoryLimit } from 'recker';

const limits = resolveCacheMemoryLimit({
  maxMemoryBytes: 100 * 1024 * 1024,
});
// {
//   maxMemoryBytes: 104857600,
//   derivedFromPercent: false,
//   effectiveTotal: 17179869184,
//   heapLimit: 4294967296,
//   inferredPercent: 0.0061
// }
```

## Performance

Benchmarks em hardware típico:

| Operação | Throughput |
|----------|------------|
| Inserções | ~38,000 ops/sec |
| Leituras | ~1,000,000 ops/sec |
| Misto (80/20) | ~900,000 ops/sec |

### Dicas de Performance

1. **Use compressão** para dados repetitivos (logs, HTML, JSON com arrays)
2. **Defina TTL apropriado** para evitar cache stale
3. **Monitore estatísticas** para ajustar limites
4. **Use LRU** para workloads com hot spots
5. **Use FIFO** para dados time-sensitive

## Troubleshooting

### Cache não está cacheando

```typescript
// Verifique se o método é GET
client.get('/users'); // ✅ Cacheado
client.post('/users'); // ❌ Não cacheado por padrão

// Verifique se o TTL não é 0
const cache = new MemoryStorage({ defaultTTL: 0 }); // ❌ Sem TTL = sem cache
```

### Memória crescendo indefinidamente

```typescript
// Defina limites explícitos
const cache = new MemoryStorage({
  maxMemoryBytes: 100 * 1024 * 1024, // ✅ Limite definido
  maxSize: 10000, // ✅ Limite de itens
});
```

### OOM em containers

```typescript
// Use porcentagem em vez de bytes fixos
const cache = new MemoryStorage({
  maxMemoryPercent: 0.15, // 15% do container
  heapUsageThreshold: 0.7, // Evição agressiva
});
```

### Hit rate baixo

```typescript
const stats = cache.getStats();
if (parseFloat(stats.hitRate) < 50) {
  // Aumente o TTL
  // Aumente maxSize/maxMemoryBytes
  // Verifique se as keys são consistentes
}
```
