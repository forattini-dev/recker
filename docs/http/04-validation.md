# Validation & Contracts

Type-safe HTTP requests with runtime validation using Zod schemas.

## The Problem

Traditional HTTP clients have weak type safety:

```typescript
// ❌ Risky: No type safety, easy to typo URL, no validation
const user = await client.get('/users/123').json();
// TypeScript has no idea what shape 'user' has
```

## Simple Validation

### Parse Response with Zod

Use `.parse()` to validate and type responses:

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email()
});

// Validates and types the response
const user = await client.get('/users/1').parse(UserSchema);
// user is typed as { id: number; name: string; email: string }

console.log(user.name); // TypeScript knows this is a string
```

### Type Inference

TypeScript automatically infers types from your schema:

```typescript
const ProductSchema = z.object({
  id: z.string(),
  price: z.number(),
  inStock: z.boolean(),
  tags: z.array(z.string())
});

const product = await client.get('/products/abc').parse(ProductSchema);
// TypeScript knows:
// - product.id is string
// - product.price is number
// - product.inStock is boolean
// - product.tags is string[]
```

### Validation Errors

When validation fails, Zod throws a descriptive error:

```typescript
import { z, ZodError } from 'zod';

try {
  const user = await client.get('/users/1').parse(UserSchema);
} catch (error) {
  if (error instanceof ZodError) {
    console.log('Validation failed:', error.issues);
    // [{ path: ['email'], message: 'Invalid email' }]
  }
}
```

## Contract-First API

Transform your HTTP client into a fully typed SDK with runtime validation.

### Define Your Contract

```typescript
import { z } from 'zod';
import { createClient, createContract } from 'recker';

const client = createClient({ baseUrl: 'https://api.example.com' });

// Define schemas
const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['admin', 'user', 'guest'])
});

const CreateUserSchema = z.object({
  name: z.string().min(2),
  role: z.enum(['admin', 'user', 'guest'])
});

// Create typed contract
const api = createContract(client, {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    params: z.object({ id: z.string().uuid() }),
    response: UserSchema
  },
  createUser: {
    method: 'POST',
    path: '/users',
    body: CreateUserSchema,
    response: UserSchema
  },
  updateUser: {
    method: 'PATCH',
    path: '/users/:id',
    params: z.object({ id: z.string() }),
    body: z.object({
      name: z.string().optional(),
      role: z.enum(['admin', 'user', 'guest']).optional()
    }),
    response: UserSchema
  },
  deleteUser: {
    method: 'DELETE',
    path: '/users/:id',
    params: z.object({ id: z.string() })
  }
});
```

### Use Your Contract

```typescript
// ✅ Full TypeScript autocomplete
// ✅ Params validated at runtime
// ✅ Response validated and typed
const user = await api.getUser({
  params: { id: '550e8400-e29b-41d4-a716-446655440000' }
});

console.log(user.role); // 'admin' | 'user' | 'guest'

// Create new user
const newUser = await api.createUser({
  body: { name: 'John Doe', role: 'user' }
});

// Update user
const updated = await api.updateUser({
  params: { id: '123' },
  body: { name: 'Jane Doe' }
});

// Delete user
await api.deleteUser({ params: { id: '123' } });
```

### Contract Endpoint Options

```typescript
interface ContractEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | ...;
  path: string;           // Supports :param syntax
  params?: ZodSchema;     // Path + Query params validation
  body?: ZodSchema;       // Request body validation
  response?: ZodSchema;   // Response body validation
  errors?: Record<number, ZodSchema>; // Error response schemas
}
```

### Path Parameters

Path parameters are automatically extracted from the URL:

```typescript
const api = createContract(client, {
  getComment: {
    method: 'GET',
    path: '/posts/:postId/comments/:commentId',
    params: z.object({
      postId: z.string(),
      commentId: z.string()
    }),
    response: CommentSchema
  }
});

// TypeScript enforces both params
await api.getComment({
  params: { postId: '1', commentId: '5' }
});
// → GET /posts/1/comments/5
```

### Query Parameters

Params not in the path become query parameters:

```typescript
const api = createContract(client, {
  searchUsers: {
    method: 'GET',
    path: '/users',
    params: z.object({
      q: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().max(100).default(20)
    }),
    response: z.object({
      users: z.array(UserSchema),
      total: z.number()
    })
  }
});

await api.searchUsers({
  params: { q: 'john', page: 2 }
});
// → GET /users?q=john&page=2&limit=20
```

## Typed Error Handling

### Define Error Schemas

```typescript
const ErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string()).optional()
});

const ValidationErrorSchema = z.object({
  code: z.literal('VALIDATION_ERROR'),
  errors: z.array(z.object({
    field: z.string(),
    message: z.string()
  }))
});

const api = createContract(client, {
  createUser: {
    method: 'POST',
    path: '/users',
    body: CreateUserSchema,
    response: UserSchema,
    errors: {
      400: ValidationErrorSchema,
      409: z.object({
        code: z.literal('CONFLICT'),
        message: z.string()
      }),
      500: ErrorSchema
    }
  }
});
```

### Handle Typed Errors

```typescript
import { ContractError } from 'recker';

try {
  await api.createUser({ body: { name: 'John', role: 'user' } });
} catch (error) {
  if (error instanceof ContractError) {
    // Typed error handling
    switch (error.status) {
      case 400:
        // error.data is typed as ValidationErrorSchema
        console.log('Validation errors:', error.data.errors);
        break;
      case 409:
        // error.data is typed as the 409 schema
        console.log('Conflict:', error.data.message);
        break;
    }
  }
}
```

## Advanced Patterns

### Override Headers

You can still pass custom headers per request:

```typescript
await api.getUser({
  params: { id: '123' },
  headers: {
    'X-Custom-Header': 'value',
    'Authorization': 'Bearer special-token'
  }
});
```

### Shared Contracts (Monorepo)

Define contracts once, share across frontend and backend:

```typescript
// packages/shared/api-contract.ts
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email()
});

export const ApiContract = {
  getUser: {
    method: 'GET' as const,
    path: '/users/:id',
    params: z.object({ id: z.string() }),
    response: UserSchema
  },
  // ... more endpoints
};

// Frontend: packages/web/api.ts
import { createClient, createContract } from 'recker';
import { ApiContract } from '@myapp/shared';

const client = createClient({ baseUrl: 'https://api.myapp.com' });
export const api = createContract(client, ApiContract);

// Backend: Can use same schemas for validation
import { UserSchema } from '@myapp/shared';
app.get('/users/:id', (req, res) => {
  const user = UserSchema.parse(dbUser);
  res.json(user);
});
```

### Composing Schemas

Build complex schemas from primitives:

```typescript
// Base schemas
const TimestampSchema = z.object({
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

const PaginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number(),
    page: z.number(),
    totalPages: z.number()
  });

// Composed schemas
const UserSchema = z.object({
  id: z.string(),
  name: z.string()
}).merge(TimestampSchema);

const UsersResponseSchema = PaginatedSchema(UserSchema);

// Use in contract
const api = createContract(client, {
  listUsers: {
    method: 'GET',
    path: '/users',
    response: UsersResponseSchema
  }
});
```

### Transform Responses

Use Zod transforms to process data:

```typescript
const DateUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  // Transform string to Date object
  createdAt: z.string().transform((s) => new Date(s)),
  // Transform cents to dollars
  balance: z.number().transform((cents) => cents / 100)
});

const user = await client.get('/users/1').parse(DateUserSchema);
// user.createdAt is Date object
// user.balance is in dollars
```

### Default Values

Provide defaults for missing fields:

```typescript
const SettingsSchema = z.object({
  theme: z.enum(['light', 'dark']).default('light'),
  notifications: z.boolean().default(true),
  language: z.string().default('en')
});

const settings = await client.get('/settings').parse(SettingsSchema);
// Missing fields get defaults
```

### Strict vs Passthrough

Control extra fields behavior:

```typescript
// Strict - error on extra fields
const StrictUser = z.object({
  id: z.string(),
  name: z.string()
}).strict();

// Passthrough - keep extra fields
const PassthroughUser = z.object({
  id: z.string(),
  name: z.string()
}).passthrough();

// Strip (default) - remove extra fields
const StripUser = z.object({
  id: z.string(),
  name: z.string()
}).strip();
```

## Safe Parsing

### Handle Validation Gracefully

Use `.safe()` for graceful error handling:

```typescript
const [success, error, data] = await client.get('/users/1').safe();

if (success) {
  console.log('Got user:', data);
} else {
  console.log('Failed:', error);
}
```

### Safe Parse with Zod

```typescript
const result = UserSchema.safeParse(await client.get('/users/1').json());

if (result.success) {
  console.log('Valid user:', result.data);
} else {
  console.log('Invalid:', result.error.issues);
}
```

## Common Schemas

### API Response Wrapper

```typescript
const ApiResponse = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.boolean(),
    data: data,
    meta: z.object({
      requestId: z.string(),
      timestamp: z.string()
    }).optional()
  });

const api = createContract(client, {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    response: ApiResponse(UserSchema)
  }
});
```

### Pagination

```typescript
const PaginationParams = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc')
});

const PaginatedResponse = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
      hasNext: z.boolean(),
      hasPrev: z.boolean()
    })
  });
```

### UUID and IDs

```typescript
const UUIDSchema = z.string().uuid();
const ObjectIdSchema = z.string().regex(/^[0-9a-f]{24}$/);
const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const api = createContract(client, {
  getUser: {
    method: 'GET',
    path: '/users/:id',
    params: z.object({
      id: UUIDSchema
    }),
    response: UserSchema
  }
});
```

## Best Practices

### 1. Validate at Boundaries

```typescript
// ✅ Validate external data
const externalUser = await client.get('/external-api/user').parse(UserSchema);

// ✅ Don't re-validate internal data
function processUser(user: z.infer<typeof UserSchema>) {
  // Already validated, just use it
  return user.name.toUpperCase();
}
```

### 2. Keep Schemas Small

```typescript
// ❌ One giant schema
const EverythingSchema = z.object({
  user: z.object({ ... }),
  posts: z.array(z.object({ ... })),
  comments: z.array(z.object({ ... }))
});

// ✅ Composable schemas
const UserSchema = z.object({ id: z.string(), name: z.string() });
const PostSchema = z.object({ id: z.string(), title: z.string() });
const CommentSchema = z.object({ id: z.string(), text: z.string() });
```

### 3. Use Branded Types

```typescript
const UserId = z.string().uuid().brand<'UserId'>();
const PostId = z.string().uuid().brand<'PostId'>();

// TypeScript prevents mixing up IDs
function getPost(postId: z.infer<typeof PostId>) { ... }

const userId: z.infer<typeof UserId> = ... ;
// getPost(userId); // TypeScript error!
```

### 4. Document with describe()

```typescript
const UserSchema = z.object({
  id: z.string().describe('Unique user identifier'),
  email: z.string().email().describe('Primary contact email'),
  role: z.enum(['admin', 'user']).describe('User permission level')
}).describe('Represents a user in the system');
```

## Next Steps

- **[Configuration](05-configuration.md)** - Client options and hooks
- **[Performance](06-performance.md)** - Pooling, HTTP/2, compression
- **[Resilience](07-resilience.md)** - Retry and circuit breaker
