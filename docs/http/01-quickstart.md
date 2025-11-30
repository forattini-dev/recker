# Quick Start

Get up and running with Recker in under 5 minutes.

## Installation

```bash
# npm
npm install recker

# pnpm
pnpm add recker

# yarn
yarn add recker
```

**Requirements:** Node.js 18+

## Your First Request

```typescript
import { createClient } from 'recker';

// Create a client
const client = createClient({
  baseUrl: 'https://api.example.com'
});

// Make a GET request
const data = await client.get('/users').json();
console.log(data);
```

That's it! Let's break down what happened:

1. **`createClient()`** - Creates a configured HTTP client
2. **`.get('/users')`** - Makes a GET request to `/users`
3. **`.json()`** - Parses the response as JSON

## Common Operations

### GET Request

```typescript
// Simple GET
const users = await client.get('/users').json();

// With query parameters
const user = await client.get('/users/:id', {
  params: { id: '123' }
}).json();

// With query string
const results = await client.get('/search', {
  query: { q: 'recker', limit: 10 }
}).json();
```

### POST Request

```typescript
// POST with JSON body
const newUser = await client.post('/users', {
  json: {
    name: 'John Doe',
    email: 'john@example.com'
  }
}).json();
```

### PUT & PATCH

```typescript
// Full update
await client.put('/users/123', {
  json: { name: 'Jane Doe', email: 'jane@example.com' }
});

// Partial update
await client.patch('/users/123', {
  json: { name: 'Jane Doe' }
});
```

### DELETE

```typescript
await client.delete('/users/123');
```

## Headers

```typescript
// Set headers per request
const data = await client.get('/protected', {
  headers: {
    'Authorization': 'Bearer token123'
  }
}).json();

// Set default headers for all requests
const client = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'Authorization': 'Bearer token123',
    'X-Custom-Header': 'value'
  }
});
```

## Error Handling

```typescript
import { createClient, HttpError } from 'recker';

try {
  const data = await client.get('/users/999').json();
} catch (error) {
  if (error instanceof HttpError) {
    console.log('Status:', error.status);      // 404
    console.log('Message:', error.statusText); // "Not Found"

    // Access response body
    const body = await error.response.json();
    console.log('Error:', body.message);
  }
}
```

## Response Methods

```typescript
const response = client.get('/endpoint');

// Parse as JSON
const json = await response.json();

// Parse as text
const text = await response.text();

// Get raw buffer
const buffer = await response.buffer();

// Get blob (browser)
const blob = await response.blob();

// Access headers
const headers = (await response).headers;
console.log(headers.get('content-type'));
```

## Timeouts

```typescript
// Per-request timeout
const data = await client.get('/slow-endpoint', {
  timeout: 5000 // 5 seconds
}).json();

// Default timeout for all requests
const client = createClient({
  baseUrl: 'https://api.example.com',
  timeout: 10000 // 10 seconds
});
```

## Abort Requests

```typescript
const controller = new AbortController();

// Start request
const promise = client.get('/large-file', {
  signal: controller.signal
}).json();

// Cancel it
setTimeout(() => controller.abort(), 1000);

try {
  await promise;
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Request was cancelled');
  }
}
```

## TypeScript Support

Recker is written in TypeScript and provides full type inference:

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

// Type-safe response
const user = await client.get<User>('/users/1').json();
console.log(user.name); // TypeScript knows this is a string

// Type-safe array
const users = await client.get<User[]>('/users').json();
users.forEach(u => console.log(u.email));
```

## What's Next?

Now that you've made your first requests, explore more features:

- **[Fundamentals](02-fundamentals.md)** - HTTP methods, parameters, headers
- **[Responses](03-responses.md)** - Streaming, downloads, parsing
- **[Configuration](05-configuration.md)** - Client options, hooks
- **[Resilience](07-resilience.md)** - Retry, circuit breaker

## Quick Reference

```typescript
import { createClient } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  timeout: 10000,
  headers: { 'Authorization': 'Bearer token' }
});

// GET
await client.get('/path').json();
await client.get('/path', { query: { key: 'value' } }).json();

// POST
await client.post('/path', { json: { data: 'value' } }).json();

// PUT
await client.put('/path', { json: { data: 'value' } });

// PATCH
await client.patch('/path', { json: { data: 'value' } });

// DELETE
await client.delete('/path');

// HEAD
await client.head('/path');

// OPTIONS
await client.options('/path');
```
