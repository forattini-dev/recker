# Pagination

Recker provides built-in pagination support for APIs that return data across multiple pages. It automatically handles Link headers (RFC 8288), cursor-based pagination, and page-number pagination.

## Quick Start

```typescript
import { createClient } from 'recker';

const client = createClient({ baseUrl: 'https://api.example.com' });

// Iterate over all items across all pages
for await (const user of client.paginate('/users')) {
  console.log(user.name);
}

// Or collect all items at once
const allUsers = await client.getAll('/users');
```

---

## Pagination Strategies

Recker automatically detects and uses the appropriate pagination strategy based on your configuration and the API response.

### 1. Link Header (RFC 8288)

The default strategy. Follows `rel="next"` links in response headers.

```
Link: <https://api.example.com/users?page=2>; rel="next"
```

```typescript
// Automatic detection - no configuration needed
for await (const user of client.paginate('/users')) {
  console.log(user);
}

// GitHub API example
const client = createClient({
  baseUrl: 'https://api.github.com',
  headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
});

for await (const repo of client.paginate('/user/repos')) {
  console.log(repo.full_name);
}
```

### 2. Cursor-Based Pagination

For APIs that return a cursor/token for the next page.

```json
{
  "data": [...],
  "pagination": {
    "next_cursor": "abc123"
  }
}
```

```typescript
for await (const item of client.paginate('/items', {}, {
  nextCursorPath: 'pagination.next_cursor',
  resultsPath: 'data'
})) {
  console.log(item);
}

// Twitter/X API example
for await (const tweet of client.paginate('/tweets/search', {
  params: { query: 'recker' }
}, {
  nextCursorPath: 'meta.next_token',
  resultsPath: 'data'
})) {
  console.log(tweet.text);
}
```

### 3. Page Number Pagination

For APIs that use `?page=1`, `?page=2`, etc.

```typescript
for await (const product of client.paginate('/products', {
  params: { limit: 100 }
}, {
  pageParam: 'page',
  resultsPath: 'products'
})) {
  console.log(product.name);
}

// Stops automatically when response is empty
```

### 4. Custom Function

For complex pagination logic or non-standard APIs.

```typescript
for await (const item of client.paginate('/search', {}, {
  getNextUrl: (response, data, currentUrl) => {
    // Custom logic to determine next URL
    if (data.hasMore) {
      return `/search?offset=${data.offset + data.limit}`;
    }
    return null;  // null = stop pagination
  },
  getItems: (data) => data.results
})) {
  console.log(item);
}
```

---

## API Reference

### `client.paginate(url, requestOptions?, paginationOptions?)`

Returns an async generator that yields individual items from all pages.

```typescript
interface PaginationOptions<T = any> {
  // Extract items from response data
  getItems?: (data: any) => T[];

  // Determine the next page URL
  getNextUrl?: (response: ReckerResponse, data: any, currentUrl: string) => string | null;

  // Maximum number of pages to fetch (default: Infinity)
  maxPages?: number;

  // Page number parameter name (e.g., 'page')
  pageParam?: string;

  // Items per page parameter name (e.g., 'limit')
  limitParam?: string;

  // Path to results array in response (e.g., 'data.items')
  resultsPath?: string;

  // Path to next cursor in response (e.g., 'meta.cursor')
  nextCursorPath?: string;
}
```

### `client.streamPages(url, requestOptions?, paginationOptions?)`

Returns an async generator that yields full page results including response metadata.

```typescript
interface PageResult<T> {
  data: T;           // Parsed response data
  response: Response; // Full Response object
  pageNumber: number; // Current page (1-indexed)
}

for await (const page of client.streamPages('/users')) {
  console.log(`Page ${page.pageNumber}:`, page.data);
  console.log('Headers:', page.response.headers);
}
```

### `client.getAll(url, requestOptions?, paginationOptions?)`

Convenience method that collects all items into an array.

```typescript
const allUsers = await client.getAll('/users');
const allProducts = await client.getAll('/products', {}, {
  resultsPath: 'data.products',
  maxPages: 10
});
```

---

## Configuration

### Default Pagination Settings

Set default pagination behavior at the client level:

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  pagination: {
    pageParam: 'page',
    limitParam: 'per_page',
    resultsPath: 'data'
  }
});

// Now all paginate calls use these defaults
for await (const item of client.paginate('/items')) {
  // Uses page, per_page, and extracts from data
}
```

### Override Per Request

```typescript
// Override defaults for specific endpoint
for await (const item of client.paginate('/special-endpoint', {}, {
  resultsPath: 'results.items',  // Override
  maxPages: 5                    // Limit pages
})) {
  console.log(item);
}
```

---

## Common API Patterns

### GitHub API

```typescript
const github = createClient({
  baseUrl: 'https://api.github.com',
  headers: {
    'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json'
  }
});

// Repositories (uses Link header)
for await (const repo of github.paginate('/user/repos', {
  params: { per_page: 100 }
})) {
  console.log(repo.full_name);
}

// Issues with state filter
for await (const issue of github.paginate('/repos/owner/repo/issues', {
  params: { state: 'open', per_page: 100 }
})) {
  console.log(`#${issue.number}: ${issue.title}`);
}
```

### Stripe API

```typescript
const stripe = createClient({
  baseUrl: 'https://api.stripe.com/v1',
  headers: {
    'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`
  }
});

// Stripe uses cursor pagination with 'starting_after'
for await (const customer of stripe.paginate('/customers', {
  params: { limit: 100 }
}, {
  getNextUrl: (response, data) => {
    if (data.has_more) {
      const lastId = data.data[data.data.length - 1].id;
      return `/customers?limit=100&starting_after=${lastId}`;
    }
    return null;
  },
  getItems: (data) => data.data
})) {
  console.log(customer.email);
}
```

### Twitter/X API

```typescript
const twitter = createClient({
  baseUrl: 'https://api.twitter.com/2',
  headers: {
    'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}`
  }
});

// Twitter uses next_token cursor
for await (const tweet of twitter.paginate('/tweets/search/recent', {
  params: {
    query: 'recker',
    max_results: 100
  }
}, {
  nextCursorPath: 'meta.next_token',
  pageParam: 'next_token',
  resultsPath: 'data'
})) {
  console.log(tweet.text);
}
```

### REST API with Offset

```typescript
// Many APIs use offset/limit
let offset = 0;
const limit = 100;

for await (const item of client.paginate('/items', {
  params: { limit }
}, {
  getNextUrl: (response, data, currentUrl) => {
    if (data.items.length < limit) {
      return null;  // No more items
    }
    offset += limit;
    return `/items?offset=${offset}&limit=${limit}`;
  },
  getItems: (data) => data.items
})) {
  console.log(item);
}
```

### GraphQL Cursor Pagination

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com/graphql',
  plugins: [graphqlPlugin()]
});

async function* paginateGraphQL(query: string, variables: any) {
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const data = await graphql(client, query, { ...variables, cursor });
    const connection = data.users;

    for (const edge of connection.edges) {
      yield edge.node;
    }

    cursor = connection.pageInfo.endCursor;
    hasMore = connection.pageInfo.hasNextPage;
  }
}

// Usage
for await (const user of paginateGraphQL(`
  query Users($cursor: String) {
    users(first: 100, after: $cursor) {
      edges {
        node { id name }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`, {})) {
  console.log(user.name);
}
```

---

## Advanced Patterns

### Parallel Page Fetching

For APIs that support it, fetch pages in parallel:

```typescript
async function parallelPaginate<T>(
  client: Client,
  url: string,
  totalPages: number,
  options: PaginationOptions
): Promise<T[]> {
  const pagePromises = Array.from({ length: totalPages }, (_, i) =>
    client.get(url, {
      params: { page: i + 1 }
    }).json()
  );

  const pages = await Promise.all(pagePromises);
  return pages.flatMap(page => options.getItems?.(page) || page);
}

// Fetch first 10 pages in parallel
const items = await parallelPaginate(client, '/items', 10, {
  getItems: (data) => data.items
});
```

### Rate-Limited Pagination

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [
    retry({
      statusCodes: [429],
      respectRetryAfter: true
    })
  ],
  concurrency: {
    requestsPerInterval: 10,
    interval: 1000  // 10 req/sec
  }
});

// Pagination automatically respects rate limits
for await (const item of client.paginate('/items')) {
  console.log(item);
}
```

### Resume Pagination

Save progress and resume from where you left off:

```typescript
interface PaginationState {
  lastUrl: string;
  lastCursor: string;
  processedCount: number;
}

async function resumablePaginate(
  client: Client,
  startUrl: string,
  state?: PaginationState
) {
  const currentState: PaginationState = state || {
    lastUrl: startUrl,
    lastCursor: '',
    processedCount: 0
  };

  try {
    for await (const page of client.streamPages(currentState.lastUrl, {}, {
      nextCursorPath: 'meta.cursor'
    })) {
      // Update state
      currentState.lastUrl = page.response.url;
      currentState.lastCursor = page.data.meta?.cursor || '';

      for (const item of page.data.items) {
        await processItem(item);
        currentState.processedCount++;
      }

      // Save checkpoint
      await saveState(currentState);
    }
  } catch (error) {
    console.log('Failed at:', currentState.lastUrl);
    console.log('Resume with state:', currentState);
    throw error;
  }
}
```

### Conditional Pagination

Stop pagination based on item conditions:

```typescript
async function* paginateUntil<T>(
  client: Client,
  url: string,
  condition: (item: T) => boolean
) {
  for await (const item of client.paginate<T>(url)) {
    if (condition(item)) {
      return;  // Stop pagination
    }
    yield item;
  }
}

// Get items until we find one older than 24 hours
const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

for await (const item of paginateUntil(client, '/items', {},
  (item: any) => new Date(item.created_at).getTime() < oneDayAgo
)) {
  console.log(item);
}
```

---

## Error Handling

### Page Failures

```typescript
try {
  for await (const item of client.paginate('/items')) {
    console.log(item);
  }
} catch (error) {
  if (error instanceof HttpError) {
    console.log('Failed on page, status:', error.status);
  }
}
```

### Retry Failed Pages

```typescript
async function* robustPaginate<T>(
  client: Client,
  url: string,
  options: PaginationOptions
) {
  for await (const page of client.streamPages(url, {}, options)) {
    let retries = 3;
    let success = false;

    while (retries > 0 && !success) {
      try {
        for (const item of options.getItems?.(page.data) || page.data) {
          yield item;
        }
        success = true;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
}
```

---

## Performance Tips

1. **Use `maxPages`** to limit memory usage
   ```typescript
   client.paginate('/items', {}, { maxPages: 100 })
   ```

2. **Process items immediately** instead of collecting all
   ```typescript
   // Good - stream processing
   for await (const item of client.paginate('/items')) {
     await processItem(item);
   }

   // Avoid - loads all into memory
   const all = await client.getAll('/items');
   ```

3. **Request larger page sizes** when supported
   ```typescript
   client.paginate('/items', { params: { per_page: 100 } })
   ```

4. **Use concurrent processing** with controlled concurrency
   ```typescript
   const items = [];
   for await (const item of client.paginate('/items')) {
     items.push(item);
     if (items.length >= 10) {
       await Promise.all(items.map(processItem));
       items.length = 0;
     }
   }
   ```

---

## Best Practices

1. **Always handle the empty case**
   ```typescript
   let count = 0;
   for await (const item of client.paginate('/items')) {
     count++;
     // process
   }
   if (count === 0) {
     console.log('No items found');
   }
   ```

2. **Set reasonable limits**
   ```typescript
   client.paginate('/items', {}, { maxPages: 1000 })
   ```

3. **Log progress for long operations**
   ```typescript
   let pageNum = 0;
   for await (const page of client.streamPages('/items')) {
     pageNum++;
     console.log(`Processing page ${pageNum}...`);
     // process page.data
   }
   ```

4. **Use appropriate strategy for your API**
   - Link headers: GitHub, GitLab, standard REST
   - Cursor: Twitter, Stripe, Shopify
   - Page number: Legacy APIs, simple pagination
