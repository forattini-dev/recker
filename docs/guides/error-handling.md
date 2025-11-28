# Error Handling

Recker provides two distinct paradigms for error handling: the classic "Exception" model and the modern "Safe Result" model (inspired by Go/Rust).

## Error types you can expect

- `HttpError`: Non-2xx/3xx HTTP status. Fields: `status`, `statusText`, `request`, `response`, `suggestions`, `retriable`.
- `TimeoutError`: Phase-specific timeout (`phase` = lookup, connect, secureConnect, socket, send, response, request) with `timeout`, `elapsed`, `retriable` true.
- `NetworkError`: Low-level socket/connection failures (e.g., ECONNRESET, ENOTFOUND); `retriable` true.
- `MaxSizeExceededError`: Response exceeded `maxResponseSize`; includes `maxSize`/`actualSize`, `retriable` false.
- `GraphQLError`: GraphQL `errors[]` present in a 200 OK body; includes `errors`, `response`, `suggestions`.
- `ReckerError`: Base error with `suggestions` and `retriable` flags for other cases.

## 1. The Exception Model (Default)

By default, Recker throws an `HttpError` for any non-2xx response. This is standard behavior for most JS clients.

```typescript
import { HttpError } from 'recker';

try {
  const user = await client.get('/users/1').json();
} catch (err) {
  if (err instanceof HttpError) {
    // Full context available
    console.log(err.status);       // 404
    console.log(err.request.url);  // '/users/1'
    console.log(await err.response.text()); // Error body
    console.log(err.suggestions);  // actionable hints
    console.log(err.retriable);    // can I retry safely?
  }
}
```

### Disabling Throw

You can disable this behavior per-request if you prefer to handle status codes manually:

```typescript
const res = await client.get('/users/1', { throwHttpErrors: false });

if (!res.ok) {
  console.log('Manual handling:', res.status);
}
```

## 2. The Safe Result Model (Recommended)

For a more robust codebase, especially in business logic, you might want to avoid `try/catch` blocks entirely. Recker exposes a `.safe()` method on every request promise.

This returns a tuple `[ok, error, data]`, forcing you to handle the outcome.

```typescript
interface User { name: string }

// No try-catch needed!
const [ok, err, user] = await client.get('/users/1').safe<User>();

if (!ok) {
  // 'err' is strictly typed as Error
  console.error('Failed to fetch user:', err);
  return;
}

// TypeScript knows 'user' is defined here
console.log(user.name);
```

## Examples for specific errors

### TimeoutError with phase
```typescript
try {
  await client.get('/slow', { timeout: { connect: 1000, response: 2000 } });
} catch (err) {
  if (err instanceof TimeoutError) {
    console.log(err.phase);       // e.g., 'response'
    console.log(err.timeout);     // configured timeout
    console.log(err.elapsed);     // observed
    console.log(err.retriable);   // true
    console.log(err.suggestions); // next steps
  }
}
```

### GraphQLError
```typescript
try {
  await client.post('/graphql', { query, variables });
} catch (err) {
  if (err instanceof GraphQLError) {
    console.error(err.errors);        // array from GraphQL response
    console.log(err.suggestions);     // fix variables/schema
    console.log(err.retriable);       // usually false unless network-related
  }
}
```

### NetworkError
```typescript
try {
  await client.get('https://unreachable.local');
} catch (err) {
  if (err instanceof NetworkError) {
    console.log(err.code);          // e.g., ENOTFOUND, ECONNRESET
    console.log(err.retriable);     // true
    console.log(err.suggestions);   // proxy/DNS/firewall tips
  }
}
```

### Why use `.safe()`?

1.  **No Hidden Flow Control:** Errors are treated as values, not exceptions that jump execution flow.
2.  **Type Safety:** You explicitly handle the error case before accessing the data.
3.  **Cleaner Code:** Reduces indentation levels caused by `try/catch` blocks.
