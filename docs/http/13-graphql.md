# GraphQL

First-class GraphQL support with automatic error handling, type safety, and a clean API for queries, mutations, and subscriptions.

## The GraphQL Problem

Traditional HTTP clients struggle with GraphQL:

| Problem | Description |
|---------|-------------|
| **"200 OK with Errors"** | GraphQL returns HTTP 200 even when the query fails |
| **Nested Error Handling** | Errors are buried in the response body |
| **Type Safety** | No compile-time validation of queries |

Recker solves these with the `graphqlPlugin` and `graphql()` helper.

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

### Plugin Options

```typescript
graphqlPlugin({
  // Throw GraphQLError for responses with errors array (default: true)
  throwOnErrors: true,

  // Custom endpoint path (default: uses baseUrl as-is)
  endpoint: '/graphql',

  // Include extensions in requests
  includeExtensions: true
});
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
      posts @include(if: $includePosts) {
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

Operation names are automatically extracted:

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

GraphQL responses can contain an `errors` array even with HTTP 200:

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

### Error Classification

```typescript
try {
  await graphql(client, query, variables);
} catch (error) {
  if (error instanceof GraphQLError) {
    for (const err of error.errors) {
      switch (err.extensions?.code) {
        case 'GRAPHQL_VALIDATION_FAILED':
          console.log('Query validation failed:', err.message);
          break;

        case 'UNAUTHENTICATED':
          redirectToLogin();
          break;

        case 'FORBIDDEN':
          console.log('Permission denied');
          break;

        case 'NOT_FOUND':
          console.log('Resource not found:', err.path);
          break;

        default:
          console.log('GraphQL error:', err.message);
      }
    }
  }
}
```

### Partial Data with Errors

Handle partial responses when `throwOnErrors: false`:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com/graphql',
  plugins: [graphqlPlugin({ throwOnErrors: false })]
});

const response = await client.post('', {
  json: { query, variables }
}).json<{ data: T; errors?: GraphQLError[] }>();

if (response.errors) {
  console.warn('Partial errors:', response.errors);
}

// Still use the partial data
console.log('Partial data:', response.data);
```

### Network vs GraphQL Errors

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

## Subscriptions

### WebSocket Setup

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

## Advanced Patterns

### GET Requests for Queries

Use GET for CDN caching:

```typescript
const data = await graphql(client, query, variables, {
  method: 'GET'
});
// Query and variables are sent as query parameters
```

### Persisted Queries

Reduce payload size with query hashing:

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

const [user1, user2, posts] = responses;
```

### Request Deduplication

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

### Caching GraphQL

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
        const body = JSON.parse(req.body);
        return `graphql:${body.operationName}:${JSON.stringify(body.variables)}`;
      }
    }),
    graphqlPlugin()
  ]
});
```

### Retry on Network Errors Only

```typescript
import { createClient, graphqlPlugin, retry, GraphQLError } from 'recker';

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

## Type Safety

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

### 1. Always Handle Errors

```typescript
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

### 2. Use Typed Responses

```typescript
// Define interfaces for your queries
interface UserData {
  user: { id: string; name: string } | null;
}

const data = await graphql<UserData>(client, query, variables);
```

### 3. Extract Fragments

```typescript
const COMMON_FIELDS = `
  fragment CommonFields on User {
    id
    createdAt
    updatedAt
  }
`;

// Reuse across queries
const query = `
  ${COMMON_FIELDS}
  query { user { ...CommonFields name } }
`;
```

### 4. Set Timeouts

```typescript
// GraphQL queries can be complex and slow
const data = await graphql(client, query, variables, {
  timeout: 30_000  // 30 seconds for complex queries
});
```

### 5. Use Persisted Queries in Production

```typescript
// Reduces payload size and improves security
const data = await client.post('', {
  json: {
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: hashQuery(query)
      }
    },
    variables
  }
}).json();
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
client.beforeRequest((req) => {
  const body = JSON.parse(req.body);
  console.log('Query:', body.query);
  console.log('Variables:', body.variables);
  console.log('Operation:', body.operationName);
});
```

### Export as cURL

```typescript
import { toCurl } from 'recker';

client.beforeRequest((req) => {
  console.log(toCurl(req));
});
```

## Next Steps

- **[Scraping](14-scraping.md)** - Web scraping patterns
- **[Observability](12-observability.md)** - Debug and metrics
- **[Plugins](10-plugins.md)** - Create custom GraphQL plugins
