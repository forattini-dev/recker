# Authentication

Recker provides built-in support for multiple authentication schemes.

## Basic Authentication

```typescript
import { createClient, basicAuth } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com'
});

client.use(basicAuth({
  username: 'user',
  password: 'pass'
}));

// All requests now include Authorization: Basic <base64>
await client.get('/protected');
```

## Bearer Token

```typescript
import { bearerAuth } from 'recker';

// Static token
client.use(bearerAuth({
  token: 'my-api-token'
}));

// Dynamic token (refreshed on each request)
client.use(bearerAuth({
  token: async () => await getAccessToken()
}));

// Custom header name
client.use(bearerAuth({
  token: 'my-token',
  type: 'Token', // Default: 'Bearer'
  headerName: 'X-Auth-Token' // Default: 'Authorization'
}));
```

## API Key

```typescript
import { apiKeyAuth } from 'recker';

// In header (default)
client.use(apiKeyAuth({
  key: 'my-api-key',
  name: 'X-API-Key' // Default header name
}));

// In query parameter
client.use(apiKeyAuth({
  key: 'my-api-key',
  in: 'query',
  name: 'api_key'
}));
// Requests become: /endpoint?api_key=my-api-key

// Dynamic key
client.use(apiKeyAuth({
  key: async () => await getApiKey()
}));
```

## OAuth 2.0

```typescript
import { oauth2 } from 'recker';

client.use(oauth2({
  accessToken: () => tokenStore.getAccessToken(),
  tokenType: 'Bearer', // Default

  // Auto-refresh on 401
  onTokenExpired: async () => {
    await tokenStore.refresh();
    return tokenStore.getAccessToken();
  }
}));
```

### Token Refresh Flow

```typescript
class TokenStore {
  private accessToken: string = '';
  private refreshToken: string = '';

  async refresh() {
    const response = await authClient.post('/oauth/token', {
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken
    });

    const data = await response.json();
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
  }

  getAccessToken() {
    return this.accessToken;
  }
}

const tokenStore = new TokenStore();

client.use(oauth2({
  accessToken: () => tokenStore.getAccessToken(),
  onTokenExpired: async () => {
    await tokenStore.refresh();
    return tokenStore.getAccessToken();
  }
}));
```

## Digest Authentication

HTTP Digest Authentication (RFC 7616) with automatic challenge handling.

```typescript
import { digestAuth } from 'recker';

client.use(digestAuth({
  username: 'user',
  password: 'pass',
  preemptive: false // Wait for 401 challenge (default)
}));

// First request gets 401 with WWW-Authenticate
// Middleware automatically retries with computed digest
await client.get('/protected');
```

### Preemptive Mode

```typescript
client.use(digestAuth({
  username: 'user',
  password: 'pass',
  preemptive: true // Send digest on first request if cached
}));
```

## AWS Signature V4

For AWS services and compatible APIs (S3, DynamoDB, etc.).

```typescript
import { awsSignatureV4 } from 'recker';

const client = createClient({
  baseUrl: 'https://s3.amazonaws.com'
});

client.use(awsSignatureV4({
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  service: 's3'
}));

// For temporary credentials (STS)
client.use(awsSignatureV4({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  region: 'us-east-1',
  service: 'execute-api'
}));
```

## Multiple Auth Methods

You can stack multiple auth middlewares, but typically only one should apply:

```typescript
// Use hooks to conditionally apply auth
client.beforeRequest(async (req) => {
  if (req.url.includes('/admin')) {
    return req.withHeader('Authorization', `Bearer ${adminToken}`);
  }
  if (req.url.includes('/api')) {
    return req.withHeader('X-API-Key', apiKey);
  }
  return req;
});
```

## Per-Request Auth

Override auth for specific requests:

```typescript
// Client has default auth
client.use(bearerAuth({ token: 'default-token' }));

// Override for specific request
await client.get('/endpoint', {
  headers: {
    'Authorization': 'Bearer different-token'
  }
});
```

## Security Best Practices

1. **Never hardcode credentials** - Use environment variables
2. **Use HTTPS** - Auth headers are transmitted in plaintext over HTTP
3. **Rotate tokens** - Implement refresh token logic for long-lived sessions
4. **Limit scope** - Request only necessary permissions
5. **Secure storage** - Don't log or persist tokens insecurely

```typescript
// Good: Environment variables
const client = createClient({
  baseUrl: process.env.API_URL
});

client.use(bearerAuth({
  token: process.env.API_TOKEN!
}));

// Good: Secret manager
import { getSecret } from './secrets';

client.use(bearerAuth({
  token: async () => await getSecret('api-token')
}));
```
