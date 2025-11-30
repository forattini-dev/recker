# Testing

Mock HTTP requests for reliable, fast tests.

## MockTransport

### Basic Setup

```typescript
import { describe, it, expect } from 'vitest';
import { createClient } from 'recker';
import { MockTransport } from 'recker/testing';

describe('UserService', () => {
  it('should fetch users', async () => {
    const mock = new MockTransport();
    mock.setMockResponse('GET', '/users', 200, [
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' }
    ]);

    const client = createClient({
      baseUrl: 'https://api.example.com',
      transport: mock
    });

    const users = await client.get('/users').json();

    expect(users).toHaveLength(2);
    expect(users[0].name).toBe('John');
  });
});
```

### Mock Response Options

```typescript
mock.setMockResponse(
  method: string,
  path: string,
  status: number,
  body: any,
  options?: {
    headers?: Record<string, string>;
    delay?: number;    // Response delay in ms
    times?: number;    // Times to use this response
  }
);
```

### Multiple Responses

```typescript
// First call returns 200, second returns 404
mock.setMockResponse('GET', '/users/1', 200, { id: 1, name: 'John' }, { times: 1 });
mock.setMockResponse('GET', '/users/1', 404, { error: 'Not found' });
```

### Response Sequence

```typescript
// Each call gets next response in sequence
mock.setMockResponse('POST', '/login', 401, { error: 'Invalid' }, { times: 1 });
mock.setMockResponse('POST', '/login', 200, { token: 'abc123' });

// First call fails, second succeeds
await client.post('/login', { json: { user: 'john' } }); // 401
await client.post('/login', { json: { user: 'john' } }); // 200
```

### Verify Calls

```typescript
mock.setMockResponse('GET', '/users', 200, []);

await client.get('/users').json();
await client.get('/users').json();

// Check call count
expect(mock.getCallCount('GET', '/users')).toBe(2);
```

### With Delay

```typescript
// Simulate slow response
mock.setMockResponse('GET', '/slow', 200, { data: 'ok' }, {
  delay: 1000  // 1 second delay
});
```

### Pattern Matching

```typescript
// Regex patterns for dynamic paths
mock.setMockResponse('GET', /\/users\/\d+/, 200, { id: 1, name: 'John' });

// This matches /users/1, /users/2, /users/123, etc.
const user = await client.get('/users/42').json();

// Match with query params
mock.setMockResponse('GET', /\/search\?q=.*/, 200, { results: [] });

// Match any path
mock.setMockResponse('POST', /.*/, 201, { success: true });
```

### Error Simulation

```typescript
// Network error
mock.setNetworkError('GET', '/network-fail', 'ECONNRESET');

// Timeout
mock.setNetworkError('GET', '/timeout', 'ETIMEDOUT');

// DNS failure
mock.setNetworkError('GET', '/dns-fail', 'ENOTFOUND');

// HTTP errors
mock.setMockResponse('GET', '/not-found', 404, { error: 'Not Found' });
mock.setMockResponse('GET', '/unauthorized', 401, { error: 'Unauthorized' });
mock.setMockResponse('GET', '/server-error', 500, { error: 'Internal Server Error' });
```

## Testing Patterns

### Test Service Layer

```typescript
// services/user-service.ts
export class UserService {
  constructor(private client: Client) {}

  async getUser(id: number) {
    return this.client.get(`/users/${id}`).json();
  }

  async createUser(data: { name: string; email: string }) {
    return this.client.post('/users', { json: data }).json();
  }
}

// services/user-service.test.ts
import { UserService } from './user-service';

describe('UserService', () => {
  let mock: MockTransport;
  let client: Client;
  let service: UserService;

  beforeEach(() => {
    mock = new MockTransport();
    client = createClient({
      baseUrl: 'https://api.example.com',
      transport: mock
    });
    service = new UserService(client);
  });

  it('should get user by ID', async () => {
    mock.setMockResponse('GET', '/users/1', 200, {
      id: 1,
      name: 'John',
      email: 'john@example.com'
    });

    const user = await service.getUser(1);

    expect(user.name).toBe('John');
    expect(mock.getCallCount('GET', '/users/1')).toBe(1);
  });

  it('should create user', async () => {
    mock.setMockResponse('POST', '/users', 201, {
      id: 2,
      name: 'Jane',
      email: 'jane@example.com'
    });

    const user = await service.createUser({
      name: 'Jane',
      email: 'jane@example.com'
    });

    expect(user.id).toBe(2);
  });
});
```

### Test Error Handling

```typescript
describe('Error Handling', () => {
  it('should handle 404', async () => {
    mock.setMockResponse('GET', '/users/999', 404, {
      error: 'User not found'
    });

    await expect(
      client.get('/users/999').json()
    ).rejects.toThrow(HttpError);
  });

  it('should handle network errors', async () => {
    mock.setNetworkError('GET', '/users', 'ECONNRESET');

    await expect(
      client.get('/users').json()
    ).rejects.toThrow(NetworkError);
  });

  it('should handle timeouts', async () => {
    mock.setMockResponse('GET', '/slow', 200, {}, {
      delay: 10000  // 10 seconds
    });

    const client = createClient({
      baseUrl: 'https://api.example.com',
      transport: mock,
      timeout: 1000  // 1 second timeout
    });

    await expect(
      client.get('/slow').json()
    ).rejects.toThrow(TimeoutError);
  });
});
```

### Test Retry Logic

```typescript
describe('Retry', () => {
  it('should retry on 503', async () => {
    // First two calls fail, third succeeds
    mock.setMockResponse('GET', '/api', 503, { error: 'Unavailable' }, { times: 2 });
    mock.setMockResponse('GET', '/api', 200, { data: 'success' });

    const client = createClient({
      baseUrl: 'https://api.example.com',
      transport: mock,
      retry: {
        maxAttempts: 3,
        delay: 10
      }
    });

    const result = await client.get('/api').json();

    expect(result.data).toBe('success');
    expect(mock.getCallCount('GET', '/api')).toBe(3);
  });
});
```

### Test with Validation

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email()
});

describe('Validation', () => {
  it('should validate response', async () => {
    mock.setMockResponse('GET', '/users/1', 200, {
      id: 1,
      name: 'John',
      email: 'john@example.com'
    });

    const user = await client.get('/users/1').parse(UserSchema);

    expect(user.id).toBe(1);
  });

  it('should fail on invalid response', async () => {
    mock.setMockResponse('GET', '/users/1', 200, {
      id: 'not-a-number',  // Invalid
      name: 'John'
      // Missing email
    });

    await expect(
      client.get('/users/1').parse(UserSchema)
    ).rejects.toThrow();
  });
});
```

### Test Hooks

```typescript
describe('Hooks', () => {
  it('should add auth header', async () => {
    mock.setMockResponse('GET', '/protected', 200, { secret: 'data' });

    client.beforeRequest((req) => {
      return req.withHeader('Authorization', 'Bearer token123');
    });

    await client.get('/protected').json();

    const calls = mock.getCalls('GET', '/protected');
    expect(calls[0].headers.get('Authorization')).toBe('Bearer token123');
  });
});
```

### Test Circuit Breaker

```typescript
describe('Circuit Breaker', () => {
  it('should open circuit after threshold failures', async () => {
    mock.setMockResponse('GET', '/api', 500, { error: 'fail' });

    const onOpen = vi.fn();
    const client = createClient({
      baseUrl: 'https://api.example.com',
      transport: mock,
      plugins: [
        circuitBreaker({
          threshold: 3,
          resetTimeout: 1000,
          onOpen
        })
      ]
    });

    // Trigger 3 failures
    for (let i = 0; i < 3; i++) {
      await client.get('/api').catch(() => {});
    }

    expect(onOpen).toHaveBeenCalled();

    // Next request fails immediately (circuit open)
    await expect(client.get('/api')).rejects.toThrow('Circuit breaker is open');
  });
});
```

### Test Streaming (SSE)

```typescript
describe('Streaming', () => {
  it('should handle SSE streaming', async () => {
    mock.setMockResponse('POST', '/stream', 200, null, {
      headers: { 'Content-Type': 'text/event-stream' },
      stream: [
        'data: {"chunk": 1}\n\n',
        'data: {"chunk": 2}\n\n',
        'data: [DONE]\n\n'
      ]
    });

    const client = createClient({
      baseUrl: 'https://api.example.com',
      transport: mock
    });

    const chunks = [];
    for await (const event of client.post('/stream').sse()) {
      if (event.data !== '[DONE]') {
        chunks.push(JSON.parse(event.data));
      }
    }

    expect(chunks).toEqual([{ chunk: 1 }, { chunk: 2 }]);
  });
});
```

### Test Progress Tracking

```typescript
describe('Progress', () => {
  it('should track download progress', async () => {
    mock.setMockResponse('GET', '/file', 200, Buffer.alloc(1000), {
      headers: { 'Content-Length': '1000' }
    });

    const client = createClient({
      baseUrl: 'https://api.example.com',
      transport: mock
    });

    const progressEvents: number[] = [];
    await client.get('/file', {
      onDownloadProgress: (progress) => {
        progressEvents.push(progress.percent);
      }
    });

    expect(progressEvents).toContain(100);
  });

  it('should track upload progress', async () => {
    mock.setMockResponse('POST', '/upload', 201, { uploaded: true });

    const progressEvents: number[] = [];
    await client.post('/upload', {
      body: Buffer.alloc(5000),
      onUploadProgress: (progress) => {
        progressEvents.push(progress.percent);
      }
    });

    expect(progressEvents.length).toBeGreaterThan(0);
  });
});
```

### Test AI Client

```typescript
import { createAIClient } from 'recker/ai';

describe('AI Client', () => {
  it('should complete chat', async () => {
    mock.setMockResponse('POST', '/chat/completions', 200, {
      id: 'chat-123',
      choices: [{
        message: { role: 'assistant', content: 'Hello!' }
      }],
      usage: { prompt_tokens: 5, completion_tokens: 10 }
    });

    const ai = createAIClient({
      providers: {
        openai: { baseUrl: 'https://api.example.com' }
      }
    });

    // Inject mock transport
    // (Implementation depends on AI client internals)

    const response = await ai.chat('Hi!');
    expect(response.content).toBe('Hello!');
  });
});
```

## HAR Replay

Record real API responses and replay them in tests for deterministic integration testing.

### Recording HAR

```typescript
import { createClient, harRecorder } from 'recker';

// Record all requests
const recorder = harRecorder();
const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [recorder]
});

// Make real requests
await client.get('/users');
await client.post('/users', { json: { name: 'John' } });
await client.get('/users/1');

// Save to file
await recorder.save('./fixtures/api-responses.har');
```

### Playing Back HAR

```typescript
import { createClient, harPlayer } from 'recker';

describe('Integration', () => {
  it('should use recorded responses', async () => {
    const player = await harPlayer('./fixtures/api-responses.har');

    const client = createClient({
      baseUrl: 'https://api.example.com',
      plugins: [player]
    });

    // Requests return recorded responses
    const users = await client.get('/users').json();
    expect(users).toEqual(/* recorded response */);
  });
});
```

### HAR Matching Options

```typescript
const player = await harPlayer('./fixtures/responses.har', {
  // Match by URL pattern only (ignore query params)
  matchBy: 'url',

  // Strict matching (method + url + body)
  matchBy: 'strict',

  // Custom matcher
  matcher: (request, entry) => {
    return request.url.includes(entry.request.url);
  },

  // Throw if no matching entry found
  strict: true
});
```

## MockClient

Simpler API for basic testing scenarios:

```typescript
import { testing } from 'recker';

const { MockClient } = testing;

const client = new MockClient({
  'GET /users': [{ id: 1, name: 'John' }],
  'POST /users': { id: 2, name: 'Jane' },
  'GET /users/:id': (params) => ({ id: params.id, name: 'User' }),
  'DELETE /users/:id': { success: true }
});

// Use like normal client
const users = await client.get('/users').json();
const user = await client.get('/users/42').json();

expect(user.id).toBe('42');
```

## Integration Testing

### Real HTTP Server

```typescript
import { createServer } from 'http';

describe('Integration', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll((done) => {
    server = createServer((req, res) => {
      if (req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://localhost:${addr.port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  it('should connect to real server', async () => {
    const client = createClient({ baseUrl });

    const health = await client.get('/api/health').json();

    expect(health.status).toBe('ok');
  });
});
```

## Test Utilities

### Assert Response

```typescript
function assertResponse(response: ReckerResponse, expected: {
  status?: number;
  contentType?: string;
}) {
  if (expected.status) {
    expect(response.status).toBe(expected.status);
  }
  if (expected.contentType) {
    expect(response.headers.get('content-type')).toContain(expected.contentType);
  }
}

// Usage
const response = await client.get('/users');
assertResponse(response, { status: 200, contentType: 'application/json' });
```

### Mock Factory

```typescript
function createMockClient(mocks: Array<{
  method: string;
  path: string;
  status: number;
  body: any;
}>) {
  const transport = new MockTransport();

  for (const mock of mocks) {
    transport.setMockResponse(mock.method, mock.path, mock.status, mock.body);
  }

  return createClient({
    baseUrl: 'https://api.example.com',
    transport
  });
}

// Usage
const client = createMockClient([
  { method: 'GET', path: '/users', status: 200, body: [] },
  { method: 'POST', path: '/users', status: 201, body: { id: 1 } }
]);
```

## Best Practices

### 1. Use MockTransport Over Real HTTP

```typescript
// Good: Fast, deterministic
const mock = new MockTransport();
mock.setMockResponse('GET', '/users', 200, [...]);

// Avoid: Slow, flaky
await client.get('https://real-api.example.com/users');
```

### 2. Reset Mocks Between Tests

```typescript
let mock: MockTransport;

beforeEach(() => {
  mock = new MockTransport();  // Fresh mock for each test
});
```

### 3. Verify Call Counts

```typescript
mock.setMockResponse('POST', '/events', 204, null);

await service.trackEvent('click');
await service.trackEvent('scroll');

expect(mock.getCallCount('POST', '/events')).toBe(2);
```

### 4. Test Edge Cases

```typescript
// Empty responses
mock.setMockResponse('GET', '/users', 200, []);

// Error responses
mock.setMockResponse('GET', '/users', 500, { error: 'Server error' });

// Slow responses
mock.setMockResponse('GET', '/users', 200, [], { delay: 5000 });
```

## Test Levels

Choose the right testing strategy for each scenario:

```typescript
// Unit test - fast, isolated
describe('Unit: UserService', () => {
  it('uses MockTransport', async () => {
    const mock = new MockTransport();
    mock.setMockResponse('GET', '/users', 200, []);
    // ...
  });
});

// Integration test - uses recorded HAR
describe('Integration: UserService', () => {
  it('uses HAR replay', async () => {
    const player = await harPlayer('./fixtures/users.har');
    // ...
  });
});

// E2E test - real server
describe('E2E: UserService', () => {
  it('hits real API', async () => {
    const client = createClient({ baseUrl: process.env.API_URL });
    // ...
  });
});
```

### When to Use Each

| Level | Speed | Reliability | Use Case |
|-------|-------|-------------|----------|
| Unit (MockTransport) | ⚡ Fast | ✅ Deterministic | Business logic, edge cases |
| Integration (HAR) | 🔄 Medium | ✅ Deterministic | Complex flows, real data shapes |
| E2E (Real Server) | 🐢 Slow | ⚠️ Flaky | Smoke tests, critical paths |

## Next Steps

- **[Presets](04-presets.md)** - Pre-configured clients
- **[Troubleshooting](05-troubleshooting.md)** - Common issues
