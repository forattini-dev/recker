# Auth Plugin

O plugin de **Auth** fornece autenticação automática para requests HTTP, suportando múltiplos esquemas de autenticação.

## Esquemas Suportados

- **Bearer Token** (JWT, OAuth)
- **Basic Auth** (username:password)
- **API Key** (header ou query param)
- **Custom** (função personalizada)

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

// Adiciona: Authorization: Bearer your-jwt-token
const data = await client.get('/protected').json();
```

### Basic Auth

```typescript
client.use(auth({
  type: 'basic',
  username: 'user',
  password: 'pass',
}));

// Adiciona: Authorization: Basic dXNlcjpwYXNz
```

### API Key

```typescript
// No header
client.use(auth({
  type: 'apikey',
  key: 'X-API-Key',
  value: 'your-api-key',
  in: 'header',
}));

// Na query string
client.use(auth({
  type: 'apikey',
  key: 'api_key',
  value: 'your-api-key',
  in: 'query',
}));
```

## Token Dinâmico

Para tokens que mudam (refresh tokens):

```typescript
client.use(auth({
  type: 'bearer',
  token: () => getAccessToken(), // Função que retorna o token atual
}));

// Ou async
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

## Configuração Completa

```typescript
interface AuthOptions {
  // Tipo de autenticação
  type: 'bearer' | 'basic' | 'apikey' | 'custom';

  // Para bearer
  token?: string | (() => string) | (() => Promise<string>);

  // Para basic
  username?: string;
  password?: string;

  // Para apikey
  key?: string;
  value?: string;
  in?: 'header' | 'query';

  // Para custom
  apply?: (req: ReckerRequest) => ReckerRequest | Promise<ReckerRequest>;

  // Auto refresh
  refreshToken?: () => Promise<string>;
  shouldRefresh?: (response: ReckerResponse) => boolean;

  // Retry após refresh
  retryOnRefresh?: boolean;
}
```

## Exemplos

### OAuth2 com Refresh

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

// Usar token diferente para um request específico
const data = await client.get('/admin', {
  headers: { Authorization: 'Bearer admin-token' },
}).json();
```

## Combinando com Outros Plugins

```typescript
// Auth deve vir antes de plugins que precisam da autenticação
client.use(auth({ type: 'bearer', token: getToken }));
client.use(retry({ maxAttempts: 3 }));
client.use(cache({ ttl: 60000 }));
```

## Segurança

1. **Nunca hardcode tokens** em código fonte
2. **Use variáveis de ambiente** ou secret managers
3. **Tokens em memória** são seguros para SPAs
4. **Refresh tokens** devem ser armazenados de forma segura

```typescript
// ✅ Bom
client.use(auth({
  type: 'bearer',
  token: process.env.API_TOKEN,
}));

// ❌ Ruim
client.use(auth({
  type: 'bearer',
  token: 'eyJhbGciOiJIUzI1NiIs...', // Token hardcoded!
}));
```

## Dicas

1. **Use token functions** para tokens dinâmicos
2. **Implemente refresh** para sessões longas
3. **API keys em header** são mais seguros que query params
4. **Custom auth** para esquemas não suportados
5. **Combine com retry** para retry automático após refresh
