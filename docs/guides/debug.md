# Debugging & Observability

Recker provides first-class tools to make the invisible visible.

## Visual Logger

See requests in real-time with colored status codes and timing.

```typescript
import { createClient, logger } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [
    logger({
      showHeaders: true,  // Log request/response headers
      showBody: true,     // Log request bodies
      showTimings: true,  // Show timing breakdown
      colors: true        // Enable ANSI colors (default: true)
    })
  ]
});
```

### Output Example

```text
→ GET     https://api.example.com/users/1
    accept: application/json

← GET     https://api.example.com/users/1 200 OK 124ms
    content-type: application/json
```

---

## cURL Export

Convert any request to a copy-pasteable cURL command:

```typescript
import { toCurl } from 'recker';

client.beforeRequest((req) => {
  console.log(toCurl(req));
});
```

**Output:**
```bash
curl -X POST 'https://api.example.com/data' \
  -H 'content-type: application/json' \
  -d '{"foo":"bar"}'
```

---

## HAR Recording

Record a full session to a `.har` file, compatible with Chrome DevTools, Postman, and Insomnia.

```typescript
import { createClient, harRecorder } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [
    harRecorder({ path: './session.har' })
  ]
});

// Make requests...
await client.get('/users');
await client.post('/users', { name: 'John' });

// HAR file is automatically saved
```

### Options

```typescript
harRecorder({
  path: './session.har',     // Output file path
  onEntry: (entry) => {      // Callback for each entry
    console.log(`Recorded: ${entry.request.url}`);
  }
})
```

---

## HAR Replay (Time Travel)

Mock your entire network layer using a recorded HAR file. Zero network calls, deterministic tests.

```typescript
import { createClient, harPlayer } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [
    harPlayer({
      path: './session.har',
      strict: true  // Throw if no matching entry found
    })
  ]
});

// Returns the recorded response instantly - no network!
const users = await client.get('/users').json();
```

### Mixed Mode

In non-strict mode, unmatched requests pass through to the network:

```typescript
harPlayer({
  path: './session.har',
  strict: false  // Pass through if no match
})
```

---

## Server-Timing

Inspect backend performance metrics (DB, Cache, etc.) from the `Server-Timing` header:

```typescript
import { createClient, serverTiming } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [serverTiming()]
});

const res = await client.get('/dashboard');

console.log(res.serverTimings);
// [
//   { name: 'db', duration: 50, description: 'Database query' },
//   { name: 'redis', duration: 2, description: 'Cache lookup' }
// ]
```

---

## Debug Mode

Enable verbose logging globally:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  debug: true  // Enable debug mode
});
```

Or via environment variable:

```bash
DEBUG=recker node app.js
```

---

## Request Timings

Access detailed timing breakdown on any response:

```typescript
const response = await client.get('/api/data');

console.log(response.timings);
// {
//   queuing: 2,      // Time in queue
//   dns: 15,         // DNS lookup
//   tcp: 25,         // TCP connection
//   tls: 45,         // TLS handshake
//   firstByte: 120,  // Time to first byte (TTFB)
//   total: 250       // Total request time
// }

console.log(response.connection);
// {
//   protocol: 'h2',
//   remoteAddress: '93.184.216.34',
//   remotePort: 443
// }
```

---

## Best Practices

1. **Use logger in development** - See traffic without setting up external tools
2. **Record HAR for CI tests** - Deterministic, fast, no network dependencies
3. **Monitor Server-Timing in production** - Identify backend bottlenecks
4. **Use cURL export for bug reports** - Share exact requests with your team
5. **Check timings for performance** - Identify slow DNS, TLS, or TTFB
