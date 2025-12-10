# Error Handling

Recker provides a comprehensive error handling system that:
- Classifies errors into categories
- Provides user-friendly messages
- Suggests fixes for each error type
- Indicates if errors are retriable
- Shows estimated wait times for rate limits

## Error Categories

### HTTP Status Errors

| Code | Type | Retriable | Suggestion |
|------|------|-----------|------------|
| 400 | `HTTP_400` | No | Check request body, headers, and URL parameters |
| 401 | `HTTP_401` | No | Check API key, token, or credentials |
| 403 | `HTTP_403` | No | Verify permissions and API scopes |
| 404 | `HTTP_404` | No | Check URL path for typos |
| 405 | `HTTP_405` | No | Check allowed HTTP methods |
| 408 | `HTTP_408` | Yes | Retry the request |
| 429 | `HTTP_429` | Yes | Wait for rate limit reset (check Retry-After header) |
| 5xx | `HTTP_5XX` | Yes | Wait and retry, server-side issue |

### Network Errors

| Type | Label | Retriable | Suggestion |
|------|-------|-----------|------------|
| `TIMEOUT` | Timeout | Yes | Increase timeout, reduce payload, or retry later |
| `DNS` | DNS Error | Yes | Check domain spelling, verify DNS configuration |
| `CONN_REFUSED` | Connection Refused | Yes | Verify server is running and port is correct |
| `CONN_RESET` | Connection Reset | Yes | Retry after delay, check for rate limiting |
| `CONN_CLOSED` | Connection Closed | Yes | Retry the request |
| `NET_UNREACHABLE` | Network Unreachable | Yes | Check internet connection, VPN settings |

### TLS/SSL Errors

| Type | Label | Retriable | Suggestion |
|------|-------|-----------|------------|
| `TLS_EXPIRED` | Certificate Expired | No | Contact server administrator |
| `TLS_INVALID` | Invalid Certificate | No | Verify server, use rejectUnauthorized: false for testing |
| `TLS_HANDSHAKE` | TLS Handshake Failed | Yes | Try again or check TLS version compatibility |
| `TLS_PROTOCOL` | TLS Protocol Error | No | Try different TLS version |

### Authentication Errors

| Type | Label | Retriable | Suggestion |
|------|-------|-----------|------------|
| `AUTH_MISSING` | Missing Credentials | No | Set required environment variable or pass credentials |
| `AUTH_INVALID` | Invalid Credentials | No | Regenerate API key or token |
| `AUTH_EXPIRED` | Token Expired | Yes | Refresh token and retry immediately |

### Parse Errors

| Type | Label | Retriable | Suggestion |
|------|-------|-----------|------------|
| `PARSE_JSON` | Invalid JSON | No | Check raw response, may be HTML error page |
| `PARSE_XML` | Invalid XML | No | Verify endpoint returns XML, check encoding |
| `PARSE_HTML` | Invalid HTML | No | HTML may be malformed |

## Using the Error Handler

### In Library Code

```typescript
import { classifyError, isRetriable, getRetryDelay } from 'recker';

try {
  const response = await client.get('/api/data');
} catch (error) {
  const classified = classifyError(error);

  console.log(classified.message);      // "Rate Limited"
  console.log(classified.explanation);  // "You have sent too many requests..."
  console.log(classified.suggestion);   // "Wait before retrying..."

  if (classified.retry.should) {
    console.log(`Retry after ${classified.retry.afterMs}ms`);
  }
}
```

### Quick Retry Check

```typescript
import { isRetriable, getRetryDelay } from 'recker';

try {
  await client.get('/api/data');
} catch (error) {
  if (isRetriable(error)) {
    const delay = getRetryDelay(error);
    await sleep(delay);
    // Retry...
  }
}
```

### Full Error Report

```typescript
import { createErrorReport } from 'recker';

try {
  await client.get('/api/data');
} catch (error) {
  const report = createErrorReport(error);

  console.log(report.summary);    // One-line summary
  console.log(report.formatted);  // Full formatted output
  console.log(report.details);    // ClassifiedError object
}
```

## CLI Error Output

When errors occur in the CLI, you'll see formatted output like:

```
Error: Rate Limited
You have sent too many requests in a given time period (rate limited).

Fix: Wait before retrying. Check the Retry-After header for the wait time.
Retry: Retry after 60s
```

## Spider Error Summary

When crawling websites, errors are grouped by type:

```
Errors Summary:
  By type:
    HTTP_404        15 errors
    TIMEOUT         3 errors [retriable]
    CONN_RESET      2 errors [retriable]

  Retriable: 5 errors can be fixed by retrying
  Non-retriable: 15 errors need manual intervention

  Details (10 of 20):
    ✗ HTTP_404      /old-page                      Not Found
    ✗ HTTP_404      /deleted-post                  Not Found
    ✗ TIMEOUT       /slow-api                      Request timed out (>10s)

  Suggestions:
    → Timeout errors: Try reducing concurrency or increasing timeout
```

## Environment Variables

- `DEBUG=true` - Show original error stack traces
- `VERBOSE=true` - Show detailed error information

## Best Practices

### 1. Always Check Retriability

```typescript
if (isRetriable(error)) {
  // Implement retry logic with exponential backoff
  const delay = getRetryDelay(error);
  await sleep(delay * Math.pow(2, attempt));
}
```

### 2. Handle Rate Limits Properly

```typescript
try {
  await client.get('/api/data');
} catch (error) {
  const classified = classifyError(error);

  if (classified.category.type === 'HTTP_429') {
    // Use Retry-After header if available
    const retryAfter = classified.context?.retryAfter;
    console.log(`Rate limited. Retry after ${retryAfter || 60}s`);
  }
}
```

### 3. Log Errors with Context

```typescript
const classified = classifyError(error, {
  url: request.url,
  method: request.method,
  attempt: attemptNumber,
});

logger.error({
  type: classified.category.type,
  message: classified.message,
  suggestion: classified.suggestion,
  retriable: classified.retry.should,
  context: classified.context,
});
```

## Custom Error Categories

You can extend the error handling for custom errors:

```typescript
import { ERROR_CATEGORIES, classifyError } from 'recker';

// Add custom category
ERROR_CATEGORIES.MY_CUSTOM_ERROR = {
  type: 'MY_CUSTOM',
  label: 'Custom Error',
  color: 'magenta',
  retriable: true,
  retryDelay: 5000,
};

// Use in your code
if (error.message.includes('my-custom-pattern')) {
  return buildClassifiedError('MY_CUSTOM_ERROR', error);
}
```

## See Also

- [Retry Plugin](/plugins/02-retry.md) - Automatic retry with backoff
- [Rate Limit Plugin](/plugins/09-rate-limit.md) - Client-side rate limiting
- [Circuit Breaker](/plugins/03-circuit-breaker.md) - Fail-fast on repeated failures
