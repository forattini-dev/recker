# Circuit Breaker

In distributed systems, failures are inevitable. When a service is down or overwhelmed, repeatedly hammering it with requests only makes things worse (and wastes your resources). Recker includes a smart **Circuit Breaker** plugin to handle these scenarios gracefully.

## How it Works

The Circuit Breaker acts like a state machine:

1.  **CLOSED (Normal):** Requests pass through normally. If they fail (e.g., 500 errors) repeatedly, the failure count increases.
2.  **OPEN (Tripped):** Once the failure threshold is reached, the circuit "trips". Subsequent requests fail **immediately** (fast failure) without hitting the network, throwing a `CircuitBreakerError`.
3.  **HALF-OPEN (Recovery):** After a reset timeout, the circuit lets *one* request through to test the waters.
    *   If it succeeds -> Circuit closes (Normal).
    *   If it fails -> Circuit opens again.

## Usage

```typescript
import { createClient, circuitBreaker } from 'recker';

const client = createClient({
  baseUrl: 'https://api.fragile-service.com',
  plugins: [
    circuitBreaker({
      threshold: 5,             // Trip after 5 failures
      resetTimeout: 30_000,     // Wait 30s before trying again
      shouldTrip: (err, res) => {
        // Optional: Customize what counts as a failure
        // Default is status >= 500
        return res && res.status >= 500;
      },
      onStateChange: (state, service) => {
        console.log(`Circuit for ${service} is now ${state}`);
      }
    })
  ]
});
```

## Configuration

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `threshold` | `number` | `5` | Number of consecutive failures to open the circuit. |
| `resetTimeout` | `number` | `30000` (30s) | Time to wait in OPEN state before switching to HALF-OPEN. |
| `shouldTrip` | `fn` | `status >= 500` | Function to determine if an error/response should count as a failure. |
| `onStateChange` | `fn` | `undefined` | Callback fired when the circuit state transitions. |

## Handling Circuit Errors

When the circuit is open, Recker throws a specific `CircuitBreakerError`. You can catch this to show a "Service Unavailable" UI or switch to a fallback immediately.

```typescript
import { CircuitBreakerError } from 'recker/plugins';

try {
  await client.get('/data');
} catch (err) {
  if (err instanceof CircuitBreakerError) {
    // Service is known to be down, show cached data or offline UI
    console.warn('Service is down, using fallback.');
  } else {
    throw err;
  }
}
```
