# Cookie Jar Plugin

O plugin de **Cookie Jar** gerencia cookies automaticamente entre requests, simulando o comportamento de um browser.

## Quick Start

```typescript
import { createClient, cookieJar, MemoryCookieJar } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(cookieJar({
  jar: new MemoryCookieJar(),
}));

// Login - servidor seta cookies
await client.post('/auth/login', {
  body: { username: 'user', password: 'pass' },
});

// Próximos requests incluem os cookies automaticamente
const data = await client.get('/protected').json();
```

## Como Funciona

```
Request 1 (POST /login)
    │
    └──► Servidor retorna: Set-Cookie: session=abc123
                          │
                          ▼
                    Cookie Jar armazena
                          │
Request 2 (GET /protected)
    │
    └──► Cookie Jar adiciona: Cookie: session=abc123
                          │
                          ▼
                    Servidor valida sessão
```

## Configuração

```typescript
interface CookieJarOptions {
  // Storage de cookies
  jar: CookieJar;

  // Ignorar erros de parsing (default: false)
  ignoreParseErrors?: boolean;
}
```

## Cookie Jars

### MemoryCookieJar

Armazena cookies em memória (perde ao reiniciar):

```typescript
import { MemoryCookieJar } from 'recker';

const jar = new MemoryCookieJar();

client.use(cookieJar({ jar }));
```

### FileCookieJar

Persiste cookies em arquivo:

```typescript
import { FileCookieJar } from 'recker';

const jar = new FileCookieJar('./cookies.json');

client.use(cookieJar({ jar }));
```

### Custom Cookie Jar

Implemente a interface `CookieJar`:

```typescript
interface CookieJar {
  setCookie(cookie: string, url: string): void;
  getCookies(url: string): string[];
  clear(): void;
}

class RedisCookieJar implements CookieJar {
  constructor(private redis: RedisClient) {}

  setCookie(cookie: string, url: string) {
    // Salvar no Redis
  }

  getCookies(url: string): string[] {
    // Buscar do Redis
  }

  clear() {
    // Limpar Redis
  }
}
```

## Funcionalidades

### Domain Matching

Cookies são enviados apenas para o domínio correto:

```typescript
// Cookie setado para .example.com
// Set-Cookie: session=abc; Domain=.example.com

await client.get('https://api.example.com/users');  // ✅ Envia cookie
await client.get('https://www.example.com/page');   // ✅ Envia cookie
await client.get('https://other.com/page');         // ❌ Não envia
```

### Path Matching

Cookies respeitam o path:

```typescript
// Set-Cookie: token=xyz; Path=/api

await client.get('https://example.com/api/users');  // ✅ Envia cookie
await client.get('https://example.com/api/orders'); // ✅ Envia cookie
await client.get('https://example.com/web/page');   // ❌ Não envia
```

### Secure Cookies

Cookies `Secure` só são enviados via HTTPS:

```typescript
// Set-Cookie: session=abc; Secure

await client.get('https://example.com/page');  // ✅ Envia cookie
await client.get('http://example.com/page');   // ❌ Não envia
```

### HttpOnly

O cookie jar respeita `HttpOnly` - são enviados normalmente em requests HTTP.

### Expiration

Cookies expirados são automaticamente removidos:

```typescript
// Set-Cookie: temp=value; Max-Age=3600

// Após 1 hora, o cookie é removido automaticamente
```

## Exemplos

### Session-based Auth

```typescript
const jar = new MemoryCookieJar();

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(cookieJar({ jar }));

// Login
await client.post('/auth/login', {
  body: { email: 'user@example.com', password: 'secret' },
});

// Sessão mantida automaticamente
const profile = await client.get('/me').json();
const orders = await client.get('/orders').json();

// Logout
await client.post('/auth/logout');
jar.clear(); // Limpa cookies locais
```

### Multi-site Scraping

```typescript
const jar = new MemoryCookieJar();

const client = createClient();
client.use(cookieJar({ jar }));

// Site 1 - cookies separados
await client.get('https://site1.com/login');
await client.post('https://site1.com/auth', { body: creds1 });

// Site 2 - cookies separados
await client.get('https://site2.com/login');
await client.post('https://site2.com/auth', { body: creds2 });

// Cookies são enviados para o domínio correto automaticamente
await client.get('https://site1.com/data'); // Usa cookies de site1
await client.get('https://site2.com/data'); // Usa cookies de site2
```

### Persistência entre Execuções

```typescript
const jar = new FileCookieJar('./session-cookies.json');

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(cookieJar({ jar }));

// Se já existe sessão salva, continua logado
const isLoggedIn = await client.get('/me')
  .then(() => true)
  .catch(() => false);

if (!isLoggedIn) {
  await client.post('/auth/login', { body: credentials });
}

// Cookies são salvos automaticamente
```

### CSRF Protection

Muitos sites usam cookies para CSRF:

```typescript
import { cookieJar, xsrf } from 'recker';

const jar = new MemoryCookieJar();

client.use(cookieJar({ jar }));
client.use(xsrf({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
}));

// 1. GET request recebe cookie XSRF-TOKEN
await client.get('/page');

// 2. POST requests automaticamente incluem o header X-XSRF-TOKEN
await client.post('/action', { body: data });
```

## Debugging

### Ver Cookies Atuais

```typescript
const jar = new MemoryCookieJar();

client.use(cookieJar({ jar }));

await client.get('https://example.com/page');

// Ver todos os cookies
console.log(jar.getAllCookies());

// Ver cookies para uma URL específica
console.log(jar.getCookies('https://example.com/page'));
```

### Logging de Cookies

```typescript
client.use(logger({
  logHeaders: true, // Mostra Cookie header nos requests
}));

client.use(cookieJar({ jar }));
```

## Segurança

1. **FileCookieJar** armazena cookies em texto plano - proteja o arquivo
2. **Cookies de sessão** devem ser tratados como credenciais
3. **Não compartilhe jars** entre usuários diferentes
4. **Limpe cookies** após logout

```typescript
// Após logout
jar.clear();

// Ou remover cookies específicos
jar.removeCookie('session', 'https://example.com');
```

## Dicas

1. **Use MemoryCookieJar** para scripts simples
2. **Use FileCookieJar** para sessões persistentes
3. **Combine com XSRF** para formulários
4. **Limpe cookies** periodicamente para evitar problemas
5. **Cookies expirados** são removidos automaticamente
