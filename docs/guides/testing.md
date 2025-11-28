# Testing with Recker

Recker provides first-class testing utilities that make it easy to write reliable tests for your HTTP-dependent code.

## MockTransport

The `MockTransport` class allows you to mock HTTP responses without making real network requests.

### Basic Usage

```typescript
import { createClient, testing } from 'recker';

const { MockTransport } = testing;

// Create a mock transport
const mock = new MockTransport();

// Define mock responses
mock.setMockResponse('GET', '/users', 200, [
  { id: 1, name: 'John' },
  { id: 2, name: 'Jane' }
]);

// Create client with mock transport
const client = createClient({
  baseUrl: 'https://api.example.com',
  transport: mock
});

// Make requests - they hit the mock, not the network
const users = await client.get('/users').json();
console.log(users); // [{ id: 1, name: 'John' }, ...]
```

### Response Options

```typescript
// Basic response
mock.setMockResponse('GET', '/users', 200, { users: [] });

// With custom headers
mock.setMockResponse('GET', '/users', 200, { users: [] }, {
  headers: {
    'X-Total-Count': '100',
    'X-Rate-Limit-Remaining': '99'
  }
});

// Limit response usage (useful for testing retry)
mock.setMockResponse('GET', '/flaky', 500, { error: 'Server Error' }, {
  times: 2  // Only fail twice
});
mock.setMockResponse('GET', '/flaky', 200, { success: true });

// Add delay for async testing
mock.setMockResponse('GET', '/slow', 200, { data: 'delayed' }, {
  delay: 1000  // 1 second delay
});
```

### Verifying Calls

```typescript
// Check if endpoint was called
expect(mock.getCallCount('GET', '/users')).toBe(1);

// Get all calls to an endpoint
const calls = mock.getCalls('GET', '/users');
expect(calls[0].headers['Authorization']).toBe('Bearer token');

// Get request body from POST calls
const postCalls = mock.getCalls('POST', '/users');
expect(postCalls[0].body).toEqual({ name: 'John' });

// Clear all mocks
mock.clear();
```

### Pattern Matching

```typescript
// Regex patterns for dynamic paths
mock.setMockResponse('GET', /\/users\/\d+/, 200, { id: 1, name: 'John' });

// This matches /users/1, /users/2, /users/123, etc.
const user = await client.get('/users/42').json();
```

### Error Simulation

```typescript
// Network error
mock.setMockError('GET', '/network-fail', new Error('ECONNREFUSED'));

// Timeout
mock.setMockError('GET', '/timeout', new Error('ETIMEDOUT'));

// HTTP errors
mock.setMockResponse('GET', '/not-found', 404, { error: 'Not Found' });
mock.setMockResponse('GET', '/unauthorized', 401, { error: 'Unauthorized' });
mock.setMockResponse('GET', '/server-error', 500, { error: 'Internal Server Error' });
```

## Testing Patterns

### Testing Retry Logic

```typescript
import { createClient, retry, testing } from 'recker';

const { MockTransport } = testing;

test('retries on server errors', async () => {
  const mock = new MockTransport();

  // Fail twice, then succeed
  mock.setMockResponse('GET', '/flaky', 503, { error: 'Unavailable' }, { times: 2 });
  mock.setMockResponse('GET', '/flaky', 200, { success: true });

  const client = createClient({
    baseUrl: 'https://api.example.com',
    transport: mock,
    plugins: [
      retry({ attempts: 3, delay: 10 })
    ]
  });

  const result = await client.get('/flaky').json();

  expect(result).toEqual({ success: true });
  expect(mock.getCallCount('GET', '/flaky')).toBe(3);
});
```

### Testing Cache

```typescript
import { createClient, cache, MemoryStorage, testing } from 'recker';

const { MockTransport } = testing;

test('returns cached response on second call', async () => {
  const mock = new MockTransport();
  mock.setMockResponse('GET', '/data', 200, { value: 42 });

  const client = createClient({
    baseUrl: 'https://api.example.com',
    transport: mock,
    plugins: [
      cache({ storage: new MemoryStorage(), ttl: 60000 })
    ]
  });

  // First call hits the mock
  await client.get('/data').json();

  // Second call should use cache
  await client.get('/data').json();

  // Only one actual request was made
  expect(mock.getCallCount('GET', '/data')).toBe(1);
});
```

### Testing Request Deduplication

```typescript
import { createClient, dedup, testing } from 'recker';

const { MockTransport } = testing;

test('deduplicates concurrent requests', async () => {
  const mock = new MockTransport();
  mock.setMockResponse('GET', '/user', 200, { id: 1 }, { delay: 100 });

  const client = createClient({
    baseUrl: 'https://api.example.com',
    transport: mock,
    plugins: [dedup()]
  });

  // Fire 3 concurrent requests
  const [a, b, c] = await Promise.all([
    client.get('/user').json(),
    client.get('/user').json(),
    client.get('/user').json()
  ]);

  // All get the same response
  expect(a).toEqual({ id: 1 });
  expect(b).toEqual({ id: 1 });
  expect(c).toEqual({ id: 1 });

  // But only one request was made
  expect(mock.getCallCount('GET', '/user')).toBe(1);
});
```

### Testing Circuit Breaker

```typescript
import { createClient, circuitBreaker, testing } from 'recker';

const { MockTransport } = testing;

test('opens circuit after threshold failures', async () => {
  const mock = new MockTransport();
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
```

### Testing with Vitest

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createClient, testing } from 'recker';

const { MockTransport } = testing;

describe('UserService', () => {
  let client: ReturnType<typeof createClient>;
  let mock: MockTransport;

  beforeEach(() => {
    mock = new MockTransport();
    client = createClient({
      baseUrl: 'https://api.example.com',
      transport: mock
    });
  });

  it('fetches users', async () => {
    mock.setMockResponse('GET', '/users', 200, [
      { id: 1, name: 'John' }
    ]);

    const users = await client.get('/users').json();

    expect(users).toHaveLength(1);
    expect(users[0].name).toBe('John');
  });

  it('creates user', async () => {
    mock.setMockResponse('POST', '/users', 201, { id: 2, name: 'Jane' });

    const user = await client.post('/users', {
      json: { name: 'Jane' }
    }).json();

    expect(user.id).toBe(2);

    const calls = mock.getCalls('POST', '/users');
    expect(calls[0].body).toEqual({ name: 'Jane' });
  });
});
```

## HAR Replay

For deterministic tests using real API responses, use HAR recording and playback.

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

test('uses recorded responses', async () => {
  // Load HAR file
  const player = await harPlayer('./fixtures/api-responses.har');

  const client = createClient({
    baseUrl: 'https://api.example.com',
    plugins: [player]
  });

  // Requests return recorded responses
  const users = await client.get('/users').json();
  expect(users).toEqual(/* recorded response */);
});
```

### HAR with Matching Options

```typescript
const player = await harPlayer('./fixtures/responses.har', {
  // Match by URL pattern only (ignore query params)
  matchBy: 'url',

  // Strict matching (method + url + body)
  matchBy: 'strict',

  // Custom matcher
  matcher: (request, entry) => {
    return request.url.includes(entry.request.url);
  }
});
```

## MockClient

For simpler testing scenarios, use `MockClient`:

```typescript
import { testing } from 'recker';

const { MockClient } = testing;

const client = new MockClient({
  'GET /users': [{ id: 1, name: 'John' }],
  'POST /users': { id: 2, name: 'Jane' },
  'GET /users/:id': (params) => ({ id: params.id, name: 'User' })
});

const users = await client.get('/users').json();
const user = await client.get('/users/42').json();
```

## Testing Streaming

```typescript
import { createClient, testing } from 'recker';

const { MockTransport } = testing;

test('handles SSE streaming', async () => {
  const mock = new MockTransport();

  // Mock SSE response
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
```

## Testing Progress

```typescript
test('tracks download progress', async () => {
  const mock = new MockTransport();
  mock.setMockResponse('GET', '/file', 200, Buffer.alloc(1000), {
    headers: { 'Content-Length': '1000' }
  });

  const client = createClient({
    baseUrl: 'https://api.example.com',
    transport: mock
  });

  const progressEvents = [];
  const response = await client.get('/file', {
    onDownloadProgress: (progress) => {
      progressEvents.push(progress.percent);
    }
  });

  expect(progressEvents).toContain(100);
});
```

## Best Practices

1. **Isolate tests** - Create fresh `MockTransport` for each test
2. **Verify calls** - Always check that expected requests were made
3. **Test error paths** - Simulate network errors and HTTP errors
4. **Use HAR for integration tests** - Record real responses for complex scenarios
5. **Test edge cases** - Empty responses, large payloads, slow responses
6. **Mock at the right level** - Use `MockTransport` for unit tests, real server for E2E

```typescript
// Unit test - fast, isolated
describe('Unit: UserService', () => {
  it('uses MockTransport', async () => {
    const mock = new MockTransport();
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
