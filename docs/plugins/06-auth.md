# Auth Plugin

The **Auth** plugin provides automatic authentication for HTTP requests, supporting multiple authentication schemes.

## Supported Schemes

- **Bearer Token** (JWT, OAuth)
- **Basic Auth** (username:password)
- **API Key** (header or query param)
- **Custom** (custom function)

## Quick Start

### Bearer Token

```typescript
import { createClient, auth } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(auth({
  type: 'bearer',
  token: 'your-jwt-token',
}));

// Adds: Authorization: Bearer your-jwt-token
const data = await client.get('/protected').json();
```

### Basic Auth

```typescript
client.use(auth({
  type: 'basic',
  username: 'user',
  password: 'pass',
}));

// Adds: Authorization: Basic dXNlcjpwYXNz
```

### API Key

```typescript
// In header
client.use(auth({
  type: 'apikey',
  key: 'X-API-Key',
  value: 'your-api-key',
  in: 'header',
}));

// In query string
client.use(auth({
  type: 'apikey',
  key: 'api_key',
  value: 'your-api-key',
  in: 'query',
}));
```

## Dynamic Token

For tokens that change (refresh tokens):

```typescript
client.use(auth({
  type: 'bearer',
  token: () => getAccessToken(), // Function that returns current token
}));

// Or async
client.use(auth({
  type: 'bearer',
  token: async () => {
    const token = await refreshTokenIfNeeded();
    return token;
  },
}));
```

## Auto Refresh

```typescript
client.use(auth({
  type: 'bearer',
  token: () => tokenStore.accessToken,
  refreshToken: async () => {
    const { accessToken, refreshToken } = await client.post('/auth/refresh', {
      body: { refresh_token: tokenStore.refreshToken },
    }).json();

    tokenStore.accessToken = accessToken;
    tokenStore.refreshToken = refreshToken;

    return accessToken;
  },
  shouldRefresh: (response) => response.status === 401,
}));
```

## Complete Configuration

```typescript
interface AuthOptions {
  // Authentication type
  type: 'bearer' | 'basic' | 'apikey' | 'custom';

  // For bearer
  token?: string | (() => string) | (() => Promise<string>);

  // For basic
  username?: string;
  password?: string;

  // For apikey
  key?: string;
  value?: string;
  in?: 'header' | 'query';

  // For custom
  apply?: (req: ReckerRequest) => ReckerRequest | Promise<ReckerRequest>;

  // Auto refresh
  refreshToken?: () => Promise<string>;
  shouldRefresh?: (response: ReckerResponse) => boolean;

  // Retry after refresh
  retryOnRefresh?: boolean;
}
```

## Examples

### OAuth2 with Refresh

```typescript
const tokenManager = {
  accessToken: '',
  refreshToken: '',

  async refresh() {
    const response = await fetch('/oauth/token', {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      }),
    });

    const data = await response.json();
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;

    return this.accessToken;
  },
};

client.use(auth({
  type: 'bearer',
  token: () => tokenManager.accessToken,
  refreshToken: () => tokenManager.refresh(),
  shouldRefresh: (res) => res.status === 401,
  retryOnRefresh: true,
}));
```

### AWS Signature

```typescript
import { sign } from 'aws4';

client.use(auth({
  type: 'custom',
  apply: (req) => {
    const signed = sign({
      host: 'api.example.com',
      path: new URL(req.url).pathname,
      method: req.method,
      headers: Object.fromEntries(req.headers),
      body: req.body,
    }, {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    });

    return req
      .withHeader('Authorization', signed.headers.Authorization)
      .withHeader('X-Amz-Date', signed.headers['X-Amz-Date']);
  },
}));
```

### Multi-Tenant

```typescript
const tenantTokens = new Map<string, string>();

client.use(auth({
  type: 'custom',
  apply: (req) => {
    const tenantId = req.headers.get('X-Tenant-Id');
    const token = tenantTokens.get(tenantId);

    if (token) {
      return req.withHeader('Authorization', `Bearer ${token}`);
    }
    return req;
  },
}));
```

### Per-Request Override

```typescript
client.use(auth({
  type: 'bearer',
  token: 'default-token',
}));

// Use different token for a specific request
const data = await client.get('/admin', {
  headers: { Authorization: 'Bearer admin-token' },
}).json();
```

## Combining with Other Plugins

```typescript
// Auth should come before plugins that need authentication
client.use(auth({ type: 'bearer', token: getToken }));
client.use(retry({ maxAttempts: 3 }));
client.use(cache({ ttl: 60000 }));
```

## Security

1. **Never hardcode tokens** in source code
2. **Use environment variables** or secret managers
3. **Tokens in memory** are safe for SPAs
4. **Refresh tokens** should be stored securely

```typescript
// ✅ Good
client.use(auth({
  type: 'bearer',
  token: process.env.API_TOKEN,
}));

// ❌ Bad
client.use(auth({
  type: 'bearer',
  token: 'eyJhbGciOiJIUzI1NiIs...', // Hardcoded token!
}));
```

## Tips

1. **Use token functions** for dynamic tokens
2. **Implement refresh** for long sessions
3. **API keys in header** are more secure than query params
4. **Custom auth** for unsupported schemes
5. **Combine with retry** for automatic retry after refresh
