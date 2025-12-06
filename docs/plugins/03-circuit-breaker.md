# Circuit Breaker Plugin

The **Circuit Breaker** plugin implements the circuit breaker pattern to protect your application against cascading failures by isolating problematic services.

## How It Works

The circuit breaker has three states:

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

- **CLOSED**: Operating normally, requests pass through
- **OPEN**: Circuit is open, requests fail immediately
- **HALF_OPEN**: Allows one test request to check if service recovered

## Quick Start

```typescript
import { createClient, circuitBreakerPlugin } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(circuitBreakerPlugin({
  threshold: 5,      // Open after 5 failures
  resetTimeout: 30000, // Try again after 30s
}));

try {
  const data = await client.get('/users').json();
} catch (error) {
  if (error instanceof CircuitBreakerError) {
    console.log('Service is down, circuit is OPEN');
  }
}
```

## Configuration

```typescript
interface CircuitBreakerOptions {
  // Number of failures before opening the circuit (default: 5)
  threshold?: number;

  // Time in ms to try again (Half-Open) (default: 30000)
  resetTimeout?: number;

  // Function to determine which errors count as failures
  shouldTrip?: (error: any, response?: ReckerResponse) => boolean;

  // Callback when state changes
  onStateChange?: (state: CircuitState, service: string) => void;
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
```

## Per-Domain Isolation

The circuit breaker isolates failures per domain automatically:

```typescript
const client = createClient({
  // No baseUrl - multi-domain
});

client.use(circuitBreakerPlugin({ threshold: 3 }));

// Failures on api1.com don't affect api2.com
await client.get('https://api1.example.com/users'); // Failure 1
await client.get('https://api2.example.com/users'); // Works!
await client.get('https://api1.example.com/users'); // Failure 2
await client.get('https://api1.example.com/users'); // Failure 3 - OPEN!
await client.get('https://api2.example.com/users'); // Still works!
```

## Custom Trip Logic

By default, only 5xx errors and network errors open the circuit. You can customize:

```typescript
client.use(circuitBreakerPlugin({
  shouldTrip: (error, response) => {
    // Only open for server errors
    if (response) {
      return response.status >= 500;
    }

    // Network errors always open
    return true;
  },
}));
```

### Include 429 (Rate Limit)

```typescript
client.use(circuitBreakerPlugin({
  shouldTrip: (error, response) => {
    if (response) {
      return response.status >= 500 || response.status === 429;
    }
    return true;
  },
}));
```

### Ignore Timeouts

```typescript
import { TimeoutError } from 'recker';

client.use(circuitBreakerPlugin({
  shouldTrip: (error, response) => {
    // Timeouts don't open the circuit
    if (error instanceof TimeoutError) return false;

    if (response) return response.status >= 500;
    return true;
  },
}));
```

## Monitoring

```typescript
client.use(circuitBreakerPlugin({
  threshold: 5,
  resetTimeout: 30000,
  onStateChange: (state, service) => {
    console.log(`Circuit for ${service} is now ${state}`);

    // Alert when it opens
    if (state === 'OPEN') {
      sendAlert(`Service ${service} is failing!`);
    }

    // Log when it recovers
    if (state === 'CLOSED') {
      console.log(`Service ${service} recovered`);
    }
  },
}));
```

## Handling CircuitBreakerError

```typescript
import { CircuitBreakerError } from 'recker';

try {
  const data = await client.get('/users').json();
} catch (error) {
  if (error instanceof CircuitBreakerError) {
    // Circuit is open - service unavailable
    console.log(`Service ${error.service} is unavailable`);

    // Use fallback
    return getCachedUsers();
  }
  throw error;
}
```

## Combining with Retry

Plugin order matters! Circuit breaker should come **before** retry:

```typescript
// ✅ Correct
client.use(circuitBreakerPlugin({ threshold: 5 }));
client.use(retryPlugin({ maxAttempts: 3 }));

// ❌ Wrong - retry will try even with circuit open
client.use(retryPlugin({ maxAttempts: 3 }));
client.use(circuitBreakerPlugin({ threshold: 5 }));
```

## Examples

### Resilient Microservices

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  timeout: 5000,
});

// Complete protection
client.use(circuitBreakerPlugin({
  threshold: 5,
  resetTimeout: 30000,
  onStateChange: (state, service) => {
    metrics.gauge('circuit_breaker_state', state === 'OPEN' ? 1 : 0, { service });
  },
}));

client.use(retryPlugin({
  maxAttempts: 2,
  backoff: 'exponential',
}));
```

### Multi-Service Dashboard

```typescript
const services = ['users', 'orders', 'payments'];
const circuits = new Map<string, CircuitState>();

const client = createClient();

client.use(circuitBreakerPlugin({
  threshold: 3,
  resetTimeout: 60000,
  onStateChange: (state, service) => {
    circuits.set(service, state);
    updateDashboard(circuits);
  },
}));

// Dashboard shows status of each service
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
      // Service unavailable - use cache
      return cache.get('users') || [];
    }
    throw error;
  }
}
```

## Tips

1. **Adjust threshold** based on request volume
2. **Use resetTimeout** sufficient for service recovery
3. **Monitor state changes** for alerts
4. **Combine with retry** (circuit breaker first!)
5. **Implement fallbacks** for when circuit opens
6. **Per-domain is automatic** - each host has its own circuit
