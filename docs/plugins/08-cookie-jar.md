# Cookie Jar Plugin

The **Cookie Jar** plugin automatically manages cookies between requests, simulating browser behavior.

## Quick Start

```typescript
import { createClient, cookieJarPlugin, MemoryCookieJar } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(cookieJarPlugin({
  jar: new MemoryCookieJar(),
}));

// Login - server sets cookies
await client.post('/auth/login', {
  body: { username: 'user', password: 'pass' },
});

// Next requests automatically include cookies
const data = await client.get('/protected').json();
```

## How It Works

```
Request 1 (POST /login)
    │
    └──► Server returns: Set-Cookie: session=abc123
                          │
                          ▼
                    Cookie Jar stores
                          │
Request 2 (GET /protected)
    │
    └──► Cookie Jar adds: Cookie: session=abc123
                          │
                          ▼
                    Server validates session
```

## Configuration

```typescript
interface CookieJarOptions {
  // Cookie storage
  jar: CookieJar;

  // Ignore parsing errors (default: false)
  ignoreParseErrors?: boolean;
}
```

## Cookie Jars

### MemoryCookieJar

Stores cookies in memory (lost on restart):

```typescript
import { MemoryCookieJar } from 'recker';

const jar = new MemoryCookieJar();

client.use(cookieJarPlugin({ jar }));
```

### FileCookieJar

Persists cookies to a file:

```typescript
import { FileCookieJar } from 'recker';

const jar = new FileCookieJar('./cookies.json');

client.use(cookieJarPlugin({ jar }));
```

### Custom Cookie Jar

Implement the `CookieJar` interface:

```typescript
interface CookieJar {
  setCookie(cookie: string, url: string): void;
  getCookies(url: string): string[];
  clear(): void;
}

class RedisCookieJar implements CookieJar {
  constructor(private redis: RedisClient) {}

  setCookie(cookie: string, url: string) {
    // Save to Redis
  }

  getCookies(url: string): string[] {
    // Fetch from Redis
  }

  clear() {
    // Clear Redis
  }
}
```

## Features

### Domain Matching

Cookies are only sent to the correct domain:

```typescript
// Cookie set for .example.com
// Set-Cookie: session=abc; Domain=.example.com

await client.get('https://api.example.com/users');  // ✅ Sends cookie
await client.get('https://www.example.com/page');   // ✅ Sends cookie
await client.get('https://other.com/page');         // ❌ Doesn't send
```

### Path Matching

Cookies respect the path:

```typescript
// Set-Cookie: token=xyz; Path=/api

await client.get('https://example.com/api/users');  // ✅ Sends cookie
await client.get('https://example.com/api/orders'); // ✅ Sends cookie
await client.get('https://example.com/web/page');   // ❌ Doesn't send
```

### Secure Cookies

`Secure` cookies are only sent over HTTPS:

```typescript
// Set-Cookie: session=abc; Secure

await client.get('https://example.com/page');  // ✅ Sends cookie
await client.get('http://example.com/page');   // ❌ Doesn't send
```

### HttpOnly

The cookie jar respects `HttpOnly` - they are sent normally in HTTP requests.

### Expiration

Expired cookies are automatically removed:

```typescript
// Set-Cookie: temp=value; Max-Age=3600

// After 1 hour, the cookie is automatically removed
```

## Examples

### Session-based Auth

```typescript
const jar = new MemoryCookieJar();

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(cookieJarPlugin({ jar }));

// Login
await client.post('/auth/login', {
  body: { email: 'user@example.com', password: 'secret' },
});

// Session maintained automatically
const profile = await client.get('/me').json();
const orders = await client.get('/orders').json();

// Logout
await client.post('/auth/logout');
jar.clear(); // Clear local cookies
```

### Multi-site Scraping

```typescript
const jar = new MemoryCookieJar();

const client = createClient();
client.use(cookieJarPlugin({ jar }));

// Site 1 - separate cookies
await client.get('https://site1.com/login');
await client.post('https://site1.com/auth', { body: creds1 });

// Site 2 - separate cookies
await client.get('https://site2.com/login');
await client.post('https://site2.com/auth', { body: creds2 });

// Cookies are sent to the correct domain automatically
await client.get('https://site1.com/data'); // Uses site1 cookies
await client.get('https://site2.com/data'); // Uses site2 cookies
```

### Persistence Between Runs

```typescript
const jar = new FileCookieJar('./session-cookies.json');

const client = createClient({
  baseUrl: 'https://api.example.com',
});

client.use(cookieJarPlugin({ jar }));

// If session already exists, continues logged in
const isLoggedIn = await client.get('/me')
  .then(() => true)
  .catch(() => false);

if (!isLoggedIn) {
  await client.post('/auth/login', { body: credentials });
}

// Cookies are saved automatically
```

### CSRF Protection

Many sites use cookies for CSRF:

```typescript
import { cookieJarPlugin, xsrfPlugin } from 'recker';

const jar = new MemoryCookieJar();

client.use(cookieJarPlugin({ jar }));
client.use(xsrfPlugin({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
}));

// 1. GET request receives XSRF-TOKEN cookie
await client.get('/page');

// 2. POST requests automatically include X-XSRF-TOKEN header
await client.post('/action', { body: data });
```

## Debugging

### View Current Cookies

```typescript
const jar = new MemoryCookieJar();

client.use(cookieJarPlugin({ jar }));

await client.get('https://example.com/page');

// View all cookies
console.log(jar.getAllCookies());

// View cookies for a specific URL
console.log(jar.getCookies('https://example.com/page'));
```

### Cookie Logging

```typescript
client.use(loggerPlugin({
  logHeaders: true, // Shows Cookie header in requests
}));

client.use(cookieJarPlugin({ jar }));
```

## Security

1. **FileCookieJar** stores cookies in plain text - protect the file
2. **Session cookies** should be treated as credentials
3. **Don't share jars** between different users
4. **Clear cookies** after logout

```typescript
// After logout
jar.clear();

// Or remove specific cookies
jar.removeCookie('session', 'https://example.com');
```

## Tips

1. **Use MemoryCookieJar** for simple scripts
2. **Use FileCookieJar** for persistent sessions
3. **Combine with XSRF** for forms
4. **Clear cookies** periodically to avoid issues
5. **Expired cookies** are removed automatically
