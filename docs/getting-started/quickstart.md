# Quick Start

Get up and running with Recker in 5 minutes.

## Basic Usage

```typescript
import { createClient } from 'recker';

// Create a client
const client = createClient({
  baseUrl: 'https://api.github.com'
});

// Make requests
const user = await client.get('/users/octocat').json();
console.log(user.name); // "The Octocat"
```

## With Smart Features

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  
  // Auto retry failed requests
  retry: {
    maxAttempts: 3,
    backoff: 'exponential'
  },
  
  // Cache responses
  cache: {
    strategy: 'stale-while-revalidate',
    ttl: 60000 // 1 minute
  },
  
  // Deduplicate parallel requests
  dedup: {},
  
  // Enable HTTP/2
  http2: true,
  
  // Beautiful debug output
  debug: true
});
```

## Common Patterns

### POST with JSON

```typescript
const response = await client.post('/users', {
  name: 'John Doe',
  email: 'john@example.com'
});

const newUser = await response.json();
```

### Error Handling

```typescript
try {
  const data = await client.get('/protected').json();
} catch (error) {
  if (error.status === 401) {
    // Handle unauthorized
  }
}
```

### With Headers

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

### Progress Tracking

```typescript
const response = await client.get('/large-file.zip');

for await (const progress of response.download()) {
  console.log(`${progress.percent?.toFixed(1)}% complete`);
  console.log(`Speed: ${(progress.rate! / 1024 / 1024).toFixed(2)} MB/s`);
}
```

### Server-Sent Events (SSE)

```typescript
// Perfect for OpenAI streaming
const response = await client.post('/chat/completions', {
  model: 'gpt-5',
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: true
});

for await (const event of response.sse()) {
  const data = JSON.parse(event.data);
  process.stdout.write(data.choices[0]?.delta?.content || '');
}
```

### Pagination

```typescript
// Auto-detect and iterate through all pages
for await (const item of client.paginate('/items')) {
  console.log(item.name);
}

// Or get all at once
const allItems = await client.getAll('/items');
```

## Next Steps

- [HTTP Fundamentals →](/http/02-fundamentals.md)
- [Configuration & Hooks →](/http/05-configuration.md)
- [API Reference →](/reference/01-api.md)
