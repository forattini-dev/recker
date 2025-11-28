# TypeScript Configuration

> Type-safe HTTP requests with full TypeScript support, generics, and runtime validation.

## Table of Contents

- [Type-Safe Responses](#type-safe-responses)
- [Generic Methods](#generic-methods)
- [Runtime Validation](#runtime-validation)
- [Type Inference](#type-inference)
- [Custom Types](#custom-types)
- [Error Types](#error-types)

## Type-Safe Responses

Define response types for compile-time safety:

### Basic Type Annotation

```typescript
interface User {
  id: number
  name: string
  email: string
}

const response = await client.get<User>('/users/1')
const user: User = await response.json()

// TypeScript knows user has id, name, email
console.log(user.name)  // ✓ Type-safe
console.log(user.foo)   // ✗ Type error: Property 'foo' does not exist
```

### Array Responses

```typescript
interface User {
  id: number
  name: string
}

const response = await client.get<User[]>('/users')
const users: User[] = await response.json()

users.forEach(user => {
  console.log(user.name)  // ✓ Type-safe
})
```

### Nested Types

```typescript
interface ApiResponse<T> {
  data: T
  meta: {
    page: number
    total: number
  }
}

interface User {
  id: number
  name: string
}

const response = await client.get<ApiResponse<User[]>>('/users')
const body: ApiResponse<User[]> = await response.json()

console.log(body.data[0].name)    // ✓ Type-safe
console.log(body.meta.total)      // ✓ Type-safe
```

## Generic Methods

All HTTP methods support generic type parameters:

### GET with Generics

```typescript
interface User {
  id: number
  name: string
}

// Type parameter
const response = await client.get<User>('/users/1')
const user = await response.json()  // Type: User
```

### POST with Generics

```typescript
interface CreateUserRequest {
  name: string
  email: string
}

interface User {
  id: number
  name: string
  email: string
}

const response = await client.post<User>('/users', {
  json: {
    name: 'Alice',
    email: 'alice@example.com'
  } satisfies CreateUserRequest
})

const user = await response.json()  // Type: User
console.log(user.id)  // ✓ Type-safe
```

### PUT/PATCH with Generics

```typescript
interface UpdateUserRequest {
  name?: string
  email?: string
}

interface User {
  id: number
  name: string
  email: string
}

const response = await client.patch<User>('/users/1', {
  json: {
    name: 'Alice Updated'
  } satisfies UpdateUserRequest
})

const user = await response.json()  // Type: User
```

## Runtime Validation

Combine TypeScript with Zod for runtime type safety:

### Basic Validation

```typescript
import { z } from 'zod'

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email()
})

type User = z.infer<typeof UserSchema>

// Runtime validation
const response = await client.get('/users/1')
const data = await response.json()
const user = UserSchema.parse(data)  // Validates at runtime

// Type: User (inferred from schema)
console.log(user.id)
```

### Validation Helper

```typescript
import { z } from 'zod'

// Helper function
async function fetchAndValidate<T>(
  schema: z.ZodSchema<T>,
  request: Promise<Response>
): Promise<T> {
  const response = await request
  const data = await response.json()
  return schema.parse(data)
}

// Usage
const UserSchema = z.object({
  id: z.number(),
  name: z.string()
})

const user = await fetchAndValidate(
  UserSchema,
  client.get('/users/1')
)
// Type: { id: number, name: string }
```

### Array Validation

```typescript
import { z } from 'zod'

const UserSchema = z.object({
  id: z.number(),
  name: z.string()
})

const UsersSchema = z.array(UserSchema)

const response = await client.get('/users')
const data = await response.json()
const users = UsersSchema.parse(data)

// Type: Array<{ id: number, name: string }>
users.forEach(user => {
  console.log(user.name)  // ✓ Type-safe
})
```

### Validation Plugin

```typescript
import { z } from 'zod'

// Create validation plugin
const validation = (client) => {
  client.validate = async <T>(schema: z.ZodSchema<T>, response: Response) => {
    const data = await response.json()
    return schema.parse(data)
  }
  return client
}

const client = recker({
  plugins: [validation]
})

// Usage
const UserSchema = z.object({ id: z.number(), name: z.string() })
const response = await client.get('/users/1')
const user = await client.validate(UserSchema, response)
```

**Related:** [Zod Documentation](https://zod.dev/)

## Type Inference

TypeScript automatically infers types from your code:

### Inferred Return Types

```typescript
interface User {
  id: number
  name: string
}

// Return type inferred as Promise<User>
async function getUser(id: number) {
  const response = await client.get<User>(`/users/${id}`)
  return response.json()
}

// Type: User
const user = await getUser(1)
```

### Inferred Parameter Types

```typescript
interface CreateUserRequest {
  name: string
  email: string
}

async function createUser(data: CreateUserRequest) {
  return client.post('/users', { json: data })
}

// ✓ Correct
await createUser({ name: 'Alice', email: 'alice@example.com' })

// ✗ Type error: missing 'email'
await createUser({ name: 'Alice' })
```

### Type Guards

```typescript
interface User {
  id: number
  name: string
}

interface Admin extends User {
  role: 'admin'
  permissions: string[]
}

function isAdmin(user: User | Admin): user is Admin {
  return 'role' in user && user.role === 'admin'
}

const response = await client.get<User | Admin>('/users/me')
const user = await response.json()

if (isAdmin(user)) {
  // Type narrowed to Admin
  console.log(user.permissions)
} else {
  // Type: User
  console.log(user.name)
}
```

## Custom Types

Define custom types for your API:

### Utility Types

```typescript
// Paginated response wrapper
interface Paginated<T> {
  data: T[]
  meta: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

// Usage
interface User {
  id: number
  name: string
}

const response = await client.get<Paginated<User>>('/users')
const body = await response.json()

body.data.forEach(user => {
  console.log(user.name)  // ✓ Type-safe
})
console.log(body.meta.totalPages)  // ✓ Type-safe
```

### API Error Types

```typescript
interface ApiError {
  error: {
    code: string
    message: string
    details?: Record<string, any>
  }
}

try {
  await client.get('/api')
} catch (error) {
  if (error instanceof ReckerError) {
    const apiError: ApiError = await error.response.json()
    console.log(apiError.error.code)
    console.log(apiError.error.message)
  }
}
```

### Discriminated Unions

```typescript
interface SuccessResponse {
  status: 'success'
  data: any
}

interface ErrorResponse {
  status: 'error'
  error: {
    code: string
    message: string
  }
}

type ApiResponse = SuccessResponse | ErrorResponse

const response = await client.get<ApiResponse>('/api')
const body = await response.json()

if (body.status === 'success') {
  // Type narrowed to SuccessResponse
  console.log(body.data)
} else {
  // Type narrowed to ErrorResponse
  console.log(body.error.message)
}
```

### Extending ReckerClient

```typescript
declare module 'recker' {
  interface ReckerClient {
    // Add custom methods
    getUserById(id: number): Promise<User>
    createUser(data: CreateUserRequest): Promise<User>
  }
}

// Implementation
const client = recker({ baseUrl: 'https://api.example.com' })

client.getUserById = async (id: number) => {
  const response = await client.get<User>(`/users/${id}`)
  return response.json()
}

client.createUser = async (data: CreateUserRequest) => {
  const response = await client.post<User>('/users', { json: data })
  return response.json()
}

// Usage with full type safety
const user = await client.getUserById(1)  // Type: User
```

## Error Types

Recker provides typed errors for better error handling:

### ReckerError

```typescript
import { ReckerError } from 'recker'

try {
  await client.get('/api')
} catch (error) {
  if (error instanceof ReckerError) {
    console.log(error.status)      // number
    console.log(error.statusText)  // string
    console.log(error.request)     // ReckerRequest
    console.log(error.response)    // ReckerResponse
    console.log(error.retries)     // number
    console.log(error.timing)      // TimingInfo
  }
}
```

### Specific Error Types

```typescript
import {
  ReckerError,
  NetworkError,
  TimeoutError,
  AbortError
} from 'recker'

try {
  await client.get('/api', { timeout: 5000 })
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log('Request timed out after', error.timeout, 'ms')
  } else if (error instanceof NetworkError) {
    console.log('Network failure:', error.message)
  } else if (error instanceof AbortError) {
    console.log('Request was cancelled')
  } else if (error instanceof ReckerError) {
    console.log('HTTP error:', error.status)
  }
}
```

### Type-Safe Error Handling

```typescript
interface ApiErrorResponse {
  error: {
    code: string
    message: string
  }
}

try {
  await client.get('/api')
} catch (error) {
  if (error instanceof ReckerError) {
    // Type-safe error response parsing
    const errorBody: ApiErrorResponse = await error.response.json()

    switch (errorBody.error.code) {
      case 'UNAUTHORIZED':
        // Handle auth error
        break
      case 'RATE_LIMIT_EXCEEDED':
        // Handle rate limit
        break
      default:
        // Handle other errors
    }
  }
}
```

**Related:** [Error Handling Guide](/guides/basics/error-handling.md)

## Complete TypeScript Example

Putting it all together:

```typescript
import recker from 'recker'
import { z } from 'zod'

// Schemas
const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email()
})

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email()
})

// Types
type User = z.infer<typeof UserSchema>
type CreateUserRequest = z.infer<typeof CreateUserSchema>

// Client
const client = recker({
  baseUrl: 'https://api.example.com',
  throwOnError: true
})

// Type-safe functions
async function getUser(id: number): Promise<User> {
  const response = await client.get<User>(`/users/${id}`)
  const data = await response.json()
  return UserSchema.parse(data)  // Runtime validation
}

async function createUser(data: CreateUserRequest): Promise<User> {
  // Validate input
  const validated = CreateUserSchema.parse(data)

  const response = await client.post<User>('/users', {
    json: validated
  })

  const created = await response.json()
  return UserSchema.parse(created)  // Validate output
}

// Usage
const user = await getUser(1)
console.log(user.name)  // ✓ Type-safe

const newUser = await createUser({
  name: 'Alice',
  email: 'alice@example.com'
})
console.log(newUser.id)  // ✓ Type-safe
```

## Next Steps

- **Client configuration** → [Client Options](/configuration/client-options.md)
- **Request configuration** → [Request Options](/configuration/request-options.md)
- **See examples** → [Examples](/examples/README.md)
- **Error handling** → [Error Handling Guide](/guides/basics/error-handling.md)
- **Back to overview** → [Configuration Quick Reference](/configuration/quick-reference.md)
