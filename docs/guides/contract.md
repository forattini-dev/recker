# Contract-First Client

Recker moves beyond "stringly-typed" URLs by allowing you to define API contracts using standard schemas (Zod). This transforms your HTTP client into a fully typed SDK with runtime validation, ensuring that your frontend code is always in sync with your API definition.

## The Problem

Usually, you write code like this:

```typescript
// ❌ Risky: No type safety, easy to typo URL, no validation
const user = await client.get('/users/123').json();
```

## The Recker Solution

With **Contract-First**, you define the "shape" of your API once, and Recker generates a type-safe client for you.

```typescript
// 1. Define your contract
import { z } from 'zod';
import { createContract } from 'recker';

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['admin', 'user']),
});

const contract = createContract(client, {
  getUser: {
    method: 'GET',
    path: '/users/:id',      // Auto-detects :id param
    params: z.object({       // Validates input params
      id: z.string().uuid() 
    }),
    response: UserSchema     // Validates output response
  },
  createUser: {
    method: 'POST',
    path: '/users',
    body: z.object({         // Validates request body
      name: z.string(),
      role: z.enum(['admin', 'user'])
    }),
    response: UserSchema
  }
});

// 2. Use it (Fully Typed!)
// ✅ TypeScript autocompletes 'getUser'
// ✅ TypeScript enforces 'params.id'
// ✅ Runtime validates inputs and outputs
const user = await contract.getUser({ 
  params: { id: '123e4567-e89b-...' } 
});

console.log(user.role); // 'admin' | 'user'
```

## Features

- **End-to-End Type Safety:** Inputs (params, body) and outputs (response) are strictly typed.
- **Runtime Validation:** If the API returns data that doesn't match the schema, the client throws a clear validation error immediately.
- **Smart Serialization:** Automatically handles `Content-Type` headers and JSON serialization for bodies.
- **Parameter Injection:** Automatically injects parameters into the URL path (e.g., `:id`).

## Advanced Usage

### Headers Override

You can still override headers per request if needed (e.g., for special auth tokens):

```typescript
await contract.getUser({
  params: { id: '123' },
  headers: { 'X-Custom-Header': 'value' }
});
```

### Sharing Contracts

The best part is that you can define the `ContractDefinition` in a shared package (monorepo) and use it in both your Backend (to implement the API) and Frontend (to consume it).

```typescript
// shared/api-contract.ts
export const MyApiContract = {
  // ... definitions
};
```
