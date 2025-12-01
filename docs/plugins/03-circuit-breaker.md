# Circuit Breaker Plugin

O plugin de **Circuit Breaker** implementa o padrão circuit breaker para proteger sua aplicação contra falhas em cascata, isolando serviços com problemas.

## Como Funciona

O circuit breaker tem três estados:

```
    ┌─────────────────────────────────────────────────┐
    │                                                 │
    ▼                                                 │
┌────────┐   failures >= threshold   ┌────────┐      │
│ CLOSED │ ──────────────────────► │  OPEN  │       │
└────────┘                          └────────┘       │
    ▲                                   │            │
    │                                   │ timeout    │
    │ success                           ▼            │
    │                             ┌───────────┐      │
    └──────────────────────────── │ HALF_OPEN │ ─────┘
              success             └───────────┘  failure
```

- **CLOSED**: Funcionando normalmente, requests passam
- **OPEN**: Circuito aberto, requests falham imediatamente
- **HALF_OPEN**: Permite um request de teste para verificar se o serviço voltou

## Quick Start

```typescript
import { createClient, circuitBreaker } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(circuitBreaker({
  threshold: 5,      // Abre após 5 falhas
  resetTimeout: 30000, // Tenta novamente após 30s
}));

try {
  const data = await client.get('/users').json();
} catch (error) {
  if (error instanceof CircuitBreakerError) {
    console.log('Service is down, circuit is OPEN');
  }
}
```

## Configuração

```typescript
interface CircuitBreakerOptions {
  // Número de falhas antes de abrir o circuito (default: 5)
  threshold?: number;

  // Tempo em ms para tentar novamente (Half-Open) (default: 30000)
  resetTimeout?: number;

  // Função para determinar quais erros contam como falha
  shouldTrip?: (error: any, response?: ReckerResponse) => boolean;

  // Callback quando o estado muda
  onStateChange?: (state: CircuitState, service: string) => void;
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
```

## Per-Domain Isolation

O circuit breaker isola falhas por domínio automaticamente:

```typescript
const client = createClient({
  // Sem baseUrl - multi-domain
});

client.use(circuitBreaker({ threshold: 3 }));

// Falhas em api1.com não afetam api2.com
await client.get('https://api1.example.com/users'); // Falha 1
await client.get('https://api2.example.com/users'); // Funciona!
await client.get('https://api1.example.com/users'); // Falha 2
await client.get('https://api1.example.com/users'); // Falha 3 - OPEN!
await client.get('https://api2.example.com/users'); // Ainda funciona!
```

## Custom Trip Logic

Por padrão, apenas erros 5xx e erros de rede abrem o circuito. Você pode customizar:

```typescript
client.use(circuitBreaker({
  shouldTrip: (error, response) => {
    // Só abrir para erros de servidor
    if (response) {
      return response.status >= 500;
    }

    // Erros de rede sempre abrem
    return true;
  },
}));
```

### Incluir 429 (Rate Limit)

```typescript
client.use(circuitBreaker({
  shouldTrip: (error, response) => {
    if (response) {
      return response.status >= 500 || response.status === 429;
    }
    return true;
  },
}));
```

### Ignorar Timeouts

```typescript
import { TimeoutError } from 'recker';

client.use(circuitBreaker({
  shouldTrip: (error, response) => {
    // Timeouts não abrem o circuito
    if (error instanceof TimeoutError) return false;

    if (response) return response.status >= 500;
    return true;
  },
}));
```

## Monitoramento

```typescript
client.use(circuitBreaker({
  threshold: 5,
  resetTimeout: 30000,
  onStateChange: (state, service) => {
    console.log(`Circuit for ${service} is now ${state}`);

    // Alertar quando abrir
    if (state === 'OPEN') {
      sendAlert(`Service ${service} is failing!`);
    }

    // Log quando recuperar
    if (state === 'CLOSED') {
      console.log(`Service ${service} recovered`);
    }
  },
}));
```

## Tratando CircuitBreakerError

```typescript
import { CircuitBreakerError } from 'recker';

try {
  const data = await client.get('/users').json();
} catch (error) {
  if (error instanceof CircuitBreakerError) {
    // Circuito aberto - serviço indisponível
    console.log(`Service ${error.service} is unavailable`);

    // Usar fallback
    return getCachedUsers();
  }
  throw error;
}
```

## Combinando com Retry

A ordem dos plugins importa! Circuit breaker deve vir **antes** do retry:

```typescript
// ✅ Correto
client.use(circuitBreaker({ threshold: 5 }));
client.use(retry({ maxAttempts: 3 }));

// ❌ Errado - retry vai tentar mesmo com circuito aberto
client.use(retry({ maxAttempts: 3 }));
client.use(circuitBreaker({ threshold: 5 }));
```

## Exemplos

### Microservices Resilient

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  timeout: 5000,
});

// Proteção completa
client.use(circuitBreaker({
  threshold: 5,
  resetTimeout: 30000,
  onStateChange: (state, service) => {
    metrics.gauge('circuit_breaker_state', state === 'OPEN' ? 1 : 0, { service });
  },
}));

client.use(retry({
  maxAttempts: 2,
  backoff: 'exponential',
}));
```

### Multi-Service Dashboard

```typescript
const services = ['users', 'orders', 'payments'];
const circuits = new Map<string, CircuitState>();

const client = createClient();

client.use(circuitBreaker({
  threshold: 3,
  resetTimeout: 60000,
  onStateChange: (state, service) => {
    circuits.set(service, state);
    updateDashboard(circuits);
  },
}));

// Dashboard mostra status de cada serviço
function updateDashboard(circuits: Map<string, CircuitState>) {
  circuits.forEach((state, service) => {
    console.log(`${service}: ${state}`);
  });
}
```

### Fallback Pattern

```typescript
async function getUsersWithFallback() {
  try {
    return await client.get('/users').json();
  } catch (error) {
    if (error instanceof CircuitBreakerError) {
      // Serviço indisponível - usar cache
      return cache.get('users') || [];
    }
    throw error;
  }
}
```

## Dicas

1. **Ajuste o threshold** baseado no volume de requests
2. **Use resetTimeout** suficiente para o serviço se recuperar
3. **Monitore state changes** para alertas
4. **Combine com retry** (circuit breaker primeiro!)
5. **Implemente fallbacks** para quando o circuito abrir
6. **Por domínio é automático** - cada host tem seu próprio circuito
