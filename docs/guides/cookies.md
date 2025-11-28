# Cookies & Session Management

By default, HTTP is stateless. Recker stays stateless too, unless you ask it to remember. The `cookieJar` plugin enables automated session management, similar to a browser.

## Usage

Enable the plugin, and Recker will automatically:
1.  Capture `Set-Cookie` headers from responses.
2.  Store them in memory (scoped by domain).
3.  Attach `Cookie` headers to subsequent requests to the matching domain.

```typescript
import { createClient, cookieJar } from 'recker';

const client = createClient({
  baseUrl: 'https://api.example.com',
  plugins: [
    cookieJar()
  ]
});

// 1. Login (Server sends Set-Cookie: session=abc)
await client.post('/login', { body: { user: 'me', pass: '123' } });

// 2. Next request automatically sends "Cookie: session=abc"
const profile = await client.get('/profile').json();
```

## Custom Store

You can initialize the jar with pre-existing cookies or share a store between clients.

```typescript
const myStore = new Map();
myStore.set('session_id', 'secret-token');

const client = createClient({
  plugins: [
    cookieJar({ store: myStore })
  ]
});
```

## Security Note

Recker's default `cookieJar` implements basic **Domain Scoping**.
*   Cookies set by `api.example.com` are sent to `api.example.com`.
*   Cookies with `Domain=example.com` are sent to `*.example.com`.
*   It does **not** currently enforce `Secure`, `HttpOnly` (client-side invisible), or `Path` restrictions strictly. For highly sensitive banking-grade applications, ensure you understand these limitations or handle headers manually.
