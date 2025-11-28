# Error Handling

Recker provides two distinct paradigms for error handling: the classic "Exception" model and the modern "Safe Result" model (inspired by Go/Rust).

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

### Why use `.safe()`?

1.  **No Hidden Flow Control:** Errors are treated as values, not exceptions that jump execution flow.
2.  **Type Safety:** You explicitly handle the error case before accessing the data.
3.  **Cleaner Code:** Reduces indentation levels caused by `try/catch` blocks.
