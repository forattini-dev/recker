# Dedup Plugin

The **Dedup** (Deduplication) plugin prevents duplicate in-flight requests by sharing the same response among simultaneous callers.

## The Problem

Without deduplication, simultaneous requests to the same endpoint generate multiple calls:

```typescript
// Without dedup - 3 requests to API
const [users1, users2, users3] = await Promise.all([
  client.get('/users').json(),
  client.get('/users').json(),
  client.get('/users').json(),
]);
```

## The Solution

With deduplication, only one request is made and the result is shared:

```typescript
import { createClient, dedupPlugin } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(dedupPlugin());

// With dedup - only 1 request to API!
const [users1, users2, users3] = await Promise.all([
  client.get('/users').json(),
  client.get('/users').json(),
  client.get('/users').json(),
]);
```

## How It Works

```
Request 1 ──┐
            │
Request 2 ──┼──► First initiates the request ──► API
            │              │
Request 3 ──┘              ▼
                      Response
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
        Clone 1       Clone 2       Clone 3
```

1. The first request initiates the call
2. Subsequent requests find the pending request
3. All await the same Promise
4. When resolved, each receives a cloned response

## Configuration

```typescript
interface DedupOptions {
  // Custom key generator
  keyGenerator?: (req: ReckerRequest) => string;
}
```

### Default Key Generator

By default, the key is `method:url`:

```typescript
client.use(dedupPlugin());

// These are deduplicated (same key)
client.get('/users');
client.get('/users');

// These are NOT deduplicated (different keys)
client.get('/users');
client.get('/users?page=2');
```

### Custom Key Generator

```typescript
client.use(dedupPlugin({
  keyGenerator: (req) => {
    // Ignore query params
    const url = new URL(req.url);
    return `${req.method}:${url.pathname}`;
  },
}));

// Now these are deduplicated!
client.get('/users');
client.get('/users?page=1');
client.get('/users?page=2');
```

## Supported Methods

By default, only GET and HEAD are deduplicated:

```typescript
client.use(dedupPlugin());

// ✅ Deduplicated
client.get('/users');
client.head('/users');

// ❌ Not deduplicated (non-safe methods)
client.post('/users', { body: data });
client.put('/users/1', { body: data });
client.delete('/users/1');
```

## Examples

### React/Frontend

```typescript
// Data hook that may be called multiple times
function useUsers() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    // Even if multiple components call this simultaneously,
    // only 1 request will be made
    client.get('/users').json().then(setUsers);
  }, []);

  return users;
}

// In multiple components
function UserList() {
  const users = useUsers(); // Request 1 (or shared)
}

function UserCount() {
  const users = useUsers(); // Shares with Request 1
}
```

### SSR/Initial Load

```typescript
// Server-side rendering with multiple data needs
async function getPageData() {
  // There may be accidental duplication in complex code
  const [header, sidebar, main] = await Promise.all([
    getHeaderData(),   // Calls /users
    getSidebarData(),  // Also calls /users
    getMainData(),     // Also calls /users
  ]);

  return { header, sidebar, main };
}

// With dedup, /users is called only once
```

### Microservices

```typescript
// Aggregator that queries multiple services
async function aggregate() {
  const [users, orders, inventory] = await Promise.all([
    client.get('/users').json(),
    client.get('/orders').json(),
    client.get('/inventory').json(),
  ]);

  // If any service internally queries /users,
  // shares the result
}
```

## Difference Between Dedup and Cache

| Aspect | Dedup | Cache |
|--------|-------|-------|
| Duration | Only during the request | After the request (TTL) |
| Use Case | Simultaneous requests | Subsequent requests |
| Storage | Memory (Map) | Configurable |
| Overhead | Minimal | Serialization/deserialization |

**Use both together for maximum efficiency:**

```typescript
client.use(dedupPlugin());  // Avoids simultaneous duplicates
client.use(cachePlugin({ ttl: 60000 }));  // Caches for 1 minute
```

## Plugin Order

Dedup should come **before** cache:

```typescript
// ✅ Correct
client.use(dedupPlugin());
client.use(cachePlugin());

// ❌ Wrong - dedup won't work correctly
client.use(cachePlugin());
client.use(dedupPlugin());
```

## Error Behavior

If the request fails, all callers receive the same error:

```typescript
client.use(dedupPlugin());

// If /users fails, both receive the error
const results = await Promise.allSettled([
  client.get('/users').json(),
  client.get('/users').json(),
]);

// results[0].status === 'rejected'
// results[1].status === 'rejected'
// results[0].reason === results[1].reason
```

## Tips

1. **Always use with cache** for maximum efficiency
2. **Non-safe methods are not deduplicated** (POST, PUT, DELETE)
3. **Custom key generator** for special cases
4. **Minimal overhead** - can use on all clients
5. **Works with streaming** - each caller receives their own stream
