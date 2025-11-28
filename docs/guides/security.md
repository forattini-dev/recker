# Security & Safety

Recker includes built-in protections to keep your application safe from untrusted inputs and attacks.

## Response Size Limit (DoS Protection)

Prevent memory exhaustion attacks by limiting the maximum response size. If a server returns more data than allowed, Recker aborts the request immediately.

```typescript
const client = createClient({
  baseUrl: 'https://api.example.com',
  maxResponseSize: 5 * 1024 * 1024 // Max 5MB
});

try {
  await client.get('/massive-file.json');
} catch (err) {
  if (err.code === 'MAX_SIZE_EXCEEDED') {
    console.error('Response too large!');
  }
}
```

## XSRF Protection

Automatically handle Cross-Site Request Forgery tokens.

```typescript
const client = createClient({
  xsrf: {
    cookieName: 'XSRF-TOKEN',
    headerName: 'X-XSRF-TOKEN'
  }
});
```

## Secure Proxy

Use `proxyAgent` with authentication to securely route traffic.

```typescript
const client = createClient({
  proxy: {
    url: 'https://secure-proxy.com:8080',
    auth: { username: 'user', password: 'pwd' }
  }
});
```