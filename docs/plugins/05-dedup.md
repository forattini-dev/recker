# Dedup Plugin

O plugin de **Dedup** (Deduplication) evita requests duplicados em voo, compartilhando a mesma resposta entre chamadores simultâneos.

## O Problema

Sem deduplicação, requests simultâneos para o mesmo endpoint geram múltiplas chamadas:

```typescript
// Sem dedup - 3 requests para a API
const [users1, users2, users3] = await Promise.all([
  client.get('/users').json(),
  client.get('/users').json(),
  client.get('/users').json(),
]);
```

## A Solução

Com deduplicação, apenas um request é feito e o resultado é compartilhado:

```typescript
import { createClient, dedup } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(dedup());

// Com dedup - apenas 1 request para a API!
const [users1, users2, users3] = await Promise.all([
  client.get('/users').json(),
  client.get('/users').json(),
  client.get('/users').json(),
]);
```

## Como Funciona

```
Request 1 ──┐
            │
Request 2 ──┼──► Primeiro inicia o request ──► API
            │              │
Request 3 ──┘              ▼
                      Response
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
        Clone 1       Clone 2       Clone 3
```

1. O primeiro request inicia a chamada
2. Requests subsequentes encontram o request pendente
3. Todos aguardam a mesma Promise
4. Quando resolve, cada um recebe um clone da resposta

## Configuração

```typescript
interface DedupOptions {
  // Gerador de chave customizado
  keyGenerator?: (req: ReckerRequest) => string;
}
```

### Key Generator Padrão

Por padrão, a chave é `method:url`:

```typescript
client.use(dedup());

// Estas são deduplicadas (mesma chave)
client.get('/users');
client.get('/users');

// Estas NÃO são deduplicadas (chaves diferentes)
client.get('/users');
client.get('/users?page=2');
```

### Custom Key Generator

```typescript
client.use(dedup({
  keyGenerator: (req) => {
    // Ignorar query params
    const url = new URL(req.url);
    return `${req.method}:${url.pathname}`;
  },
}));

// Agora estas são deduplicadas!
client.get('/users');
client.get('/users?page=1');
client.get('/users?page=2');
```

## Métodos Suportados

Por padrão, apenas GET e HEAD são deduplicados:

```typescript
client.use(dedup());

// ✅ Deduplicado
client.get('/users');
client.head('/users');

// ❌ Não deduplicado (métodos não-safe)
client.post('/users', { body: data });
client.put('/users/1', { body: data });
client.delete('/users/1');
```

## Exemplos

### React/Frontend

```typescript
// Hook de dados que pode ser chamado múltiplas vezes
function useUsers() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    // Mesmo se múltiplos componentes chamarem isso simultaneamente,
    // apenas 1 request será feito
    client.get('/users').json().then(setUsers);
  }, []);

  return users;
}

// Em múltiplos componentes
function UserList() {
  const users = useUsers(); // Request 1 (ou compartilhado)
}

function UserCount() {
  const users = useUsers(); // Compartilha com Request 1
}
```

### SSR/Initial Load

```typescript
// Server-side rendering com múltiplos dados
async function getPageData() {
  // Pode haver duplicação acidental em código complexo
  const [header, sidebar, main] = await Promise.all([
    getHeaderData(),   // Chama /users
    getSidebarData(),  // Também chama /users
    getMainData(),     // Também chama /users
  ]);

  return { header, sidebar, main };
}

// Com dedup, /users é chamado apenas 1 vez
```

### Microservices

```typescript
// Agregador que consulta múltiplos serviços
async function aggregate() {
  const [users, orders, inventory] = await Promise.all([
    client.get('/users').json(),
    client.get('/orders').json(),
    client.get('/inventory').json(),
  ]);

  // Se algum serviço consultar /users internamente,
  // compartilha o resultado
}
```

## Diferença entre Dedup e Cache

| Aspecto | Dedup | Cache |
|---------|-------|-------|
| Duração | Apenas durante o request | Após o request (TTL) |
| Uso | Requests simultâneos | Requests subsequentes |
| Storage | Memória (Map) | Configurável |
| Overhead | Mínimo | Serialização/deserialização |

**Use ambos juntos para máxima eficiência:**

```typescript
client.use(dedup());  // Evita duplicados simultâneos
client.use(cache({ ttl: 60000 }));  // Cacheia por 1 minuto
```

## Ordem dos Plugins

Dedup deve vir **antes** do cache:

```typescript
// ✅ Correto
client.use(dedup());
client.use(cache());

// ❌ Errado - dedup não vai funcionar corretamente
client.use(cache());
client.use(dedup());
```

## Comportamento com Erros

Se o request falhar, todos os callers recebem o mesmo erro:

```typescript
client.use(dedup());

// Se /users falhar, ambos recebem o erro
const results = await Promise.allSettled([
  client.get('/users').json(),
  client.get('/users').json(),
]);

// results[0].status === 'rejected'
// results[1].status === 'rejected'
// results[0].reason === results[1].reason
```

## Dicas

1. **Sempre use com cache** para eficiência máxima
2. **Métodos não-safe não são deduplicados** (POST, PUT, DELETE)
3. **Custom key generator** para casos especiais
4. **Overhead mínimo** - pode usar em todos os clientes
5. **Funciona com streaming** - cada caller recebe seu próprio stream
