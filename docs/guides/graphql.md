# GraphQL Support

Recker provides first-class GraphQL support with automatic error handling, type safety, and a clean API for queries, mutations, and subscriptions.

## The Problem with GraphQL

Traditional HTTP clients struggle with GraphQL because:

1. **"200 OK with Errors"** - GraphQL returns HTTP 200 even when the query fails
2. **Nested Error Handling** - Errors are buried in the response body
3. **Type Safety** - No compile-time validation of queries

Recker solves these issues with the `graphqlPlugin` and `graphql()` helper.

## Quick Start

```typescript
import { createClient, graphqlPlugin, graphql } from 'recker';

const client = createClient({
  baseUrl: 'https://api.github.com/graphql',
  headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` },
  plugins: [graphqlPlugin()]
});

// Type-safe query
interface UserResponse {
  viewer: {
    login: string;
    name: string;
  };
}

const data = await graphql<UserResponse>(client, `
  query {
    viewer {
      login
      name
    }
  }
`);

console.log(data.viewer.login);
```

## Setup

### Basic Setup

```typescript
import { createClient, graphqlPlugin } from 'recker';

const client = createClient({
  baseUrl: 'https://your-graphql-api.com/graphql',
  plugins: [graphqlPlugin()]
});
```

### With Authentication

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com/graphql',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  plugins: [graphqlPlugin()]
});
```

### Plugin Options

```typescript
graphqlPlugin({
  // Throw GraphQLError for responses with errors array (default: true)
  throwOnErrors: true
})
```

## Queries

### Basic Query

```typescript
import { graphql } from 'recker';

const data = await graphql(client, `
  query {
    users {
      id
      name
      email
    }
  }
`);

console.log(data.users);
```

### Query with Variables

```typescript
interface UserResponse {
  user: {
    id: string;
    name: string;
    posts: { title: string }[];
  };
}

const data = await graphql<UserResponse>(client, `
  query GetUser($id: ID!, $includePosts: Boolean!) {
    user(id: $id) {
      id
      name
      posts @include(if: $includeePosts) {
        title
      }
    }
  }
`, {
  id: '123',
  includePosts: true
});
```

### Named Queries

Recker automatically extracts operation names from your queries:

```typescript
// Operation name "GetUserProfile" is automatically sent
const data = await graphql(client, `
  query GetUserProfile {
    viewer {
      login
      avatarUrl
    }
  }
`);
```

### Query with Fragments

```typescript
const USER_FRAGMENT = `
  fragment UserFields on User {
    id
    name
    email
    avatarUrl
  }
`;

const data = await graphql(client, `
  ${USER_FRAGMENT}

  query GetUsers {
    users {
      ...UserFields
      posts {
        title
      }
    }
  }
`);
```

## Mutations

### Basic Mutation

```typescript
interface CreateUserResponse {
  createUser: {
    id: string;
    name: string;
  };
}

const data = await graphql<CreateUserResponse>(client, `
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      id
      name
    }
  }
`, {
  input: {
    name: 'John Doe',
    email: 'john@example.com'
  }
});

console.log('Created user:', data.createUser.id);
```

### Mutation with Optimistic Response

```typescript
// Immediately update UI
const optimisticUser = { id: 'temp-id', name: 'John Doe' };
updateUI(optimisticUser);

try {
  const data = await graphql<CreateUserResponse>(client, `
    mutation CreateUser($name: String!) {
      createUser(name: $name) {
        id
        name
      }
    }
  `, { name: 'John Doe' });

  // Replace with real data
  updateUI(data.createUser);
} catch (error) {
  // Rollback on failure
  rollbackUI();
}
```

### Multiple Mutations

```typescript
interface BatchResponse {
  createUser: { id: string };
  createPost: { id: string };
  sendNotification: { success: boolean };
}

const data = await graphql<BatchResponse>(client, `
  mutation BatchOperations($user: UserInput!, $post: PostInput!) {
    createUser(input: $user) {
      id
    }
    createPost(input: $post) {
      id
    }
    sendNotification(userId: "admin") {
      success
    }
  }
`, {
  user: { name: 'John' },
  post: { title: 'Hello World' }
});
```

## Error Handling

### GraphQL Errors

GraphQL responses can contain an `errors` array even with HTTP 200. Recker throws a typed `GraphQLError`:

```typescript
import { graphql, GraphQLError } from 'recker';

try {
  await graphql(client, `
    query {
      invalidField
    }
  `);
} catch (error) {
  if (error instanceof GraphQLError) {
    console.log('GraphQL errors:', error.errors);
    // [
    //   {
    //     message: "Cannot query field 'invalidField' on type 'Query'",
    //     locations: [{ line: 3, column: 7 }],
    //     path: ['invalidField']
    //   }
    // ]

    // Access the original response
    console.log('Status:', error.response.status);
  }
}
```

### Error Types

GraphQL errors typically fall into categories:

```typescript
try {
  await graphql(client, query, variables);
} catch (error) {
  if (error instanceof GraphQLError) {
    for (const err of error.errors) {
      // Validation errors (query syntax issues)
      if (err.extensions?.code === 'GRAPHQL_VALIDATION_FAILED') {
        console.log('Query validation failed:', err.message);
      }

      // Authentication errors
      if (err.extensions?.code === 'UNAUTHENTICATED') {
        console.log('Need to login');
        redirectToLogin();
      }

      // Authorization errors
      if (err.extensions?.code === 'FORBIDDEN') {
        console.log('Permission denied');
      }

      // Not found
      if (err.extensions?.code === 'NOT_FOUND') {
        console.log('Resource not found:', err.path);
      }
    }
  }
}
```

### Partial Data with Errors

GraphQL can return partial data alongside errors:

```typescript
graphqlPlugin({
  throwOnErrors: false  // Don't throw, handle manually
})

// Now handle errors yourself
const response = await client.post('', {
  json: { query, variables }
}).json<{ data: T; errors?: GraphQLError[] }>();

if (response.errors) {
  console.warn('Partial errors:', response.errors);
}

// Still use the partial data
console.log('Partial data:', response.data);
```

### Network Errors vs GraphQL Errors

```typescript
import { graphql, GraphQLError, NetworkError, TimeoutError } from 'recker';

try {
  await graphql(client, query);
} catch (error) {
  if (error instanceof GraphQLError) {
    // GraphQL-level error (query issues, business logic)
    console.log('GraphQL error:', error.errors[0].message);
  } else if (error instanceof NetworkError) {
    // Network-level error (connection failed)
    console.log('Network error:', error.code);
  } else if (error instanceof TimeoutError) {
    // Request timed out
    console.log('Request timed out');
  }
}
```

## Advanced Patterns

### GET Requests for Queries

Some CDNs and proxies cache GET requests. Use GET for queries when caching is desired:

```typescript
const data = await graphql(client, query, variables, {
  method: 'GET'
});
// Query and variables are sent as query parameters
```

### Custom Headers per Request

```typescript
const data = await graphql(client, query, variables, {
  headers: {
    'X-Request-ID': uuid(),
    'X-Trace-ID': traceId
  }
});
```

### Persisted Queries

For production, use persisted queries to reduce payload size:

```typescript
// Instead of sending full query text
const data = await client.post('', {
  json: {
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: 'abc123...'  // Hash of query
      }
    },
    variables
  }
}).json();
```

### Batched Queries

Send multiple queries in a single request:

```typescript
const responses = await client.post('', {
  json: [
    { query: 'query { user(id: "1") { name } }' },
    { query: 'query { user(id: "2") { name } }' },
    { query: 'query { posts { title } }' }
  ]
}).json<Array<{ data: any; errors?: any[] }>>();

// responses is an array of results
const [user1, user2, posts] = responses;
```

### Request Deduplication

Combine with Recker's dedup plugin to deduplicate identical queries:

```typescript
import { createClient, graphqlPlugin, dedup } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com/graphql',
  plugins: [
    dedup(),
    graphqlPlugin()
  ]
});

// These concurrent identical queries result in only one network request
const [a, b, c] = await Promise.all([
  graphql(client, 'query { viewer { id } }'),
  graphql(client, 'query { viewer { id } }'),
  graphql(client, 'query { viewer { id } }')
]);
```

### Caching GraphQL Queries

```typescript
import { createClient, graphqlPlugin, cache, MemoryStorage } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com/graphql',
  plugins: [
    cache({
      storage: new MemoryStorage(),
      methods: ['POST'],  // Cache POST requests (GraphQL)
      ttl: 60_000,
      keyGenerator: (req) => {
        // Cache key based on query + variables
        return `graphql:${req.method}:${req.url}`;
      }
    }),
    graphqlPlugin()
  ]
});
```

### Retry on Transient Errors

```typescript
import { createClient, graphqlPlugin, retry } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com/graphql',
  plugins: [
    retry({
      attempts: 3,
      delay: 1000,
      // Only retry on network errors, not GraphQL errors
      shouldRetry: (error) => {
        return !(error instanceof GraphQLError);
      }
    }),
    graphqlPlugin()
  ]
});
```

## Subscriptions

GraphQL subscriptions typically use WebSocket. Use Recker's WebSocket client:

```typescript
import { WebSocketClient } from 'recker';

const ws = new WebSocketClient('wss://api.example.com/graphql', {
  protocols: ['graphql-ws']
});

ws.on('open', () => {
  // Initialize connection
  ws.send(JSON.stringify({
    type: 'connection_init',
    payload: { authorization: token }
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);

  if (message.type === 'connection_ack') {
    // Start subscription
    ws.send(JSON.stringify({
      id: '1',
      type: 'subscribe',
      payload: {
        query: `
          subscription OnNewMessage {
            messageAdded {
              id
              content
              author { name }
            }
          }
        `
      }
    }));
  }

  if (message.type === 'next') {
    console.log('New message:', message.payload.data.messageAdded);
  }
});

await ws.connect();
```

### Subscription Helper

```typescript
async function* subscribe<T>(
  ws: WebSocketClient,
  query: string,
  variables?: Record<string, any>
): AsyncGenerator<T> {
  const id = crypto.randomUUID();

  ws.send(JSON.stringify({
    id,
    type: 'subscribe',
    payload: { query, variables }
  }));

  for await (const data of ws.messages()) {
    const message = JSON.parse(data);

    if (message.id === id) {
      if (message.type === 'next') {
        yield message.payload.data as T;
      } else if (message.type === 'complete') {
        break;
      } else if (message.type === 'error') {
        throw new GraphQLError(message.payload, null as any);
      }
    }
  }
}

// Usage
for await (const message of subscribe(ws, `
  subscription {
    messageAdded { id content }
  }
`)) {
  console.log('New message:', message);
}
```

## Type Safety with Code Generation

For full type safety, use GraphQL code generators:

### With graphql-codegen

```typescript
// Generated types from schema
import type { GetUserQuery, GetUserQueryVariables } from './generated';

const data = await graphql<GetUserQuery>(client, GetUserDocument, {
  id: '123'
} as GetUserQueryVariables);

// data.user is fully typed from schema
```

### With gql.tada

```typescript
import { graphql } from 'gql.tada';

const UserQuery = graphql(`
  query GetUser($id: ID!) {
    user(id: $id) {
      id
      name
      email
    }
  }
`);

// Types are inferred from the query
const data = await graphql(client, UserQuery, { id: '123' });
```

## Best Practices

1. **Always handle errors** - GraphQL errors are common and expected
2. **Use typed responses** - Define interfaces for your queries
3. **Extract fragments** - Reuse common field selections
4. **Use persisted queries** - Reduce payload size in production
5. **Batch when possible** - Combine multiple queries into one request
6. **Set timeouts** - GraphQL queries can be complex and slow

```typescript
// Good: Typed, with error handling
interface UserData {
  user: { id: string; name: string } | null;
}

try {
  const data = await graphql<UserData>(client, query, variables, {
    timeout: 10_000  // 10 second timeout
  });

  if (data.user) {
    console.log(data.user.name);
  }
} catch (error) {
  if (error instanceof GraphQLError) {
    handleGraphQLError(error);
  }
}
```

## Debugging

### Enable Debug Mode

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com/graphql',
  debug: true,  // Logs all requests
  plugins: [graphqlPlugin()]
});
```

### Inspect Requests

```typescript
const data = await graphql(client, query, variables, {
  hooks: {
    beforeRequest: (req) => {
      console.log('Query:', JSON.parse(req.body).query);
      console.log('Variables:', JSON.parse(req.body).variables);
    }
  }
});
```
